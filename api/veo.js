// Veo 3.1 — image-to-video.
// POST  { imageBase64, imageMimeType, voiceStyle, compliment }  → { operationName }
// GET   ?op={operationName} → { status: "pending"|"done"|"failed", url?, error? }

import { put } from "@vercel/blob";
import { randomBytes } from "crypto";

const VEO_BASE = "https://generativelanguage.googleapis.com/v1beta";
const VEO_MODEL = "veo-3.1-generate-preview";

// Robustly turn any Google error response shape into a plain string.
function extractErrorMessage(data) {
  const e = data?.error;
  if (!e) return JSON.stringify(data);
  if (typeof e === "string") return e;
  // e.message can be null on some Google error shapes — fall through to status/details
  const msg = e.message || e.status || e.code;
  if (msg) return String(msg);
  return JSON.stringify(e);
}

function buildPrompt(voiceStyle, compliment) {
  return (
    `The cat from the reference photo walks slowly across a bright solid yellow background ` +
    `toward a large novelty button on the floor. The button has a wide rounded red base ` +
    `with a yellow dome-shaped top cap, and a small white cloud-shaped badge in the centre ` +
    `that reads "Temptations" in black lettering. ` +
    `The cat's walk is unhurried — almost insulting in its lack of urgency. ` +
    `The cat stops directly in front of the button, looks at camera for one beat, ` +
    `then presses the yellow dome firmly with one paw using minimum effort. ` +
    `The button makes a satisfying click. Then — only after the button is pressed — ` +
    `a voice-over in ${voiceStyle} says: "${compliment}" ` +
    `While the voice-over plays, the cat turns its head and stares directly into the camera ` +
    `with an expression of deep, grumpy contempt — unblinking, utterly unbothered. ` +
    `No voice plays before the button press. Silence before the press, voice after. ` +
    `Clean yellow studio background, cinematic lighting, shallow depth of field, ` +
    `9:16 portrait, 8 seconds.`
  );
}

function extractVideoUrl(response) {
  const samples =
    response?.generateVideoResponse?.generatedSamples ||
    response?.generatedSamples;
  if (samples?.[0]?.video?.uri) return { uri: samples[0].video.uri };
  if (samples?.[0]?.video?.bytesBase64Encoded) return { b64: samples[0].video.bytesBase64Encoded };
  if (response?.videos?.[0]?.uri) return { uri: response.videos[0].uri };
  if (response?.videos?.[0]?.bytesBase64Encoded) return { b64: response.videos[0].bytesBase64Encoded };
  return null;
}

export const config = {
  api: { bodyParser: { sizeLimit: "20mb" } },
};

export default async function handler(req, res) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return res.status(500).json({ error: "GOOGLE_API_KEY not configured" });

  // ── POST: start generation ──────────────────────────────────────────────
  if (req.method === "POST") {
    const { imageBase64, imageMimeType = "image/jpeg", voiceStyle, compliment } = req.body || {};
    if (!imageBase64 || !voiceStyle || !compliment) {
      return res.status(400).json({ error: "imageBase64, voiceStyle, and compliment are required" });
    }

    const body = {
      instances: [{
        prompt: buildPrompt(voiceStyle, compliment),
        image: { bytesBase64Encoded: imageBase64, mimeType: imageMimeType },
      }],
      parameters: { aspectRatio: "9:16", durationSeconds: 8, sampleCount: 1 },
    };

    let r, data;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise(x => setTimeout(x, attempt * 4000));
      r = await fetch(`${VEO_BASE}/models/${VEO_MODEL}:predictLongRunning?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      data = await r.json();
      if (r.ok) break;
      console.error(`[veo POST] attempt ${attempt + 1} failed — HTTP ${r.status}:`, JSON.stringify(data));
      const isRetryable = r.status === 429 || r.status === 503;
      if (!isRetryable || attempt === 3) {
        return res.status(r.status).json({ error: extractErrorMessage(data) });
      }
    }

    const operationName = data?.name;
    if (!operationName) {
      console.error("[veo POST] no operationName in response:", JSON.stringify(data));
      return res.status(500).json({ error: "No operation name in response: " + JSON.stringify(data) });
    }

    return res.status(200).json({ operationName });
  }

  // ── GET: poll operation ─────────────────────────────────────────────────
  if (req.method === "GET") {
    const op = req.query.op;
    if (!op) return res.status(400).json({ error: "op query param required" });

    try {
      const r = await fetch(`${VEO_BASE}/${op}?key=${key}`, {
        headers: { "Content-Type": "application/json" },
      });

      const data = await r.json();

      // Never cache poll responses — a stale "pending" would block completion detection.
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");

      if (!r.ok) {
        console.error(`[veo GET] poll HTTP ${r.status}:`, JSON.stringify(data));
        return res.status(r.status).json({ status: "failed", error: extractErrorMessage(data) });
      }

      if (data.error) {
        console.error("[veo GET] operation error:", JSON.stringify(data.error));
        return res.status(500).json({ status: "failed", error: extractErrorMessage(data) });
      }

      if (!data.done) return res.status(200).json({ status: "pending" });

      // Done — extract and store video
      console.log("[veo GET] operation done, extracting video...");
      const video = extractVideoUrl(data.response || data);
      if (!video) {
        console.error("[veo GET] could not find video in response:", JSON.stringify(data).slice(0, 500));
        return res.status(500).json({ status: "failed", error: "Video not found in response — see Vercel logs" });
      }

      const id = randomBytes(8).toString("hex");
      let videoBuffer;
      if (video.uri) {
        // Convert gs:// URIs to an authenticated HTTPS download URL.
        // Plain HTTPS URIs get the API key appended for auth.
        let downloadUrl = video.uri;
        console.log("[veo GET] raw video URI:", downloadUrl);
        if (downloadUrl.startsWith("gs://")) {
          const withoutScheme = downloadUrl.slice(5); // "bucket/path/to/file.mp4"
          const slashIdx = withoutScheme.indexOf("/");
          const bucket = withoutScheme.slice(0, slashIdx);
          const object = encodeURIComponent(withoutScheme.slice(slashIdx + 1));
          downloadUrl = `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${object}?alt=media&key=${key}`;
        } else if (!downloadUrl.includes("key=")) {
          downloadUrl += (downloadUrl.includes("?") ? "&" : "?") + `key=${key}`;
        }
        console.log("[veo GET] fetching from:", downloadUrl.replace(key, "REDACTED"));
        const videoResp = await fetch(downloadUrl);
        if (!videoResp.ok) {
          const body = await videoResp.text();
          throw new Error(`Failed to fetch video from Google: HTTP ${videoResp.status} — ${body.slice(0, 200)}`);
        }
        videoBuffer = Buffer.from(await videoResp.arrayBuffer());
      } else {
        videoBuffer = Buffer.from(video.b64, "base64");
      }

      const { url } = await put(`cats/${id}.mp4`, videoBuffer, {
        access: "public",
        contentType: "video/mp4",
      });

      console.log("[veo GET] stored to blob:", url);
      return res.status(200).json({ status: "done", url });

    } catch (err) {
      console.error("[veo GET] unhandled exception:", err.message, err.stack);
      return res.status(500).json({ status: "failed", error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
