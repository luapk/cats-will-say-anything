import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const VOICES = {
  "Barry White Core": {
    emoji: "🎵",
    voiceDesc: "deep, velvet, impossibly smooth baritone — every word arrives slightly after you expected it",
    voiceStyle: "a deep, velvety, impossibly smooth Barry White style baritone with long deliberate pauses between each word, as if every syllable costs something",
    compliments: [
      "I have seen you. And I have chosen... to remain."
    ]
  },
  "French Smooth Talker": {
    emoji: "🥐",
    voiceDesc: "silky French accent, existentially resigned, as if complimenting you is a philosophical act they find distasteful but necessary",
    voiceStyle: "a silky French-accented voice, world-weary and existentially resigned, each word carrying the weight of a man who finds complimenting you philosophically distasteful but necessary",
    compliments: [
      "I have seen you cry at the television. I did not leave the room. This is love, non?"
    ]
  },
  "Noir Detective": {
    emoji: "🔦",
    voiceDesc: "gravelly and world-weary, like a man who has seen too much rain and too many owners and isn't sure which was worse",
    voiceStyle: "a gravelly, world-weary film noir detective voice, raspy and slow, like a man who has seen too much rain and too many disappointments",
    compliments: [
      "The truth about you is this: you mean well. In this city, that still counts for something."
    ]
  },
  "Latin Lothario": {
    emoji: "🌹",
    voiceDesc: "passionate and telenovela-dramatic, with occasional Spanish endearments and the energy of a man who has never once been casual about anything",
    voiceStyle: "a passionate, intensely romantic Latin lover voice — dramatic and telenovela-sincere, with occasional Spanish endearments like 'mi amor' and 'corazón', treating every sentence like a pivotal scene in a soap opera",
    compliments: [
      "Mi amor. I have been watching you from this windowsill for some time now. And I have decided: you are the one. Do not ask how I know. I simply know."
    ]
  },
  "90s R&B Slow Jam": {
    emoji: "🕯️",
    voiceDesc: "breathy Boyz II Men falsetto — achingly sincere, deeply committed, performing every sentence like it's the bridge of a candlelit slow jam",
    voiceStyle: "a smooth, breathy 90s R&B voice in the style of Boyz II Men — earnest falsetto, achingly sincere, every word performed as if at a Valentine's Day concert with candles everywhere",
    compliments: [
      "Baby. I just want you to know. You are THE human. I tried to imagine another human and I couldn't. I genuinely couldn't. Congratulations."
    ]
  }
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

const GENERATING_STEPS = [
  "Directing your cat...",
  "Generating film + voice...",
  "Cat is approaching the button...",
  "Paw contact imminent...",
  "Rendering your masterpiece...",
  "Almost there...",
];

export default function CatsWillSayAnything() {
  const navigate = useNavigate();
  const [screen, setScreen] = useState("upload");
  const [catImage, setCatImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMimeType, setImageMimeType] = useState("image/jpeg");
  const [analysis, setAnalysis] = useState(null);
  const [generatingStep, setGeneratingStep] = useState("");
  const [generatingError, setGeneratingError] = useState("");
  const [msgIndex, setMsgIndex] = useState(0);
  const [genMsgIndex, setGenMsgIndex] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [revealStep, setRevealStep] = useState(0);
  const fileInputRef = useRef(null);
  const msgIntervalRef = useRef(null);
  const genMsgIntervalRef = useRef(null);

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
      genMsgIntervalRef.current = setInterval(() => {
        setGenMsgIndex(prev => Math.min(prev + 1, GENERATING_STEPS.length - 1));
      }, 22000);
    }
    return () => clearInterval(genMsgIntervalRef.current);
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

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    stopAudio();
    setCatImage(URL.createObjectURL(file));
    setImageMimeType(file.type);
    const reader = new FileReader();
    reader.onload = (e) => setImageBase64(e.target.result.split(",")[1]);
    reader.readAsDataURL(file);
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
      const prompt = `You are analysing a cat photo for the "Cats Will Say Anything" Temptations cat treats campaign.

Assign this cat ONE of these voice archetypes based purely on their vibe, expression, posture and general energy:
- Barry White Core
- French Smooth Talker
- Noir Detective
- Latin Lothario
- 90s R&B Slow Jam

Write 2-3 funny, specific, observational sentences explaining WHY. Reference the cat's actual appearance — fur, expression, posture, eyes. Be affectionately cutting.

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
      const compliment = vd.compliments[0];

      // Start generation (video + audio baked in one call)
      setGeneratingStep("Directing your cat...");
      const startResp = await fetch("/api/veo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          imageMimeType,
          voiceStyle: vd.voiceStyle,
          compliment,
        }),
      });
      const startData = await startResp.json();
      if (!startResp.ok || !startData.operationName) {
        throw new Error(startData.error || JSON.stringify(startData));
      }
      const { operationName } = startData;

      // Poll until done (max 5 min)
      let finalUrl = null;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000));
        setGeneratingStep(`Generating film + voice... ${Math.floor(i * 5)}s`);
        const pollResp = await fetch(`/api/veo?op=${encodeURIComponent(operationName)}`);
        const pollData = await pollResp.json();
        if (pollData.status === "done") { finalUrl = pollData.url; break; }
        if (pollData.status === "failed") throw new Error(pollData.error || "Veo generation failed");
      }
      if (!finalUrl) throw new Error("Generation timed out after 5 minutes");

      const shareParams = new URLSearchParams({
        v: finalUrl,
        c: compliment,
        voice: analysis.voice,
      });
      navigate(`/share?${shareParams.toString()}`);

    } catch (err) {
      setGeneratingError(err?.message || String(err));
      setScreen("error");
    }
  };

  const reset = () => {
    setScreen("upload");
    setCatImage(null);
    setImageBase64(null);
    setAnalysis(null);
    setGeneratingError("");
    setRevealStep(0);
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

        .dot {
          width: 9px; height: 9px;
          border-radius: 50%;
          background: #E8001C;
          animation: dotBounce 1.2s ease infinite;
        }

        .spinner {
          width: 40px; height: 40px;
          border: 4px solid rgba(0,0,0,0.15);
          border-top-color: #0A0A0A;
          border-radius: 50%;
          animation: spin 0.9s linear infinite;
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
        }
        .gen-hint {
          font-size: 12px;
          font-weight: 700;
          color: #6B4F00;
          text-align: center;
        }
      `}</style>

      <div className="cwsa-wrap">

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
            <p className="cwsa-tagline">Even compliment the owner.</p>
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
          <div className="screen fade-up" style={{ alignItems: "center" }}>
            {catImage && (
              <img src={catImage} alt="cat" className="cat-circle" style={{ width: 120, height: 120 }} />
            )}
            <span style={{ fontSize: "44px", animation: "pawBounce 0.9s ease-in-out infinite" }}>🐾</span>
            <p style={{ fontSize: "17px", fontWeight: 800, color: "#0A0A0A", textAlign: "center", minHeight: "26px" }}>
              {ANALYZING_MESSAGES[msgIndex]}
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              {[0, 1, 2].map(i => (
                <div key={i} className="dot" style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </div>
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
                    <span>{vd.emoji}</span>
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
              <div style={{ width: "100%" }}>
                <div className="section-label">What your cat will say</div>
                <div
                  className={`compliment-item visible`}
                  style={{ animationDelay: "0s" }}
                >
                  <span className="compliment-text">"{vd.compliments[0]}"</span>
                </div>
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
        {screen === "generating" && (
          <div className="screen fade-up" style={{ alignItems: "center", gap: "20px" }}>
            {catImage && (
              <img src={catImage} alt="cat" className="cat-circle" style={{ width: 100, height: 100 }} />
            )}
            <div className="spinner" />
            <p className="gen-step">{generatingStep || GENERATING_STEPS[genMsgIndex]}</p>
            <p className="gen-hint">This takes 1–2 minutes. Don't close the tab.</p>
            <div style={{ display: "flex", gap: "8px" }}>
              {[0, 1, 2].map(i => (
                <div key={i} className="dot" style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
        {screen === "error" && (
          <div className="screen fade-up" style={{ gap: "16px" }}>
            <span style={{ fontSize: "42px" }}>😾</span>
            <h2 style={{ fontSize: "20px", fontWeight: 900, color: "#0A0A0A", textAlign: "center" }}>
              Something went wrong
            </h2>
            <div className="error-box">{generatingError}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
              <button
                className="btn-red"
                style={{ width: "100%" }}
                onClick={() => { setScreen("revealed"); setGeneratingError(""); }}
              >
                Try again
              </button>
              <button className="btn-ghost" style={{ width: "100%" }} onClick={reset}>
                Start over
              </button>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
