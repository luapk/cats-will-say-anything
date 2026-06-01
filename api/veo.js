// Veo 3.1 — image-to-video with native audio (dialogue baked in).
// POST  { imageBase64, imageMimeType, voice, compliment, voiceStyle }
//       → { operationName }
// GET   ?op={operationName}
//       → { status: "pending" | "done" | "failed", url?, error? }
//       When "done": downloads video from Google, stores to Vercel Blob, returns url.

import { put } from "@vercel/blob";
import { randomBytes } from "crypto";

const VEO_BASE = "https://generativelanguage.googleapis.com/v1beta";
const VEO_MODEL = "veo-3.0-generate-preview";

function apiKey() {
  const k = process.env.GOOGLE_API_KEY;
  if (!k) throw new Error("GOOGLE_API_KEY not configured");
  return k;
}

// Build the full cinematic prompt, embedding voice style + dialogue.
function buildPrompt(voiceStyle, compliment) {
  return (
    `The cat from the reference photo walks slowly across a bright solid yellow background ` +
    `toward a large circular button on the floor. The button is yellow and red, ` +
    `branded with the Temptations logo. The walk is unhurried — almost insulting in its ` +
    `lack of urgency. The cat stops directly in front of the button, looks at camera ` +
    `for one beat, then presses the button firmly with one paw using minimum effort. ` +
    `Immediately after the press, a voice — ${voiceStyle} — says: "${compliment}" ` +
    `The cat's expression throughout is one of profound, barely-concealed contempt. ` +
    `Clean yellow studio background, cinematic lighting, shallow depth of field, ` +
    `9:16 portrait, 8 seconds.`
  );
}

// Extract video URL from the various shapes the Veo response can take.
function extractVideoUrl(response) {
  // Shape A: response.generateVideoResponse.generatedSamples[0].video.uri
  const samples =
    response?.generateVideoResponse?.generatedSamples ||
    response?.generatedSamples;
  if (samples?.[0]?.video?.uri) return { uri: samples[0].video.uri };
  if (samples?.[0]?.video?.bytesBase64Encoded) {
    return { b64: samples[0].video.bytesBase64Encoded };
  }
  // Shape B: response.videos[0].uri
  if (response?.videos?.[0]?.uri) return { uri: response.videos[0].uri };
  if (response?.videos?.[0]?.bytesBase64Encoded) {
    return { b64: response.videos[0].bytesBase64Encoded };
  }
  return null;
}

export const config = {
  api: {
    bodyParser: { sizeLimit: "20mb" },
  },
};

export default async function handler(req, res) {
  const key = (() => { try { return apiKey(); } catch (e) { return null; } })();
  if (!key) return res.status(500).json({ error: "GOOGLE_API_KEY not configured" });

  // ── POST: start generation ──────────────────────────────────────────────
  if (req.method === "POST") {
    const { imageBase64, imageMimeType = "image/jpeg", voiceStyle, compliment } =
      req.body || {};
    if (!imageBase64 || !voiceStyle || !compliment) {
      return res.status(400).json({ error: "imageBase64, voiceStyle, and compliment are required" });
    }

    const body = {
      instances: [
        {
          prompt: buildPrompt(voiceStyle, compliment),
          image: { bytesBase64Encoded: imageBase64, mimeType: imageMimeType },
        },
      ],
      parameters: {
        aspectRatio: "9:16",
        durationSeconds: 8,
        generateAudio: true,
        sampleCount: 1,
      },
    };

    const r = await fetch(
      `${VEO_BASE}/models/${VEO_MODEL}:predictLongRunning?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const data = await r.json();
    if (!r.ok) {
      const msg = data?.error?.message || data?.error || JSON.stringify(data);
      return res.status(r.status).json({ error: msg });
    }

    const operationName = data?.name;
    if (!operationName) return res.status(500).json({ error: "No operation name returned: " + JSON.stringify(data) });

    return res.status(200).json({ operationName });
  }

  // ── GET: poll operation ─────────────────────────────────────────────────
  if (req.method === "GET") {
    const op = req.query.op;
    if (!op) return res.status(400).json({ error: "op query param required" });

    const r = await fetch(`${VEO_BASE}/${op}?key=${key}`, {
      headers: { "Content-Type": "application/json" },
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || JSON.stringify(data) });

    if (data.error) return res.status(500).json({ status: "failed", error: data.error?.message || JSON.stringify(data.error) });
    if (!data.done) return res.status(200).json({ status: "pending" });

    // Done — extract video
    const video = extractVideoUrl(data.response || data);
    if (!video) {
      return res.status(500).json({ status: "failed", error: "Could not locate video in response", raw: data });
    }

    // Upload to Vercel Blob for a persistent URL
    const id = randomBytes(8).toString("hex");
    let videoBuffer;

    if (video.uri) {
      const videoResp = await fetch(video.uri);
      if (!videoResp.ok) throw new Error(`Failed to fetch video: ${videoResp.status}`);
      videoBuffer = Buffer.from(await videoResp.arrayBuffer());
    } else {
      videoBuffer = Buffer.from(video.b64, "base64");
    }

    const { url } = await put(`cats/${id}.mp4`, videoBuffer, {
      access: "public",
      contentType: "video/mp4",
    });

    return res.status(200).json({ status: "done", url });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
