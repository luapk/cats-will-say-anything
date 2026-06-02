# Cats Will Say Anything — Project Brief

A Temptations (Mars Petcare) branded viral web app. User uploads a cat photo → Gemini analyses it → Google Veo generates a short film of the cat pressing a Temptations button → shareable link with voiceover.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6, mobile-first (max 440px) |
| Hosting | Vercel (static SPA + serverless functions) |
| Video generation | Google Veo 3.1 (`veo-3.1-generate-preview`) |
| Cat analysis | Google Gemini 2.5 Flash (`gemini-2.5-flash`, thinkingBudget 0) |
| Voiceover | ElevenLabs TTS (`eleven_multilingual_v2`) |
| Audio compositing | ffmpeg-static (bundled into Vercel function) |
| File storage | Vercel Blob (`@vercel/blob`) |

---

## Environment Variables (Vercel dashboard)

| Variable | Scope | Purpose |
|---|---|---|
| `GOOGLE_API_KEY` | All | Gemini + Veo API access |
| `ELEVENLABS_API_KEY` | All | ElevenLabs TTS |
| `BLOB_READ_WRITE_TOKEN` | All | Vercel Blob storage |
| `USE_ELEVENLABS` | Preview (set to `1`) | Enables decoupled ElevenLabs pipeline |
| `USE_BUTTON_REFERENCE` | All | Set to `0` to disable button image reference in Veo |

**Never put keys in code.** All secrets are Vercel env vars only.

---

## Branch Strategy

- `main` → production at `cats-will-say-anything.vercel.app`
- `claude/deploy-cats-app-vercel-uswhx` → preview deployment with `USE_ELEVENLABS=1` active

All current development is on the feature branch. Once voices and timing are signed off, merge to `main` to go live on production.

---

## Architecture

### Pipeline (ElevenLabs mode, `USE_ELEVENLABS=1`)

```
User uploads cat photo
        ↓
/api/gemini  — 3-step Gemini prompt:
  STEP 1: Content moderation (explicit, hate, violence, drugs)
  STEP 2: Subject check (must be a cat)
  STEP 3: Cat analysis → assigns voice persona + tagline
        ↓
/api/veo (POST) — starts Veo 3.1 generation (long-running op)
  Client polls GET /api/veo?op=... every 5s
        ↓
Veo generates 8s video (silent — Veo audio discarded by ffmpeg)
Stored to Vercel Blob as cats/{id}.mp4
        ↓
/api/finalize (POST)
  1. Download Veo clip from Blob
  2. Generate ElevenLabs voice (in parallel with download)
  3. ffmpeg: extend video 8s→12s (freeze last frame)
  4. ffmpeg: bake audio track —
       click.mp3 at 1.0s + ElevenLabs VO at 1.5s
       Veo's original audio discarded entirely
  5. Store final baked MP4 to Vercel Blob as cats/{id}-final.mp4
        ↓
/share page — video player + social share + "Shop Online" CTA
```

### Why ElevenLabs was decoupled from Veo

Veo cannot reliably order silence → click → voice. The voice was consistently playing before or during the button press. The fix: Veo generates a visual-only clip, ElevenLabs generates the voice separately, and ffmpeg composites them at a fixed timing offset that is structurally impossible to get wrong.

---

## Key Files

| File | Purpose |
|---|---|
| `src/CatsWillSayAnything.jsx` | Main app component — upload, analysis, generation flow |
| `src/SharePage.jsx` | Share page — video player, social buttons, Shop Online CTA |
| `src/main.jsx` | Router — `/`, `/share`, `/dev/bg-test`, `/dev/voices` |
| `api/gemini.js` | Gemini proxy (cat analysis, moderation) |
| `api/veo.js` | Veo generation — POST starts job, GET polls it |
| `api/finalize.js` | ElevenLabs + ffmpeg audio compositing |
| `api/tts-preview.js` | Dev tool — POST `{voice, text}` → audio/mpeg |
| `api/voices-list.js` | Dev tool — GET all ElevenLabs voices on account |
| `public/button.png` | Temptations button reference image sent to Veo |
| `public/click.mp3` | Real button click sound baked in at press moment |
| `vercel.json` | Function config — maxDuration, ffmpeg + click.mp3 bundle |

---

## Voice Personas

Three personas assigned by Gemini based on the cat's visual features (fur type, markings, body shape — not expression):

| Persona | ElevenLabs Voice ID | Style | Notes |
|---|---|---|---|
| Barry White Core | `hILdTfuUq4LRBMrxHERr` | 0.0 | Working well at defaults |
| French Smooth Talker | `I1T6PEfqPxl45yKRN4aS` | 0.7 | style boosted to pull accent |
| Early 2000s Sean Connery | `csXxiUN2BUFflsCaDxPM` | 0.7, speed 0.82 | style boosted + slowed down |

Voice assignment rules in Gemini prompt:
- **Barry White Core** → solid dark/black coats, plush dense fur, round heavy bodies
- **French Smooth Talker** → sleek coats, lean elegant builds, aloof expressions
- **Early 2000s Sean Connery** → tabby stripes, rugged face, stocky muscular build

---

## Audio Timing (finalize.js)

| Constant | Value | Meaning |
|---|---|---|
| `PRESS_SECONDS` | 1.0s | Fixed assumed contact moment (cat presses within first second per Veo prompt) |
| `VOICE_GAP_SECONDS` | 0.5s | Gap between click and VO start |
| `TARGET_SECONDS` | 12s | Final video length (8s Veo + 4s freeze) |

Click fires at **1000ms**, VO fires at **1500ms**. Both are locked — no Gemini detection (was tried, proved unreliable with ±0.5s drift).

---

## Veo Prompt Key Rules

- Cat already fully in frame at frame 1, presses button within first second
- No audio instructions (previously triggered Veo's audio safety filter)
- Reproduces cat's exact face markings: blazes, patches, eye liner, asymmetric colouring
- Button described via BUTTON_BIBLE JSON spec + reference image (`public/button.png`)
- Crash zoom to extreme close-up in final 1.5–2 seconds
- No text on screen, no humans

---

## Dev Tools

- `/dev/voices` — test all three ElevenLabs voices with editable text + play/stop. Also lists every voice on the account with Sample (preview clip) and Try It (live API) buttons.
- `/dev/bg-test` — background removal comparison tool

---

## Password Gate

Password: **`treats`** (stored in `sessionStorage` as `unlocked=1`)

---

## Known Decisions & Tradeoffs

- **Veo 3.1 caps at 8 seconds** — extended to 12s via ffmpeg freeze of last frame. Freeze holds the crash-zoom face stare, which works well.
- **Gemini press detection removed** — timestamp accuracy was ±0.5s, making sync feel wrong. Fixed offset at 1.0s is more consistent given the constrained Veo prompt.
- **Veo audio discarded entirely** — Veo generated stray clicks at wrong times. ffmpeg builds the audio track from scratch: `click.mp3` + ElevenLabs VO only.
- **Button reference image** — `public/button.png` sent as a second Veo asset reference. Can be disabled with `USE_BUTTON_REFERENCE=0` if it causes empty/filtered output.
- **Celebrity names removed from Veo prompt** — "Barry White", "Sean Connery" etc. triggered Veo's RAI filter ("can't create videos with real people's names"). Voice descriptions rewritten without naming real people.
