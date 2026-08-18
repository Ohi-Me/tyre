"use client";

/**
 * Freight marketplace — react-query hooks + anonymous actor identity.
 *
 * The marketplace has no login wall: each browser gets a stable anonymous id
 * (nanoid persisted in localStorage) that is sent as `x-tyre-actor` on every
 * freight request. The server scopes ownership (my listings, my bookings,
 * my payout ledger) to that id.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";

// ── Actor identity ──────────────────────────────────────────────────────────
const ACTOR_KEY = "tyre_freight_actor";
const PROFILE_KEY = "tyre_freight_profile";

export function getActorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(ACTOR_KEY);
  if (!id) {
    id = nanoid(21);
    localStorage.setItem(ACTOR_KEY, id);
  }
  return id;
}

export interface FreightProfile {
  name: string;
  phone: string;
}

export function getProfile(): FreightProfile {
  if (typeof window === "undefined") return { name: "", phone: "" };
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || "") as FreightProfile;
  } catch {
    return { name: "", phone: "" };
  }
}

export function saveProfile(p: FreightProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}

async function freightFetch(input: string, init?: RequestInit) {
  const res = await fetch(input, {
    ...init,
    headers: {
      "x-tyre-actor": getActorId(),
      ...(init?.body && !(init.body instanceof FormData)
        ? { "content-type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Request failed: ${res.status}`);
  }
  return json;
}

// ── Types ───────────────────────────────────────────────────────────────────
export interface FreightListing {
  id: string;
  code: string;
  owner_name: string;
  phone: string;
  photo_url: string | null;
  vehicle_number: string;
  vehicle_type: string;
  capacity_tons: number;
  origin: string;
  destination: string | null;
  rate_per_km: number | null;
  expected_rate: number | null;
  description: string;
  status: "ACTIVE" | "PAUSED" | "BOOKED";
  is_mine: boolean;
  pending_bookings?: number;
  created_at: string;
  updated_at: string;
}

export interface FreightBooking {
  id: string;
  listing_id: string;
  listing?: FreightListing;
  booker_name: string;
  booker_phone: string;
  pickup: string;
  dropoff: string;
  note: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "COMPLETED";
  fee_charged: boolean;
  is_mine: boolean;
  accepted_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface FreightPayouts {
  fee_inr: number;
  balance: number;
  fees_charged: number;
  fees_refunded: number;
  net_fees_paid: number;
  entries: {
    id: string;
    type: "BOOKING_FEE" | "BOOKING_FEE_REFUND";
    amount: number;
    note: string;
    listing_id: string | null;
    booking_id: string | null;
    created_at: string;
  }[];
}

export interface FreightStats {
  fee_inr: number;
  listings: {
    total: number;
    active: number;
    booked: number;
    by_vehicle_type: { vehicle_type: string; count: number }[];
  };
  bookings: {
    total: number;
    pending: number;
    accepted: number;
    completed: number;
    cancelled: number;
    per_day: { date: string; bookings: number }[];
  };
  fees: { net_revenue: number; charged_count: number };
  recent: {
    id: string;
    listing_code: string;
    vehicle_number: string;
    booker_name: string;
    status: string;
    created_at: string;
  }[];
}

export interface ListingInput {
  owner_name: string;
  phone: string;
  photo_url?: string | null;
  vehicle_number: string;
  vehicle_type: string;
  capacity_tons: number;
  origin: string;
  destination?: string | null;
  rate_per_km?: number | null;
  expected_rate?: number | null;
  description?: string;
}

// ── Query keys ──────────────────────────────────────────────────────────────
export const freightKeys = {
  all: ["freight"] as const,
  listings: (params: Record<string, string>) => ["freight", "listings", params] as const,
  bookings: (role: string) => ["freight", "bookings", role] as const,
  payouts: ["freight", "payouts"] as const,
  stats: ["freight", "stats"] as const,
};

// ── Hooks ───────────────────────────────────────────────────────────────────
export function useFreightListings(params?: { q?: string; vehicle_type?: string; mine?: boolean }) {
  const search: Record<string, string> = {};
  if (params?.q) search.q = params.q;
  if (params?.vehicle_type && params.vehicle_type !== "All") search.vehicle_type = params.vehicle_type;
  if (params?.mine) search.mine = "1";

  return useQuery<FreightListing[]>({
    queryKey: freightKeys.listings(search),
    queryFn: async () => {
      const qs = new URLSearchParams(search).toString();
      const json = await freightFetch(`/api/v1/freight${qs ? `?${qs}` : ""}`);
      return json.data;
    },
    staleTime: 15_000,
  });
}

export function useCreateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ListingInput) =>
      freightFetch("/api/v1/freight", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: freightKeys.all }),
  });
}

export function useUpdateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<ListingInput> & { id: string; status?: string }) =>
      freightFetch(`/api/v1/freight/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: freightKeys.all }),
  });
}

export function useDeleteListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => freightFetch(`/api/v1/freight/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: freightKeys.all }),
  });
}

export function useBookListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      listingId,
      ...input
    }: {
      listingId: string;
      booker_name: string;
      booker_phone: string;
      pickup?: string;
      dropoff?: string;
      note?: string;
    }) =>
      freightFetch(`/api/v1/freight/${listingId}/book`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: freightKeys.all }),
  });
}

export function useFreightBookings(role: "lister" | "booker" | "all" = "all") {
  return useQuery<FreightBooking[]>({
    queryKey: freightKeys.bookings(role),
    queryFn: async () => {
      const qs = role === "all" ? "" : `?role=${role}`;
      const json = await freightFetch(`/api/v1/freight/bookings${qs}`);
      return json.data;
    },
    staleTime: 10_000,
  });
}

export function useBookingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "accept" | "reject" | "cancel" | "complete" }) =>
      freightFetch(`/api/v1/freight/bookings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: freightKeys.all }),
  });
}

export function useFreightPayouts() {
  return useQuery<FreightPayouts>({
    queryKey: freightKeys.payouts,
    queryFn: async () => (await freightFetch("/api/v1/freight/payouts")).data,
    staleTime: 10_000,
  });
}

export function useFreightStats() {
  return useQuery<FreightStats>({
    queryKey: freightKeys.stats,
    queryFn: async () => (await freightFetch("/api/v1/freight/stats")).data,
    staleTime: 30_000,
  });
}

export async function uploadFreightPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const json = await freightFetch("/api/v1/freight/upload", { method: "POST", body: form });
  return json.data.url as string;
}
