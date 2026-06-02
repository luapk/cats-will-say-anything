// Finalize: take a SILENT Veo clip (click only), detect the button-press moment
// with Gemini, generate the persona voice with ElevenLabs, and bake the voice
// into the MP4 with ffmpeg — anchored just after the press so it can never play
// early. Returns the public URL of the final, shareable, audio-baked video.
//
// POST { videoUrl, voice, compliment } → { url }

import { put } from "@vercel/blob";
import { randomBytes } from "crypto";
import { execFile } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegPath from "ffmpeg-static";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
  maxDuration: 60,
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.5-flash";
const ELEVEN_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVEN_MODEL = "eleven_multilingual_v2";

// Persona display name → ElevenLabs voice ID.
const VOICE_IDS = {
  "Barry White Core": "hILdTfuUq4LRBMrxHERr",
  "French Smooth Talker": "FL0d5832ACnJkBaedeKX",
  "Early 2000s Sean Connery": "KJEm37Eur9OPxG4df2Cu",
};

const DEFAULT_PRESS_SECONDS = 2.0; // fallback if detection fails
const VOICE_GAP_SECONDS = 0.15;    // start voice just after the click

function run(bin, args) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${err.message}\n${stderr}`));
      resolve({ stdout, stderr });
    });
  });
}

// Ask Gemini for the exact second the paw presses the button down.
async function detectPressSeconds(videoBase64, key) {
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
    if (!r.ok) { console.error("[finalize] gemini detect failed:", JSON.stringify(data)); return DEFAULT_PRESS_SECONDS; }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    const t = Number(parsed.pressSeconds);
    if (!Number.isFinite(t) || t < 0 || t > 7.5) {
      console.warn("[finalize] press time out of range, using fallback:", t);
      return DEFAULT_PRESS_SECONDS;
    }
    console.log("[finalize] detected press seconds:", t);
    return t;
  } catch (e) {
    console.error("[finalize] press detection error, using fallback:", e.message);
    return DEFAULT_PRESS_SECONDS;
  }
}

// Generate the voiceover MP3 from the persona's fixed ElevenLabs voice ID.
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
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
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

    // 2 & 3. Detect press moment and generate the voice — in parallel.
    const [pressSeconds, voiceBuffer] = await Promise.all([
      detectPressSeconds(videoBuffer.toString("base64"), googleKey),
      generateVoice(voiceId, compliment, elevenKey),
    ]);
    await writeFile(voicePath, voiceBuffer);

    const delayMs = Math.round((pressSeconds + VOICE_GAP_SECONDS) * 1000);
    console.log(`[finalize] voice "${voice}" at ${pressSeconds}s (+${VOICE_GAP_SECONDS}s) = ${delayMs}ms`);

    // 4. Bake the voice into the clip, keeping the original click audio.
    //    Primary: mix Veo's click audio with the delayed voice.
    //    Fallback: if the clip has no audio track, lay the voice over silence.
    const mixArgs = [
      "-y", "-i", inPath, "-i", voicePath,
      "-filter_complex", `[1:a]adelay=${delayMs}|${delayMs}[vo];[0:a][vo]amix=inputs=2:normalize=0:duration=longest[a]`,
      "-map", "0:v:0", "-map", "[a]",
      "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart",
      outPath,
    ];
    try {
      await run(ffmpegPath, mixArgs);
    } catch (mixErr) {
      console.warn("[finalize] amix failed (likely no source audio), laying voice over silence:", mixErr.message);
      const soloArgs = [
        "-y", "-i", inPath, "-i", voicePath,
        "-filter_complex", `[1:a]adelay=${delayMs}|${delayMs}[a]`,
        "-map", "0:v:0", "-map", "[a]",
        "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", "-shortest",
        outPath,
      ];
      await run(ffmpegPath, soloArgs);
    }

    // 5. Store the final audio-baked MP4.
    const finalBuffer = await readFile(outPath);
    const { url } = await put(`cats/${id}-final.mp4`, finalBuffer, {
      access: "public",
      contentType: "video/mp4",
    });
    console.log("[finalize] stored final to blob:", url);

    return res.status(200).json({ url, pressSeconds });
  } catch (err) {
    console.error("[finalize] error:", err.message, err.stack);
    return res.status(500).json({ error: err.message });
  } finally {
    // Best-effort temp cleanup.
    for (const p of [inPath, voicePath, outPath]) {
      unlink(p).catch(() => {});
    }
  }
}
