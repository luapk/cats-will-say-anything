// Finalize: take a Veo clip (no usable audio) and bake the audio track from
// scratch — a crisp click.mp3 at the exact button-press moment, then the
// ElevenLabs voice just after it. The press moment is found by VISUAL MOTION
// DETECTION (the frame of peak inter-frame motion = the paw striking the button),
// semantically gated by a coarse Gemini visual estimate, with a fixed fallback.
// Veo's original audio is discarded entirely.
//
// Why motion detection (not Veo's audio): asking Veo for any sound — even a
// single click — trips its audio safety filter, so the clip is generated with no
// audio instructions at all. We therefore can't rely on a click to time against.
// Instead we measure per-frame motion energy: the cat reaching out and striking
// the button is the dominant motion in the opening seconds, and its peak pins the
// contact frame far more tightly (~1 frame) than an LLM eyeballing frames (±0.5s).
// Gemini supplies only a rough window so unrelated motion (a twitch, the crash
// zoom) can never be mistaken for the press. The last frame is frozen so a long
// or late voiceover is never cut off.
//
// POST { videoUrl, voice, compliment } → { url, pressSeconds, pressSource }

import { put } from "@vercel/blob";
import { randomBytes } from "crypto";
import { execFile } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import ffmpegPath from "ffmpeg-static";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
  maxDuration: 60,
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

// Press-detection tuning. Gemini's visual estimate is the TRUSTED anchor (it
// understands what a button-press is); per-frame motion is used only to refine
// that estimate to the exact contact frame when it closely agrees — it never
// overrides Gemini, because on cinematic footage (camera moves, crash zoom) the
// raw motion peak is unreliable.
const DEFAULT_PRESS_SECONDS = 1.1;  // blind fallback (prompt makes the cat press ~1s in)
const PRESS_MIN_SECONDS = 0.2;      // ignore the very start (encode warm-up)
const PRESS_MAX_SECONDS = 4.5;      // ignore late motion (e.g. the crash-zoom)
const GEMINI_WINDOW = 0.3;          // refine to a motion peak only within ± this of Gemini
const MOTION_MIN_ENERGY = 0.8;      // a peak below this means "no real motion found"

// Audio layout. The real click.mp3 is ~0.55s long with ~0.05s of lead-in silence;
// CLICK_LEAD_TRIM drops that silence so the click's transient lands ON the press,
// and VOICE_GAP_SECONDS (> the click's length) keeps the voice strictly AFTER it.
const CLICK_LEAD_TRIM = 0.05;       // leading silence trimmed off the click file
const CLICK_VOLUME = 2.0;           // boost — the source click is quiet (~ -33 dB mean)
const VOICE_GAP_SECONDS = 0.65;     // press → voice; the click fully finishes first
const TAIL_SECONDS = 0.6;           // breathing room held after the voice ends

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

// Visual motion detection: measure per-frame motion energy (mean luma of the
// frame-to-frame difference). The paw reaching out and striking the button is
// the dominant motion in the opening seconds, so the energy peak pins the contact
// frame. Returns { samples:[{t,e}], duration }.
async function detectMotion(inPath) {
  // metadata=print writes to stdout (file=-); ffmpeg's own logs go to stderr.
  const { stdout, stderr } = await capture(ffmpegPath, [
    "-hide_banner", "-i", inPath,
    "-vf", "tblend=all_mode=difference,signalstats,metadata=print:file=-",
    "-f", "null", "-",
  ]);
  const duration = parseDuration(stderr);
  const samples = [];
  let t = null;
  for (const line of stdout.split("\n")) {
    const tm = line.match(/pts_time:([0-9.]+)/);
    if (tm) { t = Number(tm[1]); continue; }
    const em = line.match(/YAVG=([0-9.]+)/);
    if (em && t != null) samples.push({ t, e: Number(em[1]) });
  }
  return { samples, duration };
}

// Highest-energy sample within [lo, hi]; null if none meet the motion floor.
function motionPeak(samples, lo, hi) {
  let best = null;
  for (const s of samples) {
    if (s.t < lo || s.t > hi) continue;
    if (!best || s.e > best.e) best = s;
  }
  return best && best.e >= MOTION_MIN_ENERGY ? best.t : null;
}

// Coarse semantic estimate: roughly when does Gemini see the paw hit the button?
// Used only as a sanity window around the precise audio onset.
async function detectPressVisual(videoBase64, key) {
  try {
    const r = await fetch(`${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: "video/mp4", data: videoBase64 } },
            { text:
              `This is a short video of a cat pressing a yellow button with its paw. ` +
              `Identify the exact moment the paw makes full contact and presses the button down (the click). ` +
              `Respond ONLY as JSON, no markdown: {"pressSeconds": N} where N is that time in seconds as a decimal.` }
          ]
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 64, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    const data = await r.json();
    if (!r.ok) { console.error("[finalize] gemini detect failed:", JSON.stringify(data)); return null; }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    const t = Number(parsed.pressSeconds);
    if (!Number.isFinite(t) || t < 0 || t > 7.5) return null;
    return t;
  } catch (e) {
    console.error("[finalize] visual press detection error:", e.message);
    return null;
  }
}

// Gemini is the trusted anchor. Refine to a nearby motion peak only when it
// closely agrees (snaps to the exact contact frame); never let motion override.
function resolvePress(samples, visual) {
  if (visual == null) return { pressSeconds: DEFAULT_PRESS_SECONDS, source: "default" };
  const peak = motionPeak(samples, visual - GEMINI_WINDOW, visual + GEMINI_WINDOW);
  if (peak != null) return { pressSeconds: peak, source: "visual+motion" };
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

  const { videoUrl, voice, compliment } = req.body || {};
  if (!videoUrl || !voice || !compliment) {
    return res.status(400).json({ error: "videoUrl, voice, and compliment are required" });
  }
  const voiceId = VOICE_IDS[voice];
  if (!voiceId) return res.status(400).json({ error: `Unknown voice: ${voice}` });

  const id = randomBytes(8).toString("hex");
  const inPath = join(tmpdir(), `${id}-in.mp4`);
  const voicePath = join(tmpdir(), `${id}-vo.mp3`);
  const outPath = join(tmpdir(), `${id}-out.mp4`);

  try {
    // 1. Download the silent Veo clip.
    const vresp = await fetch(videoUrl);
    if (!vresp.ok) throw new Error(`Failed to fetch source video: HTTP ${vresp.status}`);
    const videoBuffer = Buffer.from(await vresp.arrayBuffer());
    await writeFile(inPath, videoBuffer);

    // 2. In parallel: generate the voice, get the coarse visual press estimate,
    //    detect per-frame motion, and resolve the click asset.
    const [voiceBuffer, visual, { samples, duration }, clickPath] = await Promise.all([
      generateVoice(voiceId, compliment, elevenKey),
      detectPressVisual(videoBuffer.toString("base64"), googleKey),
      detectMotion(inPath),
      resolveClickPath(),
    ]);
    await writeFile(voicePath, voiceBuffer);

    // 3. Resolve the press moment from the two signals.
    const videoLen = duration || (await mediaDuration(inPath)) || 8;
    let { pressSeconds, source } = resolvePress(samples, visual);
    pressSeconds = Math.min(Math.max(pressSeconds, PRESS_MIN_SECONDS), videoLen - 0.1);
    console.log(`[finalize] press=${pressSeconds.toFixed(3)}s via ${source} (visual=${visual})`);

    // 4. Compute timing and the freeze-extend needed so the voice is never cut.
    const voiceLen = (await mediaDuration(voicePath)) || 4;
    const clickMs = Math.round(pressSeconds * 1000);
    const voiceStart = pressSeconds + VOICE_GAP_SECONDS;
    const voiceMs = Math.round(voiceStart * 1000);
    const target = Math.max(videoLen, voiceStart + voiceLen + TAIL_SECONDS);
    const extend = Math.max(0, target - videoLen);
    console.log(`[finalize] click@${clickMs}ms voice@${voiceMs}ms videoLen=${videoLen.toFixed(2)} ` +
      `voiceLen=${voiceLen.toFixed(2)} target=${target.toFixed(2)} extend=${extend.toFixed(2)}`);

    // 5. Build the final video: freeze-extend the last frame, then bake the audio
    //    track from scratch — click at the press, voice just after. Veo's own
    //    audio is mapped from nothing (discarded entirely).
    // Click: trim its lead-in silence so the transient lands ON the press, boost
    // it (the source is quiet), force stereo, then delay to the press moment.
    // Voice: force stereo and delay to press + gap so it starts AFTER the click.
    const filter =
      `[0:v]tpad=stop_mode=clone:stop_duration=${extend.toFixed(3)},setsar=1[v];` +
      `[1:a]atrim=start=${CLICK_LEAD_TRIM},asetpts=PTS-STARTPTS,volume=${CLICK_VOLUME},` +
        `aformat=channel_layouts=stereo,adelay=${clickMs}|${clickMs}[click];` +
      `[2:a]aformat=channel_layouts=stereo,adelay=${voiceMs}|${voiceMs}[vo];` +
      `[click][vo]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.97[a]`;
    await run(ffmpegPath, [
      "-y",
      "-i", inPath,         // 0: video (audio ignored)
      "-i", clickPath,      // 1: click.mp3
      "-i", voicePath,      // 2: ElevenLabs voice
      "-filter_complex", filter,
      "-map", "[v]", "-map", "[a]",
      "-t", target.toFixed(3),
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
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
    for (const p of [inPath, voicePath, outPath]) unlink(p).catch(() => {});
  }
}
