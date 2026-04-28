import { useState, useRef, useCallback } from "react";

// ─── Constants ──────────────────────────────────────────────────────────────
const YELLOW = "#FFC800";
const RED = "#E8001C";
const BLACK = "#0A0A0A";
const WHITE = "#FFFFFF";

// ─── Utility: base64 → Blob ──────────────────────────────────────────────────
function b64ToBlob(b64, mime) {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ─── Utility: Blob URL → Blob ────────────────────────────────────────────────
async function urlToBlob(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
  return r.blob();
}

// ─── Utility: Composite transparent PNG on #FFC800 ───────────────────────────
async function compositeOnYellow(sourceBlob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(sourceBlob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = YELLOW;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(objUrl);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas blob failed"))),
        "image/jpeg",
        0.95
      );
    };
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = objUrl;
  });
}

// ─── Utility: Poll Replicate prediction via server proxy ─────────────────────
async function pollReplicate(predId, onStatus) {
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const r = await fetch(`/api/replicate?id=${predId}`);
    const d = await r.json();
    onStatus(d.status);
    if (d.status === "succeeded") return d.output;
    if (d.status === "failed" || d.status === "canceled")
      throw new Error(d.error || `Prediction ${d.status}`);
  }
  throw new Error("Timed out after 135 seconds");
}

// ─── Method A: @imgly/background-removal (npm package, WASM) ─────────────────
async function runMethodA(b64, mime, onStatus) {
  onStatus("loading model...");
  const { removeBackground } = await import("@imgly/background-removal");
  onStatus("running segmentation...");
  const inputBlob = b64ToBlob(b64, mime);
  const outputBlob = await removeBackground(inputBlob, {
    progress: (key, current, total) => {
      if (total > 0) onStatus(`loading ${Math.round((current / total) * 100)}%`);
    },
  });
  onStatus("compositing on yellow...");
  return await compositeOnYellow(outputBlob);
}

// ─── Method B: Replicate cjwbw/rembg (via server proxy) ──────────────────────
async function runMethodB(b64, mime, onStatus) {
  onStatus("creating prediction...");
  const r = await fetch("/api/replicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://api.replicate.com/v1/models/cjwbw/rembg/predictions",
      body: {
        input: {
          image: `data:${mime};base64,${b64}`,
          alpha_matting: true,
          alpha_matting_foreground_threshold: 240,
          alpha_matting_background_threshold: 10,
          alpha_matting_erode_size: 10,
        },
      },
    }),
  });
  const pred = await r.json();
  if (!pred.id) throw new Error(pred.detail || JSON.stringify(pred));
  const output = await pollReplicate(pred.id, onStatus);
  onStatus("compositing on yellow...");
  const rawUrl = Array.isArray(output) ? output[0] : output;
  const rawBlob = await urlToBlob(rawUrl);
  return await compositeOnYellow(rawBlob);
}

// ─── Method C: Replicate configurable (via server proxy) ─────────────────────
async function runMethodC(b64, mime, modelId, prompt, onStatus) {
  // Upload image to Replicate file storage first — image_urls needs a real URL
  onStatus("uploading image...");
  const uploadR = await fetch("/api/replicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "upload", b64, mime }),
  });
  const uploaded = await uploadR.json();
  if (!uploaded.urls?.get) throw new Error(`Upload failed: ${uploaded.detail || JSON.stringify(uploaded)}`);
  const imageUrl = uploaded.urls.get;

  onStatus("creating prediction...");
  const hasVersion = modelId.includes(":");
  const url = hasVersion
    ? "https://api.replicate.com/v1/predictions"
    : `https://api.replicate.com/v1/models/${modelId}/predictions`;

  // google/nano-banana-2 uses image_urls (array). Fall back to image for other models.
  const isNanoBanana = modelId.includes("nano-banana");
  const inputPayload = isNanoBanana
    ? {
        image_urls: [imageUrl],
        prompt,
        aspect_ratio: "match_input_image",
        output_format: "png",
        resolution: "1K",
      }
    : { image: imageUrl, prompt };

  const body = hasVersion
    ? { version: modelId.split(":")[1], input: inputPayload }
    : { input: inputPayload };
  const r = await fetch("/api/replicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, body }),
  });
  const pred = await r.json();
  if (!pred.id) throw new Error(pred.detail || JSON.stringify(pred));
  const output = await pollReplicate(pred.id, onStatus);
  onStatus("compositing on yellow...");
  const rawUrl = Array.isArray(output) ? output[0] : output;
  const rawBlob = await urlToBlob(rawUrl);
  return await compositeOnYellow(rawBlob);
}

// ─── Timer hook ───────────────────────────────────────────────────────────────
function useTimer() {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  const start = useCallback(() => {
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 100);
  }, []);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
  }, []);

  const reset = useCallback(() => {
    clearInterval(intervalRef.current);
    setElapsed(0);
  }, []);

  return { elapsed, start, stop, reset };
}

// ─── Result state helper ──────────────────────────────────────────────────────
const fresh = () => ({ status: "idle", msg: "", result: null, error: null, time: 0 });

// ─── Download helper ──────────────────────────────────────────────────────────
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BgRemovalComparison() {
  const [catImage, setCatImage] = useState(null);
  const [b64, setB64] = useState(null);
  const [mime, setMime] = useState("image/jpeg");
  const [dragOver, setDragOver] = useState(false);
  const [modelC, setModelC] = useState("google/nano-banana-2:pazq5tpd7xrmr0cwkbb8ek35pr");
  const [promptC, setPromptC] = useState(
    "The exact same cat from the reference photo on a clean solid yellow background. Critically preserve without any alteration: the cat's precise fur markings and coat pattern, exact fur colours, eye colour and eye shape, fur length and texture, facial structure, whisker length, age (kitten/adult/senior), body proportions, and any distinctive features or blemishes. The cat must be photorealistally identical to the reference. Clean flat yellow background (#FFD600), studio product photography, professional lighting, sharp focus on the cat."
  );
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState({ a: fresh(), b: fresh(), c: fresh() });
  const fileRef = useRef(null); // kept for potential future use

  const timerA = useTimer();
  const timerB = useTimer();
  const timerC = useTimer();

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setCatImage(URL.createObjectURL(file));
    setMime(file.type);
    const reader = new FileReader();
    reader.onload = (e) => setB64(e.target.result.split(",")[1]);
    reader.readAsDataURL(file);
    setResults({ a: fresh(), b: fresh(), c: fresh() });
  };

  const setR = (key, partial) =>
    setResults((prev) => ({ ...prev, [key]: { ...prev[key], ...partial } }));

  const runAll = async () => {
    if (!b64) return;
    setRunning(true);
    setResults({ a: fresh(), b: fresh(), c: fresh() });

    const runA = async () => {
      timerA.reset();
      timerA.start();
      setR("a", { status: "running", msg: "starting..." });
      try {
        const blob = await runMethodA(b64, mime, (msg) =>
          setR("a", { msg })
        );
        timerA.stop();
        const elapsed = Date.now();
        setR("a", { status: "done", result: blob, msg: "complete" });
      } catch (e) {
        timerA.stop();
        setR("a", { status: "error", error: e.message, msg: e.message });
      }
    };

    const runB = async () => {
      timerB.reset();
      timerB.start();
      setR("b", { status: "running", msg: "starting..." });
      try {
        const blob = await runMethodB(b64, mime, (msg) => setR("b", { msg }));
        timerB.stop();
        setR("b", { status: "done", result: blob, msg: "complete" });
      } catch (e) {
        timerB.stop();
        setR("b", { status: "error", error: e.message, msg: e.message });
      }
    };

    const runC = async () => {
      timerC.reset();
      timerC.start();
      setR("c", { status: "running", msg: "starting..." });
      try {
        const blob = await runMethodC(b64, mime, modelC, promptC, (msg) => setR("c", { msg }));
        timerC.stop();
        setR("c", { status: "done", result: blob, msg: "complete" });
      } catch (e) {
        timerC.stop();
        setR("c", { status: "error", error: e.message, msg: e.message });
      }
    };

    await Promise.all([runA(), runB(), runC()]);
    setRunning(false);
  };

  const allDone =
    results.a.status !== "idle" &&
    results.b.status !== "idle" &&
    results.c.status !== "idle" &&
    !running;

  const fmtTime = (ms) => {
    if (!ms) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const METHODS = [
    {
      key: "a",
      label: "A",
      name: "@imgly/background-removal",
      desc: "Browser WASM. No API key. Runs client-side.",
      tag: "FREE",
      tagColor: "#00A36C",
      timer: timerA,
    },
    {
      key: "b",
      label: "B",
      name: "Replicate: cjwbw/rembg",
      desc: "Dedicated ML background removal. Alpha matting enabled.",
      tag: "REPLICATE",
      tagColor: "#0055FF",
      timer: timerB,
    },
    {
      key: "c",
      label: "C",
      name: "Replicate: Nano Banana 2",
      desc: "Generative img2img. Preserves cat features, replaces background.",
      tag: "CUSTOM",
      tagColor: "#7B00E8",
      timer: timerC,
    },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800;900&family=Space+Mono:wght@400;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${YELLOW}; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%,100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: scale(0.94); }
          to { opacity: 1; transform: scale(1); }
        }

        .wrap {
          min-height: 100vh;
          background: ${YELLOW};
          font-family: 'Nunito', sans-serif;
          padding: 24px 16px 48px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }

        /* Header */
        .header {
          text-align: center;
          animation: fadeUp 0.4s ease forwards;
        }
        .header-eyebrow {
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: ${RED};
          margin-bottom: 4px;
        }
        .header-title {
          font-family: 'Nunito', sans-serif;
          font-weight: 900;
          font-size: clamp(24px, 6vw, 38px);
          color: ${BLACK};
          text-transform: uppercase;
          letter-spacing: -1.5px;
          line-height: 0.95;
        }
        .header-sub {
          font-size: 13px;
          font-weight: 700;
          color: #7A5F00;
          margin-top: 6px;
        }

        /* Config panel */
        .config {
          background: ${BLACK};
          border-radius: 16px;
          padding: 18px;
          width: 100%;
          max-width: 700px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          animation: fadeUp 0.4s 0.1s ease both;
        }
        .config-row {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .config-label {
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: ${YELLOW};
          margin-bottom: 5px;
        }
        .config-group {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 140px;
        }
        .config-input {
          background: #1A1A1A;
          border: 1.5px solid #333;
          border-radius: 8px;
          padding: 9px 12px;
          color: white;
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          outline: none;
          transition: border-color 0.2s;
          width: 100%;
        }
        .config-input:focus { border-color: ${YELLOW}; }
        .config-input.key-hidden { -webkit-text-security: disc; letter-spacing: 2px; }

        /* Upload zone */
        .upload-zone {
          background: #1A1A1A;
          border: 2px dashed #444;
          border-radius: 12px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          cursor: pointer;
          transition: all 0.2s;
          overflow: hidden;
          position: relative;
          flex: 1;
          min-width: 200px;
        }
        .upload-zone:hover, .upload-zone.drag-over {
          border-color: ${YELLOW};
          background: #222;
        }
        .upload-zone img {
          width: 60px; height: 60px;
          border-radius: 8px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .upload-zone-text {
          font-size: 11px;
          font-weight: 800;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .upload-zone-name {
          font-size: 11px;
          font-weight: 700;
          color: ${YELLOW};
        }

        /* Run button */
        .run-btn {
          background: ${RED};
          color: white;
          border: none;
          border-radius: 100px;
          padding: 14px 36px;
          font-family: 'Nunito', sans-serif;
          font-size: 15px;
          font-weight: 900;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 1px;
          transition: all 0.2s;
          width: 100%;
          max-width: 700px;
          animation: fadeUp 0.4s 0.2s ease both;
        }
        .run-btn:hover:not(:disabled) {
          background: #C00018;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(232,0,28,0.4);
        }
        .run-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Results grid */
        .results-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          width: 100%;
          max-width: 900px;
          animation: fadeUp 0.4s 0.25s ease both;
        }
        @media (max-width: 600px) {
          .results-grid { grid-template-columns: 1fr; }
        }

        /* Method card */
        .method-card {
          background: white;
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .card-header {
          padding: 12px 14px 10px;
          border-bottom: 1px solid #f0f0f0;
        }
        .card-header-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
        }
        .card-label-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .card-letter {
          width: 22px; height: 22px;
          border-radius: 50%;
          background: ${BLACK};
          color: ${YELLOW};
          font-size: 11px;
          font-weight: 900;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .card-name {
          font-size: 11px;
          font-weight: 900;
          color: ${BLACK};
          line-height: 1.3;
        }
        .card-tag {
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.5px;
          border-radius: 4px;
          padding: 2px 6px;
          color: white;
          flex-shrink: 0;
        }
        .card-desc {
          font-size: 10px;
          font-weight: 700;
          color: #888;
          line-height: 1.45;
        }

        /* Status bar */
        .status-bar {
          padding: 8px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #FAFAFA;
          border-bottom: 1px solid #f0f0f0;
          min-height: 34px;
        }
        .status-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .status-dot.idle { background: #ccc; }
        .status-dot.running { background: ${RED}; animation: pulse 1s ease infinite; }
        .status-dot.done { background: #00A36C; }
        .status-dot.error { background: ${RED}; }
        .status-msg {
          font-family: 'Space Mono', monospace;
          font-size: 9px;
          color: #555;
          flex: 1;
          padding: 0 8px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .status-time {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          font-weight: 700;
          color: ${BLACK};
          flex-shrink: 0;
          min-width: 40px;
          text-align: right;
        }
        .spinner {
          width: 10px; height: 10px;
          border: 2px solid #f0f0f0;
          border-top-color: ${RED};
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }

        /* Result image area */
        .result-image-wrap {
          flex: 1;
          background: repeating-conic-gradient(#f0f0f0 0% 25%, white 0% 50%) 0 0 / 12px 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 180px;
          position: relative;
        }
        .result-image-wrap img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
          animation: slideIn 0.35s ease forwards;
        }
        .result-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 20px;
          opacity: 0.35;
        }
        .result-placeholder-icon {
          font-size: 28px;
        }
        .result-placeholder-text {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #888;
          text-align: center;
        }
        .result-error-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 16px;
          text-align: center;
        }
        .result-error-icon { font-size: 24px; }
        .result-error-text {
          font-family: 'Space Mono', monospace;
          font-size: 9px;
          color: ${RED};
          line-height: 1.5;
          word-break: break-word;
        }

        /* Card footer */
        .card-footer {
          padding: 10px 14px;
          border-top: 1px solid #f0f0f0;
        }
        .dl-btn {
          width: 100%;
          background: ${BLACK};
          color: ${YELLOW};
          border: none;
          border-radius: 8px;
          padding: 9px;
          font-family: 'Nunito', sans-serif;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          transition: background 0.2s;
        }
        .dl-btn:hover { background: #333; }

        /* Winner banner */
        .winner-banner {
          background: ${BLACK};
          border-radius: 14px;
          padding: 14px 18px;
          width: 100%;
          max-width: 700px;
          animation: slideIn 0.4s ease forwards;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .winner-trophy { font-size: 26px; flex-shrink: 0; }
        .winner-text { }
        .winner-label {
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: ${YELLOW};
          opacity: 0.7;
          margin-bottom: 2px;
        }
        .winner-name {
          font-size: 15px;
          font-weight: 900;
          color: ${YELLOW};
        }
        .winner-reason {
          font-size: 11px;
          font-weight: 700;
          color: #aaa;
          margin-top: 2px;
        }

        /* Note box */
        .note {
          background: rgba(0,0,0,0.06);
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 11px;
          font-weight: 700;
          color: #5A4200;
          line-height: 1.5;
          width: 100%;
          max-width: 700px;
        }
        .note strong { color: ${RED}; }

        .show-key-btn {
          background: none;
          border: none;
          color: #555;
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          cursor: pointer;
          padding: 0 4px;
          flex-shrink: 0;
          align-self: flex-end;
          margin-bottom: 2px;
        }
      `}</style>

      <div className="wrap">

        {/* Header */}
        <div className="header">
          <div className="header-eyebrow">Cats Will Say Anything — Dev Tool</div>
          <h1 className="header-title">BG Removal<br />Smackdown</h1>
          <p className="header-sub">A vs B vs C. Yellow background. Best cat wins.</p>
        </div>

        {/* Config */}
        <div className="config">

          <div className="config-row">
            {/* Upload */}
            <div className="config-group" style={{ flex: 2, minWidth: "200px" }}>
              <div className="config-label">Cat image</div>
              <div
                className={`upload-zone ${dragOver ? "drag-over" : ""}`}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                style={{ position: "relative" }}
              >
                {catImage ? (
                  <>
                    <img src={catImage} alt="uploaded cat" />
                    <span className="upload-zone-name">Cat loaded. Click to change.</span>
                  </>
                ) : (
                  <span className="upload-zone-text">Click or drop cat image here</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFile(e.target.files[0])}
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: 0,
                    cursor: "pointer",
                    width: "100%",
                    height: "100%",
                  }}
                />
              </div>
            </div>

          </div>

          {/* Method C config */}
          <div className="config-row">
            <div className="config-group" style={{ flex: 1 }}>
              <div className="config-label">Method C — Replicate model ID</div>
              <input
                className="config-input"
                type="text"
                placeholder="e.g. owner/nano-banana-2 or owner/model:version"
                value={modelC}
                onChange={(e) => setModelC(e.target.value)}
              />
            </div>
            <div className="config-group" style={{ flex: 2 }}>
              <div className="config-label">Method C — generation prompt</div>
              <input
                className="config-input"
                type="text"
                value={promptC}
                onChange={(e) => setPromptC(e.target.value)}
              />
            </div>
          </div>

        </div>

        {/* Note */}
        <div className="note">
          <strong>Method A</strong> runs fully in-browser using WASM — may be slow on first load (downloads model). <strong>Methods B + C</strong> require your Replicate API key. <strong>All three</strong> composite the result onto <code>#FFC800</code> yellow for direct comparison.
        </div>

        {/* Run button */}
        <button
          className="run-btn"
          onClick={runAll}
          disabled={!catImage || running}
        >
          {running ? "⚡ Running all three..." : "⚡ Run comparison"}
        </button>

        {/* Results */}
        <div className="results-grid">
          {METHODS.map(({ key, label, name, desc, tag, tagColor, timer }) => {
            const r = results[key];
            const imgUrl = r.result ? URL.createObjectURL(r.result) : null;

            return (
              <div className="method-card" key={key}>
                {/* Card header */}
                <div className="card-header">
                  <div className="card-header-top">
                    <div className="card-label-wrap">
                      <div className="card-letter">{label}</div>
                      <div className="card-name">{name}</div>
                    </div>
                    <div className="card-tag" style={{ background: tagColor }}>{tag}</div>
                  </div>
                  <div className="card-desc">{desc}</div>
                </div>

                {/* Status bar */}
                <div className="status-bar">
                  {r.status === "running" ? (
                    <div className="spinner" />
                  ) : (
                    <div className={`status-dot ${r.status}`} />
                  )}
                  <span className="status-msg">
                    {r.status === "idle" ? "waiting" : r.msg}
                  </span>
                  <span className="status-time">
                    {r.status === "running"
                      ? fmtTime(timer.elapsed)
                      : r.status === "done" || r.status === "error"
                      ? fmtTime(timer.elapsed)
                      : "—"}
                  </span>
                </div>

                {/* Result image */}
                <div className="result-image-wrap">
                  {r.status === "idle" && (
                    <div className="result-placeholder">
                      <div className="result-placeholder-icon">🐱</div>
                      <div className="result-placeholder-text">Result appears here</div>
                    </div>
                  )}
                  {r.status === "running" && (
                    <div className="result-placeholder">
                      <div className="result-placeholder-icon" style={{ animation: "pulse 1s ease infinite" }}>⚙️</div>
                      <div className="result-placeholder-text">{r.msg}</div>
                    </div>
                  )}
                  {r.status === "done" && imgUrl && (
                    <img src={imgUrl} alt={`Method ${label} result`} />
                  )}
                  {r.status === "error" && (
                    <div className="result-error-wrap">
                      <div className="result-error-icon">⚠️</div>
                      <div className="result-error-text">{r.error}</div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="card-footer">
                  {r.status === "done" && r.result ? (
                    <button
                      className="dl-btn"
                      onClick={() => downloadBlob(r.result, `cat-yellow-method-${key}.jpg`)}
                    >
                      ↓ Download
                    </button>
                  ) : (
                    <button className="dl-btn" disabled style={{ opacity: 0.3, cursor: "default" }}>
                      ↓ Download
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Winner assessment — appears when all done */}
        {allDone && (() => {
          const doneKeys = ["a","b","c"].filter(k => results[k].status === "done");
          const errorKeys = ["a","b","c"].filter(k => results[k].status === "error");
          if (doneKeys.length === 0) return null;

          const times = { a: timerA.elapsed, b: timerB.elapsed, c: timerC.elapsed };
          const fastest = doneKeys.sort((x, y) => times[x] - times[y])[0];
          const methodNames = { a: "@imgly (browser)", b: "Replicate rembg", c: "Custom model" };

          return (
            <div className="winner-banner">
              <div className="winner-trophy">🏆</div>
              <div className="winner-text">
                <div className="winner-label">Fastest to yellow</div>
                <div className="winner-name">Method {fastest.toUpperCase()} — {methodNames[fastest]}</div>
                <div className="winner-reason">
                  {fmtTime(times[fastest])} to complete.
                  {errorKeys.length > 0 && ` Methods ${errorKeys.map(k => k.toUpperCase()).join(", ")} errored — check config.`}
                  {" "}Compare edges on fur detail above to pick your winner.
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </>
  );
}
