"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/api/auth-fetch";

export interface InvoiceLine {
  kind: string;
  description: string;
  amount: number;
}

export interface Invoice {
  id: string;
  invoice_no: string;
  org_id: string;
  trip_id: string;
  load_code: string | null;
  place_of_supply: "intra" | "inter";
  currency: string;
  gross_freight: number;
  gst_total: number;
  commission_total: number;
  tds_total: number;
  invoice_total: number;
  carrier_net_payout: number;
  status: "DRAFT" | "ISSUED" | "CANCELLED";
  financial_year: string;
  pdf_url?: string | null;
  issued_at: string | null;
  created_at: string;
  lines?: InvoiceLine[];
}

export interface GenerateInvoiceInput {
  trip_id: string;
  place_of_supply?: "intra" | "inter";
  gst_rate_pct?: number;
  tds_rate_pct?: number;
  commission_rate_pct?: number;
}

const invoiceKeys = {
  all: ["invoices"] as const,
  list: (params: { status?: string; financial_year?: string }) => ["invoices", "list", params] as const,
  detail: (id: string) => ["invoices", "detail", id] as const,
};

/** Org-scoped invoice list (RBAC billing:manage). */
export function useInvoices(params?: { status?: string; financial_year?: string }) {
  return useQuery<Invoice[]>({
    queryKey: invoiceKeys.list(params ?? {}),
    queryFn: async () => {
      const search = new URLSearchParams();
      if (params?.status) search.set("status", params.status);
      if (params?.financial_year) search.set("financial_year", params.financial_year);
      const res = await authFetch(`/api/v1/invoices?${search.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch invoices: ${res.status}`);
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useInvoice(id: string | null) {
  return useQuery<Invoice>({
    queryKey: invoiceKeys.detail(id ?? ""),
    queryFn: async () => {
      const res = await authFetch(`/api/v1/invoices/${id}`);
      if (!res.ok) throw new Error(`Failed to fetch invoice: ${res.status}`);
      const json = await res.json();
      return json.data;
    },
    enabled: !!id,
  });
}

/**
 * Generate the invoice for a COMPLETED trip — idempotent per trip (the API
 * returns the existing invoice with `idempotent: true` if one already exists).
 */
export function useGenerateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerateInvoiceInput): Promise<Invoice> => {
      const res = await authFetch("/api/v1/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || `Generate failed: ${res.status}`);
      }
      return json.data as Invoice;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: invoiceKeys.all }),
  });
}
