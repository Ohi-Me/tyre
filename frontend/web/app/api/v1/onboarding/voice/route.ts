import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/onboarding/voice — Phase 0 fix.
 *
 * `docs/ARCHITECTURE.md` §8: "Voice onboarding — STUB — Extracts entities from speech
 * (real) but doesn't persist a VoiceOnboarding row." `app/ai/onboarding/voice_onboarding.py`'s
 * entity extraction (STT + LLM/regex extraction) was already real; only the persistence
 * step was a comment (`# Real impl: db.voiceOnboarding.create`). This route is that
 * persistence, called via `app/clients/bff_client.persist_voice_onboarding()`.
 *
 * Upserts on `driverPhone` (unique) so a driver who onboards twice (e.g. retries after a
 * dropped call) updates the same row rather than creating duplicates.
 */
export async function POST(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const {
      driver_name, driver_phone, driver_locale, truck_number, truck_type,
      truck_capacity_tons, voice_sample_url, stt_provider, detected_locale,
      onboarding_duration_sec,
    } = body;

    if (!driver_phone) {
      return NextResponse.json({ success: false, error: "driver_phone required" }, { status: 400 });
    }

    const record = await db.voiceOnboarding.upsert({
      where: { driverPhone: driver_phone },
      create: {
        driverName: driver_name || "Unknown",
        driverPhone: driver_phone,
        driverLocale: driver_locale || "hi",
        truckNumber: truck_number || null,
        truckType: truck_type || null,
        truckCapacity: truck_capacity_tons ?? null,
        voiceSampleUrl: voice_sample_url || null,
        sttProvider: stt_provider || null,
        detectedLocale: detected_locale || null,
        onboardingDurationSec: onboarding_duration_sec ?? null,
        status: "AWAITING_KYC",
      },
      update: {
        driverName: driver_name || undefined,
        driverLocale: driver_locale || undefined,
        truckNumber: truck_number || undefined,
        truckType: truck_type || undefined,
        truckCapacity: truck_capacity_tons ?? undefined,
        voiceSampleUrl: voice_sample_url || undefined,
        sttProvider: stt_provider || undefined,
        detectedLocale: detected_locale || undefined,
        onboardingDurationSec: onboarding_duration_sec ?? undefined,
      },
    });

    return NextResponse.json({
      success: true,
      data: { onboarding_id: record.id, status: record.status, created_at: record.createdAt },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[onboarding/voice]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
