#!/usr/bin/env node
/**
 * Delete all chat data (encrypted blobs) from the database.
 * Run from server dir: node scripts/delete-all-chat-data.mjs
 * Requires DATABASE_URL and prisma generate.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.blob.deleteMany({});
  console.log("Deleted", result.count, "blob(s).");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
