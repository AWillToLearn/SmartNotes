# SmartNotes

Prototype web app implementing SmartNotes V1 workflows from `SmartNotes V.1.0.pdf`.

## Run
Open `index.html` in a browser.

## Implemented
- Home page with mission-aligned feature entry points
- Workspace with left source sidebar + right video panel
- Video URL/file loading, playback speed, screenshot-to-clipboard attempt
- Simulated AI processing with draggable key points into editable workspace
- Rich text editing tools (bold/italic/underline/list/alignment/table/font size)
- Autosave, manual save, version history, share-link generation, print-to-PDF export
- Textbook workspace with PDF import, chapter list scaffold, annotations, comments, draw-mode placeholder
- TTS using browser SpeechSynthesis with voice and rate controls
- Summary + quiz generation stubs from provided textbook text
- Garden XP/coins loop with purchasable decorations
- Local persistence via `localStorage`

## Still Backend-Dependent (WIP)
- Real AI transcription / OCR / key-point extraction / formula detection
- True live notes capture from lecture audio/video streams
- Real chapter extraction from textbook PDFs and page-linked annotations
- Multi-user auth, real private/public permissions, and hosted share URLs
- Strong PDF export pipeline and server-side versioning
