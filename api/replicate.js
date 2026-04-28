export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

export default async function handler(req, res) {
  const token = process.env.REPLICATE_TOKEN || process.env.VITE_REPLICATE_TOKEN;
  if (!token) return res.status(500).json({ error: "REPLICATE_TOKEN not configured" });

  try {
    if (req.method === "POST") {
      const { action, url, body, b64, mime } = req.body;

      // Upload image to Replicate file storage, returns { urls: { get: "https://..." } }
      if (action === "upload") {
        const buf = Buffer.from(b64, "base64");
        const r = await fetch("https://api.replicate.com/v1/files", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": mime,
            "Content-Length": String(buf.length),
          },
          body: buf,
        });
        const text = await r.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { error: text }; }
        return res.status(r.status).json(data);
      }

      const r = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { error: text }; }
      return res.status(r.status).json(data);
    }

    if (req.method === "GET") {
      const { id } = req.query;
      const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { error: text }; }
      return res.status(r.status).json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
