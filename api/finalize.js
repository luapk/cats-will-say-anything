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
  maxDuration: 300,
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
const LOGO_DURATION = 2.0;          // seconds before end to show the Temptations logo

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
const FRAME_FPS = 8;            // frames per second to sample (0.125s resolution)
const FRAME_WINDOW = 4.0;       // sample only the first N seconds (press is early)

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

// Ending clip generation: extract last frame of main clip, generate a 5s
// continuation via Veo (slow zoom out), then return the stored Blob URL.
const VEO_BASE_FIN = "https://generativelanguage.googleapis.com/v1beta";
const VEO_MODEL_FIN = "veo-3.1-generate-preview";

function buildEndingPrompt() {
  return (
    `STARTING FRAME: The provided image is the EXACT first frame of this clip. ` +
    `Match it precisely — same cat, same position, same yellow studio, same lighting. ` +
    `\n\n` +
    `ACTION: Over the full 8 seconds, the camera executes one slow, smooth, continuous pull-back — a gentle recession away from the cat. ` +
    `The cat holds completely still, sitting upright, staring directly into the lens throughout. ` +
    `No movement from the cat. Simply a steady, slow recession that ends on a wide shot of the cat in the yellow studio. ` +
    `\n\n` +
    `SCENE: Bright solid yellow studio floor and background. Only the cat. ` +
    `\n\n` +
    `NO HUMANS: No human figures, hands, or body parts. Only the cat. ` +
    `NO TEXT ON SCREEN: No captions, labels, or text of any kind. ` +
    `VISUAL STYLE: Cinematic, warm studio lighting, 9:16 portrait, 8 seconds.`
  );
}

async function generateEndingClip(mainPath, googleKey) {
  // Extract last frame
  const { stderr } = await capture(ffmpegPath, ["-hide_banner", "-i", mainPath]);
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) { console.warn("[finalize] could not parse duration for ending — skipping"); return null; }
  const dur = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  const seekTo = Math.max(0, dur - 0.15).toFixed(3);

  const frameId = randomBytes(4).toString("hex");
  const framePath = join(tmpdir(), `${frameId}-lastframe.jpg`);
  try {
    await run(ffmpegPath, [
      "-y", "-ss", seekTo, "-i", mainPath,
      "-vframes", "1", "-q:v", "3", "-f", "image2", framePath,
    ]);
  } catch (e) {
    console.warn("[finalize] last-frame extraction failed:", e.message);
    return null;
  }

  let frameBase64;
  try {
    frameBase64 = (await readFile(framePath)).toString("base64");
  } finally {
    unlink(framePath).catch(() => {});
  }

  // Start Veo ending job
  const body = {
    instances: [{
      prompt: buildEndingPrompt(),
      image: { bytesBase64Encoded: frameBase64, mimeType: "image/jpeg" },
    }],
    parameters: { aspectRatio: "9:16", durationSeconds: 8, sampleCount: 1 },
  };
  let opName;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(x => setTimeout(x, attempt * 4000));
    const r = await fetch(`${VEO_BASE_FIN}/models/${VEO_MODEL_FIN}:predictLongRunning?key=${googleKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (r.ok && data?.name) { opName = data.name; console.log("[finalize] ending Veo job started:", opName); break; }
    console.warn(`[finalize] ending Veo start attempt ${attempt + 1} failed HTTP ${r.status}:`, JSON.stringify(data).slice(0, 300));
    if (r.status !== 429 && r.status !== 503) return null;
  }
  if (!opName) return null;

  // Poll ending operation (max 3 min)
  for (let i = 0; i < 36; i++) {
    await new Promise(x => setTimeout(x, 5000));
    const r = await fetch(`${VEO_BASE_FIN}/${opName}?key=${googleKey}`);
    const data = await r.json();
    if (!r.ok || data.error) { console.warn("[finalize] ending poll error:", JSON.stringify(data).slice(0, 200)); return null; }
    if (!data.done) continue;

    const samples = data.response?.generateVideoResponse?.generatedSamples || data.response?.generatedSamples;
    const vidUri = samples?.[0]?.video?.uri;
    const vidB64 = samples?.[0]?.video?.bytesBase64Encoded;
    if (!vidUri && !vidB64) { console.warn("[finalize] ending clip filtered or empty"); return null; }

    let buf;
    if (vidUri) {
      let url = vidUri;
      if (url.startsWith("gs://")) {
        const rest = url.slice(5);
        const slash = rest.indexOf("/");
        url = `https://storage.googleapis.com/download/storage/v1/b/${rest.slice(0,slash)}/o/${encodeURIComponent(rest.slice(slash+1))}?alt=media&key=${googleKey}`;
      } else if (!url.includes("key=")) url += (url.includes("?") ? "&" : "?") + `key=${googleKey}`;
      const vr = await fetch(url);
      if (!vr.ok) { console.warn("[finalize] ending clip download failed:", vr.status); return null; }
      buf = Buffer.from(await vr.arrayBuffer());
    } else {
      buf = Buffer.from(vidB64, "base64");
    }

    const eid = randomBytes(6).toString("hex");
    const { url: blobUrl } = await put(`cats/${eid}-ending.mp4`, buf, { access: "public", contentType: "video/mp4" });
    console.log("[finalize] ending clip stored:", blobUrl);
    return blobUrl;
  }
  console.warn("[finalize] ending clip timed out");
  return null;
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

// Locate the Temptations logo PNG for the closing overlay.
function resolveLogoPath() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "public/logo.png"),
    join(here, "../public/logo.png"),
    join(here, "public/logo.png"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) { console.log("[finalize] found logo.png:", p); return p; }
  }
  console.warn("[finalize] logo.png not found — skipping logo overlay");
  return null;
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

  const { videoUrl, voice, compliment } = req.body || {};
  if (!videoUrl || !voice || !compliment) {
    return res.status(400).json({ error: "videoUrl, voice, and compliment are required" });
  }
  const voiceId = VOICE_IDS[voice];
  if (!voiceId) return res.status(400).json({ error: `Unknown voice: ${voice}` });

  const id = randomBytes(8).toString("hex");
  const mainPath = join(tmpdir(), `${id}-main.mp4`);
  const endPath  = join(tmpdir(), `${id}-end.mp4`);
  const voicePath = join(tmpdir(), `${id}-vo.mp3`);
  const outPath  = join(tmpdir(), `${id}-out.mp4`);

  try {
    // 1. Download the main clip.
    const vresp = await fetch(videoUrl);
    if (!vresp.ok) throw new Error(`Failed to fetch main clip: HTTP ${vresp.status}`);
    await writeFile(mainPath, Buffer.from(await vresp.arrayBuffer()));

    // 2. Generate ending clip (extract last frame → 5s Veo) and voice/assets in parallel.
    //    Ending is non-fatal: if it fails we fall back to main clip only.
    const [voiceBuffer, visual, mainLen, endingVideoUrl, clickPath, logoPath] = await Promise.all([
      generateVoice(voiceId, compliment, elevenKey),
      detectPressVisual(mainPath, googleKey),
      mediaDuration(mainPath).then(d => d || 8),
      generateEndingClip(mainPath, googleKey),
      resolveClickPath(),
      Promise.resolve(resolveLogoPath()),
    ]);

    // Download ending clip if generated.
    let endLen = 0;
    if (endingVideoUrl) {
      const er = await fetch(endingVideoUrl);
      if (er.ok) {
        await writeFile(endPath, Buffer.from(await er.arrayBuffer()));
        endLen = await mediaDuration(endPath).then(d => d || 5);
      } else {
        console.warn("[finalize] could not download ending clip — skipping");
      }
    }
    await writeFile(voicePath, voiceBuffer);

    // 3. Resolve press moment.
    let { pressSeconds, source } = resolvePress(visual);
    pressSeconds = Math.min(Math.max(pressSeconds + CLICK_OFFSET, PRESS_MIN_SECONDS), mainLen - 0.1);
    console.log(`[finalize] press=${pressSeconds.toFixed(3)}s via ${source} (visual=${visual}, +${CLICK_OFFSET} offset)`);

    const totalLen = mainLen + endLen;
    const clickMs = Math.round(pressSeconds * 1000);
    const voiceStart = pressSeconds + VOICE_GAP_SECONDS;
    const voiceMs = Math.round(voiceStart * 1000);
    const logoStart = Math.max(0, totalLen - LOGO_DURATION);
    console.log(`[finalize] click@${clickMs}ms voice@${voiceMs}ms main=${mainLen.toFixed(2)}s end=${endLen.toFixed(2)}s total=${totalLen.toFixed(2)}s`);

    // 4. Build ffmpeg command.
    //    Inputs:
    //      0 = main clip
    //      1 = ending clip  (if present)
    //      2 = click.mp3
    //      3 = voice.mp3
    //      4 = logo.png     (if present, -loop 1)
    //    Without ending: 0=main, 1=click, 2=voice, 3=logo
    const hasEnding = !!endingVideoUrl && endLen > 0;
    const clickIdx = hasEnding ? 2 : 1;
    const voiceIdx = hasEnding ? 3 : 2;
    const logoIdx  = hasEnding ? 4 : 3;

    // Video chain: concat if we have an ending, then overlay logo if available.
    let videoChain;
    if (hasEnding) {
      videoChain =
        `[0:v]setsar=1,fps=24,format=yuv420p[v0];` +
        `[1:v]setsar=1,fps=24,format=yuv420p[v1];` +
        `[v0][v1]concat=n=2:v=1:a=0[cat]`;
    } else {
      videoChain = `[0:v]setsar=1,fps=24,format=yuv420p[cat]`;
    }

    let videoOut;
    if (logoPath) {
      videoChain +=
        `;[${logoIdx}:v]scale=320:-1[logo]` +
        `;[cat][logo]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2` +
          `:enable='gte(t,${logoStart.toFixed(3)})',format=yuv420p[v]`;
      videoOut = "[v]";
    } else {
      videoChain += `;[cat]copy[v]`;
      videoOut = "[v]";
    }

    // Audio chain: click + voice mixed over the full film.
    const audioChain =
      `[${clickIdx}:a]atrim=start=${CLICK_LEAD_TRIM},asetpts=PTS-STARTPTS,volume=${CLICK_VOLUME},` +
        `aformat=channel_layouts=stereo,adelay=${clickMs}|${clickMs}[click];` +
      `[${voiceIdx}:a]aformat=channel_layouts=stereo,adelay=${voiceMs}|${voiceMs}[vo];` +
      `[click][vo]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.97[a]`;

    const filter = videoChain + `;` + audioChain;

    const ffmpegArgs = ["-y"];
    ffmpegArgs.push("-i", mainPath);
    if (hasEnding) ffmpegArgs.push("-i", endPath);
    ffmpegArgs.push("-i", clickPath, "-i", voicePath);
    if (logoPath) ffmpegArgs.push("-loop", "1", "-i", logoPath);
    ffmpegArgs.push(
      "-filter_complex", filter,
      "-map", videoOut, "-map", "[a]",
      "-t", totalLen.toFixed(3),
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
      outPath,
    );

    await run(ffmpegPath, ffmpegArgs);

    // 5. Store and return.
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
    for (const p of [mainPath, endPath, voicePath, outPath]) unlink(p).catch(() => {});
  }
}
