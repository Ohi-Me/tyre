/**
 * FE-C1 fix: react-query hooks for the trips domain.
 *
 * Updated to match the actual API response format from /api/v1/trips
 * which returns { success, data: [...] } with serialized trip objects.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/api/auth-fetch";

export interface Trip {
  id: string;
  load_id: string;
  load_code: string | null;
  origin: string | null;
  destination: string | null;
  truck_id: string | null;
  truck_number: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
  pod_verified: boolean;
  payment_released: boolean;
  rate: number;
  advance: number;
  balance: number;
  // Optional — set by the trips/[id]/complete route when the balance is released.
  // tracking.tsx uses this to show "Held in escrow" → "Released" on delivery.
  balance_released?: number;
  payment_status?: string;
  created_at: string;
}

export interface TripListResponse {
  trips: Trip[];
  next_cursor: string | null;
}

export const tripKeys = {
  all: ["trips"] as const,
  lists: () => [...tripKeys.all, "list"] as const,
  list: (params: { status?: string; driver_id?: string; cursor?: string }) =>
    [...tripKeys.lists(), params] as const,
  detail: (id: string) => [...tripKeys.all, "detail", id] as const,
};

/**
 * Fetch a list of trips. Returns `Trip[]` directly.
 * The API returns `{ success, data }` — we extract `data`.
 */
export function useTrips(params?: { status?: string; driver_id?: string; cursor?: string }) {
  return useQuery<Trip[]>({
    queryKey: tripKeys.list(params ?? {}),
    queryFn: async () => {
      const search = new URLSearchParams();
      if (params?.status) search.set("status", params.status);
      if (params?.driver_id) search.set("driver_id", params.driver_id);
      if (params?.cursor) search.set("cursor", params.cursor);
      const res = await authFetch(`/api/v1/trips?${search.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch trips: ${res.status}`);
      const json = await res.json();
      return json.data ?? json.trips ?? [];
    },
    staleTime: 30_000,
  });
}

export function useTrip(id: string | null) {
  return useQuery<Trip>({
    queryKey: tripKeys.detail(id ?? ""),
    queryFn: async () => {
      const res = await authFetch(`/api/v1/trips/${id}`);
      if (!res.ok) throw new Error(`Failed to fetch trip: ${res.status}`);
      const json = await res.json();
      return json.data;
    },
    enabled: !!id,
  });
}

export function useStartTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tripId: string) => {
      const res = await authFetch(`/api/v1/trips/${tripId}/start`, { method: "POST" });
      if (!res.ok) throw new Error(`Start failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.lists() });
    },
  });
}

export function useCompleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tripId: string) => {
      const res = await authFetch(`/api/v1/trips/${tripId}/complete`, { method: "POST" });
      if (!res.ok) throw new Error(`Complete failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.lists() });
    },
  });
}
