# SmartNotes

Prototype web app implementing SmartNotes V1 workflows from `SmartNotes V.1.0.pdf`.

## Run
1. Copy `.env.example` to `.env`.
2. Set `GEMINI_API_KEY` and `DATABASE_URL` in `.env`.
3. Activate local Node runtime in this repo:
   - `powershell -ExecutionPolicy Bypass -File .\use-node.ps1`
4. Start server:
   - `corepack pnpm start`
4. Open:
   - `http://localhost:8787`

## Implemented
- Home page with mission-aligned feature entry points
- Workspace with left source sidebar + right video panel
- Video URL/file loading, playback speed, screenshot-to-clipboard attempt
- Gemini-backed video key-point analysis with local fallback if backend is unavailable
- Rich text editing tools (bold/italic/underline/list/alignment/table/font size)
- Autosave, manual save, version history, share-link generation, print-to-PDF export
- Textbook workspace with PDF import, chapter list scaffold, annotations, comments, draw-mode placeholder
- TTS using browser SpeechSynthesis with voice and rate controls
- Gemini-backed summary/quiz generation with local fallback
- Supabase Postgres persistence for workspace + textbook state through backend API
- Garden XP/coins loop with purchasable decorations
- Local persistence via `localStorage`

## Still Backend-Dependent (WIP)
- Full video binary upload analysis pipeline (current API analyzes source metadata text)
- Real AI transcription / OCR / formula detection
- True live notes capture from lecture audio/video streams
- Real chapter extraction from textbook PDFs and page-linked annotations
- Multi-user auth, real private/public permissions, and hosted share URLs
- Strong PDF export pipeline and server-side versioning
