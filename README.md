# Modellr

Turn a raw cloth / garment photo into a model photoshoot image.

## Run

```bash
cd /Users/manojwadhwani/IdeaProjects/Modellr
npm install
```

1. Copy `.env.example` to `.env`
2. Add your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
3. Start the app:

```bash
npm run dev
```

Open the Local URL (usually `http://localhost:5173`).

## How to use

1. **Cloth photo** — upload a front-facing garment / mannequin shot  
2. **Background** — pick a scene from `public/Background`  
3. **Generate** — create a model wearing that garment in the selected scene  
4. **Download** the result

## Backgrounds

Put JPG backgrounds in:

`public/Background/`

Then update `public/Background/manifest.json` (or regenerate it) so they appear in the UI.

## Scripts

```bash
npm run dev      # start local dev server (includes /api/generate)
npm run build    # production build
npm run preview  # preview production build
npm run lint     # run oxlint
```

## Note

Image generation uses the Gemini API (`gemini-2.5-flash-image`) via `/api/generate` in the Vite dev server. Keep `GEMINI_API_KEY` in `.env` only — never commit it.
