import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";

const TikTokIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.75a8.17 8.17 0 0 0 4.77 1.52V6.82a4.85 4.85 0 0 1-1-.13z"/>
  </svg>
);

const InstagramIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const CopyLinkIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

export default function SharePage() {
  const [params] = useSearchParams();
  const videoUrl = params.get("v");
  const compliment = params.get("c");
  const voice = params.get("voice");

  const [copied, setCopied] = useState(false);
  const [copiedPlatform, setCopiedPlatform] = useState(null);

  const copyLink = async (platform) => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setCopiedPlatform(platform);
      setTimeout(() => { setCopied(false); setCopiedPlatform(null); }, 2500);
    } catch { /* clipboard unavailable */ }
  };

  const shareToFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`;
    window.open(url, "_blank", "width=600,height=400");
  };

  const SHARE_ITEMS = [
    { name: "TikTok", icon: <TikTokIcon />, action: () => copyLink("TikTok") },
    { name: "Instagram", icon: <InstagramIcon />, action: () => copyLink("Instagram") },
    { name: "Facebook", icon: <FacebookIcon />, action: shareToFacebook },
    { name: copied ? "Copied!" : "Copy link", icon: <CopyLinkIcon />, action: () => copyLink("Copy link") },
  ];

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
          padding-bottom: 40px;
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
        .sp-share-icons {
          width: 100%;
          max-width: 420px;
          padding: 24px 20px 0;
          display: flex;
          justify-content: center;
          gap: 28px;
          animation: fadeUp 0.5s 0.1s ease both;
        }
        .sp-icon-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          background: none;
          border: none;
          cursor: pointer;
          color: #fff;
          padding: 0;
        }
        .sp-icon-circle {
          width: 54px; height: 54px;
          border-radius: 50%;
          background: #1A1A1A;
          border: 1px solid #2A2A2A;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s, border-color 0.2s;
        }
        .sp-icon-btn:hover .sp-icon-circle {
          background: #252525;
          border-color: #444;
        }
        .sp-icon-label {
          font-size: 10px;
          font-weight: 700;
          color: #888;
          letter-spacing: 0.3px;
          white-space: nowrap;
        }
        .sp-actions {
          width: 100%;
          max-width: 420px;
          padding: 20px 20px 0;
          animation: fadeUp 0.5s 0.2s ease both;
        }
        .btn-buy {
          display: block;
          width: 100%;
          text-align: center;
          background: #FFD600;
          color: #0A0A0A;
          border: none;
          border-radius: 100px;
          padding: 16px 32px;
          font-family: 'FilsonPro', 'Nunito', sans-serif;
          font-size: 17px;
          font-weight: 900;
          cursor: pointer;
          text-decoration: none;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          transition: all 0.2s;
        }
        .btn-buy:hover { background: #FFE933; transform: translateY(-2px); }
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

        <div className="sp-share-icons">
          {SHARE_ITEMS.map(item => (
            <button key={item.name} className="sp-icon-btn" onClick={item.action}>
              <div className="sp-icon-circle">
                {item.icon}
              </div>
              <span className="sp-icon-label">
                {item.name === "Copy link" && copied && copiedPlatform === "Copy link"
                  ? "Copied!"
                  : item.name === "TikTok" && copied && copiedPlatform === "TikTok"
                  ? "Copied!"
                  : item.name === "Instagram" && copied && copiedPlatform === "Instagram"
                  ? "Copied!"
                  : item.name}
              </span>
            </button>
          ))}
        </div>

        <div className="sp-actions">
          <a
            href="https://www.temptationstreats.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-buy"
          >
            Buy Temptations →
          </a>
        </div>
      </div>
    </>
  );
}
