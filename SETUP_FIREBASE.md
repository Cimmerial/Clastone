# Firebase setup (Clastone)

This app will use:
- **Firebase Auth** (accounts)
- **Firestore** (lists + cached TMDb data)

## 1. Create Firebase project

1. In Firebase console, create a new project (e.g. `clastone`).
2. Add a **Web app** to the project (this gives you the config values).

## 2. Firestore

1. Create a Firestore database.
2. Start in **test mode** for early UI integration, then switch to locked rules.

### Suggested initial collections (v1)

- `users/{userId}`
  - `username`
  - `passwordActorIds: string[]` (4 TMDb person IDs)
- `users/{userId}/lists/{listId}`
  - `type: "movies" | "tv" | "actors" | "directors"`
  - `classes: { key: string, label: string }[]`
- `users/{userId}/lists/{listId}/entries/{entryId}`
  - For movies/tv:
    - `tmdbId`, `title`, `posterPath`, `classKey`, `absoluteRank`, `rankInClass`, `percentileRank`, `numberRanking`
    - `viewingDates: { start: string, end: string }[]`
    - `stickerTags: string[]`, `percentCompleted: number`
  - For people:
    - `tmdbId`, `name`, `profilePath`, `classKey`, `absoluteRank`, `rankInClass`

## 3. Auth

Enable at least one provider to start (email/password is simplest) so we can stand up a basic account system before the headshot grid.

Later we’ll implement the headshot-grid login flow on top of Firebase Auth + Firestore-stored `passwordActorIds`.

## 4. Local environment variables

We’ll store Firebase web config in a local env file:

- Create `.env.local` (do not commit it)
- Add:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## 5. Firestore security rules (starter)

When ready to lock down, a safe starting point is:

- Users can only read/write their own subtree `users/{userId}/...`.
- Deny everything else.

We’ll put concrete rules into a `firestore.rules` file once the app code exists.
