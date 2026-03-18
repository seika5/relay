# Relay

A **hyper-private, E2EE messaging and voice/video** system for a small, closed circle. The server is zero-knowledge (blind relay + temporary encrypted blobs only). No public signup; identities are generated once and **distributed in person** to minimize vulnerability (no keys or tokens over the network).

This repo has two parts:

- **`relay-app/`** — Next.js web app that users run **locally**. They put their identity file in the app and point it at your server.
- **`relay-server/`** — Node.js API + Socket.io + background worker. You deploy this (e.g. on a VPS) and run the identity generator once to create the fixed set of accounts.

**Running the web app locally is an intentional design choice** so users can customize the UI and add features without touching the server. If you prefer to host the web app yourself, you can make a few changes and have users “log in” by **drag-and-dropping their identity file** in the browser. **The identity file must always be processed in the browser (client-side)** so the private key never leaves the user’s device; do not send or store the identity on the server.

---

## Features

- **Fixed 20 accounts** — One-time script generates 20 identity binaries; server is seeded with those key hashes. Only those keys can use the server.
- **E2EE messaging** — Text and files sent as **uniform encrypted blobs** (fixed size, chunked when too large): the server only sees opaque 64 KB blobs, so it cannot infer message length, file size, or content type. AES-GCM encryption, per-recipient keys. No local message storage.
- **Voice/video** — Room-based WebRTC (Socket.io signaling). Mute, deafen, camera, screen share.
- **72hr blob expiry with timestamp obfuscation** — Blobs expire in a random window ~72 hours after the day they were sent; exact send time is not stored. The server cannot derive precise timestamps from expiry, and a worker deletes expired blobs.
- **Identity** — Binary file only. Out-of-band/in-person distribution is highly suggested for absolute security.
- **Customizable app** — UI and blob handling runs locally, so users can change the look and add their own features without touching the server or breaking compatibility.

---

## What’s not done yet (WIP)

These items come from an internal security review. They improve abuse resistance and metadata hardening; they do not change E2EE or decrypt blobs.

1. **Blob DELETE** — Require proof the caller may delete (e.g. HMAC or signed token for recipient + blob id).
2. **Blob POST** — Rate limit per recipient; consider proof-of-work or scoped tokens to reduce spam.
3. **`join_blob`** — Only emit refresh for clients that prove possession of the private key for that `keyHash` (e.g. challenge–response or short-lived token).
4. **Call `join_room`** — Bind room ACL to server-verified allowed keys, or merge ACL when members join (avoid first-joiner-wins room squatting).
5. **Signaling** — Optionally encrypt signal payloads for the recipient’s key to reduce ICE/metadata exposure at the relay.

**User-facing takeaway:** Message *content* is intended to stay opaque to the relay. *Metadata* (who mails whom, when, call participation, IPs from ICE) is visible to the relay. Best mitigation: keep identity off the public web, use a relay you trust, verify contact keys out-of-band.

---

## Repo layout

| Folder        | Purpose |
|---------------|--------|
| **`relay-app/`** | Next.js app run **locally** by each user. **Give users this folder + their identity file**. Put their `identity.bin` in `public/identity/` and set the server URL in env. |
| **`relay-server/`** | Backend for the host machine only. **Copy this folder to your cloud / VPS / server**, configure env, run API + worker + DB. Identity generator usually runs once on an operator machine, then you deploy with `allowed-keys-seed.json` after seeding. |

---

## Requirements

- **relay-app (users):** Node.js v18+ (v20+ recommended), npm.
- **relay-server (deployed):** Node.js v18+, npm, PostgreSQL. For the identity generator: Node 19+ (Web Crypto API).

---

## 1. Identity setup (one-time)

Done by whoever will operate the server. Generates the 20 identity files and the allowlist.

1. Go into **relay-server**:
   ```bash
   cd relay-server
   ```
2. Install deps and generate identities:
   ```bash
   npm i
   node scripts/generate-20-identities.mjs
   ```
   This creates:
   - `identities/identity-01.bin` … `identity-20.bin` (give one to each user)
   - `allowed-keys-seed.json` in the repo root (used to seed the DB)
3. Seed the database (after DB is set up and `DATABASE_URL` is in `.env`):
   ```bash
   npx prisma db push    # or migrate
   npm run seed
   ```
4. **Give each user their package:** send them the **relay-app** folder (same build for everyone) **and** their matching `identities/identity-NN.bin` (ideally out-of-band/in-person). They rename/copy it to `identity.bin` in `relay-app/public/identity/identity.bin`.

---

## 2. TURN server (required for calls)

Voice/video uses **WebRTC**. The relay API only does **signaling**; media is peer-to-peer or relayed through **TURN**. For calls to work reliably, especially across different networks or strict NATs, **TURN is effectively required**. The app ships with public **STUN** only, which is enough for some same, LAN setups but not a substitute for TURN in the general case.

**Today, Relay does not bundle a TURN server** (nothing TURN-related runs inside the Node relay). **I intend to bundle TURN with Relay in a future release** so deployment is simpler. **Until then, I recommend running coturn (free open source TURN)** yourself, usually on the same VPS as **relay-server**.

**Recommended setup (coturn) until bundled TURN ships:**

1. **Install coturn** on the host (e.g. Ubuntu: `apt install coturn`).
2. **Configure** `/etc/turnserver.conf` (paths may vary), for example:
   - `listening-port=3478`
   - A **static long-term credential** user, e.g. `user=relay_turn:YOUR_STRONG_PASSWORD` (or the equivalent `lt-cred-mech` + user line your distro documents).
   - Set **`min-port`** / **`max-port`** for relayed media (coturn needs a UDP/TCP range for relay traffic).
3. **Firewall:** allow **3478** (UDP and TCP as needed) **and** the configured **relay port range** on the same host’s public interface.
4. **relay-app:** In each user’s **`.env.local`**, set the three vars to match coturn (then restart dev or rebuild so Next picks them up):
   - `NEXT_PUBLIC_TURN_URL=turn:YOUR_SERVER_IP:3478`
   - `NEXT_PUBLIC_TURN_USERNAME=relay_turn`
   - `NEXT_PUBLIC_TURN_CREDENTIAL=YOUR_STRONG_PASSWORD`

---

## 3. Env files

### relay-app

- Copy **`.env.local.example`** to **`.env.local`** in `relay-app/`.
- Set:
  - **`NEXT_PUBLIC_API_URL`** — Your relay server URL (e.g. `http://YOUR_SERVER_IP:4000` or `https://api.example.com`).
  - **TURN** (required for reliable calls until Relay bundles TURN): `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, `NEXT_PUBLIC_TURN_CREDENTIAL` — point these at your coturn instance (see §2).

### relay-server

- Copy **`.env.example`** to **`.env`** in `relay-server/`.
- Set:
  - **`PORT`** — API port (default 4000).
  - **`DATABASE_URL`** — PostgreSQL connection string.
  - **`WEB_ORIGIN`** — Exact origin of the app (e.g. `http://localhost:3000` for local app, or `https://relay.example.com` if you ever host the app). Used for CORS.

---

## 4. Deploying the backend

On the machine that will host the relay server (cloud VM, VPS, e.g. a DigitalOcean droplet):

1. **Copy** **`relay-server/`** onto that machine (rsync, scp, git, etc.).
2. **Install** Node.js and PostgreSQL; create an empty database and a DB user.
3. **Configure env:** copy `.env.example` → `.env`, set `DATABASE_URL`, `PORT` (e.g. 4000), and `WEB_ORIGIN` (the origin users’ apps will use, e.g. `http://localhost:3000`).
4. **Install deps and schema:**
   ```bash
   cd relay-server
   npm i
   npx prisma db push
   ```
5. **Identity and seed:** follow **§1 Identity setup** to generate the 20 identities; run **`npm run seed`** so the DB has the allowed keys.
6. **Start the relay:**
   ```bash
   npm run start    # API + Socket.io
   npm run worker   # deletes expired blobs (run in a second terminal or via PM2)
   ```
7. **Firewall:** open the API port (e.g. 4000) and, if you use TURN, the TURN port(s).
8. **Users:** point **relay-app** at `http://YOUR_HOST:PORT` via `NEXT_PUBLIC_API_URL` in their `.env.local`.

---

## 5. Running the app locally (users)

Each user receives **relay-app** + **their identity binary** from you. See **`relay-app/README.md`**: copy and edit `.env.local.example` → `.env.local`, put `identity.bin` in `public/identity/`, then:
```bash
npm i && npm run dev
```

---

## Quick reference

| Task | Where | Command / action |
|------|--------|-------------------|
| Generate 20 identities | relay-server | `node scripts/generate-20-identities.mjs` |
| Seed allowed keys | relay-server | `npm run seed` |
| Run API | relay-server | `npm run start` |
| Run expiry worker | relay-server | `npm run worker` |
| Run app locally | relay-app | Copy `.env.local.example` → `.env.local`, add `identity.bin`, then `npm run dev` |
