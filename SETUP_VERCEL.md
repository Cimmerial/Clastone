# Vercel setup (Clastone)

Clastone is a Vite SPA, which deploys cleanly on Vercel.

## 1. Create a Vercel project

1. Push this repo to GitHub (if not already).
2. In Vercel, **New Project** → import the repo.

## 2. Build settings

- **Framework preset**: Vite
- **Build command**: `npm run build`
- **Output directory**: `dist`

## 3. SPA routing (important)

Because this is a single-page app using `react-router-dom`, Vercel needs to rewrite all routes to `index.html`.

Create `vercel.json` in the repo root:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

## 4. Environment variables

When we add Firebase/TMDb, put secrets into Vercel Project Settings → Environment Variables (and keep `.env.local` uncommitted).

- Firebase: `VITE_FIREBASE_*`
- TMDb: `VITE_TMDB_API_KEY`

## 5. Deploy

After import, Vercel will deploy automatically on every push to your chosen branch (usually `main`).

