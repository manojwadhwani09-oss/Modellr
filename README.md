# Modellr

Cloth → model photoshoot app.

**Architecture (deployable):**
- Frontend: Vite + React
- API: Express (`/api/generate`) calling OpenAI Images (`gpt-image-1`)

## Setup

```bash
cd /Users/manojwadhwani/IdeaProjects/Modellr
npm install
cp .env.example .env
```

Add your key to `.env`:

```bash
OPENAI_API_KEY=sk-...
```

Get a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys) (billing required).

## Local development

```bash
npm run dev
```

- Web: http://localhost:5173  
- API: http://localhost:3001  

Vite proxies `/api/*` to the API server.

## Production deploy

```bash
npm run build
npm start
```

This serves the built frontend and API from one process on `PORT` (default `3001`).

### Deploy on Render

1. Push this repo to GitHub (do **not** commit `.env`)
2. Go to [https://dashboard.render.com](https://dashboard.render.com) → **New** → **Web Service**
3. Connect the GitHub repo
4. Settings:
   - **Runtime:** Node
   - **Build Command:** `npm install --include=dev && npm run build`
   - **Start Command:** `npm start`
5. Environment variables:
   - `OPENAI_API_KEY` = your secret key (required)
   - Optional: `OPENAI_IMAGE_MODEL=gpt-image-1`
6. Create Web Service and wait for deploy

Or use the included `render.yaml`: **New** → **Blueprint** → select the repo.

Your app URL will look like `https://modellr.onrender.com`.

**Notes**
- Free Render instances sleep after idle; first request can be slow
- Keep the API key only in Render Environment (never in git)
- OpenAI image calls need billing enabled on your OpenAI account

Deploy on any Node host (Railway, Fly.io, VPS, etc.):

1. Set `OPENAI_API_KEY` in the host environment  
2. `npm install --include=dev`  
3. `npm run build`  
4. `npm start`

## How to use

1. Browse a cloth / garment photo (HEIC supported)  
2. Browse a background photo (not shown on the page)  
3. Generate with OpenAI  
4. Download the result
