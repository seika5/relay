#!/usr/bin/env node
/**
 * Verify that allowed key hashes from allowed-keys-seed.json are present in the DB.
 * Run from server dir: node scripts/verify-allowed-keys.mjs
 * Use after seeding to confirm identities will be accepted.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, "..");
const seedPath = join(serverDir, "allowed-keys-seed.json");

const prisma = new PrismaClient();

async function main() {
  let keyHashes;
  try {
    const raw = readFileSync(seedPath, "utf8");
    keyHashes = JSON.parse(raw);
  } catch (e) {
    console.error("Could not read allowed-keys-seed.json:", e.message);
    console.error("Run from repo root: node scripts/generate-20-identities.mjs");
    console.error("That creates server/allowed-keys-seed.json.");
    process.exit(1);
  }

  if (!Array.isArray(keyHashes) || keyHashes.length === 0) {
    console.error("allowed-keys-seed.json must be a non-empty array. Re-run generate script.");
    process.exit(1);
  }

  const inDb = await prisma.allowedKey.findMany({
    where: { keyHash: { in: keyHashes } },
    select: { keyHash: true },
  });
  const inDbSet = new Set(inDb.map((r) => r.keyHash));
  const missing = keyHashes.filter((h) => !inDbSet.has(h));

  console.log("Seed file:", keyHashes.length, "key hash(es)");
  console.log("In database:", inDb.length, "allowed key(s)");
  if (missing.length > 0) {
    console.error("Missing in DB:", missing.length, "- run: node scripts/seed-allowed-keys.mjs");
    missing.slice(0, 3).forEach((h) => console.error("  -", h));
    if (missing.length > 3) console.error("  ... and", missing.length - 3, "more");
    process.exit(1);
  }
  console.log("OK: all seed key hashes are allowed on the server.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
