# Slidequest

Slidequest is a Next.js app that turns live speech, uploaded decks, and audience questions into AI-generated slides in real time.

Live demo: https://slidequest.vercel.app

It uses:
- Deepgram for live transcription
- Gemini for image and text generation
- OpenAI Realtime for idea extraction

The presenter gets a control surface with channels for exploratory ideas, audience questions, and uploaded slides, plus a separate audience view with QR-code joining and live Q&A.

## Requirements

- Node.js 20+ (22+ recommended)
- `npm` or `pnpm`
- API keys for:
  - `GOOGLE_API_KEY` (Gemini)
  - `DEEPGRAM_API_KEY` (Deepgram Nova)
  - `OPENAI_API_KEY` (OpenAI Realtime)

Create a `.env.local` file (not committed) based on these keys:

```bash
GOOGLE_API_KEY=your-google-gemini-api-key
DEEPGRAM_API_KEY=your-deepgram-api-key
OPENAI_API_KEY=your-openai-api-key
```

Office file uploads (`.ppt/.pptx/.key`) and server-side conversion are only enabled in local development (`NODE_ENV=development`) and require LibreOffice plus `poppler-utils` or ImageMagick installed on your machine.

## Local Development

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Visit `http://localhost:3000` and:
- Start a presenter session from the main page
- Open the audience view (QR code or URL)
- Speak into the mic and watch slides appear in the exploratory channel
- Upload a PDF or images (and, in dev, PowerPoint/Keynote if conversion is available)
- Let audience members ask questions from the presentation view

## Scripts

- `npm run dev` – Start Next.js dev server
- `npm run build` – Build the app for production
- `npm start` – Run the production build
- `npm test` – Run unit tests with Vitest
- `npm run lint` – Run ESLint

## Architecture Overview

- `src/app` – Next.js app routes and API routes
  - `app/page.tsx` – Presenter entry point (splash + presenter view)
  - `app/presentation/[sessionId]` – Audience-facing presentation view
  - `app/api/*` – All back-end endpoints for Gemini, Deepgram, OpenAI, sessions, conversion, and extraction
- `src/components/presentation` – Presenter UI, slide canvas, and channel UI
- `src/hooks` – Realtime orchestration (`useRealtimeAPI`), slide channels, uploads, feedback, and audience questions
- `src/lib` – Session store and slide color helpers
- `src/utils` – Slide conversion, rate limiting, and other utilities
- `src/__tests__` – Vitest tests for utilities, hooks, and session behavior

Key behaviors:
- The presenter connects their mic; Deepgram streams transcripts into `useRealtimeAPI`.
- A “gate” model decides when to create slides and passes structured content to a Gemini image model.
- Exploratory, audience, and uploaded slide channels are rate-limited and merged into suggestions for the presenter.
- The audience joins via QR code/URL and can submit questions; feedback is streamed back to the presenter.

## Notes

- This project is optimized for local demos and small-scale use; API usage (Gemini, Deepgram, OpenAI) will incur costs on your accounts.
- Gemini grounding via Google Search is used selectively in several routes to improve factual accuracy.
