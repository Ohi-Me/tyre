/**
 * GET /api/v1/languages — the language catalogue for the picker.
 *
 * Served from @tyre/i18n so the navbar/app share one source of truth and the
 * "live" set tracks the Y1 rollout config. Pure config — no datastore needed.
 */
import { NextResponse } from "next/server";
import { INDIAN_LOCALES, Y1_ACTIVE_LOCALE_CODES } from "@tyre/i18n";

export const revalidate = 3600;

export async function GET() {
  return NextResponse.json(
    {
      languages: INDIAN_LOCALES.map((l: any) => ({ code: l.code, name: l.name, native_name: l.native_name })),
      live: Y1_ACTIVE_LOCALE_CODES,
      total: INDIAN_LOCALES.length,
    },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
