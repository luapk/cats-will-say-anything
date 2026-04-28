# Cats Will Say Anything
### A Temptations campaign experience

Built with Vite + React. Deployed on Vercel.

## Routes

| Route | Description |
|-------|-------------|
| `/` | Main campaign experience — upload cat, get voice, create film |
| `/dev/bg-test` | Background removal comparison tool (A vs B vs C) |

## Local development

```bash
npm install
npm run dev
```

## Environment variables

Set these in Vercel project settings (or `.env.local` for local dev):

```
ANTHROPIC_API_KEY=sk-ant-...
```

The Anthropic API key is **never** exposed to the client. All AI calls route through `/api/chat` (a Vercel serverless function).

## Deploy

```bash
npm install -g vercel   # if not already installed
vercel --team pauls-projects-522f6b11
```

On first run, Vercel will ask you to link to a new or existing project.

## Architecture

```
/                          # Vite React SPA
├── src/
│   ├── main.jsx           # React Router entry
│   ├── CatsWillSayAnything.jsx   # Main campaign app
│   └── BgRemovalComparison.jsx   # Dev tool: bg removal A/B/C test
├── api/
│   └── chat.js            # Vercel serverless fn — Anthropic proxy
└── vercel.json            # SPA rewrites + API routing
```
