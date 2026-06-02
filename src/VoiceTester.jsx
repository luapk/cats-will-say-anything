import { useState, useRef, useEffect } from "react";

const ASSIGNED = {
  "Barry White Core": "hILdTfuUq4LRBMrxHERr",
  "French Smooth Talker": "I1T6PEfqPxl45yKRN4aS",
  "Early 2000s Sean Connery": "csXxiUN2BUFflsCaDxPM",
};

const SAMPLES = {
  "Barry White Core": "You smell... incredible. Did you roll in something dead? Be honest with me.",
  "French Smooth Talker": "Your hair, it shines. You have been licking it, non? Do not lie. I know the work of a tongue.",
  "Early 2000s Sean Connery": "I have hunted many things. Birds. Moths. One unfortunate sock. None of them looked at me the way you do.",
};

// ── Persona card (top section) ───────────────────────────────────────────────

function PersonaCard({ name }) {
  const [text, setText] = useState(SAMPLES[name]);
  const [state, setState] = useState("idle");
  const [err, setErr] = useState("");
  const audioRef = useRef(null);

  async function play() {
    if (state === "loading") return;
    audioRef.current?.pause();
    audioRef.current = null;
    setState("loading"); setErr("");
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
      const url = URL.createObjectURL(await resp.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setState("idle"); URL.revokeObjectURL(url); };
      audio.onerror = () => { setState("error"); setErr("Playback error"); };
      await audio.play();
      setState("playing");
    } catch (e) { setState("error"); setErr(e.message); }
  }

  function stop() { audioRef.current?.pause(); audioRef.current = null; setState("idle"); }

  return (
    <div style={{ background: "#fff", border: "2px solid #000", borderRadius: 12, padding: "18px 16px", marginBottom: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>{name}</div>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>ID: {ASSIGNED[name]}</div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
        style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #ccc", borderRadius: 8,
          padding: "7px 9px", fontFamily: "inherit", fontSize: 13, resize: "vertical", marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={state === "playing" ? stop : play} disabled={!text.trim()}
          style={{ background: state === "playing" ? "#e00" : "#FFD700", color: "#000",
            border: "2px solid #000", borderRadius: 8, padding: "8px 20px",
            fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
          {state === "loading" ? "Loading…" : state === "playing" ? "Stop" : "Play"}
        </button>
        {state === "error" && <span style={{ fontSize: 12, color: "#e00" }}>{err}</span>}
      </div>
    </div>
  );
}

// ── Voice browser row ────────────────────────────────────────────────────────

function VoiceRow({ voice, testText }) {
  const [state, setState] = useState("idle");
  const audioRef = useRef(null);

  function stopAll() { audioRef.current?.pause(); audioRef.current = null; }

  async function playPreview() {
    stopAll();
    if (!voice.preview_url) return;
    setState("loading");
    const audio = new Audio(voice.preview_url);
    audioRef.current = audio;
    audio.onended = () => setState("idle");
    audio.onerror = () => setState("idle");
    await audio.play().catch(() => setState("idle"));
    setState("playing-preview");
  }

  async function playCustom() {
    stopAll();
    setState("loading-custom");
    try {
      const resp = await fetch("/api/tts-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: voice.voice_id, text: testText }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const url = URL.createObjectURL(await resp.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setState("idle"); URL.revokeObjectURL(url); };
      await audio.play();
      setState("playing-custom");
    } catch { setState("idle"); }
  }

  function stop() { stopAll(); setState("idle"); }
  const busy = state !== "idle";

  const accent = voice.labels?.accent || "";
  const gender = voice.labels?.gender || "";
  const age = voice.labels?.age || "";
  const meta = [accent, gender, age].filter(Boolean).join(" · ");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
      borderBottom: "1px solid #eee", fontSize: 13 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {voice.name}
        </div>
        {meta && <div style={{ fontSize: 11, color: "#888" }}>{meta}</div>}
        <div style={{ fontSize: 10, color: "#bbb", fontFamily: "monospace" }}>{voice.voice_id}</div>
      </div>
      <button onClick={busy ? stop : playPreview} disabled={!voice.preview_url && !busy}
        title="ElevenLabs sample clip"
        style={{ background: state === "playing-preview" ? "#e00" : "#f5f5f5",
          color: state === "playing-preview" ? "#fff" : "#000",
          border: "1.5px solid #ccc", borderRadius: 6, padding: "5px 10px",
          fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
        {state === "loading" ? "…" : state === "playing-preview" ? "Stop" : "Sample"}
      </button>
      <button onClick={busy ? stop : playCustom}
        title="Generate with test text via ElevenLabs API"
        style={{ background: state === "playing-custom" ? "#e00" : "#FFD700",
          color: "#000", border: "1.5px solid #000", borderRadius: 6,
          padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
        {state === "loading-custom" ? "…" : state === "playing-custom" ? "Stop" : "Try it"}
      </button>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function VoiceTester() {
  const [voices, setVoices] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [filter, setFilter] = useState("");
  const [testText, setTestText] = useState("I have hunted many things. Birds. Moths. One unfortunate sock. None of them looked at me the way you do.");

  useEffect(() => {
    fetch("/api/voices-list")
      .then(r => r.json())
      .then(d => { if (d.voices) setVoices(d.voices); else setLoadErr(d.error || "Unknown error"); })
      .catch(e => setLoadErr(e.message));
  }, []);

  const filtered = voices
    ? voices.filter(v => {
        const q = filter.toLowerCase();
        return (
          v.name.toLowerCase().includes(q) ||
          (v.labels?.accent || "").toLowerCase().includes(q) ||
          (v.labels?.gender || "").toLowerCase().includes(q) ||
          v.voice_id.toLowerCase().includes(q)
        );
      })
    : [];

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: "28px 16px",
      fontFamily: "'Arial Black', Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#aaa", marginBottom: 6 }}>DEV TOOL</div>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>Voice Preview</h1>
      <p style={{ fontSize: 12, color: "#666", margin: "0 0 24px" }}>
        Current persona assignments — edit text, hit Play to hear the assigned voice.
      </p>

      {/* Persona cards */}
      {Object.keys(ASSIGNED).map(name => <PersonaCard key={name} name={name} />)}

      {/* Divider */}
      <div style={{ borderTop: "3px solid #000", margin: "28px 0 20px" }} />
      <h2 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 6px" }}>All account voices</h2>
      <p style={{ fontSize: 12, color: "#666", margin: "0 0 14px" }}>
        Sample = ElevenLabs preview clip. Try it = generate with the test text below (uses API credits).
      </p>

      {/* Test text for "Try it" */}
      <textarea value={testText} onChange={e => setTestText(e.target.value)} rows={2}
        placeholder="Text to use for 'Try it' buttons…"
        style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #ccc", borderRadius: 8,
          padding: "7px 9px", fontFamily: "inherit", fontSize: 12, resize: "vertical", marginBottom: 12 }} />

      {/* Filter */}
      <input value={filter} onChange={e => setFilter(e.target.value)}
        placeholder="Filter by name or accent…"
        style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #ccc", borderRadius: 8,
          padding: "7px 9px", fontFamily: "inherit", fontSize: 13, marginBottom: 4 }} />

      {/* Voice list */}
      {!voices && !loadErr && (
        <div style={{ color: "#888", fontSize: 13, padding: "20px 0" }}>Loading voices…</div>
      )}
      {loadErr && (
        <div style={{ color: "#e00", fontSize: 13, padding: "12px 0" }}>Error: {loadErr}</div>
      )}
      {voices && (
        <div>
          <div style={{ fontSize: 11, color: "#aaa", marginBottom: 8 }}>{filtered.length} voices</div>
          {filtered.map(v => <VoiceRow key={v.voice_id} voice={v} testText={testText} />)}
          {filtered.length === 0 && <div style={{ fontSize: 13, color: "#888" }}>No voices match.</div>}
        </div>
      )}

      <div style={{ fontSize: 10, color: "#ccc", textAlign: "center", marginTop: 24 }}>
        /dev/voices — internal only
      </div>
    </div>
  );
}
