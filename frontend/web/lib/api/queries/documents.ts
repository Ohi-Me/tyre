"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/api/auth-fetch";

export type DocType = "INSURANCE" | "RC" | "PERMIT" | "FITNESS" | "POLLUTION" | "LICENSE" | "OTHER";
export type DocStatus = "VALID" | "EXPIRING" | "EXPIRED" | "UNKNOWN";

export interface TyreDocument {
  id: string;
  org_id: string;
  truck_id: string | null;
  driver_id: string | null;
  type: DocType;
  doc_number: string | null;
  issuer: string | null;
  file_url: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  status: DocStatus;
  created_at: string;
  updated_at: string;
}

export interface DocumentSummary {
  valid: number;
  expiring: number;
  expired: number;
  unknown: number;
}

export interface CreateDocumentInput {
  type: DocType;
  truck_id?: string | null;
  driver_id?: string | null;
  doc_number?: string | null;
  issuer?: string | null;
  file_url?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  notes?: string;
}

const documentKeys = {
  all: ["documents"] as const,
  list: (params: Record<string, string | undefined>) => ["documents", "list", params] as const,
};

export function useDocuments(params?: { truck_id?: string; driver_id?: string; type?: string; status?: string }) {
  return useQuery<{ items: TyreDocument[]; summary: DocumentSummary }>({
    queryKey: documentKeys.list(params ?? {}),
    queryFn: async () => {
      const search = new URLSearchParams();
      if (params?.truck_id) search.set("truck_id", params.truck_id);
      if (params?.driver_id) search.set("driver_id", params.driver_id);
      if (params?.type) search.set("type", params.type);
      if (params?.status) search.set("status", params.status);
      const res = await authFetch(`/api/v1/documents?${search.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch documents: ${res.status}`);
      const json = await res.json();
      return { items: json.data ?? [], summary: json.summary ?? { valid: 0, expiring: 0, expired: 0, unknown: 0 } };
    },
    staleTime: 30_000,
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDocumentInput): Promise<TyreDocument> => {
      const res = await authFetch("/api/v1/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) throw new Error(json?.error || `Create failed: ${res.status}`);
      return json.data as TyreDocument;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: documentKeys.all }),
  });
}

export function useUpdateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<CreateDocumentInput>) => {
      const res = await authFetch(`/api/v1/documents/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) throw new Error(json?.error || `Update failed: ${res.status}`);
      return json.data as TyreDocument;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: documentKeys.all }),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/v1/documents/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) throw new Error(json?.error || `Delete failed: ${res.status}`);
      return json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: documentKeys.all }),
  });
}
