#!/usr/bin/env node
/**
 * Seed allowed keys from allowed-keys-seed.json: upsert each key hash, then delete
 * any AllowedKey not in the seed file so the allowlist is exactly the seed.
 * Run from server dir: node scripts/seed-allowed-keys.mjs
 * Requires DATABASE_URL and prisma generate to have been run.
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
  const raw = readFileSync(seedPath, "utf8");
  const keyHashes = JSON.parse(raw);
  if (!Array.isArray(keyHashes) || keyHashes.length === 0) {
    throw new Error("allowed-keys-seed.json must be a non-empty array of key hashes");
  }

  for (const keyHash of keyHashes) {
    if (typeof keyHash !== "string" || !keyHash) {
      throw new Error("Each entry in allowed-keys-seed.json must be a non-empty string");
    }
  }

  const seedSet = new Set(keyHashes);
  for (const keyHash of keyHashes) {
    await prisma.allowedKey.upsert({
      where: { keyHash },
      create: { keyHash },
      update: {},
    });
  }

  const deleted = await prisma.allowedKey.deleteMany({
    where: { keyHash: { notIn: [...seedSet] } },
  });

  console.log("Seeded", keyHashes.length, "allowed key(s). Removed", deleted.count, "old key(s) not in seed.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
