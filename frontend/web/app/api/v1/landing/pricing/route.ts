/**
 * GET /api/v1/landing/pricing — plans for the landing pricing section.
 *
 * Server-owned so prices/features can change (or be region- or A/B-varied)
 * without a client redeploy. Static today; needs no datastore, so it's safe in
 * standalone dev. (Distinct from /api/v1/pricing, which is the AI freight-rate
 * agent.)
 */
import { NextResponse } from "next/server";

export const revalidate = 3600;

export type Plan = {
  name: string;
  price: string;
  period?: string;
  sub: string;
  cta: string;
  highlight: boolean;
  features: string[];
};

const PLANS: Plan[] = [
  {
    name: "Driver",
    price: "Free",
    sub: "Forever — for every driver on the corridor",
    cta: "Open the driver app",
    highlight: false,
    features: [
      "Unlimited voice load search",
      "UPI escrow + ₹10K advance",
      "FASTag wallet integration",
      "Voice onboarding in 2 minutes",
      "WhatsApp voice bot access",
      "Last-mile voice navigation",
    ],
  },
  {
    name: "Broker",
    price: "₹2,000",
    period: "/mo",
    sub: "Per broker seat. Cancel anytime.",
    cta: "Start 30-day trial",
    highlight: true,
    features: [
      "Unlimited load postings",
      "GSTIN-verified broker badge",
      "Live dispatch board for 50 loads",
      "Trust score dashboard",
      "Automated e-way bill generation",
      "Priority fraud-check queue",
      "API access (1K calls/day)",
    ],
  },
  {
    name: "Shipper",
    price: "₹1,000",
    period: "/mo",
    sub: "Per shipper seat. Live in H2 2026.",
    cta: "Join waitlist",
    highlight: false,
    features: [
      "RFP & contract load posting",
      "Dedicated fleet allocation",
      "Multi-stop optimization (Y2)",
      "POD & invoice automation",
      "Lane analytics dashboard",
      "Dedicated account manager",
    ],
  },
];

export async function GET() {
  return NextResponse.json(
    { plans: PLANS, currency: "INR", updatedAt: "2026-06" },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
