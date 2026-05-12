import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { put } from "@vercel/blob";
import ffmpegPath from "ffmpeg-static";

export const config = {
  api: { bodyParser: { sizeLimit: "5mb" } },
};

const execFileAsync = promisify(execFile);

const VOICE_DEFAULTS = {
  "Barry White Core":     process.env.ELEVEN_VOICE_BARRY_WHITE || "pNInz6obpgDQGcFmaJgB",
  "French Smooth Talker": process.env.ELEVEN_VOICE_FRENCH      || "ErXwobaYiN019PkySvjV",
  "Noir Detective":       process.env.ELEVEN_VOICE_NOIR        || "yoZ06aMxZJJ28mfd3POQ",
};

async function generateAudio(voice, text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");
  const voiceId = VOICE_DEFAULTS[voice];
  if (!voiceId) throw new Error(`Unknown voice: ${voice}`);

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2",
      voice_settings: { stability: 0.45, similarity_boost: 0.82 },
    }),
  });
  if (!r.ok) throw new Error(`ElevenLabs error: ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { videoUrl, voice, text, audioOffsetMs = 2000 } = req.body || {};
  if (!videoUrl || !voice || !text) {
    return res.status(400).json({ error: "videoUrl, voice, and text are required" });
  }

  const id = randomBytes(8).toString("hex");
  const tmpDir = "/tmp";
  const videoPath = join(tmpDir, `${id}-in.mp4`);
  const audioPath = join(tmpDir, `${id}-audio.mp3`);
  const outputPath = join(tmpDir, `${id}-out.mp4`);

  try {
    // Fetch Kling video and generate ElevenLabs audio in parallel
    const [videoResp, audioBuffer] = await Promise.all([
      fetch(videoUrl),
      generateAudio(voice, text),
    ]);

    if (!videoResp.ok) throw new Error(`Failed to fetch video: ${videoResp.status}`);
    const videoBuffer = Buffer.from(await videoResp.arrayBuffer());

    await Promise.all([
      writeFile(videoPath, videoBuffer),
      writeFile(audioPath, audioBuffer),
    ]);

    // Bake: delay audio by audioOffsetMs, overlay on silent video
    await execFileAsync(ffmpegPath, [
      "-i", videoPath,
      "-i", audioPath,
      "-filter_complex", `[1:a]adelay=${audioOffsetMs}|${audioOffsetMs}[a]`,
      "-map", "0:v",
      "-map", "[a]",
      "-c:v", "copy",
      "-shortest",
      "-y",
      outputPath,
    ]);

    const bakedBuffer = await readFile(outputPath);
    const { url } = await put(`cats/${id}.mp4`, bakedBuffer, {
      access: "public",
      contentType: "video/mp4",
    });

    return res.status(200).json({ url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    // Clean up tmp files
    await Promise.allSettled([
      unlink(videoPath),
      unlink(audioPath),
      unlink(outputPath),
    ]);
  }
}
