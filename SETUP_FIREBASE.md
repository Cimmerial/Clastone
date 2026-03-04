# Firebase setup (Clastone)

This app uses **Firebase Auth** (admin login) and **Firestore** (persisting your movies list).

## 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** (or use an existing one). Name it e.g. `clastone`.
3. Finish the wizard (Google Analytics optional).

## 2. Register the web app

1. In the project overview, click the **Web** icon (`</>`) to add a web app.
2. Choose a nickname (e.g. `Clastone Web`) and leave “Firebase Hosting” unchecked for now.
3. Click **Register app**. Copy the `firebaseConfig` object (you’ll need it for step 4).

## 3. Enable Authentication (Email/Password)

1. In the left sidebar, go to **Build → Authentication**.
2. Click **Get started**.
3. Open the **Sign-in method** tab.
4. Click **Email/Password**, enable it, and save.

## 4. Create the admin user (Cimmerial)

1. Still in **Authentication**, open the **Users** tab.
2. Click **Add user**.
3. Set:
   - **Email:** `cimmerial@clastone.local`
   - **Password:** any password **at least 6 characters** (e.g. `admin12` or something you’ll remember). You can change it later.
4. Click **Add user**.

## 5. Create Firestore database

1. In the left sidebar, go to **Build → Firestore Database**.
2. Click **Create database**.
3. Choose **Start in test mode** for development (you can lock down rules later).
4. Pick a region and enable.

## 6. Firestore security rules

Replace the default “test mode” rule (which expires and allows anyone to read/write) with rules that allow only the signed-in user to access their own data.

In **Firestore → Rules**, replace everything with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{path=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Then click **Publish**. Only authenticated users can read/write, and only under their own `users/{userId}/...` path (where the app stores movies).

**Per-profile storage:** All lists (movies, etc.) are stored under `users/{your-uid}/data/movies`. Each account has its own data; nothing is shared between users.

## 7. Local environment variables (detailed)

You **do not edit** `src/lib/firebase.ts`. That file already reads your config from environment variables. You only create or edit the **`.env`** file.

### Where is `.env`?

- **Path:** the **project root** — the same folder that contains `package.json` and `src/`.
- **Full path example:** `Clastone/.env` (so the file is next to `package.json`, not inside `src/`).
- **Do not commit** `.env`; it should be listed in `.gitignore`.

### Step-by-step

1. **Open the project root in your editor**  
   In Cursor/VS Code: File → Open Folder → choose the `Clastone` folder (the one that has `package.json` and `src/`). The root is that folder.

2. **Create or open `.env` in the project root**  
   - If `.env` already exists (e.g. for TMDB), open it.  
   - If it doesn’t exist: in the file tree, right‑click the root (e.g. “Clastone”) → New File → name it exactly `.env` (with the leading dot).

3. **Add the variables**  
   Put the following **variable names** in `.env`. Get the **values** from Firebase (see step 4). No quotes around values; no spaces around `=`.

   ```env
   # Firebase (values from Firebase Console → Project settings → Your apps)
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=

   # Same password you set for cimmerial@clastone.local in step 4 (min 6 characters)
   VITE_ADMIN_PASSWORD=
   ```

4. **Fill in the values**  
   - In [Firebase Console](https://console.firebase.google.com/) open your project.  
   - Click the gear icon → **Project settings**.  
   - Under **Your apps**, select your web app (or add one).  
   - In the `firebaseConfig` object, copy each value into the matching line in `.env`:

   | In Firebase config | In `.env` |
   |--------------------|-----------|
   | `apiKey: "AIza..."` | `VITE_FIREBASE_API_KEY=AIza...` |
   | `authDomain: "clastone.firebaseapp.com"` | `VITE_FIREBASE_AUTH_DOMAIN=clastone.firebaseapp.com` |
   | `projectId: "clastone"` | `VITE_FIREBASE_PROJECT_ID=clastone` |
   | `storageBucket: "..."` | `VITE_FIREBASE_STORAGE_BUCKET=...` |
   | `messagingSenderId: "459472111557"` | `VITE_FIREBASE_MESSAGING_SENDER_ID=459472111557` |
   | `appId: "1:459472111557:web:..."` | `VITE_FIREBASE_APP_ID=1:459472111557:web:...` |

   - For `VITE_ADMIN_PASSWORD`, use the **same password** you set for the user `cimmerial@clastone.local` in step 4 (at least 6 characters).

5. **Save the file**  
   Save `.env` in the project root. Do not put these values in `src/lib/firebase.ts` or any other code file.

6. **Restart the dev server**  
   Env vars are read when the server starts. Stop the current dev server (Ctrl+C), then run `npm run dev` or `python run_clastone.py` again.

After this, the app will use Firebase: you’ll see the login page, and Admin login will work.

## 8. Run the app

1. Restart the dev server so it picks up the new env vars: `npm run dev` or `python run_clastone.py`.
2. Open the app. You should see the **Login** page.
3. Click **Admin login**. You’re signed in as Cimmerial and your movies list will load/save from Firestore.

## Summary

| What              | Where / value |
|-------------------|----------------|
| Admin username    | **Cimmerial** (display; login uses email below) |
| Login email       | `cimmerial@clastone.local` |
| Password          | Whatever you set in Firebase (step 4) and in `VITE_ADMIN_PASSWORD` |
| Firestore path    | `users/{userId}/data/movies` (one doc per user with `byClass`) |

If Firebase env vars are **not** set, the app runs without login and without persistence (local state only).

---

**About the Firebase config:** The config object from Firebase Console (e.g. when you click “Config” in Project settings → Your apps) is exactly what you turn into `.env` entries. Map each field to the variable name above (e.g. `apiKey` → `VITE_FIREBASE_API_KEY`). Do **not** paste the real config or API key into the repo or this doc; keep them only in `.env`, which is gitignored.

## Troubleshooting: list doesn't save after reload

If you add movies (or change order) and they disappear after reload, check:

1. **Firestore database exists** — In Firebase Console → **Build → Firestore Database**, the database must be created (step 5). Auth and Firestore are separate; both must be set up.
2. **Security rules are published** — In **Firestore → Rules**, use the rules from step 6 and click **Publish**. If the default "test mode" rule has expired, reads/writes are denied.
3. **Browser console** — Open DevTools (F12) → Console. After adding a movie, look for Firestore errors (e.g. "Missing or insufficient permissions").
4. **Wait a moment before reloading** — Saves are debounced (~400 ms). Wait a second after adding a movie, then reload.

Data is stored **per account** at `users/{your-uid}/data/movies`.