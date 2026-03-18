# Relay

The app is intended to be **run locally** on your machine. You need a **relay server** (see the repo root README) and an **identity file** (`identity.bin`) in `public/identity/` to use it.

## Requirements

- **Node.js** (v18 or later; v20+ recommended)
- **npm** (comes with Node.js)

## Install and run

1. Copy `.env.local.example` to `.env.local` and set `NEXT_PUBLIC_API_URL` to your relay server (e.g. `http://YOUR_SERVER_IP:4000`). Set the three **TURN** variables for reliable voice/video (see root README §2); Relay will bundle TURN in the future—until then use coturn.
2. Put your **identity file** (`identity.bin`) in `public/identity/`. (You receive this from whoever runs the server; it is not created in the app.)
3. Install and start:

```bash
npm i
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Customizing the UI

You can change the look and layout of the app by editing specific files. **Only edit the files listed below**; changing core data or crypto code can break the app or your identity.

### Files that are OK to change

- **`src/app/page.tsx`** — Main chat view (sidebar, messages, modals). Safe to change layout, labels, and how things are displayed.
- **`src/app/layout.tsx`** — Root layout and metadata.
- **`src/app/globals.css`** — Global styles and CSS variables (`--bg`, `--text`, `--accent`, `--surface`, `--border`, `--muted`). Change these to adjust colors and theme.
- **New or edited components under `src/app/`** (or a `src/components/` folder) — As long as they use `useIdentity()` and `useMessages(identity)` for data and don’t change how identity or blobs work.

Use the same hooks and context for data; only change how the UI looks and behaves.

### Files you should NOT change

- **`src/lib/identityBinary.ts`**, **`src/lib/crypto.ts`**, **`src/lib/e2ee.ts`** — Identity format and encryption.
- **`src/lib/blobPayload.ts`**, **`src/lib/blobChunk.ts`**, **`src/lib/api.ts`** — Blobs and server API.
- **`src/context/IdentityContext.tsx`**, **`src/lib/useMessages.ts`** — Data loading and identity state.

Changing these can break compatibility with the server or corrupt your identity.
