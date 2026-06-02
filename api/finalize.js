// Finalize: take a Veo clip (no usable audio) and bake the audio track from
// scratch — a crisp click.mp3 at the exact button-press moment, then the
// ElevenLabs voice just after it. The press moment is found by asking Gemini to
// watch the generated video and identify when the paw contacts the button, with a
// fixed fallback if that fails. Veo's original audio is discarded entirely.
//
// Why Gemini-only (not motion energy): the button is already in its depressed
// resting state, so the paw contacting it produces almost no inter-frame pixel
// delta. Motion energy reliably picks the wrong frame (camera drift, fur movement)
// and was worse than Gemini's semantic understanding of the footage.
//
// POST { videoUrl, voice, compliment } → { url, pressSeconds, pressSource }

import { put } from "@vercel/blob";
import { randomBytes } from "crypto";
import { execFile } from "child_process";
import { writeFile, readFile, unlink, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import ffmpegPath from "ffmpeg-static";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
  maxDuration: 300, // concat of two clips + frame detection + encode can exceed 60s
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.5-flash";
const ELEVEN_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVEN_MODEL = "eleven_multilingual_v2";

// Persona display name → ElevenLabs voice ID. Kept in sync with the /dev/voices
// tester and api/tts-preview.js — change these together so previews match prod.
const VOICE_IDS = {
  "Barry White Core": "hILdTfuUq4LRBMrxHERr",
  "French Smooth Talker": "I1T6PEfqPxl45yKRN4aS",
  "Highland Heartthrob": "csXxiUN2BUFflsCaDxPM",
};

// Per-voice ElevenLabs settings, keyed by voice ID. MUST mirror tts-preview.js
// exactly so the /dev/voices tester reflects production: French gets a style
// boost to pull the accent; Highland Heartthrob is style-boosted and slowed (speed 0.82).
const VOICE_SETTINGS = {
  "hILdTfuUq4LRBMrxHERr": { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
  "I1T6PEfqPxl45yKRN4aS": { stability: 0.5, similarity_boost: 0.75, style: 0.7, use_speaker_boost: true },
  "csXxiUN2BUFflsCaDxPM": { stability: 0.5, similarity_boost: 0.75, style: 0.7, use_speaker_boost: true, speed: 0.82 },
};
const DEFAULT_VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true };

const DEFAULT_PRESS_SECONDS = 1.1;  // fallback — prompt instructs Veo to press ~1s in
const PRESS_MIN_SECONDS = 0.2;

// Audio layout. The real click.mp3 is ~0.55s long with ~0.05s of lead-in silence;
// CLICK_LEAD_TRIM drops that silence so the click's transient lands ON the press,
// and VOICE_GAP_SECONDS (> the click's length) keeps the voice strictly AFTER it.
const CLICK_LEAD_TRIM = 0.05;       // leading silence trimmed off the click file
const CLICK_VOLUME = 2.0;           // boost — the source click is quiet (~ -33 dB mean)
const CLICK_OFFSET = 0.18;          // nudge later so the click lands as the button bottoms out
const VOICE_GAP_SECONDS = 0.65;     // press → voice; the click fully finishes first

// execFile that rejects on a non-zero exit.
function run(bin, args) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${err.message}\n${stderr}`));
      resolve({ stdout, stderr });
    });
  });
}

// execFile that NEVER rejects — ffmpeg returns non-zero for probe-only runs
// (no output file), but its diagnostics on stderr are exactly what we want.
function capture(bin, args) {
  return new Promise((resolve) => {
    execFile(bin, args, { maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

// Parse "Duration: HH:MM:SS.ss" out of ffmpeg's stderr.
function parseDuration(stderr) {
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function mediaDuration(path) {
  const { stderr } = await capture(ffmpegPath, ["-hide_banner", "-i", path]);
  return parseDuration(stderr);
}

// Frame-extraction window: vision LLMs are good at picking a frame from a
// labelled set but bad at inventing a precise timestamp. So we extract evenly
// spaced frames across the window the press can occur in, stamp each with its
// time, and ask Gemini to pick the first frame where the paw is pressing.
const FRAME_FPS = 6;            // frames per second to sample (~0.17s resolution)
const FRAME_WINDOW = 3.0;       // sample only the first N seconds (press is early)

// Extract evenly spaced JPEG frames from the start of the clip. Returns
// [{ t, base64 }] ordered by time. The frame index i (1-based) maps to
// timestamp (i-1)/FRAME_FPS.
async function extractFrames(inPath, dir) {
  await run(ffmpegPath, [
    "-y", "-i", inPath,
    "-vf", `fps=${FRAME_FPS},scale=384:-1`,
    "-t", String(FRAME_WINDOW),
    "-q:v", "5",
    join(dir, "f_%03d.jpg"),
  ]);
  const frames = [];
  for (let i = 1; i <= Math.ceil(FRAME_WINDOW * FRAME_FPS) + 2; i++) {
    const p = join(dir, `f_${String(i).padStart(3, "0")}.jpg`);
    if (!existsSync(p)) break;
    const buf = await readFile(p);
    frames.push({ t: (i - 1) / FRAME_FPS, base64: buf.toString("base64") });
  }
  return frames;
}

// Ask Gemini to pick the first frame where the paw is fully pressing the button.
// Returns seconds as a float, or null on failure.
async function detectPressVisual(inPath, key) {
  const dir = join(tmpdir(), `${randomBytes(4).toString("hex")}-frames`);
  try {
    await mkdir(dir, { recursive: true });
    const frames = await extractFrames(inPath, dir);
    if (frames.length === 0) return null;

    const parts = [{
      text:
        `Below are ${frames.length} sequential frames from a short video of a cat pressing a button with its paw. ` +
        `Each frame is preceded by its index. Find the frame at the moment the button is FULLY pressed down — ` +
        `the paw at the bottom of its travel, pressing the button to its lowest point (not the first light touch as it reaches in, and not after the paw has started lifting away). ` +
        `Respond ONLY as JSON, no markdown: {"frameIndex": N} where N is that frame's index. ` +
        `If the paw never clearly presses the button in these frames, respond {"frameIndex": null}.`
    }];
    frames.forEach((f, i) => {
      parts.push({ text: `Frame ${i}:` });
      parts.push({ inlineData: { mimeType: "image/jpeg", data: f.base64 } });
    });

    const r = await fetch(`${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0, maxOutputTokens: 64, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    const data = await r.json();
    if (!r.ok) { console.error("[finalize] gemini frame-pick failed:", JSON.stringify(data)); return null; }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    const idx = parsed.frameIndex;
    if (idx == null || !Number.isInteger(idx) || idx < 0 || idx >= frames.length) {
      console.log(`[finalize] gemini returned no usable frame index:`, text.trim());
      return null;
    }
    console.log(`[finalize] gemini picked frame ${idx} → ${frames[idx].t.toFixed(3)}s`);
    return frames[idx].t;
  } catch (e) {
    console.error("[finalize] visual press detection error:", e.message);
    return null;
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function resolvePress(visual) {
  if (visual == null) return { pressSeconds: DEFAULT_PRESS_SECONDS, source: "default" };
  return { pressSeconds: visual, source: "visual" };
}

// Locate the real bundled click.mp3. Only if it genuinely isn't shipped with the
// function do we fall back to synthesizing one (emergency net — not preferred).
async function resolveClickPath() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "public/click.mp3"),
    join(process.cwd(), "click.mp3"),
    join(here, "../public/click.mp3"),
    join(here, "public/click.mp3"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) { console.log("[finalize] using bundled click.mp3:", p); return p; }
  }
  console.warn("[finalize] click.mp3 NOT bundled — synthesizing a fallback:", candidates);
  const p = join(tmpdir(), `${randomBytes(4).toString("hex")}-click.mp3`);
  await run(ffmpegPath, [
    "-y",
    "-f", "lavfi", "-i", "anoisesrc=color=white:d=0.05:amplitude=0.9",
    "-f", "lavfi", "-i", "sine=frequency=170:duration=0.10",
    "-filter_complex",
      "[0:a]highpass=f=1800,afade=t=out:st=0:d=0.045,volume=1.2[tick];" +
      "[1:a]lowpass=f=400,afade=t=out:st=0:d=0.10,volume=0.6[tock];" +
      "[tick][tock]amix=inputs=2:normalize=0,alimiter=limit=0.95,volume=2.0[out]",
    "-map", "[out]", "-ac", "1", "-ar", "44100", "-t", "0.13",
    "-codec:a", "libmp3lame", "-q:a", "4", p,
  ]);
  return p;
}

// Generate the voiceover MP3 from the persona's fixed ElevenLabs voice ID.
async function generateVoice(voiceId, text, apiKey) {
  const r = await fetch(`${ELEVEN_BASE}/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", "Accept": "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: ELEVEN_MODEL,
      voice_settings: VOICE_SETTINGS[voiceId] || DEFAULT_VOICE_SETTINGS,
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`ElevenLabs TTS failed: HTTP ${r.status} — ${body.slice(0, 300)}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const googleKey = process.env.GOOGLE_API_KEY;
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (!googleKey) return res.status(500).json({ error: "GOOGLE_API_KEY not configured" });
  if (!elevenKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });
  if (!ffmpegPath) return res.status(500).json({ error: "ffmpeg binary not available" });

  const { videoUrl, endingVideoUrl, voice, compliment } = req.body || {};
  if (!videoUrl || !voice || !compliment) {
    return res.status(400).json({ error: "videoUrl, voice, and compliment are required" });
  }
  const voiceId = VOICE_IDS[voice];
  if (!voiceId) return res.status(400).json({ error: `Unknown voice: ${voice}` });

  const id = randomBytes(8).toString("hex");
  const inPath = join(tmpdir(), `${id}-in.mp4`);
  const endPath = join(tmpdir(), `${id}-end.mp4`);
  const voicePath = join(tmpdir(), `${id}-vo.mp3`);
  const outPath = join(tmpdir(), `${id}-out.mp4`);

  // Download a URL to a local file.
  const download = async (url, path, label) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to fetch ${label}: HTTP ${r.status}`);
    await writeFile(path, Buffer.from(await r.arrayBuffer()));
  };

  try {
    // 1. Download the silent main clip (and the ending clip, if provided).
    const hasEnding = !!endingVideoUrl;
    await Promise.all([
      download(videoUrl, inPath, "main video"),
      hasEnding ? download(endingVideoUrl, endPath, "ending video") : Promise.resolve(),
    ]);

    // 2. In parallel: generate the voice, get Gemini's press estimate (on the main
    //    clip only — the press is there), measure both clip durations, resolve click.
    const [voiceBuffer, visual, mainLen, endLen, clickPath] = await Promise.all([
      generateVoice(voiceId, compliment, elevenKey),
      detectPressVisual(inPath, googleKey),
      mediaDuration(inPath).then(d => d || 8),
      hasEnding ? mediaDuration(endPath).then(d => d || 4) : Promise.resolve(0),
      resolveClickPath(),
    ]);
    await writeFile(voicePath, voiceBuffer);

    // 3. Resolve the press moment (Gemini's fully-pressed frame, nudged slightly
    //    later by CLICK_OFFSET so the click lands as the button bottoms out).
    let { pressSeconds, source } = resolvePress(visual);
    pressSeconds = Math.min(Math.max(pressSeconds + CLICK_OFFSET, PRESS_MIN_SECONDS), mainLen - 0.1);
    console.log(`[finalize] press=${pressSeconds.toFixed(3)}s via ${source} (visual=${visual}, +${CLICK_OFFSET} offset)`);

    // 4. Compute timing. The final film is main + ending concatenated; the voice
    //    runs across the cut. A voiceover longer than the total is truncated.
    const clickMs = Math.round(pressSeconds * 1000);
    const voiceStart = pressSeconds + VOICE_GAP_SECONDS;
    const voiceMs = Math.round(voiceStart * 1000);
    const target = mainLen + endLen;
    console.log(`[finalize] click@${clickMs}ms voice@${voiceMs}ms mainLen=${mainLen.toFixed(2)} ` +
      `endLen=${endLen.toFixed(2)} total=${target.toFixed(2)}${hasEnding ? "" : " (no ending clip)"}`);

    // 5. Build the final video. The audio track is baked from scratch — click at
    //    the press, voice just after — and runs across the whole film. Veo's own
    //    audio is discarded entirely.
    // Click: trim its lead-in silence so the transient lands ON the press, boost
    // it (the source is quiet), force stereo, then delay to the press moment.
    // Voice: force stereo and delay to press + gap so it starts AFTER the click.
    const clickIdx = hasEnding ? 2 : 1;   // input index of click.mp3
    const voiceIdx = hasEnding ? 3 : 2;   // input index of the voiceover
    const audioChain =
      `[${clickIdx}:a]atrim=start=${CLICK_LEAD_TRIM},asetpts=PTS-STARTPTS,volume=${CLICK_VOLUME},` +
        `aformat=channel_layouts=stereo,adelay=${clickMs}|${clickMs}[click];` +
      `[${voiceIdx}:a]aformat=channel_layouts=stereo,adelay=${voiceMs}|${voiceMs}[vo];` +
      `[click][vo]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.97[a]`;

    // Video: when there's an ending clip, scale it to match the main clip's exact
    // dimensions (scale2ref) and concat. Otherwise just pass the main clip through.
    const videoChain = hasEnding
      ? `[1:v][0:v]scale2ref=w=iw:h=ih[ve][vm];` +
        `[vm]setsar=1,fps=24,format=yuv420p[v0];[ve]setsar=1,fps=24,format=yuv420p[v1];` +
        `[v0][v1]concat=n=2:v=1:a=0[v]`
      : `[0:v]setsar=1[v]`;

    const inputs = hasEnding
      ? ["-i", inPath, "-i", endPath, "-i", clickPath, "-i", voicePath] // 0,1,2,3
      : ["-i", inPath, "-i", clickPath, "-i", voicePath];               // 0,1,2

    await run(ffmpegPath, [
      "-y",
      ...inputs,
      "-filter_complex", `${videoChain};${audioChain}`,
      "-map", "[v]", "-map", "[a]",
      "-t", target.toFixed(3),
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
      outPath,
    ]);

    // 6. Store the final audio-baked MP4.
    const finalBuffer = await readFile(outPath);
    const { url } = await put(`cats/${id}-final.mp4`, finalBuffer, {
      access: "public",
      contentType: "video/mp4",
    });
    console.log("[finalize] stored final to blob:", url);

    return res.status(200).json({ url, pressSeconds, pressSource: source });
  } catch (err) {
    console.error("[finalize] error:", err.message, err.stack);
    return res.status(500).json({ error: err.message });
  } finally {
    for (const p of [inPath, endPath, voicePath, outPath]) unlink(p).catch(() => {});
  }
}
