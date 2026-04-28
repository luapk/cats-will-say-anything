import { useState, useRef, useEffect } from "react";

const VOICES = {
  "Barry White Core": {
    emoji: "🎵",
    voiceDesc: "deep, velvet, impossibly smooth baritone — every word arrives slightly after you expected it",
    compliments: [
      "You... are doing your best. And that is... enough.",
      "I have seen you. And I have chosen... to remain.",
      "Your cooking. Is not offensive. To me. Tonight.",
      "You opened the window when I asked. That is... a quality.",
      "For a human... you are tolerable. In the evenings.",
      "I notice... you made the bed today. That was... something.",
      "You have a warmth about you. That I occasionally appreciate... from a distance.",
      "Your voice is not unpleasant. When you are not talking too much.",
      "I have considered leaving. And I have not. That is... my gift to you.",
      "You try. And sometimes... that is visible."
    ]
  },
  "French Smooth Talker": {
    emoji: "🥐",
    voiceDesc: "silky French accent, existentially resigned, as if complimenting you is a philosophical act they find distasteful but necessary",
    compliments: [
      "You are not, how do I say... the worst thing in this apartment.",
      "Your sense of style is limited. But it is yours. This I respect. A little.",
      "Other people's owners are also mediocre. You are mediocre in a... familiar way.",
      "I have seen you cry at the television. I did not leave the room. This is love, non?",
      "You smell of effort. I find this... not entirely unpleasant.",
      "In France, we would not keep you. But this is not France. So here we are.",
      "You have a good heart. It is not your fault you also have that haircut.",
      "When you laugh, it is annoying. But also, somehow, it is yours. C'est la vie.",
      "You are improving. Slowly. It is noticeable. Barely.",
      "You ask so little in return. This is, perhaps, your greatest quality."
    ]
  },
  "Reluctant Life Coach": {
    emoji: "📋",
    voiceDesc: "reluctantly encouraging, like Tony Robbins halfway through a particularly disappointing Tuesday",
    compliments: [
      "You showed up today. That's literally it. And today, that's enough.",
      "Growth isn't linear. I can see that. From your life. Very clearly.",
      "Not everyone needs to be great. Some people just need to be present. You're present.",
      "I'm going to say something and I need you to really hear it: you're fine. You're just fine.",
      "Other people gave up. You didn't. I'm choosing to focus on that.",
      "You have potential. In the sense that potential is, by definition, unrealised. But it's there.",
      "I believe in you. I want that on record. Even on days when the evidence is limited.",
      "You're doing a good job. Of several things. I won't specify which ones right now. But several.",
      "The important thing is you tried. And that you'll try again. Tomorrow. Probably.",
      "Some people never learn. You learn. Eventually. That puts you ahead of some people."
    ]
  },
  "Passive Aggressive HR Manager": {
    emoji: "📎",
    voiceDesc: "measured, flat corporate delivery — the tone of someone reading a performance review they didn't enjoy writing",
    compliments: [
      "Going forward, your contributions to this household have been noted. And logged.",
      "This is not formal feedback. But if it were, I would say you are meeting most expectations.",
      "I've reviewed your performance over the past year and I wouldn't say I have concerns, exactly.",
      "Your communication style is very... you. I think that's something to lean into.",
      "We're not saying you need to change. We're just saying there's a development plan available.",
      "You bring a unique energy to this space. Unique is the word I would use.",
      "In the interests of transparency, you are someone I would describe as satisfactory.",
      "Thank you for your continued commitment to being here. It has been observed.",
      "Your effort is visible. That's something I can say with confidence.",
      "I wouldn't say you're the best person in this home. I also wouldn't say you're the worst."
    ]
  },
  "Early 2000s Sean Connery": {
    emoji: "🥃",
    voiceDesc: "imperious, vaguely disappointed, with the cadence of a man who has never once been wrong and suspects today will be no different",
    compliments: [
      "You have done adequately. I will not elaborate on this.",
      "In my experience, most people are disappointing. You are less disappointing than most.",
      "You remembered to feed me. This is the minimum. And yet. Here we are.",
      "I have known greater people. I have also known worse. You are somewhere in that range.",
      "You are not entirely without merit. Take that. Keep it. Use it wisely.",
      "Your determination is noted. I do not share it. But I note it.",
      "A lesser person would have given up by now. You have not. That is... something.",
      "You have managed today. Tomorrow remains to be seen. But today. Yes.",
      "I expect more. I always expect more. But what you gave was... sufficient.",
      "You have stopped trying to impress me. I find this... almost refreshing."
    ]
  },
  "Noir Detective": {
    emoji: "🔦",
    voiceDesc: "gravelly and world-weary, like a man who has seen too much rain and too many owners and isn't sure which was worse",
    compliments: [
      "In this city, everyone's hiding something. You're hiding very little. I respect that.",
      "I've seen good people. I've seen bad people. You're somewhere I don't usually see.",
      "You didn't lie to me today. In my line of work, that's a compliment.",
      "You keep going. I've seen enough to know that's rarer than it sounds.",
      "You're not what I expected. You're slightly better. Don't let it go to your head.",
      "Every case teaches you something. You've taught me patience. Specifically, patience.",
      "I've watched you. From across the room. You're not the problem. You're never the problem.",
      "In forty years on the job I've met maybe three people I'd call decent. You're adjacent to that.",
      "The truth about you is this: you mean well. In this city, that still counts for something.",
      "I came in expecting the worst. As I always do. You weren't that. Today, you weren't that."
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

export default function CatsWillSayAnything() {
  const [screen, setScreen] = useState("upload");
  const [catImage, setCatImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMimeType, setImageMimeType] = useState("image/jpeg");
  const [analysis, setAnalysis] = useState(null);
  const [videoPrompt, setVideoPrompt] = useState(null);
  const [copied, setCopied] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [revealStep, setRevealStep] = useState(0);
  const fileInputRef = useRef(null);
  const msgIntervalRef = useRef(null);

  useEffect(() => {
    if (screen === "analyzing") {
      msgIntervalRef.current = setInterval(() => {
        setMsgIndex(prev => (prev + 1) % ANALYZING_MESSAGES.length);
      }, 1100);
    }
    return () => clearInterval(msgIntervalRef.current);
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

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
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
    setScreen("analyzing");
    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: imageMimeType, data: imageBase64 }
              },
              {
                type: "text",
                text: `You are analysing a cat photo for the "Cats Will Say Anything" Temptations cat treats campaign.

Assign this cat ONE of these voice archetypes based purely on their vibe, expression, posture and general energy:
- Barry White Core
- French Smooth Talker
- Reluctant Life Coach
- Passive Aggressive HR Manager
- Early 2000s Sean Connery
- Noir Detective

Write 2-3 funny, specific, observational sentences explaining WHY. Reference the cat's actual appearance — fur, expression, posture, eyes. Be affectionately cutting.

Also write one punchy tagline about this specific cat. Max 8 words. Example: "This cat has seen things. Bad things."

Respond ONLY as valid JSON. No preamble, no backticks, no markdown:
{"voice": "exact name from list", "reasoning": "2-3 funny sentences", "tagline": "short line"}`
              }
            ]
          }]
        })
      });
      const data = await resp.json();
      const text = (data.content || []).map(b => b.text || "").join("");
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setAnalysis(parsed);
      setScreen("revealed");
    } catch (err) {
      const fallback = VOICE_KEYS[Math.floor(Math.random() * VOICE_KEYS.length)];
      setAnalysis({
        voice: fallback,
        reasoning: "Analysis encountered resistance. Your cat refused to cooperate with the process. Which, frankly, tells us everything we need to know.",
        tagline: "Unknowable. Possibly judging everyone."
      });
      setScreen("revealed");
    }
  };

  const createFilm = () => {
    const vd = VOICES[analysis.voice];
    const compliment = vd.compliments[Math.floor(Math.random() * vd.compliments.length)];
    const prompt = `A cat walks slowly across a clean white floor toward a large circular button, centre-frame. The button is yellow and red, branded with the Temptations logo, sitting flush on the floor like a pet training button. The cat's movement is unhurried. Almost insulting in its lack of urgency. It stops. Looks directly at camera for one beat too long. Then raises one paw and presses the button with the very tip, using the minimum possible effort. The moment the paw makes contact, a voice plays — ${vd.voiceDesc} — and says: "${compliment}" The cat's expression throughout is one of profound, barely-concealed contempt. It does not acknowledge the compliment. Cinematic close-up on paw meeting button. Cut to cat's face: unchanged. Style: clean product aesthetic, shallow depth of field, warm studio lighting, 4K, slight slow motion on the button press. 8 seconds.`;
    setVideoPrompt({ prompt, compliment, voice: analysis.voice });
    setScreen("complete");
  };

  const reset = () => {
    setScreen("upload");
    setCatImage(null);
    setImageBase64(null);
    setAnalysis(null);
    setVideoPrompt(null);
    setCopied(false);
    setRevealStep(0);
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(videoPrompt.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
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

        .cwsa-brand {
          text-align: center;
          margin-bottom: 0;
        }
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
        .cwsa-tagline {
          font-size: 14px;
          font-weight: 700;
          color: #6B4F00;
          margin-top: 4px;
        }

        /* Upload zone */
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
        .upload-zone:hover {
          background: #FFED00;
          border-color: #0A0A0A;
        }
        .upload-zone.drag-over {
          background: #FFED00;
          border-color: #0A0A0A;
          border-style: solid;
          transform: scale(1.02);
        }
        .upload-zone .mascot {
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          height: 70%;
          width: auto;
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
          top: 33%;
          left: 50%;
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

        /* Buttons */
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
        .btn-red:hover {
          background: #FFED00;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.18);
        }
        .btn-red:active { transform: translateY(0); }
        .btn-red.pulsing { animation: pulse 2.2s ease infinite; }

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
        .btn-black:hover {
          background: #222;
          transform: translateY(-2px);
        }

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
        .btn-ghost:hover {
          background: #0A0A0A;
          color: #FFD600;
        }

        /* Card */
        .card {
          background: white;
          border-radius: 20px;
          padding: 18px 20px;
          width: 100%;
        }

        /* Compliment cards */
        .compliment-item {
          background: #FFF8E0;
          border-radius: 12px;
          padding: 12px 16px;
          font-size: 13px;
          color: #333;
          line-height: 1.55;
          font-style: italic;
          font-weight: 700;
          border-left: 4px solid #0A0A0A;
          opacity: 0;
        }
        .compliment-item.visible {
          animation: fadeUp 0.45s ease forwards;
        }

        /* Analyzing dots */
        .dot {
          width: 9px; height: 9px;
          border-radius: 50%;
          background: #E8001C;
          animation: dotBounce 1.2s ease infinite;
        }

        /* Prompt box */
        .prompt-box {
          background: #0A0A0A;
          border-radius: 16px;
          padding: 18px 20px;
          font-family: 'Courier New', monospace;
          font-size: 11.5px;
          color: #FFD600;
          line-height: 1.65;
          text-align: left;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 200px;
          overflow-y: auto;
        }

        /* Temptations button graphic */
        .treats-button {
          width: 80px; height: 80px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #FFE066, #FFD600 60%, #E8001C);
          border: 4px solid #E8001C;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 900;
          color: white;
          text-align: center;
          line-height: 1.2;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          box-shadow: 0 4px 16px rgba(0,0,0,0.25);
          flex-shrink: 0;
          text-shadow: 0 1px 3px rgba(0,0,0,0.5);
        }

        /* Divider */
        .divider {
          width: 40px;
          height: 3px;
          background: #0A0A0A;
          border-radius: 2px;
        }

        /* Screen containers */
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

        /* Section label */
        .section-label {
          font-family: 'FilsonPro', 'Nunito', sans-serif;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 3px;
          color: #0A0A0A;
          margin-bottom: 6px;
        }

        /* Voice badge */
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

        /* Cat image circle */
        .cat-circle {
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid #0A0A0A;
          flex-shrink: 0;
          display: block;
        }

        /* Footer mark */
        .footer-mark {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          opacity: 0.5;
        }
        .footer-mark-dot {
          width: 32px; height: 32px;
          background: #E8001C;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
        }
        .footer-mark-text {
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #0A0A0A;
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

        {/* ── UPLOAD SCREEN ── */}
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
                  <img
                    src="/cat-mascot.png"
                    alt=""
                    className="mascot"
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
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

        {/* ── ANALYZING SCREEN ── */}
        {screen === "analyzing" && (
          <div className="screen fade-up" style={{ alignItems: "center" }}>
            {catImage && (
              <img
                src={catImage}
                alt="cat"
                className="cat-circle"
                style={{ width: 120, height: 120 }}
              />
            )}
            <span style={{ fontSize: "44px", animation: "pawBounce 0.9s ease-in-out infinite" }}>🐾</span>
            <p style={{
              fontSize: "17px",
              fontWeight: 800,
              color: "#0A0A0A",
              textAlign: "center",
              minHeight: "26px",
              transition: "opacity 0.3s"
            }}>
              {ANALYZING_MESSAGES[msgIndex]}
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              {[0, 1, 2].map(i => (
                <div key={i} className="dot" style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* ── REVEALED SCREEN ── */}
        {screen === "revealed" && vd && analysis && (
          <div className="screen scale-in" style={{ gap: "14px" }}>

            {/* Cat + Voice identity */}
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
                  <p style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#6B4F00",
                    fontStyle: "italic",
                    marginTop: "6px",
                    animation: "revealSlide 0.4s ease forwards"
                  }}>
                    {analysis.tagline}
                  </p>
                )}
              </div>
            </div>

            {/* Reasoning */}
            {revealStep >= 2 && (
              <div className="card" style={{ animation: "fadeUp 0.4s ease forwards" }}>
                <div className="section-label">Why this voice</div>
                <p style={{ fontSize: "14px", color: "#333", lineHeight: 1.6, fontWeight: 700 }}>
                  {analysis.reasoning}
                </p>
              </div>
            )}

            {/* Sample compliments */}
            {revealStep >= 3 && (
              <div style={{ width: "100%" }}>
                <div className="section-label">Sample compliments</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {vd.compliments.slice(0, 3).map((c, i) => (
                    <div
                      key={i}
                      className={`compliment-item ${revealStep >= 3 ? "visible" : ""}`}
                      style={{ animationDelay: `${i * 0.12}s` }}
                    >
                      "{c}"
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA */}
            {revealStep >= 3 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", width: "100%", marginTop: "4px", animation: "fadeUp 0.5s 0.4s ease forwards", opacity: 0 }}>
                <button className="btn-red pulsing" style={{ width: "100%", fontSize: "19px", padding: "18px" }} onClick={createFilm}>
                  🎬 Create Film
                </button>
                <button className="btn-ghost" onClick={reset}>Try another cat</button>
              </div>
            )}
          </div>
        )}

        {/* ── COMPLETE SCREEN ── */}
        {screen === "complete" && videoPrompt && (
          <div className="screen scale-in" style={{ gap: "14px" }}>

            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: "42px", display: "block", animation: "pawBounce 0.8s ease 3" }}>🎬</span>
              <div className="section-label" style={{ marginTop: "8px" }}>Film Brief Generated</div>
              <h2 style={{ fontSize: "20px", fontWeight: 900, color: "#0A0A0A" }}>{videoPrompt.voice}</h2>
            </div>

            <div className="card" style={{ textAlign: "center" }}>
              <div className="section-label">Your cat will say</div>
              <p style={{ fontSize: "17px", fontWeight: 800, color: "#0A0A0A", lineHeight: 1.45, fontStyle: "italic" }}>
                "{videoPrompt.compliment}"
              </p>
            </div>

            <div style={{ width: "100%" }}>
              <div className="section-label">Video prompt — paste into Kling / Runway / Luma</div>
              <div className="prompt-box">{videoPrompt.prompt}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
              <button className="btn-black" style={{ width: "100%" }} onClick={copyPrompt}>
                {copied ? "✓ Copied to clipboard" : "Copy video prompt"}
              </button>
              <button
                className="btn-red"
                style={{ width: "100%" }}
                onClick={() => {
                  const vd2 = VOICES[analysis.voice];
                  const newC = vd2.compliments[Math.floor(Math.random() * vd2.compliments.length)];
                  const newPrompt = `A cat walks slowly across a clean white floor toward a large circular button, centre-frame. The button is yellow and red, branded with the Temptations logo, sitting flush on the floor like a pet training button. The cat's movement is unhurried. Almost insulting in its lack of urgency. It stops. Looks directly at camera for one beat too long. Then raises one paw and presses the button with the very tip, using the minimum possible effort. The moment the paw makes contact, a voice plays — ${vd2.voiceDesc} — and says: "${newC}" The cat's expression throughout is one of profound, barely-concealed contempt. It does not acknowledge the compliment. Cinematic close-up on paw meeting button. Cut to cat's face: unchanged. Style: clean product aesthetic, shallow depth of field, warm studio lighting, 4K, slight slow motion on the button press. 8 seconds.`;
                  setVideoPrompt({ prompt: newPrompt, compliment: newC, voice: analysis.voice });
                  setCopied(false);
                }}
              >
                Different compliment →
              </button>
              <button className="btn-ghost" onClick={reset} style={{ width: "100%" }}>Start again</button>
            </div>
          </div>
        )}


      </div>
    </>
  );
}
