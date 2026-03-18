#!/usr/bin/env node
/**
 * Test the expiry worker: set all blobs' expiresAt to the past, then run the
 * same delete logic the worker runs. Use to verify expired blobs are removed.
 *
 * Run from server dir: node scripts/test-expiry-worker.mjs
 * Requires DATABASE_URL and prisma generate.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PAST = new Date(0); // 1970-01-01 UTC

async function main() {
  const before = await prisma.blob.count();
  if (before === 0) {
    console.log("No blobs in DB. Create some messages first, then run this script.");
    return;
  }

  await prisma.blob.updateMany({
    data: { expiresAt: PAST },
  });
  console.log("Set expiresAt to the past for", before, "blob(s).");

  const result = await prisma.blob.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  console.log("Worker delete run: deleted", result.count, "expired blob(s).");

  const after = await prisma.blob.count();
  console.log("Blobs remaining:", after);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
