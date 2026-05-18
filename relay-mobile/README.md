# relay-mobile

The Capacitor iOS wrapper for Relay. Wraps the Next.js static export from `relay-web/` in a WKWebView for sideloading on iPhone via [SideStore](https://sidestore.io/).

See the [root README section 3](../README.md#3-mobile-app-setup-ios-each-user) for the complete build and sideload walkthrough.

---

## Requirements

- macOS (Ventura 13+ recommended)
- Xcode 15+ with iOS 16.4+ SDK
- Node.js v18+
- Free Apple ID

---

## Quick steps

```bash
# 1. Install mobile deps (Capacitor CLI + iOS platform)
npm install

# 2. Build static web export + sync assets into Xcode project
npm run build

# 3. Open Xcode
npm run open
```

Then follow the signing, IPA export, and SideStore install steps in the [root README](../README.md#3-mobile-app-setup-ios-each-user).

---

## Scripts

| Script | What it does |
|--------|-------------|
| `npm run build` | Runs `relay-web`'s `build:mobile` then `npx cap sync ios` |
| `npm run sync` | `npx cap sync ios` only (re-sync web assets without full rebuild) |
| `npm run open` | Opens the Xcode workspace |

---

## Importing your identity on iPhone

**AirDrop (recommended):** AirDrop your `identity-NN.bin` to the device. iOS prompts "Open with Relay". Tap it. The app saves and reloads automatically.

**Files app:** Share the `.bin` file to Relay from the Files app.

---

## Updating the app

After editing `relay-web`:

```bash
npm run build   # re-export + sync
# Then rebuild the IPA in Xcode and reinstall via SideStore
```
