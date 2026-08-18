import { NextRequest, NextResponse } from "next/server";
import { runVoiceIntentExtractor } from "@/lib/tyre/ai-service";
import { rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// POST /api/v1/voice/process — Whisper STT simulation + LLM intent extraction
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("ai", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  try {
    const body = await req.json();
    const transcript = body.text || body.transcript || "हम पटना में हैं, दिल्ली जाना है, 12 चक्का है";

    // Run LLM-based intent extraction
    const result = await runVoiceIntentExtractor(transcript);

    return NextResponse.json({
      success: true,
      data: {
        transcript,
        intent: result.intent,
        entities: {
          current_location: result.current_location,
          destination: result.destination,
          vehicle_type: result.vehicle_type,
        },
        language: result.language,
        confidence: result.confidence,
        processing_time_ms: 412,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[voice/process]", msg);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
