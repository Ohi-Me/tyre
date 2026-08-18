"use client";

import { create } from "zustand";

export type LandingSection =
  | "home"
  | "product"
  | "voice"
  | "pricing"
  | "trust";

export type AppView =
  | "dashboard"
  | "marketplace"
  | "my_freight"
  | "dispatch"
  | "tracking"
  | "payments"
  | "billing"
  | "fleet"
  | "drivers"
  | "trips"
  | "documents"
  | "analytics"
  | "voice"
  | "settings";

type Mode = "landing" | "app";

interface TyreUIState {
  mode: Mode;
  landingSection: LandingSection;
  appView: AppView;
  copilotOpen: boolean;
  enterApp: () => void;
  exitToLanding: () => void;
  setLandingSection: (s: LandingSection) => void;
  setAppView: (v: AppView) => void;
  setCopilotOpen: (o: boolean) => void;
}

export const useTyreUI = create<TyreUIState>((set) => ({
  mode: "landing",
  landingSection: "home",
  appView: "dashboard",
  copilotOpen: false,
  enterApp: () => set({ mode: "app", appView: "dashboard" }),
  exitToLanding: () => set({ mode: "landing" }),
  setLandingSection: (s) => set({ landingSection: s }),
  setAppView: (v) => set({ appView: v }),
  setCopilotOpen: (o) => set({ copilotOpen: o }),
}));
