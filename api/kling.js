async function generateToken(accessKey, secretKey) {
  const b64url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

  const header = { alg: "HS256", typ: "JWT", kid: accessKey };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 };
  const signingInput = `${b64url(header)}.${b64url(payload)}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  const sigB64 = Buffer.from(sig)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${signingInput}.${sigB64}`;
}

export const config = {
  api: { bodyParser: { sizeLimit: "20mb" } },
};

export default async function handler(req, res) {
  const { KLING_ACCESS_KEY, KLING_SECRET_KEY } = process.env;
  if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
    return res.status(500).json({ error: "KLING_ACCESS_KEY / KLING_SECRET_KEY not configured" });
  }

  try {
    const token = await generateToken(KLING_ACCESS_KEY, KLING_SECRET_KEY);

    if (req.method === "POST") {
      const { image, prompt } = req.body;
      // Strip data URI prefix — Kling expects raw base64
      const imageData = image.startsWith("data:") ? image.split(",")[1] : image;

      const r = await fetch("https://api.klingai.com/v1/videos/image2video", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_name: "kling-v1",
          image: imageData,
          prompt,
          duration: "5",
          aspect_ratio: "9:16",
          mode: "std",
          cfg_scale: 0.5,
        }),
      });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { error: text }; }
      return res.status(r.status).json(data);
    }

    if (req.method === "GET") {
      const { id } = req.query;
      const r = await fetch(`https://api.klingai.com/v1/videos/image2video/${id}`, {
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
