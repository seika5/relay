import { Router } from "express";

/**
 * Keys: check if a key hash is allowed (e.g. for UI). No PII.
 */
export function keysRouter(prisma) {
  const router = Router();

  router.get("/allowed", async (req, res) => {
    const keyHash = req.query.keyHash;
    if (!keyHash) {
      return res.status(400).json({ error: "keyHash required" });
    }
    const exists = await prisma.allowedKey.findUnique({
      where: { keyHash },
      select: { id: true },
    });
    return res.json({ allowed: !!exists });
  });

  return router;
}
