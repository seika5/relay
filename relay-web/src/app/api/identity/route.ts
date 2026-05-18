import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

/** PUT /api/identity — body = raw identity binary. Writes to public/identity/identity.bin so it persists across reloads. */
export async function PUT(request: Request) {
  try {
    const body = await request.arrayBuffer();
    if (!body || body.byteLength === 0) {
      return NextResponse.json({ error: "Empty body" }, { status: 400 });
    }
    const dir = join(process.cwd(), "public", "identity");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, "identity.bin");
    await writeFile(filePath, new Uint8Array(body));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to write identity binary:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save identity" },
      { status: 500 }
    );
  }
}
