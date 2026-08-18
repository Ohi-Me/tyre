import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { nanoid } from "nanoid";
import { rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";
import { requireActor, internalError } from "@/lib/freight/server";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// POST /api/v1/freight/upload — multipart photo upload for a listing.
// Stores under public/uploads/freight and returns the public URL.
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });
  const { response } = requireActor(req);
  if (response) return response;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }
    const ext = ALLOWED[file.type];
    if (!ext) {
      return NextResponse.json(
        { success: false, error: "Only JPEG, PNG or WebP images are allowed" },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "Image must be under 5 MB" },
        { status: 400 },
      );
    }

    const dir = path.join(process.cwd(), "public", "uploads", "freight");
    await mkdir(dir, { recursive: true });
    const name = `${nanoid(12)}${ext}`;
    await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

    return NextResponse.json({ success: true, data: { url: `/uploads/freight/${name}` } }, { status: 201 });
  } catch (e) {
    return internalError("freight:upload", e);
  }
}
