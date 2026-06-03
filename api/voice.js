// Pre-generate voiceover audio from ElevenLabs and store to Blob.
// Called early in the film creation flow (in parallel with Veo) so the audio
// is ready before finalize starts, saving ~3-5s off the finalize phase.
// POST { voice, compliment } → { url }

import { put } from "@vercel/blob";
import { randomBytes } from "crypto";

const ELEVEN_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVEN_MODEL = "eleven_multilingual_v2";

const VOICE_IDS = {
  "Barry White Core": "hILdTfuUq4LRBMrxHERr",
  "French Smooth Talker": "I1T6PEfqPxl45yKRN4aS",
  "Highland Heartthrob": "csXxiUN2BUFflsCaDxPM",
};

const VOICE_SETTINGS = {
  "hILdTfuUq4LRBMrxHERr": { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
  "I1T6PEfqPxl45yKRN4aS": { stability: 0.5, similarity_boost: 0.75, style: 0.7, use_speaker_boost: true },
  "csXxiUN2BUFflsCaDxPM": { stability: 0.5, similarity_boost: 0.75, style: 0.7, use_speaker_boost: true, speed: 0.82 },
};
const DEFAULT_VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });

  const { voice, compliment } = req.body || {};
  if (!voice || !compliment) return res.status(400).json({ error: "voice and compliment are required" });

  const voiceId = VOICE_IDS[voice];
  if (!voiceId) return res.status(400).json({ error: `Unknown voice: ${voice}` });

  const r = await fetch(`${ELEVEN_BASE}/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": elevenKey, "Content-Type": "application/json", "Accept": "audio/mpeg" },
    body: JSON.stringify({
      text: compliment,
      model_id: ELEVEN_MODEL,
      voice_settings: VOICE_SETTINGS[voiceId] || DEFAULT_VOICE_SETTINGS,
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    return res.status(r.status).json({ error: `ElevenLabs TTS failed: HTTP ${r.status} — ${body.slice(0, 300)}` });
  }

  const buf = Buffer.from(await r.arrayBuffer());
  const id = randomBytes(6).toString("hex");
  const { url } = await put(`cats/${id}-vo.mp3`, buf, { access: "public", contentType: "audio/mpeg" });
  console.log("[voice] stored:", url);
  return res.status(200).json({ url });
}
