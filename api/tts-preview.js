// POST { voice, text } → audio/mpeg
// Internal preview endpoint for testing ElevenLabs voice IDs.

const ELEVEN_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVEN_MODEL = "eleven_multilingual_v2";

const VOICE_IDS = {
  "Barry White Core": "hILdTfuUq4LRBMrxHERr",
  "French Smooth Talker": "I1T6PEfqPxl45yKRN4aS",
  "Early 2000s Sean Connery": "csXxiUN2BUFflsCaDxPM",
};

// Must mirror finalize.js VOICE_SETTINGS exactly so the tester reflects production.
const VOICE_SETTINGS = {
  "hILdTfuUq4LRBMrxHERr": { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
  "I1T6PEfqPxl45yKRN4aS": { stability: 0.5, similarity_boost: 0.75, style: 0.7, use_speaker_boost: true },
  "csXxiUN2BUFflsCaDxPM": { stability: 0.5, similarity_boost: 0.75, style: 0.7, use_speaker_boost: true, speed: 0.82 },
};
const DEFAULT_VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true };

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });

  const { voice, text } = req.body || {};
  if (!voice || !text) return res.status(400).json({ error: "voice and text are required" });

  // Accept either a persona display name or a raw ElevenLabs voice ID.
  const voiceId = VOICE_IDS[voice] || voice;
  if (!/^[a-zA-Z0-9]{20,}$/.test(voiceId)) {
    return res.status(400).json({ error: `Invalid voice: ${voice}` });
  }

  const r = await fetch(`${ELEVEN_BASE}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: ELEVEN_MODEL,
      voice_settings: VOICE_SETTINGS[voiceId] || DEFAULT_VOICE_SETTINGS,
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    return res.status(r.status).json({ error: `ElevenLabs error: ${body.slice(0, 300)}` });
  }

  const audio = Buffer.from(await r.arrayBuffer());
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Length", String(audio.length));
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(audio);
}
