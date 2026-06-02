// Finalize: take a Veo clip, add a real button click + ElevenLabs voiceover
// baked in at a fixed offset (cat presses within the first second per prompt).
//
// POST { videoUrl, voice, compliment } → { url }

import { put } from "@vercel/blob";
import { randomBytes } from "crypto";
import { execFile } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import ffmpegPath from "ffmpeg-static";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
  maxDuration: 60,
};

const ELEVEN_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVEN_MODEL = "eleven_multilingual_v2";

// Persona display name → ElevenLabs voice ID.
const VOICE_IDS = {
  "Barry White Core": "hILdTfuUq4LRBMrxHERr",
  "French Smooth Talker": "I1T6PEfqPxl45yKRN4aS",
  "Early 2000s Sean Connery": "csXxiUN2BUFflsCaDxPM",
};

// Fixed press timing. The Veo prompt puts the cat already in frame pressing
// within the first second, so 1.0s is a reliable contact point.
const PRESS_SECONDS = 1.0;
const VOICE_GAP_SECONDS = 0.5;  // VO starts this long after the click
const TARGET_SECONDS = 12;      // final video duration (Veo 8s + 4s freeze)

// click.mp3 is bundled via vercel.json includeFiles alongside this function.
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLICK_PATH = join(__dirname, "..", "public", "click.mp3");

// Per-persona voice settings.
const VOICE_SETTINGS = {
  "hILdTfuUq4LRBMrxHERr": { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },                   // Barry White Core
  "I1T6PEfqPxl45yKRN4aS": { stability: 0.5, similarity_boost: 0.75, style: 0.7, use_speaker_boost: true },                   // French Smooth Talker
  "csXxiUN2BUFflsCaDxPM": { stability: 0.5, similarity_boost: 0.75, style: 0.7, use_speaker_boost: true, speed: 0.82 },       // Early 2000s Sean Connery
};
const DEFAULT_VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true };

function run(bin, args) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${err.message}\n${stderr}`));
      resolve({ stdout, stderr });
    });
  });
}

async function generateVoice(voiceId, text, apiKey) {
  const r = await fetch(`${ELEVEN_BASE}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
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

  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });
  if (!ffmpegPath) return res.status(500).json({ error: "ffmpeg binary not available" });

  const { videoUrl, voice, compliment } = req.body || {};
  if (!videoUrl || !voice || !compliment) {
    return res.status(400).json({ error: "videoUrl, voice, and compliment are required" });
  }
  const voiceId = VOICE_IDS[voice];
  if (!voiceId) return res.status(400).json({ error: `Unknown voice: ${voice}` });

  const clickMs = Math.round(PRESS_SECONDS * 1000);
  const voiceMs = Math.round((PRESS_SECONDS + VOICE_GAP_SECONDS) * 1000);
  console.log(`[finalize] voice "${voice}" — click @ ${clickMs}ms, VO @ ${voiceMs}ms, click file: ${CLICK_PATH}`);

  const id = randomBytes(8).toString("hex");
  const inPath  = join(tmpdir(), `${id}-in.mp4`);
  const extPath = join(tmpdir(), `${id}-ext.mp4`);
  const voicePath = join(tmpdir(), `${id}-vo.mp3`);
  const outPath = join(tmpdir(), `${id}-out.mp4`);

  try {
    // 1. Download Veo clip + generate ElevenLabs voice in parallel.
    const [videoBuffer, voiceBuffer] = await Promise.all([
      fetch(videoUrl).then(r => {
        if (!r.ok) throw new Error(`Failed to fetch video: HTTP ${r.status}`);
        return r.arrayBuffer().then(Buffer.from);
      }),
      generateVoice(voiceId, compliment, elevenKey),
    ]);
    await writeFile(inPath, videoBuffer);
    await writeFile(voicePath, voiceBuffer);

    // 2. Extend the 8s Veo clip to TARGET_SECONDS by freezing the last frame.
    const padSeconds = TARGET_SECONDS - 8;
    await run(ffmpegPath, [
      "-y", "-i", inPath,
      "-vf", `tpad=stop_duration=${padSeconds}:stop_mode=clone`,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
      "-an",
      extPath,
    ]);

    // 3. Bake clean audio track: click.mp3 at press moment + boosted VO 0.5s later.
    //    Veo's own audio is discarded. apad fills silence to TARGET_SECONDS so the
    //    full 12s video plays out without being cut short.
    await run(ffmpegPath, [
      "-y",
      "-i", extPath,
      "-i", voicePath,
      "-i", CLICK_PATH,
      "-filter_complex",
        `[1:a]adelay=${voiceMs}:all=1,volume=2.2,aformat=channel_layouts=stereo[vo];` +
        `[2:a]adelay=${clickMs}:all=1,volume=1.0,aformat=channel_layouts=stereo[clk];` +
        `[clk][vo]amix=inputs=2:normalize=0:duration=longest,apad=whole_dur=${TARGET_SECONDS}[a]`,
      "-map", "0:v:0", "-map", "[a]",
      "-c:v", "copy", "-c:a", "aac", "-t", String(TARGET_SECONDS), "-movflags", "+faststart",
      outPath,
    ]);

    // 4. Store final MP4.
    const finalBuffer = await readFile(outPath);
    const { url } = await put(`cats/${id}-final.mp4`, finalBuffer, {
      access: "public",
      contentType: "video/mp4",
    });
    console.log("[finalize] stored final to blob:", url);

    return res.status(200).json({ url });
  } catch (err) {
    console.error("[finalize] error:", err.message, err.stack);
    return res.status(500).json({ error: err.message });
  } finally {
    for (const p of [inPath, extPath, voicePath, outPath]) {
      unlink(p).catch(() => {});
    }
  }
}
