/**
 * FE-C1 fix: react-query hooks for the trucks domain.
 *
 * Updated to match the actual API response format from /api/v1/trucks
 * which returns { success, data: [...] } with serialized truck objects.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/api/auth-fetch";

export interface Truck {
  id: string;
  vehicle_number: string;
  truck_type: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  current_location: string | null;
  status: string;
  utilization_pct: number;
  todays_km: number;
  total_km_this_month: number;
  fuel_efficiency_kmpl: number;
  next_maintenance_km: number;
  last_maintenance_date: string;
  predicted_breakdown_risk: string;
  cargo_loaded: boolean;
  destination: string | null;
  capacity_tons?: number;
}

export interface TruckListResponse {
  trucks: Truck[];
  next_cursor: string | null;
}

export const truckKeys = {
  all: ["trucks"] as const,
  lists: () => [...truckKeys.all, "list"] as const,
  detail: (id: string) => [...truckKeys.all, "detail", id] as const,
};

/**
 * Fetch a list of trucks. Returns `Truck[]` directly.
 * The API returns `{ success, data }` — we extract `data`.
 */
export function useTrucks(params?: { status?: string; cursor?: string }) {
  return useQuery<Truck[]>({
    queryKey: truckKeys.lists(),
    queryFn: async () => {
      const search = new URLSearchParams();
      if (params?.status) search.set("status", params.status);
      if (params?.cursor) search.set("cursor", params.cursor);
      const res = await authFetch(`/api/v1/trucks?${search.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch trucks: ${res.status}`);
      const json = await res.json();
      return json.data ?? json.trucks ?? [];
    },
    staleTime: 30_000,
  });
}

export function useTruck(id: string | null) {
  return useQuery<Truck>({
    queryKey: truckKeys.detail(id ?? ""),
    queryFn: async () => {
      const res = await authFetch(`/api/v1/trucks/${id}`);
      if (!res.ok) throw new Error(`Failed to fetch truck: ${res.status}`);
      const json = await res.json();
      return json.data;
    },
    enabled: !!id,
  });
}

/** Update a truck (status/location/etc.) — RBAC: trucks:manage. */
export function useUpdateTruck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Record<string, unknown>) => {
      const res = await authFetch(`/api/v1/trucks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) throw new Error(json?.error || `Update failed: ${res.status}`);
      return json.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trucks"] }),
  });
}
