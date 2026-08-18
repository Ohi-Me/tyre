"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/api/auth-fetch";

export interface Driver {
  id: string;
  name: string;
  phone: string;
  preferred_lang: string;
  truck_type: string | null;
  current_location: string | null;
  status: string; // AVAILABLE | ON_TRIP | OFFLINE
  rating: number;
  total_trips: number;
  truck: {
    id: string;
    vehicle_number: string;
    truck_type: string;
    status: string;
  } | null;
}

export function useDrivers() {
  return useQuery<Driver[]>({
    queryKey: ["drivers"],
    queryFn: async () => {
      const res = await authFetch("/api/v1/drivers");
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30_000,
  });
}

export interface CreateDriverInput {
  name: string;
  phone: string;
  preferred_lang?: string;
  truck_type?: string | null;
  current_location?: string | null;
}

/** Register a new driver — POST /api/v1/drivers (RBAC drivers:manage). */
export function useCreateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDriverInput): Promise<Driver> => {
      const res = await authFetch("/api/v1/drivers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) throw new Error(json?.error || `Create failed: ${res.status}`);
      return json.data as Driver;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drivers"] }),
  });
}
