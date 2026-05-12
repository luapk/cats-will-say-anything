import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";

export default function SharePage() {
  const [params] = useSearchParams();
  const videoUrl = params.get("v");
  const compliment = params.get("c");
  const voice = params.get("voice");

  const [shared, setShared] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "My cat has something to say",
          text: `"${compliment}" — Cats Will Say Anything`,
          url,
        });
        setShared(true);
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (!videoUrl) {
    return (
      <div style={{
        background: "#FFD600", minHeight: "100vh",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 20, fontFamily: "sans-serif", padding: 24,
      }}>
        <p style={{ fontSize: 20, fontWeight: 900 }}>No film found.</p>
        <Link to="/" style={{
          background: "#0A0A0A", color: "#FFD600", textDecoration: "none",
          borderRadius: 100, padding: "14px 32px", fontWeight: 900, fontSize: 16,
        }}>Make yours →</Link>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800;900&display=swap');
        @font-face {
          font-family: 'FilsonPro';
          src: url('/fonts/FilsonProBlack.otf') format('opentype');
          font-weight: 900;
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0A0A0A; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sp-wrap {
          min-height: 100vh;
          background: #0A0A0A;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-bottom: 32px;
          font-family: 'Nunito', sans-serif;
        }
        .sp-header {
          width: 100%;
          padding: 16px 20px 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sp-video-wrap {
          width: 100%;
          max-width: 420px;
          background: #111;
        }
        .sp-video {
          width: 100%;
          display: block;
          max-height: 72vh;
          object-fit: contain;
        }
        .sp-info {
          width: 100%;
          max-width: 420px;
          padding: 20px 24px 0;
          animation: fadeUp 0.5s ease forwards;
        }
        .sp-voice-label {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #FFD600;
          margin-bottom: 8px;
        }
        .sp-compliment-text {
          font-size: 18px;
          font-weight: 800;
          color: #ffffff;
          font-style: italic;
          line-height: 1.5;
        }
        .sp-divider {
          width: 40px; height: 2px;
          background: #333; border-radius: 2px;
          margin-top: 16px;
        }
        .sp-actions {
          width: 100%;
          max-width: 420px;
          padding: 20px 20px 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
          animation: fadeUp 0.5s 0.1s ease both;
        }
        .btn-share {
          width: 100%;
          background: #FFD600;
          color: #0A0A0A;
          border: none;
          border-radius: 100px;
          padding: 16px 32px;
          font-family: 'FilsonPro', 'Nunito', sans-serif;
          font-size: 17px;
          font-weight: 900;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          transition: all 0.2s;
        }
        .btn-share:hover { background: #FFE933; transform: translateY(-2px); }
        .btn-try {
          display: block;
          width: 100%;
          text-align: center;
          background: transparent;
          color: #FFD600;
          border: 2px solid #FFD600;
          border-radius: 100px;
          padding: 14px 32px;
          font-family: 'FilsonPro', 'Nunito', sans-serif;
          font-size: 15px;
          font-weight: 900;
          cursor: pointer;
          text-decoration: none;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          transition: all 0.2s;
        }
        .btn-try:hover { background: #FFD600; color: #0A0A0A; }
      `}</style>

      <div className="sp-wrap">
        <div className="sp-header">
          <img
            src="/logo.png"
            alt="Temptations"
            style={{ height: 56, objectFit: "contain" }}
            onError={(e) => { e.target.style.display = "none"; }}
          />
        </div>

        <div className="sp-video-wrap">
          {/* Audio is baked into the video — no separate audio element needed */}
          <video
            src={videoUrl}
            className="sp-video"
            controls
            playsInline
            autoPlay
          />
        </div>

        {(compliment || voice) && (
          <div className="sp-info">
            {voice && <div className="sp-voice-label">{voice} says:</div>}
            {compliment && <p className="sp-compliment-text">"{compliment}"</p>}
            <div className="sp-divider" />
          </div>
        )}

        <div className="sp-actions">
          <button className="btn-share" onClick={handleShare}>
            {copied ? "✓ Link copied!" : shared ? "✓ Shared!" : "Share this film"}
          </button>
          <Link to="/" className="btn-try">
            Make yours with Temptations →
          </Link>
        </div>
      </div>
    </>
  );
}
