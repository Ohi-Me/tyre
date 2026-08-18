"use client";

/**
 * APP SHELL v2 — dark cab (sidebar) looking onto a daylight yard (canvas).
 * View changes glide in with a soft rise + settle instead of hard cuts.
 */
import { useTyreUI } from "@/lib/tyre/store";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AppSidebar, AppTopbar } from "./sidebar";
import { DashboardView } from "./views/dashboard";
import { MarketplaceView } from "./views/marketplace";
import { MyFreightView } from "./views/my-freight";
import { DispatchView } from "./views/dispatch";
import { TrackingView } from "./views/tracking";
import { PaymentsView } from "./views/payments";
import { AnalyticsView } from "./views/analytics";
import { VoiceView } from "./views/voice";
import { FleetView } from "./views/fleet";
import { DriversView } from "./views/drivers";
import { TripsView } from "./views/trips";
import { BillingView } from "./views/billing";
import { DocumentsView } from "./views/documents";
import { SettingsView } from "./views/settings";
import { AskPilot } from "../askpilot";

const EXPO = [0.19, 1, 0.22, 1] as const;

const VIEWS = {
  dashboard: DashboardView,
  marketplace: MarketplaceView,
  my_freight: MyFreightView,
  dispatch: DispatchView,
  tracking: TrackingView,
  payments: PaymentsView,
  fleet: FleetView,
  drivers: DriversView,
  trips: TripsView,
  billing: BillingView,
  documents: DocumentsView,
  analytics: AnalyticsView,
  voice: VoiceView,
  settings: SettingsView,
} as const;

export function AppShell() {
  const { appView } = useTyreUI();
  const reduce = useReducedMotion();
  const View = VIEWS[appView as keyof typeof VIEWS] ?? DashboardView;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AppTopbar />
        <main className="flex-1 tyre-scroll relative">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={appView}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.995 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.998 }}
              transition={{ duration: 0.35, ease: EXPO }}
              className="min-h-full"
            >
              <View />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <AskPilot />
    </div>
  );
}
