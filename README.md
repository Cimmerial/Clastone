# Clastone

UI-first build with mocked data, running locally on port **6001**.

## Run locally (recommended)

1. Install dependencies:

```bash
npm install
```

2. Start the UI dev server (port 6001):

```bash
npm run dev:ui
```

Open `http://localhost:6001`.

## One-command launcher (starts server + opens Arc)

```bash
python3 run_clastone.py
```

This starts `npm run dev:ui`, waits for `http://localhost:6001` to respond, then opens it in **Arc**.

## Setup docs

- `SETUP_FIREBASE.md`
- `SETUP_VERCEL.md`

