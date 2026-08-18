import { NextRequest } from "next/server";

/** FE-H2 fix: previously duplicated 29 times across route handlers. */
export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
