// Gemini proxy for cat personality analysis.
// Uses gemini-2.0-flash — fast, no thinking tokens, well within 10s function limit.

export const config = {
  api: { maxDuration: 30 },
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-2.0-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.GOOGLE_API_KEY;
  if (!key) return res.status(500).json({ error: "GOOGLE_API_KEY not configured" });

  // Merge caller body but force thinkingBudget:0 so there are no slow thinking tokens
  const { generationConfig: callerConfig, ...rest } = req.body || {};
  const body = {
    ...rest,
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 512,
      ...callerConfig,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  try {
    const r = await fetch(
      `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || JSON.stringify(data) });
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
