#!/usr/bin/env node
/**
 * One-time script: generate 20 identity binaries, each with the other 19 as contacts.
 * Output: identities/identity-01.bin ... identity-20.bin and allowed-keys-seed.json (repo root).
 * Run from repo root: node scripts/generate-20-identities.mjs
 * Requires Node 19+ (Web Crypto API).
 */

import { writeFileSync, mkdirSync } from "fs";
import { createHash } from "crypto";
import { webcrypto } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const outDir = join(rootDir, "identities");
const VERSION = 4;
const COUNT = 20;

const subtle = webcrypto.subtle;
const namedCurve = "P-256";

function u16be(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n, 0);
  return b;
}
function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

async function generateKeyPair() {
  return subtle.generateKey(
    { name: "ECDH", namedCurve },
    true,
    ["deriveBits", "deriveKey"]
  );
}

async function exportPublicRaw(key) {
  const raw = await subtle.exportKey("raw", key);
  return Buffer.from(raw).toString("base64");
}

async function exportPrivateJwk(key) {
  return subtle.exportKey("jwk", key);
}

function sha256Hex(data) {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
  return createHash("sha256").update(buf).digest("hex");
}

function writeIdentityBinary(me, contacts, myUserNumber) {
  const keyHashBytes = Buffer.from(me.keyHash, "utf8");
  const pubKeyBytes = Buffer.from(me.publicKeyBase64, "base64");
  const privKeyJson = JSON.stringify(me.privateKeyJwk);
  const privKeyBytes = Buffer.from(privKeyJson, "utf8");

  const chunks = [
    Buffer.from([VERSION]),
    u16be(keyHashBytes.length),
    keyHashBytes,
    u16be(pubKeyBytes.length),
    pubKeyBytes,
    u32be(privKeyBytes.length),
    privKeyBytes,
    u16be(contacts.length),
  ];

  for (const c of contacts) {
    const cKeyHashBytes = Buffer.from(c.keyHash, "utf8");
    const cPubBytes = Buffer.from(c.publicKey, "base64");
    const displayName = c.displayName ?? "User 00";
    const dnBytes = Buffer.from(displayName, "utf8");
    const volume = Math.min(100, Math.max(0, c.volume ?? 100));
    chunks.push(u16be(cKeyHashBytes.length), cKeyHashBytes, u16be(cPubBytes.length), cPubBytes, u16be(dnBytes.length), dnBytes, u16be(volume));
  }

  if (VERSION >= 3 && myUserNumber >= 1 && myUserNumber <= 20) {
    chunks.push(u16be(myUserNumber));
  }
  return Buffer.concat(chunks);
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const people = [];
  for (let i = 0; i < COUNT; i++) {
    const keyPair = await generateKeyPair();
    const publicKeyBase64 = await exportPublicRaw(keyPair.publicKey);
    const keyHash = sha256Hex(publicKeyBase64);
    const privateKeyJwk = await exportPrivateJwk(keyPair.privateKey);
    people.push({
      keyHash,
      publicKeyBase64,
      privateKeyJwk,
    });
  }

  const allowedKeyHashes = people.map((p) => p.keyHash);

  for (let i = 0; i < COUNT; i++) {
    const me = people[i];
    const contacts = people
      .filter((_, j) => j !== i)
      .map((p, k) => {
        const personIndex = k < i ? k : k + 1;
        const displayName = `User ${String(personIndex + 1).padStart(2, "0")}`;
        return { keyHash: p.keyHash, publicKey: p.publicKeyBase64, displayName, volume: 100 };
      });

    const bin = writeIdentityBinary(me, contacts, i + 1);
    const filename = `identity-${String(i + 1).padStart(2, "0")}.bin`;
    const path = join(outDir, filename);
    writeFileSync(path, bin);
    console.log("Wrote", path);
  }

  const seedPath = join(rootDir, "allowed-keys-seed.json");
  writeFileSync(seedPath, JSON.stringify(allowedKeyHashes, null, 2), "utf8");
  console.log("Wrote", seedPath);

  console.log("");
  console.log("Next: seed the server: npm run seed");
  console.log("Then give each user their identity file (identities/identity-NN.bin) and they put it in their app's public/identity/identity.bin.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
