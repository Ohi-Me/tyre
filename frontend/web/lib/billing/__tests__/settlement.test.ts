import { describe, it, expect } from "vitest";
import { computeSettlement, round2, financialYear } from "../settlement";

describe("computeSettlement", () => {
  it("intra-state: splits GST into CGST+SGST and nets carrier payout (golden values)", () => {
    const s = computeSettlement({ grossFreight: 32000, placeOfSupply: "intra" });
    // GST 5% of 32000 = 1600 → 800 + 800
    expect(s.gst.total).toBe(1600);
    expect(s.gst.cgst).toBe(800);
    expect(s.gst.sgst).toBe(800);
    expect(s.gst.igst).toBe(0);
    // Commission 5% = 1600, +18% GST = 288 → 1888
    expect(s.commission.base).toBe(1600);
    expect(s.commission.gst).toBe(288);
    expect(s.commission.total).toBe(1888);
    // TDS 2% = 640
    expect(s.tds.amount).toBe(640);
    // Shipper invoice = 32000 + 1600 = 33600
    expect(s.invoiceTotal).toBe(33600);
    // Carrier net = 32000 - 640 - 1888 = 29472
    expect(s.carrierNetPayout).toBe(29472);
  });

  it("inter-state: uses IGST, no CGST/SGST", () => {
    const s = computeSettlement({ grossFreight: 32000, placeOfSupply: "inter" });
    expect(s.gst.igst).toBe(1600);
    expect(s.gst.cgst).toBe(0);
    expect(s.gst.sgst).toBe(0);
    expect(s.invoiceTotal).toBe(33600);
  });

  it("custom rates flow through", () => {
    const s = computeSettlement({
      grossFreight: 10000,
      placeOfSupply: "inter",
      gstRatePct: 12,
      tdsRatePct: 1,
      commissionRatePct: 8,
      commissionGstRatePct: 18,
    });
    expect(s.gst.total).toBe(1200);
    expect(s.tds.amount).toBe(100);
    expect(s.commission.base).toBe(800);
    expect(s.commission.gst).toBe(144);
    expect(s.carrierNetPayout).toBe(round2(10000 - 100 - 944));
  });

  it("lines reconcile to the summary", () => {
    const s = computeSettlement({ grossFreight: 25000, placeOfSupply: "intra" });
    const charges = s.lines.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
    expect(round2(charges)).toBe(s.invoiceTotal);
    const deductions = s.lines.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
    expect(round2(s.freight + deductions)).toBe(s.carrierNetPayout);
  });

  it("rejects negative freight", () => {
    expect(() => computeSettlement({ grossFreight: -1, placeOfSupply: "intra" })).toThrow();
  });
});

describe("financialYear", () => {
  it("April onwards belongs to the new FY", () => {
    expect(financialYear(new Date("2026-04-01T00:00:00Z"))).toBe("2026-27");
    expect(financialYear(new Date("2026-12-31T00:00:00Z"))).toBe("2026-27");
  });
  it("Jan–Mar belongs to the previous FY", () => {
    expect(financialYear(new Date("2026-03-31T00:00:00Z"))).toBe("2025-26");
  });
});
