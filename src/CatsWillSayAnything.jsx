import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const VOICES = {
  "Barry White Core": {
    emoji: "🎵",
    toneNote: "Deep African American baritone — every word arrives late and costs something",
    voiceDesc: "deep, velvet, impossibly smooth baritone — every word arrives slightly after you expected it",
    voiceStyle: "a rich, resonant deep male bass-baritone in the style of a classic 1970s soul crooner, speaking with extraordinary deliberateness. Each word is separated by a long, meaningful pause. The voice is impossibly smooth, almost liquid, velvet-warm, with a slight hum underneath. Every consonant lands softly. Every pause is pregnant. It sounds like the voice knows something you don't, and is deciding whether to share it",
    compliments: [
      "You smell... incredible. Did you roll in something dead? Be honest with me.",
      "I blinked at you. Slow. In my world, baby... that was a proposal.",
    ]
  },
  "French Smooth Talker": {
    emoji: "🥐",
    toneNote: "Silky French film star — existentially resigned, philosophically disappointed but magnanimous",
    voiceDesc: "silky French accent, existentially resigned, as if complimenting you is a philosophical act they find distasteful but necessary",
    voiceStyle: "a French-accented male voice speaking English, like a world-weary narrator in a Parisian art film. The accent is genuine: lilting vowels, slightly nasal, Rs rolled gently, H sounds dropped. The tone is world-weary and philosophically resigned, as if this compliment is an existential burden the speaker has agreed to carry, reluctantly, out of a vague sense of duty. There is a faint, dry amusement underneath — the voice of someone who finds everything mildly disappointing but is too elegant to make a fuss about it",
    compliments: [
      "Your hair, it shines. You have been licking it, non? Do not lie. I know the work of a tongue.",
      "If a face can launch a thousand ships, yours could launch... perhaps nine. Good ships, though.",
      "You wash yourself. With the water. Like a savage. It is grotesque. And yet, mon amour, I watch.",
      "You have no tail, no fur, no claws. Frankly, barely an animal. And still I choose you. Strange, non?",
      "I knocked your cup to the floor this morning. A gift. In France, we call this passion.",
    ]
  },
  "Highland Heartthrob": {
    emoji: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    toneNote: "Measured Scottish gravitas — imperious, deliberate, delivers backhanded praise like a knighthood",
    voiceDesc: "measured Scottish brogue, imperious and deliberate, delivering backhanded praise with the weight of a man who has seen far greater things",
    voiceStyle: "a distinguished older Scottish male voice — a rich, gravelly baritone with a strong Edinburgh-Highlands Scottish accent. The Rs are slightly rolled. The vowels are rounded and full. The cadence is unhurried and authoritative, as if each sentence has been considered carefully and delivered from a position of supreme, unearned confidence. There is a mild rasp in the voice. Every word carries the quiet implication that this speaker has done far more impressive things than whatever you have done, and is choosing, generously, not to say so",
    compliments: [
      "I have hunted many things. Birds. Moths. One unfortunate sock. None of them looked at me the way you do.",
      "You stare at the glowing box for hours. Unblinking. Patient. You would have made a passable cat.",
      "You cannot climb. You cannot pounce. You sleep eleven hours, not sixteen. And yet. I have grown fond of you.",
      "I brought you a bird once. You screamed. We do not speak of it. But the gesture stands.",
    ]
  },
};

const VOICE_KEYS = Object.keys(VOICES);

const ANALYZING_MESSAGES = [
  "Assessing disdain levels...",
  "Measuring contempt per square inch...",
  "Cross-referencing judgemental stare database...",
  "Calculating passive aggression quotient...",
  "Reading 47 years of accumulated resentment...",
  "Consulting the ancient cat council...",
  "Translating the stare into data...",
  "Quantifying the eye-roll energy...",
];

const FINALIZE_STEPS = [
  "Filming the final scene...",
  "Mixing the audio track...",
  "Adding the Temptations touch...",
  "Assembling the masterpiece...",
  "Almost in the can...",
];

const GENERATING_STEPS = [
  "Casting call issued. Cat unimpressed.",
  "Wardrobe fitting. Bow tie rejected.",
  "Director's briefing. Entirely ignored.",
  "Craft services negotiation underway.",
  "Cat refusing to hit their mark.",
  "Method acting prep. Still judging.",
  "Scene 1, take 23. Paw descending.",
  "Lighting adjusted. Cat unmoved.",
  "The button has been located.",
  "Post-production. Almost in the can.",
];

export default function CatsWillSayAnything() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem("unlocked") === "1");
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [screen, setScreen] = useState("upload");
  const [catImage, setCatImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMimeType, setImageMimeType] = useState("image/jpeg");
  const [analysis, setAnalysis] = useState(null);
  const [generatingStep, setGeneratingStep] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loaderImgIndex, setLoaderImgIndex] = useState(0);
  const [generatingError, setGeneratingError] = useState("");
  const [msgIndex, setMsgIndex] = useState(0);
  const [genMsgIndex, setGenMsgIndex] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [revealStep, setRevealStep] = useState(0);
  const fileInputRef = useRef(null);
  const msgIntervalRef = useRef(null);
  const genMsgIntervalRef = useRef(null);
  const loaderImgIntervalRef = useRef(null);
  const lastComplimentRef = useRef(null);

  useEffect(() => {
    if (screen === "analyzing") {
      msgIntervalRef.current = setInterval(() => {
        setMsgIndex(prev => (prev + 1) % ANALYZING_MESSAGES.length);
      }, 1100);
    }
    return () => clearInterval(msgIntervalRef.current);
  }, [screen]);

  useEffect(() => {
    if (screen === "generating") {
      setGenMsgIndex(0);
      setElapsedSeconds(0);
      setLoaderImgIndex(0);
      genMsgIntervalRef.current = setInterval(() => {
        setGenMsgIndex(prev => Math.min(prev + 1, GENERATING_STEPS.length - 1));
      }, 22000);
      loaderImgIntervalRef.current = setInterval(() => {
        setLoaderImgIndex(prev => prev + 1);
      }, 5000);
    }
    return () => {
      clearInterval(genMsgIntervalRef.current);
      clearInterval(loaderImgIntervalRef.current);
    };
  }, [screen]);

  useEffect(() => {
    if (screen === "revealed") {
      setRevealStep(0);
      const t1 = setTimeout(() => setRevealStep(1), 100);
      const t2 = setTimeout(() => setRevealStep(2), 400);
      const t3 = setTimeout(() => setRevealStep(3), 700);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  }, [screen]);

  const stopAudio = () => {};

  // Fetch the Temptations button render once and cache its base64 — passed to
  // Veo as a second asset reference so the prop renders consistently.
  const buttonRefCache = useRef(null);
  const getButtonBase64 = async () => {
    if (buttonRefCache.current) return buttonRefCache.current;
    try {
      const resp = await fetch("/button.png");
      const blob = await resp.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      buttonRefCache.current = {
        base64: String(dataUrl).split(",")[1],
        mimeType: blob.type || "image/png",
      };
      return buttonRefCache.current;
    } catch {
      return null; // non-fatal — Veo falls back to the text-only button spec
    }
  };

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    stopAudio();
    setUploadError("");
    setCatImage(URL.createObjectURL(file));

    // Compress to max 1024px and JPEG 0.82 before storing — keeps payload
    // well under Vercel's 4.5 MB body limit regardless of source image size.
    const img = new Image();
    img.onload = () => {
      const MAX = 1024;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      setImageMimeType("image/jpeg");
      setImageBase64(dataUrl.split(",")[1]);
    };
    img.src = URL.createObjectURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const analyzeCat = async () => {
    if (!imageBase64) return;
    stopAudio();
    setScreen("analyzing");
    try {
      const prompt = `You are a content moderator and cat analyst for the "Cats Will Say Anything" Temptations cat treats campaign. This is a family-friendly brand app.

STEP 1 — CONTENT MODERATION (check this first, before anything else):
Examine the image carefully for any of the following. Apply a STRICT threshold — if there is any low-to-medium likelihood of a violation, treat it as a violation:
- Explicit or suggestive sexual content, nudity, or adult imagery
- Hate symbols, slurs, or imagery associated with hate groups (e.g. Nazi imagery, KKK, white supremacist symbols, racial slurs visible as text)
- Graphic violence, gore, or disturbing imagery
- Drugs, drug paraphernalia, or drug-related content

If ANY of the above are present or likely present, respond ONLY with this exact JSON and nothing else:
{"error": "content_violation"}

STEP 2 — SUBJECT CHECK:
If the image passed Step 1, check whether the image primarily features a cat. If the main subject is NOT a cat — for example it is a human, a dog, another animal, an object, or a scene with no cat — respond ONLY with this exact JSON and nothing else:
{"error": "not_a_cat"}

STEP 3 — CAT ANALYSIS:
If the image passed both checks above and primarily features a cat, assign ONE of these three voice archetypes based on the cat's dominant VISUAL features. All three are equally valid — choose the best fit, not the safest default. Be decisive.

- Barry White Core — assign this to cats with PLUSH, DENSE, or VELVETY fur (Persians, Ragdolls, British Shorthairs, any long-haired or very fluffy cat); OR heavy-lidded, half-closed, or drowsy-looking eyes; OR a large round body with a languid, slow energy. The fur or body shape is the key trigger.

- French Smooth Talker — assign this to cats with a SLEEK, SHORT, FINE coat and an elegant or aristocratic build (Siamese, Burmese, Oriental, Devon Rex, any lean angular cat); OR unusual, refined, or two-tone colouring that reads as fashionable; OR a sharp, pointed face with a faintly superior expression. The coat texture and face shape are the key triggers.

- Highland Heartthrob — assign this to cats with TABBY STRIPES, a rugged or weathered face, a stocky muscular build, or a direct confrontational stare that reads as battle-hardened rather than elegant. This is the voice for tough-looking tabbies and street cats, NOT a generic fallback for any serious-looking cat.

IMPORTANT: Do NOT default to Highland Heartthrob just because a cat looks serious. Serious cats can be any of the three. Base the choice on fur type, coat pattern, and body shape first — those are more reliable signals than expression alone. Aim for variety: if the visual evidence equally supports two choices, pick the one that is more unexpected or funnier.

Write 2-3 funny, specific observational sentences explaining WHY this cat matches that voice. Reference actual visual details — fur colour/texture, eye shape, posture, expression. Be affectionately cutting.

Also write one punchy tagline about this specific cat. Max 8 words. Example: "This cat has seen things. Bad things."

Respond ONLY as valid JSON. No preamble, no backticks, no markdown:
{"voice": "exact name from list", "reasoning": "2-3 funny sentences", "tagline": "short line"}`;

      const resp = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
              { text: prompt }
            ]
          }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 512 }
        })
      });
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (parsed.error === "content_violation") {
        setScreen("upload");
        setUploadError("That image can't be used here. Please upload an appropriate photo of your cat.");
        return;
      }
      if (parsed.error === "not_a_cat") {
        setScreen("upload");
        setUploadError("That doesn't look like a cat! Please upload a photo where a cat is the main subject.");
        return;
      }
      setAnalysis(parsed);
      setScreen("revealed");
    } catch {
      const fallback = VOICE_KEYS[Math.floor(Math.random() * VOICE_KEYS.length)];
      setAnalysis({
        voice: fallback,
        reasoning: "Analysis encountered resistance. Your cat refused to cooperate with the process. Which, frankly, tells us everything we need to know.",
        tagline: "Unknowable. Possibly judging everyone."
      });
      setScreen("revealed");
    }
  };

  const createFilm = async () => {
    if (!imageBase64 || !analysis) return;
    stopAudio();
    setGeneratingError("");
    setScreen("generating");

    try {
      const vd = VOICES[analysis.voice];
      // Exclude the last-used compliment so the same line never plays twice in a row.
      const pool = vd.compliments.filter(c => c !== lastComplimentRef.current);
      const compliment = (pool.length > 0 ? pool : vd.compliments)[Math.floor(Math.random() * (pool.length > 0 ? pool : vd.compliments).length)];
      lastComplimentRef.current = compliment;
      console.log("[createFilm] voice:", analysis.voice, "compliment:", compliment);

      // Kick off voice generation immediately — runs in parallel with Veo (~3 min),
      // so the audio is ready before finalize even starts.
      const voiceFetchPromise = fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: analysis.voice, compliment }),
      }).then(r => r.json()).catch(e => ({ error: e.message }));

      setGeneratingStep("On set. Briefing the cat...");
      const buttonRef = await getButtonBase64();
      const startResp = await fetch("/api/veo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          imageMimeType,
          voiceStyle: vd.voiceStyle,
          compliment,
          buttonBase64: buttonRef?.base64,
          buttonMimeType: buttonRef?.mimeType,
        }),
      });
      const startData = await startResp.json();
      if (!startResp.ok || !startData.operationName) {
        throw new Error(startData.error || JSON.stringify(startData));
      }
      const { operationName } = startData;

      // Clear initial step so GENERATING_STEPS cycle shows during polling
      setGeneratingStep("");

      // Poll a single Veo operation until done (max 10 min).
      const pollOp = async (op) => {
        for (let i = 0; i < 120; i++) {
          await new Promise(r => setTimeout(r, 5000));
          setElapsedSeconds(prev => prev + 5);
          const pollResp = await fetch(`/api/veo?op=${encodeURIComponent(op)}&t=${Date.now()}`);
          const pollData = await pollResp.json();
          if (pollData.status === "done") return pollData;
          if (pollData.status === "failed") throw new Error(pollData.error || "Veo generation failed");
        }
        throw new Error("Generation timed out after 10 minutes");
      };

      // Poll main clip (8s).
      const mainPoll = await pollOp(operationName);
      const mainUrl = mainPoll.url;
      const needsVoice = !!mainPoll.needsVoice;

      // ElevenLabs mode: finalize generates the ending clip, concats, bakes audio, overlays logo.
      let finalUrl = needsVoice ? null : mainUrl;
      if (needsVoice) {
        // Retrieve pre-generated voice URL (should already be done).
        const voiceData = await voiceFetchPromise;
        const pregenVoiceUrl = voiceData?.url || null;
        if (!pregenVoiceUrl) console.warn("[createFilm] pre-generated voice unavailable:", voiceData?.error);

        // Rotating step messages + real-time elapsed counter during finalize.
        let finalizeStepIdx = 0;
        setGeneratingStep(FINALIZE_STEPS[0]);
        const finalizeStepInterval = setInterval(() => {
          finalizeStepIdx = Math.min(finalizeStepIdx + 1, FINALIZE_STEPS.length - 1);
          setGeneratingStep(FINALIZE_STEPS[finalizeStepIdx]);
        }, 20000);
        const finalizeElapsedInterval = setInterval(() => setElapsedSeconds(prev => prev + 1), 1000);

        let finData;
        try {
          const finResp = await fetch("/api/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoUrl: mainUrl, voice: analysis.voice, compliment, voiceUrl: pregenVoiceUrl }),
          });
          finData = await finResp.json();
          if (!finResp.ok || !finData.url) throw new Error(finData.error || "Voiceover compositing failed");
        } finally {
          clearInterval(finalizeStepInterval);
          clearInterval(finalizeElapsedInterval);
        }
        finalUrl = finData.url;
      }

      const shareParams = new URLSearchParams({
        v: finalUrl,
        c: compliment,
        voice: analysis.voice,
      });
      navigate(`/share?${shareParams.toString()}`);

    } catch (err) {
      const raw = err?.message || String(err);
      const low = raw.toLowerCase();
      let friendly;
      if (low.includes("likeness") || low.includes("real people") || low.includes("celebrity") || low.includes("can't create videos") || low.includes("cannot create videos")) {
        friendly = `That couldn't be generated due to a content rule (often a real person's name in the styling). Please try again.\n\nDetail: ${raw}`;
      } else if (low.includes("quota") || low.includes("resource_exhausted") || low.includes("429")) {
        friendly = `Video generation quota reached on the Google API key. This won't clear by retrying — the daily Veo quota is used up (or billing needs raising).\n\nDetail: ${raw}`;
      } else if (low.includes("audio for your prompt") || low.includes("issue with the audio")) {
        // Veo audio safety filter — can be a transient false positive, safe to retry.
        friendly = `The film studio hit a content filter on this attempt. This sometimes clears on a retry — please try again.\n\nDetail: ${raw}`;
      } else if (low.includes("audio for your prompt") || low.includes("issue with the audio")) {
        friendly = `The film studio hit a content filter on this attempt. This sometimes clears on a retry — please try again.\n\nDetail: ${raw}`;
      } else if (low.includes("overloaded") || low.includes("unavailable") || low.includes("503") || low.includes("high demand")) {
        friendly = `The film studio is very busy right now (Veo is temporarily overloaded). Wait a moment and try again.\n\nDetail: ${raw}`;
      } else {
        friendly = raw;
      }
      setGeneratingError(friendly);
      setScreen("error");
    }
  };

  const reset = () => {
    setScreen("upload");
    setCatImage(null);
    setImageBase64(null);
    setAnalysis(null);
    setGeneratingError("");
    setUploadError("");
    setRevealStep(0);
    setElapsedSeconds(0);
    setGeneratingStep("");
    setLoaderImgIndex(0);
  };

  const vd = analysis ? VOICES[analysis.voice] : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800;900&family=Roboto:wght@400;700&display=swap');

        @font-face {
          font-family: 'FilsonPro';
          src: url('/fonts/FilsonProBlack.otf') format('opentype');
          font-weight: 900;
          font-style: normal;
          font-display: swap;
        }
        @font-face {
          font-family: 'FilsonPro';
          src: url('/fonts/FilsonProBold.otf') format('opentype');
          font-weight: 700;
          font-style: normal;
          font-display: swap;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #FFD600; }

        @keyframes pawBounce {
          0%, 100% { transform: translateY(0) rotate(-8deg); }
          50% { transform: translateY(-14px) rotate(8deg); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.88); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
          50% { transform: scale(1.03); box-shadow: 0 8px 32px rgba(0,0,0,0.25); }
        }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes revealSlide {
          from { opacity: 0; transform: translateX(-16px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes buttonPop {
          0% { transform: scale(0.8); opacity: 0; }
          70% { transform: scale(1.06); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes loaderFade {
          from { opacity: 0; transform: scale(0.88); }
          to { opacity: 1; transform: scale(1); }
        }

        .cwsa-wrap {
          min-height: 100vh;
          background: #FFD600;
          font-family: 'Roboto', sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 12px 20px 20px;
          position: relative;
          overflow-x: hidden;
        }

        .cwsa-brand { text-align: center; margin-bottom: 0; }
        .cwsa-brand-sub {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: #0A0A0A;
          margin-bottom: 2px;
        }
        .cwsa-title {
          font-family: 'FilsonPro', 'Nunito', sans-serif;
          font-weight: 900;
          color: #ffffff;
          -webkit-text-stroke: 5px #000000;
          paint-order: stroke fill;
          text-shadow: 7px 4px 0 #000000;
          line-height: 0.92;
          letter-spacing: -1px;
          text-transform: uppercase;
          transition: font-size 0.35s ease;
        }
        .cwsa-title.large { font-size: clamp(48px, 11vw, 72px); }
        .cwsa-title.small { font-size: clamp(24px, 5.5vw, 36px); }
        .cwsa-title-yellow {
          color: #FFED00;
          -webkit-text-stroke: 5px #000000;
          paint-order: stroke fill;
        }
        .cwsa-tagline { font-size: 14px; font-weight: 700; color: #6B4F00; margin-top: 4px; }

        .upload-zone {
          border: 3px dashed #0A0A0A;
          border-radius: 16px;
          width: 100%;
          height: 220px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          cursor: pointer;
          transition: background 0.25s ease, border-color 0.25s ease, transform 0.25s ease;
          background: #ffffff;
          position: relative;
          overflow: hidden;
          flex-shrink: 0;
        }
        .upload-zone:hover { background: #FFED00; }
        .upload-zone.drag-over {
          background: #FFED00;
          border-style: solid;
          transform: scale(1.02);
        }
        .upload-zone .mascot {
          position: absolute;
          bottom: 0; left: 50%;
          transform: translateX(-50%);
          height: 70%; width: auto;
          object-fit: contain;
          object-position: bottom;
          pointer-events: none;
        }
        .upload-zone .cat-preview {
          width: 100%; height: 100%;
          object-fit: cover;
          display: block;
        }
        .upload-zone-label {
          position: absolute;
          top: 33%; left: 50%;
          transform: translateX(-50%);
          z-index: 1;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #0A0A0A;
          text-align: center;
          white-space: nowrap;
          padding: 4px 16px;
          background: rgba(255,255,255,0.85);
          border-radius: 20px;
          line-height: 1.3;
        }
        .change-photo-btn {
          position: absolute;
          bottom: 10px;
          background: rgba(0,0,0,0.6);
          color: white;
          border: none;
          border-radius: 20px;
          padding: 4px 12px;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1px;
          text-transform: uppercase;
          cursor: pointer;
          font-family: 'Roboto', sans-serif;
        }

        .btn-red {
          background: #ffffff;
          color: #0A0A0A;
          border: 2.5px solid #0A0A0A;
          border-radius: 100px;
          padding: 15px 40px;
          font-family: 'FilsonPro', 'Nunito', sans-serif;
          font-size: 17px;
          font-weight: 900;
          cursor: pointer;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          transition: background 0.25s ease, transform 0.2s, box-shadow 0.2s;
        }
        .btn-red:hover { background: #FFED00; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.18); }
        .btn-red:active { transform: translateY(0); }
        .btn-red.pulsing { animation: pulse 2.2s ease infinite; }
        .btn-red:disabled { opacity: 0.5; cursor: not-allowed; animation: none; }

        .btn-black {
          background: #0A0A0A;
          color: #FFD600;
          border: none;
          border-radius: 100px;
          padding: 15px 40px;
          font-family: 'Roboto', sans-serif;
          font-size: 17px;
          font-weight: 900;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-black:hover { background: #222; transform: translateY(-2px); }

        .btn-ghost {
          background: transparent;
          color: #0A0A0A;
          border: 2.5px solid #0A0A0A;
          border-radius: 100px;
          padding: 10px 28px;
          font-family: 'Roboto', sans-serif;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-ghost:hover { background: #0A0A0A; color: #FFD600; }

        .card {
          background: white;
          border-radius: 20px;
          padding: 18px 20px;
          width: 100%;
        }

        .compliment-item {
          background: #FFF8E0;
          border-radius: 12px;
          padding: 10px 14px 10px 16px;
          font-size: 13px;
          color: #333;
          line-height: 1.55;
          font-style: italic;
          font-weight: 700;
          border-left: 4px solid #0A0A0A;
          opacity: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .compliment-item.visible { animation: fadeUp 0.45s ease forwards; }
        .compliment-text { flex: 1; }

        .play-btn {
          flex-shrink: 0;
          width: 30px; height: 30px;
          border-radius: 50%;
          border: 2px solid #0A0A0A;
          background: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          transition: all 0.15s;
        }
        .play-btn:hover { background: #0A0A0A; color: white; }
        .play-btn.playing { background: #E8001C; border-color: #E8001C; color: white; }

        .cat-ring-wrap {
          position: relative;
          width: 162px; height: 162px;
          display: flex; align-items: center; justify-content: center;
          margin-top: 28px;
        }
        .cat-ring-wrap::after {
          content: "";
          position: absolute;
          inset: -10px;
          border-radius: 50%;
          background: conic-gradient(
            from 0deg,
            transparent 0%,
            transparent 15%,
            rgba(255,255,255,0.15) 25%,
            rgba(255,255,255,0.5) 40%,
            #ffffff 65%,
            rgba(255,255,255,0.5) 80%,
            rgba(255,255,255,0.15) 88%,
            transparent 95%,
            transparent 100%
          );
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 8px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 8px));
          animation: spin 1.8s linear infinite;
        }

        .screen {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
          width: 100%;
          max-width: 440px;
        }
        .screen.fade-up { animation: fadeUp 0.4s ease forwards; }
        .screen.scale-in { animation: scaleIn 0.4s ease forwards; }

        .section-label {
          font-family: 'FilsonPro', 'Nunito', sans-serif;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 3px;
          color: #0A0A0A;
          margin-bottom: 6px;
        }

        .voice-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #0A0A0A;
          color: #FFD600;
          border-radius: 100px;
          padding: 6px 16px 6px 10px;
          font-size: 13px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          animation: buttonPop 0.5s ease forwards;
        }

        .cat-circle {
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid #0A0A0A;
          flex-shrink: 0;
          display: block;
        }

        .error-box {
          background: #0A0A0A;
          border-radius: 16px;
          padding: 20px;
          width: 100%;
          color: #FF6B6B;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          line-height: 1.6;
          word-break: break-word;
        }

        .gen-step {
          font-size: 15px;
          font-weight: 800;
          color: #0A0A0A;
          text-align: center;
          min-height: 24px;
          margin-top: 8px;
        }
        .gen-elapsed {
          font-size: 11px;
          font-weight: 700;
          color: #6B4F00;
          text-align: center;
          font-family: 'Roboto', sans-serif;
          letter-spacing: 0.5px;
        }
        .gen-hint {
          font-size: 12px;
          font-weight: 700;
          color: #6B4F00;
          text-align: center;
        }
        .pw-wrap {
          min-height: 100vh;
          background: #FFD600;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          gap: 24px;
          font-family: 'Roboto', sans-serif;
        }
        .pw-card {
          background: #fff;
          border-radius: 20px;
          padding: 28px 24px;
          width: 100%;
          max-width: 360px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          box-shadow: 0 2px 16px rgba(0,0,0,0.08);
        }
        .pw-label {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #0A0A0A;
          font-family: 'FilsonPro', 'Nunito', sans-serif;
        }
        .pw-input {
          width: 100%;
          padding: 14px 16px;
          border: 2.5px solid #0A0A0A;
          border-radius: 12px;
          font-size: 17px;
          font-family: 'Roboto', sans-serif;
          font-weight: 700;
          outline: none;
          letter-spacing: 3px;
          transition: border-color 0.2s;
        }
        .pw-input:focus { border-color: #FFD600; }
        .pw-input.error { border-color: #E8001C; }
        .pw-error {
          font-size: 12px;
          font-weight: 700;
          color: #E8001C;
          text-align: center;
        }
      `}</style>

      {!unlocked && (
        <div className="pw-wrap">
          <div className="cwsa-brand">
            <img src="/logo.png" alt="Temptations"
              style={{ height: 120, display: "block", margin: "0 auto 8px", objectFit: "contain" }}
              onError={(e) => { e.target.style.display = "none"; }} />
            <div className="cwsa-brand-sub">presents</div>
            <h1 className="cwsa-title small">
              <span>Cats Will</span><br />
              <span className="cwsa-title-yellow">Say Anything</span>
            </h1>
          </div>
          <div className="pw-card">
            <div className="pw-label">Enter password</div>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (pwInput.trim().toLowerCase() === "treats") {
                sessionStorage.setItem("unlocked", "1");
                setUnlocked(true);
              } else {
                setPwError(true);
                setPwInput("");
                setTimeout(() => setPwError(false), 2000);
              }
            }}>
              <input
                className={`pw-input${pwError ? " error" : ""}`}
                type="password"
                placeholder="••••••"
                value={pwInput}
                autoFocus
                autoComplete="off"
                onChange={(e) => setPwInput(e.target.value)}
              />
              {pwError && <p className="pw-error" style={{ marginTop: 8 }}>Incorrect password</p>}
              <button
                type="submit"
                className="btn-red"
                style={{ width: "100%", marginTop: 14 }}
              >
                Enter →
              </button>
            </form>
          </div>
        </div>
      )}

      {unlocked && <div className="cwsa-wrap">

        {/* Brand header */}
        <div className="cwsa-brand">
          <img
            src="/logo.png"
            alt="Temptations"
            style={{
              height: screen === "upload" ? "176px" : "120px",
              transition: "height 0.35s ease",
              display: "block",
              margin: "0 auto 8px",
              objectFit: "contain",
            }}
            onError={(e) => { e.target.style.display = "none"; }}
          />
          <div className="cwsa-brand-sub">presents</div>
          <h1 className={`cwsa-title ${screen === "upload" ? "large" : "small"}`}>
            <span>Cats Will</span><br />
            <span className="cwsa-title-yellow">Say Anything</span>
          </h1>
          {screen === "upload" && (
            <p className="cwsa-tagline">for Temptations.</p>
          )}
        </div>

        <div style={{ height: screen === "upload" ? "10px" : "8px", transition: "height 0.3s" }} />

        {/* ── UPLOAD ── */}
        {screen === "upload" && (
          <div className="screen fade-up" style={{ gap: "12px" }}>
            <div
              className={`upload-zone ${dragOver ? "drag-over" : ""}`}
              onClick={() => !catImage && fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
            >
              {catImage ? (
                <>
                  <img src={catImage} alt="Your cat" className="cat-preview" />
                  <button
                    className="change-photo-btn"
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  >Change photo</button>
                </>
              ) : (
                <>
                  <img src="/cat-mascot.png" alt="" className="mascot" onError={(e) => { e.target.style.display = "none"; }} />
                  <span className="upload-zone-label">Drop your cat here</span>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files[0])}
              style={{ display: "none" }}
            />

            {uploadError && (
              <div style={{
                background: "#0A0A0A",
                color: "#FFD600",
                borderRadius: 12,
                padding: "12px 16px",
                width: "100%",
                fontSize: 13,
                fontWeight: 800,
                textAlign: "center",
                lineHeight: 1.5,
              }}>
                🐾 {uploadError}
              </div>
            )}

            {catImage ? (
              <button className="btn-red pulsing" onClick={analyzeCat}>
                Analyse this cat →
              </button>
            ) : (
              <button className="btn-red" onClick={() => fileInputRef.current?.click()}>
                Upload your cat
              </button>
            )}
          </div>
        )}

        {/* ── ANALYZING ── */}
        {screen === "analyzing" && (
          <div className="screen fade-up" style={{ alignItems: "center", gap: "20px" }}>
            <div className="cat-ring-wrap">
              {catImage && (
                <img src={catImage} alt="cat" className="cat-circle" style={{ width: 135, height: 135 }} />
              )}
            </div>
            <p style={{ fontSize: "17px", fontWeight: 800, color: "#0A0A0A", textAlign: "center", minHeight: "26px" }}>
              {ANALYZING_MESSAGES[msgIndex]}
            </p>
          </div>
        )}

        {/* ── REVEALED ── */}
        {screen === "revealed" && vd && analysis && (
          <div className="screen scale-in" style={{ gap: "14px" }}>

            <div style={{ display: "flex", alignItems: "center", gap: "16px", width: "100%" }}>
              {catImage && (
                <img src={catImage} alt="cat" className="cat-circle" style={{ width: 80, height: 80 }} />
              )}
              <div style={{ flex: 1 }}>
                <div className="section-label">Voice assigned</div>
                {revealStep >= 1 && (
                  <div className="voice-badge">
                    <span>{analysis.voice}</span>
                  </div>
                )}
                {revealStep >= 2 && (
                  <p style={{ fontSize: "12px", fontWeight: 700, color: "#6B4F00", fontStyle: "italic", marginTop: "6px", animation: "revealSlide 0.4s ease forwards" }}>
                    {analysis.tagline}
                  </p>
                )}
              </div>
            </div>

            {revealStep >= 2 && (
              <div className="card" style={{ animation: "fadeUp 0.4s ease forwards" }}>
                <div className="section-label">Why this voice</div>
                <p style={{ fontSize: "14px", color: "#333", lineHeight: 1.6, fontWeight: 700 }}>
                  {analysis.reasoning}
                </p>
              </div>
            )}

            {revealStep >= 3 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", width: "100%", marginTop: "4px", animation: "fadeUp 0.5s 0.4s ease forwards", opacity: 0 }}>
                <button
                  className="btn-red pulsing"
                  style={{ width: "100%", fontSize: "19px", padding: "18px" }}
                  onClick={createFilm}
                >
                  🎬 Create Film
                </button>
                <button className="btn-ghost" onClick={reset}>Try another cat</button>
              </div>
            )}
          </div>
        )}

        {/* ── GENERATING ── */}
        {screen === "generating" && (() => {
          const LOADER_STILLS = ["/director.png", "/clapper.png", "/boom.png"];
          const phase = loaderImgIndex % 4;
          const isUserPhoto = phase === 3;
          const imgSrc = isUserPhoto ? catImage : LOADER_STILLS[phase];
          return (
          <div className="screen fade-up" style={{ alignItems: "center", gap: "20px" }}>
            <div className="cat-ring-wrap">
              {imgSrc && (
                <img
                  key={loaderImgIndex}
                  src={imgSrc}
                  alt="loading"
                  style={isUserPhoto ? {
                    width: 135, height: 135,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "3px solid #0A0A0A",
                    animation: "loaderFade 0.4s ease forwards",
                  } : {
                    width: 130, height: 130,
                    objectFit: "contain",
                    animation: "loaderFade 0.4s ease forwards",
                  }}
                />
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
              <p className="gen-step">{generatingStep || GENERATING_STEPS[genMsgIndex]}</p>
              {elapsedSeconds > 0 && (
                <p className="gen-elapsed">
                  {elapsedSeconds >= 60
                    ? `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s elapsed`
                    : `${elapsedSeconds}s elapsed`}
                </p>
              )}
            </div>
            <p className="gen-hint">This takes a few minutes. Don't close the tab.</p>
          </div>
          );
        })()}

        {/* ── ERROR ── */}
        {screen === "error" && (
          <div className="screen fade-up" style={{ gap: "16px" }}>
            <span style={{ fontSize: "42px" }}>😾</span>
            <h2 style={{ fontSize: "20px", fontWeight: 900, color: "#0A0A0A", textAlign: "center" }}>
              Something went wrong
            </h2>
            <div className="error-box">{generatingError}</div>
            <button
              className="btn-red"
              style={{ width: "100%" }}
              onClick={() => { setScreen("revealed"); setGeneratingError(""); }}
            >
              Try again
            </button>
          </div>
        )}

      </div>}
    </>
  );
}
