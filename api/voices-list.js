// GET → { voices: [{ voice_id, name, category, labels, preview_url }] }
// Returns all ElevenLabs voices available on the account, sorted by name.

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });

  const r = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });
  if (!r.ok) {
    const body = await r.text();
    return res.status(r.status).json({ error: `ElevenLabs error: ${body.slice(0, 300)}` });
  }
  const data = await r.json();
  const voices = (data.voices || [])
    .map(v => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category,
      labels: v.labels || {},
      preview_url: v.preview_url || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ voices });
}
