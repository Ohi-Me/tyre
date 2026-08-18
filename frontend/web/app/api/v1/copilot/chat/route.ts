import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import Groq from "groq-sdk";
import { rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


let groqClient: Groq | null = null;
function getClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === "your_groq_api_key_here") {
      throw new Error("GROQ_API_KEY is not set. Add it to your .env file.");
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

// POST /api/v1/copilot/chat — chat with the TYRE Copilot agent
// Context-aware: knows about current loads, trucks, negotiations, fleet state
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("ai", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  try {
    const { message, history = [] } = await req.json();
    if (!message) {
      return NextResponse.json(
        { success: false, error: "message required" },
        { status: 400 }
      );
    }

    // Fetch live context from DB to ground the LLM
    const [loads, trucks, negotiations, agents] = await Promise.all([
      db.load.count({ where: { status: "OPEN" } }),
      db.truck.count({ where: { status: "IN_TRANSIT" } }),
      db.negotiation.count(),
      db.agentLog.count(),
    ]);

    const todaysGmv = await db.load.aggregate({
      where: { status: { in: ["ASSIGNED", "IN_TRANSIT", "DELIVERED"] } },
      _sum: { aiSuggestedRate: true },
    });

    const context = `LIVE TYRE NETWORK STATE (as of ${new Date().toISOString()}):
- Open loads available: ${loads}
- Trucks currently in transit: ${trucks}
- Total negotiations completed: ${negotiations}
- Total AI agent events logged: ${agents}
- Today's GMV (assigned+in-transit+delivered): ₹${(
      todaysGmv._sum.aiSuggestedRate || 0
    ).toLocaleString("en-IN")}

You have access to 10 specialized agents: Dispatch, Pricing, Fraud, Negotiation, Compliance, Contract, Payment, Route, Copilot (you), Fleet.
The platform supports 7 languages: Hindi, Bhojpuri, Marathi, Tamil, Telugu, Bengali, Punjabi.
UPI escrow releases advance on load assignment and balance on GPS-verified POD.`;

    const systemPrompt = `You are TYRE Copilot — the AI assistant for India's trucking logistics platform.
You help dispatchers, brokers, shippers, and fleet managers with real-time insights about loads, trucks, pricing, fraud, and negotiations.

${context}

Guidelines:
- Be concise and actionable. 2-4 sentences max unless asked for detail.
- When asked about specific loads/trucks, reference realistic data from the live state above.
- When asked for rates, factor in: diesel ₹92/L, HXL mileage 3.5 km/L, toll ₹3.5/km.
- Sprinkle in Hindi phrases naturally when appropriate (भाई, ठीक है, etc.) — Indian trucking context.
- If asked to do something outside your scope (e.g., "block a broker"), tell the user which view to navigate to.
- You are NOT a generic assistant — you are TYRE Copilot. Stay in character.`;

    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      { role: "system", content: systemPrompt },
      ...history.slice(-6).map((h: any) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: message },
    ];

    const client = getClient();
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.5,
      max_tokens: 512,
    });

    const reply =
      completion.choices?.[0]?.message?.content ||
      "माफ़ करें, मैं समझ नहीं पाया।";

    // Log Copilot agent event
    await db.agentLog.create({
      data: {
        agentName: "Copilot",
        eventType: "CHAT",
        payload: JSON.stringify({
          userMsg: message.slice(0, 200),
          replyLen: reply.length,
        }),
        latencyMs: 800,
        success: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        reply,
        timestamp: new Date().toISOString(),
        context_used: {
          open_loads: loads,
          in_transit: trucks,
          total_negotiations: negotiations,
        },
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[copilot/chat]", msg);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
