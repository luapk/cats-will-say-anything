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
    `REFERENCE IMAGES: You are given reference images as character/prop references ONLY — they are NOT the first frame and must NEVER appear as a static still anywhere in the video. ` +
    `The FIRST reference image is the CAT (the star). The SECOND reference image, if present, is the TEMPTATIONS BUTTON prop — match its exact shape, colours, proportions, glossy plastic finish, and cloud logo. ` +
    `Generate a video featuring a cat that matches the cat reference as closely as possible: ` +
    `same fur colour, markings, face shape, eye colour, coat texture, and body type. ` +
    `This cat is the star of the video. ` +
    `\n\n` +
    `START OF VIDEO: The very first frame is already live action — the cat in the yellow studio, in motion, beginning to reach toward the button. ` +
    `Do NOT open on a static photo, freeze-frame, fade-in, or the reference image. The action is moving from frame 0, and the full beginning of the action must be shown (do not cut into the middle of the press). ` +
    `\n\n` +
    `SCENE: Bright solid yellow studio floor and background. No other objects except one button. ` +
    `THE BUTTON — reproduce this prop FAITHFULLY and IDENTICALLY in every video. The button reference image is the authoritative source for its look; this continuity-bible JSON spec describes the same prop: ` +
    `${BUTTON_BIBLE}. ` +
    `The button sits directly on the yellow floor. Its surface is shiny plastic with glossy specular highlights. ` +
    `\n\n` +
    `AUDIO — THIS IS THE MOST IMPORTANT INSTRUCTION. Follow it exactly. ` +
    `The video is divided into two halves split by a single CLICK sound: ` +
    `\n\n` +
    `FIRST HALF — BEFORE THE CLICK (the first 2 seconds only): ABSOLUTE TOTAL SILENCE. ` +
    `There is NO voice, NO speech, NO talking, NO words, NO music, NO narration of any kind. ` +
    `Pure ambient room tone only. Quickly — within the first 2 seconds — the cat reaches out and presses the yellow button down with one paw. ` +
    `The press happens early so the rest of the video is free for the voice. ` +
    `The cat's mouth stays shut the entire time. Do NOT let any voice or speech occur in this first 2 seconds under any circumstances. ` +
    `\n\n` +
    `THE CLICK: At the exact instant the paw pushes the yellow cap down, play ONE short mechanical "CLICK" sound effect. ` +
    `This click is the very first sound in the whole video and it marks the boundary between the two halves. ` +
    `\n\n` +
    `SECOND HALF — AFTER THE CLICK (everything following the click): ONLY NOW does sound begin. ` +
    `Immediately after the click, the BUTTON itself plays a pre-recorded voice through a built-in speaker, like a talking novelty toy. ` +
    `The voice is in the style of ${voiceStyle}. The button says, exactly once: "${compliment}". ` +
    `The voice comes OUT OF THE BUTTON, not the cat. The cat never opens its mouth and never speaks. ` +
    `\n\n` +
    `STRICT ORDERING RULE: silence comes first, THEN the click, THEN the voice. ` +
    `The voice must NEVER be heard before the click. If you are about to play the voice, the click must already have happened. ` +
    `The cat presses the button within the first 2 seconds, and only after that click does any voice begin. This ordering is non-negotiable. ` +
    `\n\n` +
    `WHILE THE VOICE PLAYS: the cat turns its head and stares directly into the camera — deeply grumpy, unblinking, utterly unbothered. ` +
    `\n\n` +
    `FINAL SHOT (last 1.5–2 seconds): Execute a rapid crash zoom — a sudden, fast push into an extreme close-up of the cat's face, filling the frame with its expression. The cat holds its deadpan, deeply unimpressed stare directly into the lens. Hold on this face as the clip ends. ` +
    `\n\n` +
    `NO HUMANS: Do not show any human, person, human hands, human body parts, or human figures anywhere in the video. Only the cat and the button. ` +
    `NO TEXT ON SCREEN: Do not render any words, captions, subtitles, labels, or text of any kind burned into the video frames. No on-screen text whatsoever. ` +
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

// When an operation is done but has no video, Veo usually filtered the output.
// Pull out any RAI/filter reason so we can report it instead of a generic message.
function extractFilterReason(response) {
  const gvr = response?.generateVideoResponse || response;
  const count = gvr?.raiMediaFilteredCount ?? response?.raiMediaFilteredCount;
  const reasons =
    gvr?.raiMediaFilteredReasons || response?.raiMediaFilteredReasons;
  if (reasons?.length) return reasons.join("; ");
  if (count > 0) return `Output was filtered by content safety (${count} sample${count === 1 ? "" : "s"} blocked).`;
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
    const {
      imageBase64, imageMimeType = "image/jpeg", voiceStyle, compliment,
      buttonBase64, buttonMimeType = "image/png",
    } = req.body || {};
    if (!imageBase64 || !voiceStyle || !compliment) {
      return res.status(400).json({ error: "imageBase64, voiceStyle, and compliment are required" });
    }

    // Primary: use ASSET reference images (Veo 3.1 "ingredients to video").
    // referenceImages[0] = the cat photo (preserves the cat's appearance WITHOUT
    // pinning it as frame 0).
    // Fallback: if the API rejects reference images (preview support is patchy on the
    // Gemini Developer endpoint), retry with the legacy image-to-video first-frame field.
    //
    // The Temptations button render is sent as a SECOND asset reference alongside the
    // cat photo. Text description alone doesn't produce a faithful button render.
    // If this causes empty/filtered output for a particular generation, the fallback
    // chain (referenceImages rejected → first-frame) still recovers.
    // Set USE_BUTTON_REFERENCE=0 in Vercel env vars to disable if needed.
    const useButtonRef = !/^(0|false)$/i.test(process.env.USE_BUTTON_REFERENCE || "");
    const referenceImages = [{
      image: { bytesBase64Encoded: imageBase64, mimeType: imageMimeType },
      referenceType: "asset",
    }];
    if (useButtonRef && buttonBase64) {
      referenceImages.push({
        image: { bytesBase64Encoded: buttonBase64, mimeType: buttonMimeType },
        referenceType: "asset",
      });
    }
    console.log(`[veo POST] referenceImages count: ${referenceImages.length} (button ref ${useButtonRef ? "ON" : "OFF"})`);
    const refBody = {
      instances: [{
        prompt: buildPrompt(voiceStyle, compliment),
        referenceImages,
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
        const reason = extractFilterReason(data.response || data);
        console.error("[veo GET] could not find video — keys present:", Object.keys(data.response || data), "filterReason:", reason);
        return res.status(500).json({
          status: "failed",
          error: reason
            ? `No video was produced. ${reason}`
            : "Video not found in response — see Vercel logs",
        });
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
