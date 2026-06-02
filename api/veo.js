// Veo 3.1 — image-to-video.
// POST  { imageBase64, imageMimeType, voiceStyle, compliment }  → { operationName }
// GET   ?op={operationName} → { status: "pending"|"done"|"failed", url?, error? }

import { put, list } from "@vercel/blob";
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
  object: "Temptations push-button",
  overall:
    "Chunky glossy novelty push-button. Two pieces: a bright yellow cylindrical actuator seated flush inside a bulbous red base.",
  actuator: {
    shape: "Flat-topped cylinder, gently rounded upper edges; top flush with the rim of the base — never protruding above it.",
    color: "Solid bright yellow, semi-gloss plastic.",
    logo: {
      text: "Temptations",
      typeface: "Black italic cursive script",
      badge: "Text inside a solid white scalloped cloud badge, centred on the top face.",
    },
    press: "Travels straight down a short distance when pressed, returns to flush resting position. Never springs up or extrudes outward.",
  },
  base: {
    shape: "Flattened-sphere / flared-donut form, widest at the equator, flat bottom, curves inward at top to frame the actuator.",
    color: "Highly saturated vivid red.",
    finish: "High-gloss plastic, curved white specular highlight on the upper-right quadrant.",
  },
  scale: "~90mm wide — approximately as wide as the cat's paw is long.",
});

// Five distinct closing beats, each describing the WHOLE second clip (~4s). One
// is chosen SEQUENTIALLY across all films (not per-user, not random) via a shared
// counter in Blob storage, so consecutive generations rotate through the full set.
const ENDINGS = [
  // 0 — crash zoom (the original)
  `THE SHOT: A rapid crash zoom pushes into an extreme close-up of the cat's face, filling the frame. The cat holds a deadpan, deeply unimpressed stare directly into the lens for the whole clip.`,
  // 1 — wide pull-back, patient
  `THE SHOT: A wide shot — the cat small and centred in the vast empty yellow studio, sitting bolt upright and perfectly still, paws together, waiting with infinite patience.`,
  // 2 — mortified
  `THE SHOT: The cat looks mortified — ears flattening back, eyes darting away from the lens, head shrinking down between its shoulders, deeply embarrassed. Hold on this sheepish, cringing expression.`,
  // 3 — smug
  `THE SHOT: The cat looks supremely smug — chin lifted, eyes half-closed, giving one slow self-satisfied blink directly down the lens, utterly pleased with itself.`,
  // 4 — unbothered exit
  `THE SHOT: The cat dismissively breaks eye contact, turns and strolls out of frame with a single flick of its tail, completely done with you, leaving the empty yellow studio.`,
];

// Shared scene preamble (reference images + studio + button spec), reused by both
// the main clip and the ending clip so the cat and set stay consistent.
function sceneIntro() {
  return (
    `REFERENCE IMAGES: You are given reference images as character/prop references ONLY — they are NOT the first frame and must NEVER appear as a static still anywhere in the video. ` +
    `The FIRST reference image is the CAT (the star). The SECOND reference image, if present, is the TEMPTATIONS BUTTON prop — match its exact shape, colours, proportions, glossy plastic finish, and cloud logo. ` +
    `Generate a video featuring a cat that matches the cat reference as closely as possible: ` +
    `same fur colour, markings, face shape, eye colour, coat texture, and body type. This cat is the star of the video. ` +
    `\n\n` +
    `SCENE: Bright solid yellow studio floor and background. No other objects except one button. ` +
    `THE BUTTON — reproduce this prop FAITHFULLY and IDENTICALLY in every video. The button reference image is the authoritative source for its look; this continuity-bible JSON spec describes the same prop: ` +
    `${BUTTON_BIBLE}. ` +
    `The button sits directly on the yellow floor. Its yellow cap is seated FLUSH in the red base in its resting state (the reference image shows this resting, depressed-looking state) — the cap never protrudes or sticks up; pressing only pushes it a short way straight down and inward. Its surface is shiny plastic with glossy specular highlights. ` +
    `\n\n`
  );
}

const RULES =
  `NO HUMANS: Do not show any human, person, human hands, human body parts, or human figures anywhere in the video. Only the cat and the button. ` +
  `NO TEXT ON SCREEN: Do not render any words, captions, subtitles, labels, or text of any kind burned into the video frames. No on-screen text whatsoever. `;

// MAIN clip (~8s): the cat presses the button, then holds a deadpan stare. No
// closing camera move — the ending is a separate second clip concatenated after.
function buildMainPrompt(voiceStyle, compliment, elevenLabs) {
  const audioSection = elevenLabs
    ? (
      // ElevenLabs mode: Veo is given NO audio instructions at all (any audio
      // directive trips Veo's safety filter); finalize.js bakes click + voice.
      `ACTION — CRITICAL: At roughly 1 second in, the cat reaches out with one paw and presses the yellow cap straight down a short distance, then withdraws the paw. ONE press only — no second tap, no repeated pawing, no returning to the button. The cat's mouth stays completely shut throughout — no meowing, no vocalisation of any kind. ` +
      `\n\n` +
      `POST-PRESS: the cat turns its head and holds a deadpan, grumpy, unblinking stare directly into the camera for the rest of the clip. ` +
      `\n\n`
    )
    : (
      `AUDIO — THIS IS THE MOST IMPORTANT INSTRUCTION. Follow it exactly. ` +
      `The video is divided into two halves split by a single CLICK sound: ` +
      `\n\n` +
      `FIRST HALF — BEFORE THE CLICK (the first 2 seconds only): ABSOLUTE TOTAL SILENCE. ` +
      `There is NO voice, NO speech, NO talking, NO words, NO music, NO narration of any kind. ` +
      `Pure ambient room tone only. At roughly 1 second in, the cat reaches out and presses the yellow cap straight down, then withdraws — ONE press only. ` +
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
      `STRICT ORDERING RULE: silence comes first, THEN the click, THEN the voice. The voice must NEVER be heard before the click. ` +
      `\n\n` +
      `WHILE THE VOICE PLAYS: the cat turns its head and stares directly into the camera — deeply grumpy, unblinking, utterly unbothered. ` +
      `\n\n`
    );

  return (
    sceneIntro() +
    `START OF VIDEO: The very first frame is already live action — the cat in the yellow studio, in motion, beginning to reach toward the button. ` +
    `Do NOT open on a static photo, freeze-frame, fade-in, or the reference image. The action is moving from frame 0, and the full beginning of the action must be shown (do not cut into the middle of the press). ` +
    `\n\n` +
    audioSection +
    RULES +
    `VISUAL STYLE: Cinematic, shallow depth of field, warm studio lighting, 9:16 portrait, 8 seconds.`
  );
}

// ENDING clip (~4s): the cat, having just pressed the button, performs one of the
// randomised closing beats. No new press, mouth stays shut (the voiceover from the
// first clip carries over the cut in finalize.js).
function buildEndingPrompt(ending) {
  return (
    sceneIntro() +
    `START OF VIDEO: The very first frame is already live action — the cat in the same bright yellow studio beside the Temptations button, having just finished pressing it. ` +
    `Do NOT open on a static photo, freeze-frame, fade-in, or the reference image. The cat is moving from frame 0. ` +
    `\n\n` +
    `NO NEW PRESS: The cat does NOT touch, paw, or press the button in this clip. Its mouth stays completely shut throughout — no meowing, no speaking, no vocalisation. ` +
    `\n\n` +
    ending + ` ` +
    `\n\n` +
    RULES +
    `VISUAL STYLE: Cinematic, shallow depth of field, warm studio lighting, 9:16 portrait, 4 seconds.`
  );
}

// Sequential ending rotation, shared across all films via a Blob counter.
// Reads the current count, returns count % ENDINGS.length, and persists the
// incremented count (fire-and-forget). Under rare concurrent writes a number may
// repeat — harmless for this use. Falls back to a random ending if Blob is down.
const ENDING_COUNTER_KEY = "state/ending-counter.json";

async function nextEndingIndex() {
  try {
    let count = 0;
    const { blobs } = await list({ prefix: ENDING_COUNTER_KEY });
    if (blobs[0]) {
      const r = await fetch(blobs[0].url, { cache: "no-store" });
      if (r.ok) count = Number((await r.json())?.count) || 0;
    }
    const index = count % ENDINGS.length;
    put(ENDING_COUNTER_KEY, JSON.stringify({ count: count + 1 }), {
      access: "public", addRandomSuffix: false, allowOverwrite: true,
      contentType: "application/json", cacheControlMaxAge: 0,
    }).catch((e) => console.error("[veo] ending counter write failed:", e.message));
    return index;
  } catch (e) {
    console.error("[veo] ending counter read failed, using random:", e.message);
    return Math.floor(Math.random() * ENDINGS.length);
  }
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
    // When ElevenLabs voiceover is enabled, Veo renders a SILENT (click-only) clip and
    // the voice is composited in later. Otherwise Veo bakes the voice itself (legacy).
    const elevenLabs = /^(1|true)$/i.test(process.env.USE_ELEVENLABS || "");
    const endingIndex = await nextEndingIndex();
    console.log(`[veo POST] ending index: ${endingIndex} of ${ENDINGS.length}`);
    const mainPrompt = buildMainPrompt(voiceStyle, compliment, elevenLabs);
    const endingPrompt = buildEndingPrompt(ENDINGS[endingIndex]);
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
    console.log(`[veo POST] referenceImages count: ${referenceImages.length} (button ref ${useButtonRef ? "ON" : "OFF"}, elevenLabs ${elevenLabs ? "ON" : "OFF"})`);

    const bodiesFor = (prompt, durationSeconds) => ({
      refBody: {
        instances: [{ prompt, referenceImages }],
        parameters: { aspectRatio: "9:16", durationSeconds, sampleCount: 1 },
      },
      firstFrameBody: {
        instances: [{ prompt, image: { bytesBase64Encoded: imageBase64, mimeType: imageMimeType } }],
        parameters: { aspectRatio: "9:16", durationSeconds, sampleCount: 1 },
      },
    });

    const postVeo = async (payload) => {
      const resp = await fetch(`${VEO_BASE}/models/${VEO_MODEL}:predictLongRunning?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { resp, json: await resp.json() };
    };

    // Start one generation (with reference-image → first-frame fallback and
    // retry/backoff). Returns { operationName } or { error, status }.
    const startGeneration = async (label, prompt, durationSeconds) => {
      const { refBody, firstFrameBody } = bodiesFor(prompt, durationSeconds);
      let body = refBody, usedFallback = false, r, data;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) await new Promise(x => setTimeout(x, attempt * 4000));
        ({ resp: r, json: data } = await postVeo(body));
        if (r.ok) break;
        console.error(`[veo POST] ${label} attempt ${attempt + 1} failed — HTTP ${r.status}:`, JSON.stringify(data));

        const errStr = JSON.stringify(data).toLowerCase();
        const refUnsupported = !usedFallback && body === refBody &&
          (errStr.includes("referenceimage") || errStr.includes("reference_image") ||
           errStr.includes("not supported") || errStr.includes("unknown name") ||
           errStr.includes("invalid"));
        if (refUnsupported) {
          console.log(`[veo POST] ${label}: referenceImages rejected — falling back to first-frame image`);
          body = firstFrameBody;
          usedFallback = true;
          continue;
        }

        const isRetryable = r.status === 429 || r.status === 503;
        if (!isRetryable || attempt === 3) return { error: extractErrorMessage(data), status: r.status };
      }
      const operationName = data?.name;
      if (!operationName) return { error: "No operation name in response: " + JSON.stringify(data), status: 500 };
      console.log(`[veo POST] ${label} started using ${usedFallback ? "first-frame image" : "asset referenceImages"}`);
      return { operationName };
    };

    // Fire the main (~8s) and ending (~4s) clips concurrently — both Veo jobs run
    // in parallel, so wall time is unchanged (one clip's worth of waiting).
    const endingDuration = Number(process.env.ENDING_DURATION_SECONDS) || 4;
    const [main, ending] = await Promise.all([
      startGeneration("main", mainPrompt, 8),
      startGeneration("ending", endingPrompt, endingDuration),
    ]);
    if (main.error) return res.status(main.status).json({ error: main.error });
    if (ending.error) return res.status(ending.status).json({ error: `Ending clip: ${ending.error}` });

    return res.status(200).json({
      operationName: main.operationName,
      endingOperationName: ending.operationName,
    });
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
      // In ElevenLabs mode this stored clip is SILENT (click only). The client then
      // calls /api/finalize to detect the press, generate the voice, and bake it in.
      const needsVoice = /^(1|true)$/i.test(process.env.USE_ELEVENLABS || "");
      return res.status(200).json({ status: "done", url, needsVoice });

    } catch (err) {
      console.error("[veo GET] unhandled exception:", err.message, err.stack);
      return res.status(500).json({ status: "failed", error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
