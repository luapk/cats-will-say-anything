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

// Continuity-bible description of the Temptations button. Kept verbatim across
// every generation so the prop renders identically film to film.
const BUTTON_BIBLE = JSON.stringify({
  object: "Temptations push-button (two-piece actuator + base)",
  overall:
    "A stylized, glossy, 3D-rendered push-button assembly. Two pieces: a vibrant yellow central actuator seated inside a bulbous orange base. Reads as a chunky, oversized novelty 'easy button'.",
  actuator_top_button: {
    shape: "Flat-topped cylinder with gently rounded upper edges; sits raised/elevated in the unpressed state.",
    color: "Solid bright yellow, smooth semi-gloss plastic finish with a subtle soft highlight running along the rounded top edge.",
    logo: {
      text: "Temptations",
      typeface: "Black stylized italic cursive script",
      badge: "Text sits entirely inside a solid white scalloped cloud-like shape, bordered by a thin yellow outline that separates it slightly from the yellow surface.",
      placement: "Centered flat on the top face of the yellow cap.",
    },
    position: "Centered inside the orange housing, noticeably elevated to indicate an unpressed state.",
  },
  base_housing: {
    shape: "Smooth convex flattened-sphere / flared-donut form, widest at its horizontal equator, tapering inward to a flat bottom and curving inward at the top to seamlessly frame the yellow button.",
    color: "Highly saturated vibrant orange.",
    finish: "High-gloss plastic. Prominent curved white specular highlight on the mid-to-upper-right quadrant (strong key light from above-right); softer diffuse highlight along the upper-left curve.",
  },
  scale: "Larger than the cat's paw — a chunky, satisfying prop the cat can press with one paw.",
});

function buildPrompt(voiceStyle, compliment) {
  return (
    `SUBJECT REFERENCE: The attached image is a character reference ONLY — it is NOT the first frame and must NEVER appear as a static still anywhere in the video. ` +
    `Generate a video featuring a cat that matches this specific cat as closely as possible: ` +
    `same fur colour, markings, face shape, eye colour, coat texture, and body type. ` +
    `This cat is the star of the video. ` +
    `\n\n` +
    `START OF VIDEO: The very first frame is already live action — the cat in the yellow studio, in motion, beginning to reach toward the button. ` +
    `Do NOT open on a static photo, freeze-frame, fade-in, or the reference image. The action is moving from frame 0, and the full beginning of the action must be shown (do not cut into the middle of the press). ` +
    `\n\n` +
    `SCENE: Bright solid yellow studio floor and background. No other objects except one button. ` +
    `THE BUTTON — reproduce this prop FAITHFULLY and IDENTICALLY in every video, exactly matching this continuity-bible JSON spec: ` +
    `${BUTTON_BIBLE}. ` +
    `The button sits directly on the yellow floor. Its surface is shiny plastic with glossy specular highlights. ` +
    `\n\n` +
    `STRICT AUDIO TIMELINE — there are exactly three audio phases, in this precise order: ` +
    `\n` +
    `PHASE 1 (0 sec to button press) — TOTAL SILENCE. No music, no voice, no dialogue. ` +
    `The cat is already positioned in front of the button and presses the yellow cap firmly with one paw. ` +
    `The cat's mouth stays completely closed. The cat never speaks at any point. ` +
    `\n` +
    `PHASE 2 (the moment of the press) — a single short mechanical "CLICK" sound effect, ` +
    `the sound of the physical button being pressed down. This click is the FIRST sound in the entire video. ` +
    `\n` +
    `PHASE 3 (immediately after the click) — right after the click sound, and only then, ` +
    `the BUTTON plays a recorded voice through a built-in speaker (like a talking novelty toy), ` +
    `in the style of ${voiceStyle}, saying: "${compliment}". ` +
    `The voice comes OUT OF THE BUTTON, not from the cat. The cat's mouth does not move. ` +
    `The voice must be tightly synced to start right after the click — no gap, no overlap, no voice before the click. ` +
    `\n\n` +
    `CRITICAL: The order is always SILENCE, then CLICK, then VOICE. Never play the voice before the button is pressed. ` +
    `The cat is silent for the whole video — it only presses the button; the button does the talking. ` +
    `\n` +
    `WHILE THE VOICE PLAYS: the cat turns its head and stares directly into the camera — deeply grumpy, unblinking, utterly unbothered. ` +
    `\n\n` +
    `FINAL SHOT (last 1.5–2 seconds): Execute a rapid crash zoom — a sudden, fast push into an extreme close-up of the cat's face, filling the frame with its expression. The cat holds its deadpan, deeply unimpressed stare directly into the lens. Hold on this face as the clip ends. ` +
    `\n\n` +
    `NO HUMANS: Do not show any human, person, human hands, human body parts, or human figures anywhere in the video. Only the cat and the button. ` +
    `VISUAL STYLE: Cinematic, shallow depth of field, warm studio lighting, 9:16 portrait, 8 seconds.`
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

    // Primary: use the cat photo as an ASSET reference image (Veo 3.1 "ingredients
    // to video"). This preserves the cat's appearance WITHOUT pinning it as frame 0.
    // Fallback: if the API rejects reference images (preview support is patchy on the
    // Gemini Developer endpoint), retry with the legacy image-to-video first-frame field.
    const refBody = {
      instances: [{
        prompt: buildPrompt(voiceStyle, compliment),
        referenceImages: [{
          image: { bytesBase64Encoded: imageBase64, mimeType: imageMimeType },
          referenceType: "asset",
        }],
      }],
      parameters: { aspectRatio: "9:16", durationSeconds: 8, sampleCount: 1 },
    };
    const firstFrameBody = {
      instances: [{
        prompt: buildPrompt(voiceStyle, compliment),
        image: { bytesBase64Encoded: imageBase64, mimeType: imageMimeType },
      }],
      parameters: { aspectRatio: "9:16", durationSeconds: 8, sampleCount: 1 },
    };

    const postVeo = async (payload) => {
      const resp = await fetch(`${VEO_BASE}/models/${VEO_MODEL}:predictLongRunning?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { resp, json: await resp.json() };
    };

    let body = refBody;
    let usedFallback = false;
    let r, data;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise(x => setTimeout(x, attempt * 4000));
      ({ resp: r, json: data } = await postVeo(body));
      if (r.ok) break;
      console.error(`[veo POST] attempt ${attempt + 1} failed — HTTP ${r.status}:`, JSON.stringify(data));

      // If reference images aren't supported, fall back to first-frame once.
      const errStr = JSON.stringify(data).toLowerCase();
      const refUnsupported = !usedFallback && body === refBody &&
        (errStr.includes("referenceimage") || errStr.includes("reference_image") ||
         errStr.includes("not supported") || errStr.includes("unknown name") ||
         errStr.includes("invalid")) ;
      if (refUnsupported) {
        console.log("[veo POST] referenceImages rejected — falling back to first-frame image");
        body = firstFrameBody;
        usedFallback = true;
        continue; // immediate retry with fallback body, no backoff
      }

      const isRetryable = r.status === 429 || r.status === 503;
      if (!isRetryable || attempt === 3) {
        return res.status(r.status).json({ error: extractErrorMessage(data) });
      }
    }
    console.log(`[veo POST] started using ${usedFallback ? "first-frame image" : "asset referenceImages"}`);

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
      console.log("[veo GET] operation done, full response:", JSON.stringify(data));
      const video = extractVideoUrl(data.response || data);
      if (!video) {
        console.error("[veo GET] could not find video — keys present:", Object.keys(data.response || data));
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
