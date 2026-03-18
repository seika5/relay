/**
 * Background worker: delete blobs where expiresAt < NOW().
 * Run via: npm run worker (or cron)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const INTERVAL_MS = 60 * 1000;

async function run() {
  const result = await prisma.blob.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  if (result.count > 0) {
    console.log(`Deleted ${result.count} expired blob(s)`);
  }
}

async function loop() {
  try {
    await run();
  } catch (e) {
    console.error("Worker error:", e);
  }
  setTimeout(loop, INTERVAL_MS);
}

loop();
