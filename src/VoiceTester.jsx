import { useState, useRef } from "react";

const VOICES = {
  "Barry White Core": {
    sample: "You smell... incredible. Did you roll in something dead? Be honest with me.",
    desc: "Deep 70s soul crooner — velvet baritone, impossibly slow",
  },
  "French Smooth Talker": {
    sample: "Your hair, it shines. You have been licking it, non? Do not lie. I know the work of a tongue.",
    desc: "French-accented, world-weary, philosophically resigned",
  },
  "Early 2000s Sean Connery": {
    sample: "I have hunted many things. Birds. Moths. One unfortunate sock. None of them looked at me the way you do.",
    desc: "Scottish gravitas — gravelly baritone, imperious cadence",
  },
};

function VoiceCard({ name, desc, sample }) {
  const [text, setText] = useState(sample);
  const [state, setState] = useState("idle"); // idle | loading | playing | error
  const [errorMsg, setErrorMsg] = useState("");
  const audioRef = useRef(null);

  async function play() {
    if (state === "loading") return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setState("loading");
    setErrorMsg("");
    try {
      const resp = await fetch("/api/tts-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: name, text }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setState("idle"); URL.revokeObjectURL(url); };
      audio.onerror = () => { setState("error"); setErrorMsg("Playback error"); };
      await audio.play();
      setState("playing");
    } catch (e) {
      setState("error");
      setErrorMsg(e.message);
    }
  }

  function stop() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setState("idle");
  }

  return (
    <div style={{
      background: "#fff", border: "2px solid #000", borderRadius: 12,
      padding: "20px 18px", marginBottom: 18,
    }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{name}</div>
      <div style={{ fontSize: 12, color: "#555", marginBottom: 14 }}>{desc}</div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
        style={{
          width: "100%", boxSizing: "border-box", border: "1.5px solid #ccc",
          borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13,
          resize: "vertical", marginBottom: 12,
        }}
      />
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={state === "playing" ? stop : play}
          disabled={!text.trim()}
          style={{
            background: state === "playing" ? "#e00" : "#FFD700",
            color: "#000", border: "2px solid #000", borderRadius: 8,
            padding: "9px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer",
          }}
        >
          {state === "loading" ? "Loading…" : state === "playing" ? "Stop" : "Play"}
        </button>
        {state === "error" && (
          <span style={{ fontSize: 12, color: "#e00" }}>{errorMsg}</span>
        )}
      </div>
    </div>
  );
}

export default function VoiceTester() {
  return (
    <div style={{
      maxWidth: 460, margin: "0 auto", padding: "32px 20px",
      fontFamily: "'Arial Black', Arial, sans-serif",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 8, color: "#888" }}>
        DEV TOOL
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 6px" }}>Voice Preview</h1>
      <p style={{ fontSize: 13, color: "#555", margin: "0 0 28px" }}>
        Test the three ElevenLabs voice IDs. Edit the text, hit Play.
      </p>
      {Object.entries(VOICES).map(([name, { desc, sample }]) => (
        <VoiceCard key={name} name={name} desc={desc} sample={sample} />
      ))}
      <div style={{ fontSize: 11, color: "#aaa", textAlign: "center", marginTop: 8 }}>
        /dev/voices — not linked from the main app
      </div>
    </div>
  );
}
