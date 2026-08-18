/**
 * FE-C1 fix: react-query hooks for the loads domain.
 *
 * These hooks replace the hardcoded mock data in lib/tyre/data.ts.
 * Every app view that displayed LOADS should import from here instead.
 *
 * Usage:
 *   import { useLoads, useCreateLoad } from "@/lib/api/queries/loads";
 *
 *   function MarketplaceView() {
 *     const { data, isLoading } = useLoads();
 *     if (isLoading) return <Skeleton />;
 *     return <LoadList loads={data ?? []} />;
 *   }
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/api/auth-fetch";

// ── Types matching the API response ─────────────────────────────────────────
export interface Load {
  id: string;
  tyre_code: string;
  origin: string;
  // Week 3 broadcast: optional GPS coords (set when the load creation flow
  // includes them; older loads may have null).
  origin_lat?: number | null;
  origin_lng?: number | null;
  destination: string;
  destination_lat?: number | null;
  destination_lng?: number | null;
  distance_km: number;
  weight_tons: number;
  truck_type_req: string;
  goods_type: string;
  offered_rate: number;
  ai_suggested_rate: number | null;
  advance_offered: number;
  status: string;
  risk_level: string;
  broker_id: string;
  broker_name: string;
  broker_phone: string | null;
  broker_risk_score: number;
  // Derived 0-5 star rating for marketplace display (computed from
  // broker_risk_score: (100 - risk_score) / 20). Optional because older
  // API responses may not include it.
  broker_rating?: number;
  assigned_truck_id: string | null;
  assigned_truck_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoadListResponse {
  loads: Load[];
  next_cursor: string | null;
}

export interface LoadCreateInput {
  broker_id: string;
  origin: string;
  destination: string;
  distance_km: number;
  weight_tons: number;
  truck_type_req: string;
  goods_type: string;
  offered_rate: number;
  advance_offered?: number;
}

// ── Query keys ──────────────────────────────────────────────────────────────
export const loadKeys = {
  all: ["loads"] as const,
  lists: () => [...loadKeys.all, "list"] as const,
  list: (params: { status?: string; broker_id?: string; cursor?: string }) =>
    [...loadKeys.lists(), params] as const,
  details: () => [...loadKeys.all, "detail"] as const,
  detail: (id: string) => [...loadKeys.details(), id] as const,
};

// ── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Fetch a list of loads. Returns `Load[]` directly for easy use in views.
 * The API returns `{ success, data }` — we extract `data`.
 */
export function useLoads(params?: { status?: string; broker_id?: string; cursor?: string }) {
  return useQuery<Load[]>({
    queryKey: loadKeys.list(params ?? {}),
    queryFn: async () => {
      const search = new URLSearchParams();
      if (params?.status) search.set("status", params.status);
      if (params?.broker_id) search.set("broker_id", params.broker_id);
      if (params?.cursor) search.set("cursor", params.cursor);
      const res = await authFetch(`/api/v1/loads?${search.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch loads: ${res.status}`);
      const json = await res.json();
      // API returns { success, data } — extract data array
      return json.data ?? json.loads ?? [];
    },
    staleTime: 30_000,  // 30 seconds
  });
}

/** Fetch a single load by ID. */
export function useLoad(id: string | null) {
  return useQuery<Load>({
    queryKey: loadKeys.detail(id ?? ""),
    queryFn: async () => {
      const res = await authFetch(`/api/v1/loads/${id}`);
      if (!res.ok) throw new Error(`Failed to fetch load: ${res.status}`);
      const json = await res.json();
      return json.data;
    },
    enabled: !!id,
  });
}

/** Create a new load. Invalidates the loads list on success. */
export function useCreateLoad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoadCreateInput) => {
      const res = await authFetch("/api/v1/loads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Create failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: loadKeys.lists() });
    },
  });
}

// ── Dispatch assign ──────────────────────────────────────────────────────────

export interface AssignLoadInput {
  load_id: string;
  truck_id: string;
  driver_phone?: string;
}

export interface AssignLoadResult {
  load_id: string;
  load_code: string;
  status: string;
  trip_id: string;
  truck_number: string;
  driver_name: string | null;
  driver_phone: string | null;
  advance_released: number;
  escrow_simulated: boolean;
  escrow_error?: string;
  message: string;
}

/**
 * Assign a truck to a load — POST /api/v1/loads/assign (RBAC loads:assign).
 * Creates a Trip and attempts to release the UPI advance via the ai-gateway
 * escrow flow. Invalidates loads/trucks/trips so Dispatch, Fleet, and Trips
 * all reflect the new state without a manual refresh.
 */
export function useAssignLoad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AssignLoadInput): Promise<AssignLoadResult> => {
      const res = await authFetch("/api/v1/loads/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || `Assign failed: ${res.status}`);
      }
      return json.data as AssignLoadResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: loadKeys.lists() });
      qc.invalidateQueries({ queryKey: ["trucks"] });
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}
