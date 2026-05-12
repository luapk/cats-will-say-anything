// Maps voice archetype names to ElevenLabs voice IDs.
// Override any with ELEVEN_VOICE_{KEY} environment variables.
const VOICE_DEFAULTS = {
  "Barry White Core":               process.env.ELEVEN_VOICE_BARRY_WHITE   || "pNInz6obpgDQGcFmaJgB", // Adam
  "French Smooth Talker":           process.env.ELEVEN_VOICE_FRENCH        || "ErXwobaYiN019PkySvjV", // Antoni
  "Reluctant Life Coach":           process.env.ELEVEN_VOICE_LIFE_COACH    || "TxGEqnHWrfWFTfGW9XjX", // Josh
  "Passive Aggressive HR Manager":  process.env.ELEVEN_VOICE_HR_MANAGER    || "EXAVITQu4vr4xnSDxMaL", // Bella
  "Early 2000s Sean Connery":       process.env.ELEVEN_VOICE_CONNERY       || "VR6AewLTigWG4xSOukaG", // Arnold
  "Noir Detective":                 process.env.ELEVEN_VOICE_NOIR          || "yoZ06aMxZJJ28mfd3POQ", // Sam
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });

  const { voice, text } = req.body || {};
  if (!voice || !text) return res.status(400).json({ error: "voice and text required" });

  const voiceId = VOICE_DEFAULTS[voice];
  if (!voiceId) return res.status(400).json({ error: `Unknown voice: ${voice}` });

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2",
        voice_settings: { stability: 0.45, similarity_boost: 0.82 },
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }

    const buffer = await r.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return res.status(200).json({ audioBase64: base64, audioMime: "audio/mpeg" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
