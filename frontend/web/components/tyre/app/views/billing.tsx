"use client";

/**
 * Billing — invoice list over the settlement engine (GST/TDS/commission) and
 * a Generate-invoice action for completed trips. Real API: /api/v1/invoices*
 * (RBAC billing:manage — fleet_manager/operator/admin).
 */
import { useMemo, useState } from "react";
import { useInvoices, type Invoice } from "@/lib/api/queries/invoices";
import { GenerateInvoiceDialog } from "./billing/generate-invoice-dialog";
import { SceneLoader } from "../loading/scene-loader";
import { Plus, Search, Receipt } from "lucide-react";

function formatINR(n: number): string {
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN")}`;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#F3F4F6", text: "#6B7280" },
  ISSUED: { bg: "#ECFDF5", text: "#10B981" },
  CANCELLED: { bg: "#FEF2F2", text: "#EF4444" },
};

type StatusFilter = "ALL" | "DRAFT" | "ISSUED" | "CANCELLED";
const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "ALL", label: "All Invoices" },
  { id: "ISSUED", label: "Issued" },
  { id: "DRAFT", label: "Draft" },
  { id: "CANCELLED", label: "Cancelled" },
];

export function BillingView() {
  const { data, isLoading } = useInvoices();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [generateOpen, setGenerateOpen] = useState(false);

  const all = data ?? [];
  const invoices = all.filter((i) => {
    const okStatus = filter === "ALL" || i.status === filter;
    const okSearch = !search || `${i.invoice_no} ${i.load_code ?? ""}`.toLowerCase().includes(search.toLowerCase());
    return okStatus && okSearch;
  });

  const totals = useMemo(() => {
    const issued = all.filter((i) => i.status === "ISSUED");
    return {
      count: all.length,
      totalBilled: issued.reduce((s, i) => s + i.invoice_total, 0),
      totalGst: issued.reduce((s, i) => s + i.gst_total, 0),
      totalPayout: issued.reduce((s, i) => s + i.carrier_net_payout, 0),
    };
  }, [all]);

  const cards: { label: string; value: string; bg: string }[] = [
    { label: "Total Invoices", value: String(totals.count), bg: "#10B981" },
    { label: "Total Billed", value: formatINR(totals.totalBilled), bg: "#3B82F6" },
    { label: "GST Collected", value: formatINR(totals.totalGst), bg: "#F59E0B" },
    { label: "Carrier Payouts", value: formatINR(totals.totalPayout), bg: "#8B5CF6" },
  ];

  return (
    <div className="p-5 sm:p-6 max-w-[1600px] mx-auto">
      <GenerateInvoiceDialog open={generateOpen} onOpenChange={setGenerateOpen} />

      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#1F2937]">Billing</h1>
          <p className="text-[12.5px] text-[#6B7280] mt-0.5">Invoices, GST/TDS breakdown, and carrier settlements</p>
        </div>
        <button
          onClick={() => setGenerateOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-[12.5px] font-semibold transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Generate invoice
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg p-3 text-white" style={{ background: c.bg }}>
            <div className="text-[18px] font-extrabold leading-tight truncate">{c.value}</div>
            <div className="text-[10.5px] text-white/85 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5 p-3 rounded-xl border border-black/[0.06] bg-white">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[11.5px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#F97316]/40 ${filter === f.id ? "border-[#1F2937] bg-[#1F2937] text-white" : "border-black/[0.08] text-[#374151] hover:bg-[#F8FAFC]"}`}
          >
            {f.label}
          </button>
        ))}
        <div className="flex-1 min-w-[180px] relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice or load…"
            aria-label="Search invoices"
            className="w-full h-8 pl-8 pr-3 rounded-md bg-[#F3F4F6] text-[12px] focus:outline-none focus:ring-1 focus:ring-[#F97316]/30"
          />
        </div>
      </div>

      {isLoading ? (
        <SceneLoader scene="fleet" compact />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[0.06] bg-white">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#9CA3AF] bg-[#FAFBFC]">
                <th className="px-4 py-3 font-semibold">Invoice</th>
                <th className="px-4 py-3 font-semibold">Load</th>
                <th className="px-4 py-3 font-semibold">Supply</th>
                <th className="px-4 py-3 font-semibold text-right">Freight</th>
                <th className="px-4 py-3 font-semibold text-right">GST</th>
                <th className="px-4 py-3 font-semibold text-right">TDS</th>
                <th className="px-4 py-3 font-semibold text-right">Invoice Total</th>
                <th className="px-4 py-3 font-semibold text-right">Carrier Payout</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv: Invoice) => {
                const sc = STATUS_COLORS[inv.status] ?? STATUS_COLORS.DRAFT!;
                return (
                  <tr key={inv.id} className="border-t border-black/[0.04] hover:bg-[#FAFBFC]">
                    <td className="px-4 py-3 font-mono font-semibold text-[#1F2937]">{inv.invoice_no}</td>
                    <td className="px-4 py-3 text-[#374151]">{inv.load_code ?? "-"}</td>
                    <td className="px-4 py-3 text-[#6B7280] uppercase">{inv.place_of_supply}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#1F2937]">{formatINR(inv.gross_freight)}</td>
                    <td className="px-4 py-3 text-right text-[#374151]">{formatINR(inv.gst_total)}</td>
                    <td className="px-4 py-3 text-right text-[#374151]">{formatINR(inv.tds_total)}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#1F2937]">{formatINR(inv.invoice_total)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#10B981]">{formatINR(inv.carrier_net_payout)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold" style={{ backgroundColor: sc.bg, color: sc.text }}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {invoices.length === 0 && (
            <div className="py-16 text-center text-[#6B7280]">
              <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
              {all.length === 0 ? (
                <div>
                  <div className="font-semibold text-[#1F2937]">No invoices yet</div>
                  <div className="text-[12px] mt-1">Generate one from a completed trip to see GST/TDS/commission settlement.</div>
                </div>
              ) : (
                <div>No invoices match your search or filter.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
