/**
 * Settlement / tax computation — pure, deterministic, side-effect free.
 *
 * This is the calculation core of the billing engine (NEXT.md Feature 2). It is
 * intentionally decoupled from persistence and PDF rendering so it can be unit
 * tested with golden values. All money is in INR, rounded to 2 decimals (paise).
 *
 * NOTE: rates are configurable inputs, not hard-coded tax law. Defaults model a
 * common GTA + platform-commission scenario (freight GST 5%, TDS 194C 2%,
 * platform commission 5% + 18% GST on commission). This is a computation model,
 * not tax advice — the caller supplies the correct rates per org/regime.
 */

export type PlaceOfSupply = "intra" | "inter";

export interface SettlementInput {
  grossFreight: number; // taxable freight value
  placeOfSupply: PlaceOfSupply;
  gstRatePct?: number; // GST on freight (default 5)
  tdsRatePct?: number; // TDS u/s 194C, deducted from carrier (default 2)
  commissionRatePct?: number; // platform take as % of freight (default 5)
  commissionGstRatePct?: number; // GST on the commission (default 18)
}

export type SettlementLineKind =
  | "FREIGHT"
  | "GST_CGST"
  | "GST_SGST"
  | "GST_IGST"
  | "COMMISSION"
  | "COMMISSION_GST"
  | "TDS";

export interface SettlementLine {
  kind: SettlementLineKind;
  description: string;
  amount: number; // signed: charges positive, deductions negative
}

export interface Settlement {
  freight: number;
  gst: { ratePct: number; cgst: number; sgst: number; igst: number; total: number };
  commission: { ratePct: number; base: number; gst: number; total: number };
  tds: { ratePct: number; amount: number };
  /** What the shipper is invoiced (freight + GST on freight). */
  invoiceTotal: number;
  /** What the carrier nets after TDS + platform commission. */
  carrierNetPayout: number;
  lines: SettlementLine[];
}

/** Round to 2 decimal places (paise), avoiding binary float drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeSettlement(input: SettlementInput): Settlement {
  const freight = round2(input.grossFreight);
  const gstRatePct = input.gstRatePct ?? 5;
  const tdsRatePct = input.tdsRatePct ?? 2;
  const commissionRatePct = input.commissionRatePct ?? 5;
  const commissionGstRatePct = input.commissionGstRatePct ?? 18;

  if (freight < 0) throw new Error("grossFreight must be >= 0");

  const gstTotal = round2((freight * gstRatePct) / 100);
  const isIntra = input.placeOfSupply === "intra";
  const cgst = isIntra ? round2(gstTotal / 2) : 0;
  const sgst = isIntra ? round2(gstTotal - cgst) : 0; // absorb rounding remainder
  const igst = isIntra ? 0 : gstTotal;

  const commissionBase = round2((freight * commissionRatePct) / 100);
  const commissionGst = round2((commissionBase * commissionGstRatePct) / 100);
  const commissionTotal = round2(commissionBase + commissionGst);

  const tds = round2((freight * tdsRatePct) / 100);

  const invoiceTotal = round2(freight + gstTotal);
  const carrierNetPayout = round2(freight - tds - commissionTotal);

  const lines: SettlementLine[] = [
    { kind: "FREIGHT", description: "Freight charges", amount: freight },
  ];
  if (isIntra) {
    lines.push({ kind: "GST_CGST", description: `CGST @ ${gstRatePct / 2}%`, amount: cgst });
    lines.push({ kind: "GST_SGST", description: `SGST @ ${gstRatePct / 2}%`, amount: sgst });
  } else {
    lines.push({ kind: "GST_IGST", description: `IGST @ ${gstRatePct}%`, amount: igst });
  }
  lines.push({ kind: "COMMISSION", description: `Platform commission @ ${commissionRatePct}%`, amount: -commissionBase });
  lines.push({ kind: "COMMISSION_GST", description: `GST on commission @ ${commissionGstRatePct}%`, amount: -commissionGst });
  lines.push({ kind: "TDS", description: `TDS u/s 194C @ ${tdsRatePct}%`, amount: -tds });

  return {
    freight,
    gst: { ratePct: gstRatePct, cgst, sgst, igst, total: gstTotal },
    commission: { ratePct: commissionRatePct, base: commissionBase, gst: commissionGst, total: commissionTotal },
    tds: { ratePct: tdsRatePct, amount: tds },
    invoiceTotal,
    carrierNetPayout,
    lines,
  };
}

/** Indian financial year label (Apr–Mar) for a date, e.g. 2026 → "2026-27". */
export function financialYear(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0=Jan
  const startYear = m >= 3 ? y : y - 1; // FY starts in April (month index 3)
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}
