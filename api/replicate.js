export default async function handler(req, res) {
  const token = process.env.REPLICATE_TOKEN || process.env.VITE_REPLICATE_TOKEN;
  if (!token) return res.status(500).json({ error: "REPLICATE_TOKEN not configured" });

  if (req.method === "POST") {
    const { url, body } = req.body;
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  if (req.method === "GET") {
    const { id } = req.query;
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
