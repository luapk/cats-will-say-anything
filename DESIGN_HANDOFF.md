# Cats Will Say Anything — Design Handoff

**Brand:** Temptations (Mars Petcare)  
**Format:** Mobile-first single-page web app (max-width 480px)  
**Screens:** Upload → Analysing → Reveal → Generating → Share

---

## Colour Palette

| Token | Hex | Usage |
|---|---|---|
| **Temptations Yellow** | `#FFD600` | App background, primary CTA fill, brand anchor |
| **Yellow Hover** | `#FFED00` | Upload zone hover, button hover state |
| **Yellow Light** | `#FFF8E0` | Compliment card background |
| **Near Black** | `#0A0A0A` | Body text, borders, button fills, share page background |
| **Dark Grey** | `#222222` | Black button hover state |
| **Body Text Grey** | `#333333` | Card body copy |
| **Warm Brown** | `#6B4F00` | Tagline text, secondary captions |
| **Temptations Red** | `#E8001C` | Spinner, playing state, error text |
| **Error Red (text)** | `#FF6B6B` | Error message copy inside dark box |
| **White** | `#FFFFFF` | Cards, upload zone base, button fills |
| **Share Page BG** | `#0A0A0A` | Full-bleed dark background on /share |
| **Share Video BG** | `#111111` | Video container on share page |
| **Share Divider** | `#333333` | Hairline divider below compliment |

---

## Typography

### Fonts

| Font | Weight(s) | Source | Usage |
|---|---|---|---|
| **FilsonPro Black** | 900 | `/public/fonts/FilsonProBlack.otf` | App title (CATS WILL SAY ANYTHING), all CTAs |
| **FilsonPro Bold** | 700 | `/public/fonts/FilsonProBold.otf` | Secondary headings |
| **Nunito** | 400, 700, 800, 900 | Google Fonts | Fallback for FilsonPro, UI labels |
| **Roboto** | 400, 700 | Google Fonts | Body text, ghost buttons, general UI |
| **Courier New** | — | System | Error message monospace box |

> **Stack order:** `'FilsonPro', 'Nunito', sans-serif` for display  
> `'Roboto', sans-serif` for body/buttons

### Type Scale

| Role | Size | Weight | Font | Colour | Notes |
|---|---|---|---|---|---|
| App title (large) | `clamp(48px, 11vw, 72px)` | 900 | FilsonPro | `#ffffff` | Line-height 0.92, letter-spacing -1px |
| App title (small) | `clamp(24px, 5.5vw, 36px)` | 900 | FilsonPro | `#ffffff` | Shrinks when not on upload screen |
| PRESENTS label | `10px` | 900 | FilsonPro | `#0A0A0A` | Letter-spacing 4px, uppercase |
| Section label | `10px` | 900 | FilsonPro | `#0A0A0A` | Letter-spacing 3px, uppercase |
| Voice badge text | `13px` | 900 | System | `#FFD600` | On `#0A0A0A` pill |
| Tagline | `12px` | 700 | Roboto | `#6B4F00` | Italic |
| Card body (reasoning) | `14px` | 700 | Roboto | `#333` | Line-height 1.6 |
| Compliment text | `13px` | 700 | Roboto | `#333` | Line-height 1.55, italic |
| Button text | `17px` | 900 | FilsonPro | Varies | Letter-spacing 0.5px |
| Ghost button text | `14px` | 800 | Roboto | `#0A0A0A` | — |
| Generating step | `15px` | 800 | Roboto | `#0A0A0A` | — |
| Generating hint | `12px` | 700 | Roboto | `#6B4F00` | — |
| Error heading | `20px` | 900 | Roboto | `#0A0A0A` | — |
| Share voice label | `10px` | 900 | FilsonPro | `#FFD600` | Letter-spacing 3px, uppercase |
| Share compliment | `18px` | 800 | Nunito | `#ffffff` | Italic |

---

## Spacing & Layout

| Token | Value |
|---|---|
| App max-width | `480px` |
| App horizontal padding | `20px` |
| App top padding | `12px` |
| App bottom padding | `20px` |
| Card padding | `18px 20px` |
| Card border-radius | `20px` |
| Compliment item padding | `10px 14px 10px 16px` |
| Compliment border-radius | `12px` |
| Screen gap (flex column) | `14px` (reveal) / `16px` (error) / `20px` (generating) |
| Button vertical padding | `15px` (primary) / `10px` (ghost) |
| Button horizontal padding | `40px` (primary) / `28px` (ghost) |
| Button border-radius | `100px` (pill) |
| Voice badge padding | `6px 16px 6px 10px` |
| Voice badge border-radius | `100px` |

---

## Components

### Upload Zone
- Border: `3px dashed #0A0A0A`
- Border-radius: `16px`
- Background: `#FFFFFF` → `#FFED00` on hover / drag-over
- Contains: upload icon, label, file input (hidden)
- Transitions to cat circle (80px diameter, circular crop, `border: 2px solid #0A0A0A`) after upload

### Buttons

| Class | Fill | Text colour | Border | Hover |
|---|---|---|---|---|
| `.btn-red` (primary CTA) | `#FFFFFF` | `#0A0A0A` | `2.5px solid #0A0A0A` | Fill `#FFED00`, lift `translateY(-2px)` |
| `.btn-black` | `#0A0A0A` | `#FFD600` | None | Fill `#222` |
| `.btn-ghost` | Transparent | `#0A0A0A` | `2.5px solid #0A0A0A` | Fill `#0A0A0A`, text `#FFD600` |
| `.btn-share` (share page) | `#FFD600` | `#0A0A0A` | None | Fill `#FFE933`, lift |
| `.btn-try` (share page) | Transparent | `#FFD600` | `2px solid #FFD600` | Fill `#FFD600`, text `#0A0A0A` |

> Primary CTA has a `.pulsing` modifier: `scale(1) → scale(1.03)` loop, box-shadow grows from `rgba(0,0,0,0.15)` to `rgba(0,0,0,0.25)`.

### Voice Badge
- Background: `#0A0A0A`
- Text: `#FFD600`, 13px, weight 900
- Pill shape, `border-radius: 100px`
- Left icon: emoji in 22px circle, `border: 3px solid #0A0A0A`

### Cards
- Background: `#FFFFFF`
- Border-radius: `20px`
- Padding: `18px 20px`
- Drop shadow: `0 2px 12px rgba(0,0,0,0.07)`

### Compliment Item
- Background: `#FFF8E0`
- Left accent border: `4px solid #0A0A0A`
- Border-radius: `12px`
- Text: 13px, weight 700, `#333`, italic

### Spinner
- `32px × 32px` circle
- Border: `3px solid rgba(0,0,0,0.1)`
- Top border: `#0A0A0A`
- Spins at 0.75s linear infinite

### Dot Loader (3 dots)
- `8px × 8px` circles
- Background: `#E8001C`
- Bounce animation, staggered `0.18s` delay per dot

### Error Box
- Background: `#0A0A0A`
- Text: `#FF6B6B`, 12px, Courier New, line-height 1.6
- Border-radius: `16px`, padding `20px`

---

## Animations

| Name | Effect | Duration | Usage |
|---|---|---|---|
| `fadeUp` | `opacity 0→1`, `translateY(16px→0)` | `0.5s ease` | Cards, buttons appearing |
| `revealSlide` | `opacity 0→1`, `translateY(8px→0)` | `0.4s ease` | Tagline, reasoning |
| `scale-in` | `scale(0.95)→scale(1)`, opacity | `0.4s ease` | Reveal screen entrance |
| `pulsing` | `scale(1)↔scale(1.03)`, box-shadow | `2s ease-in-out infinite` | CREATE FILM button |
| `bounce` | `translateY(0→-6px→0)` | `0.6s ease-in-out infinite` | Dot loader |
| `spin` | `rotate(0→360deg)` | `0.75s linear infinite` | Spinner |
| Title size | `font-size` transition | `0.35s ease` | Upload→post-upload shrink |

---

## Screen States

### 1 — Upload
- Full yellow background
- Temptations logo top-centre
- Large title (72px max)
- Upload zone centred
- Primary CTA: "Upload a cat photo" (or drag-drop)

### 2 — Analysing
- Cat circle replaces upload zone (80px, circular)
- Cycling messages (e.g. "Assessing disdain levels…") swap every 2.5s
- Spinner below

### 3 — Reveal
- Cat circle persists top-left (80px)
- Voice badge appears (step 1)
- Tagline fades in (step 2)
- "Why this voice" card (step 2)
- "What your cat will say" compliment (step 3)
- CREATE FILM button (pulsing) + "Try another cat" ghost link (step 3)

### 4 — Generating
- Cat circle (100px, centred)
- Spinner
- Step text updates live (e.g. "Paw contact imminent… 45s")
- Hint: "This takes 1–2 minutes. Don't close the tab."
- 3-dot loader

### 5 — Error
- 😾 emoji (42px)
- "Something went wrong" heading
- Error box with monospace message
- TRY AGAIN (returns to Reveal) + Start over (resets)

### 6 — Share (`/share`)
- Full dark (`#0A0A0A`) background
- Temptations logo (56px, top-centre)
- Video player (full width, max 72vh)
- Voice label + italic compliment quote below
- "Share this film" primary button (`#FFD600`)
- "Make yours with Temptations →" outline button

---

## Assets Required

| Asset | Path | Notes |
|---|---|---|
| Temptations logo | `/public/logo.png` | White version for dark bg (share page), full colour for yellow |
| Cat mascot | `/public/cat-mascot.png` | Shown on error screen, hidden if missing |
| FilsonPro Black | `/public/fonts/FilsonProBlack.otf` | Must be licensed for web use |
| FilsonPro Bold | `/public/fonts/FilsonProBold.otf` | Must be licensed for web use |
