"use client";

/**
 * Local profile store — the identity shown across the app (sidebar, topbar,
 * AskPilot context) and the business context captured during onboarding.
 * Persisted to localStorage; becomes the client cache of the server session
 * once NextAuth credentials/OAuth are wired.
 */
import { useEffect, useState } from "react";

export type TyreRole = "driver" | "fleet_owner" | "traveller" | "business";

export type TyreProfile = {
  /* account */
  name: string;
  email?: string;
  phone: string;
  role: TyreRole;
  /* business / onboarding */
  company?: string;
  businessType?: string;
  fleetType?: string;
  industry?: string;
  country?: string;
  language?: string;
  currency?: string;
  vehicleCategories?: string[];
  teamSize?: string;
  createdAt: string;
};

const KEY = "tyre.profile.v1";
const EVT = "tyre-profile-changed";

export const ROLE_LABEL: Record<TyreRole, string> = {
  driver: "Driver",
  fleet_owner: "Fleet owner",
  traveller: "Traveller",
  business: "Business / shipper",
};

export const BUSINESS_TYPES = ["Individual", "Fleet operator", "Logistics company", "Travel agency", "E-commerce", "Other"];
export const FLEET_TYPES = ["Owned", "Leased", "Mixed", "None yet"];
export const INDUSTRIES = ["Transport & logistics", "Retail & e-commerce", "Manufacturing", "Agriculture", "Services", "Other"];
export const TEAM_SIZES = ["Just me", "2–10", "11–50", "51–200", "200+"];
export const VEHICLE_CATEGORIES = ["Car", "SUV", "Van", "Pickup", "Mini truck", "Tempo", "Freight truck", "Trailer", "Two-wheeler", "EV"];

export function loadProfile(): TyreProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as TyreProfile;
    return p?.name && p?.phone ? p : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: Omit<TyreProfile, "createdAt">) {
  const full: TyreProfile = { ...p, createdAt: new Date().toISOString() };
  window.localStorage.setItem(KEY, JSON.stringify(full));
  window.dispatchEvent(new Event(EVT));
  return full;
}

export function clearProfile() {
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVT));
}

export function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "T"
  );
}

/** Reactive profile — updates across components on save/clear. */
export function useProfile(): { profile: TyreProfile | null; hydrated: boolean } {
  const [profile, setProfile] = useState<TyreProfile | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setHydrated(true);
    const h = () => setProfile(loadProfile());
    window.addEventListener(EVT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVT, h);
      window.removeEventListener("storage", h);
    };
  }, []);

  return { profile, hydrated };
}
