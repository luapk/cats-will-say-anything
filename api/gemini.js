// Gemini proxy for cat personality analysis.
// Accepts a Gemini-format generateContent body, injects the API key server-side.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.GOOGLE_API_KEY;
  if (!key) return res.status(500).json({ error: "GOOGLE_API_KEY not configured" });

  const { model = "gemini-2.5-flash-preview-05-20", ...body } = req.body || {};

  try {
    const r = await fetch(
      `${GEMINI_BASE}/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
