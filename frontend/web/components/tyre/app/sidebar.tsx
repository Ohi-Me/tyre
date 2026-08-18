"use client";

/**
 * APP CHROME v2 — "The operator's cab."
 *
 * The sidebar is the night cab of the truck: an asphalt rail with a lit
 * top edge, mono manifest labels, and a signal lane-marker that glides to
 * the active view (framer layoutId). The content canvas stays daylight
 * bone — you look out of the dark cab onto the bright yard. The topbar is
 * paper glass with a command-key search; "List freight" is the one ember
 * action because it moves money.
 */
import { useTyreUI, type AppView } from "@/lib/tyre/store";
import {
  LayoutGrid,
  Store,
  Boxes,
  Radio,
  MapPin,
  Wallet,
  Truck,
  Users,
  Route,
  BarChart3,
  Mic,
  Settings,
  Sparkles,
  ChevronDown,
  ArrowLeft,
  Search,
  Bell,
  Plus,
  Receipt,
  FileText,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useProfile, initialsOf, ROLE_LABEL, clearProfile } from "@/lib/tyre/profile";
import { logout } from "@/lib/tyre/auth";
import { NotificationsBell } from "./notifications-bell";

type NavItem = { id: AppView; label: string; icon: typeof Truck };

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Operate",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
      { id: "dispatch", label: "Dispatch", icon: Radio },
      { id: "tracking", label: "Tracking", icon: MapPin },
      { id: "trips", label: "Trips", icon: Route },
    ],
  },
  {
    title: "Marketplace",
    items: [
      { id: "marketplace", label: "Marketplace", icon: Store },
      { id: "my_freight", label: "My Freight", icon: Boxes },
    ],
  },
  {
    title: "Assets & Money",
    items: [
      { id: "fleet", label: "Fleet", icon: Truck },
      { id: "drivers", label: "Drivers", icon: Users },
      { id: "payments", label: "Payments", icon: Wallet },
      { id: "billing", label: "Billing", icon: Receipt },
      { id: "documents", label: "Documents", icon: FileText },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { id: "analytics", label: "Analytics", icon: BarChart3 },
      { id: "voice", label: "Voice AI", icon: Mic },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { appView, setAppView, exitToLanding, setCopilotOpen } = useTyreUI();
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const { profile } = useProfile();

  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-[var(--tyre-panel)] text-[#F3F1E8] h-screen sticky top-0 border-r border-[rgba(243,241,232,0.08)] shadow-[inset_0_1px_0_rgba(255,250,235,0.06)]">
      {/* Brand */}
      <div className="h-16 px-5 flex items-center border-b border-[rgba(243,241,232,0.08)]">
        <button
          onClick={exitToLanding}
          className="flex items-start gap-[3px] transition-transform hover:scale-[1.02]"
          aria-label="Back to landing"
        >
          <span className="tyre-display text-[19px] tracking-[-0.02em] leading-none text-[var(--tyre-signal)]">
            TYRE
          </span>
          <span className="mt-[2px] w-[6px] h-[6px] rounded-full bg-[var(--tyre-signal)]" />
          <span className="ml-2 mt-[3px] font-mono text-[8.5px] uppercase tracking-[0.22em] text-[rgba(243,241,232,0.35)]">
            Freight OS
          </span>
        </button>
      </div>

      {/* Nav — manifest groups with gliding lane marker */}
      <nav className="flex-1 overflow-y-auto tyre-scroll px-3 py-4 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="px-2.5 mb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-[rgba(243,241,232,0.3)]">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = appView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setAppView(item.id)}
                    className={`relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors duration-300 ${
                      active
                        ? "text-[var(--tyre-signal)]"
                        : "text-[rgba(243,241,232,0.55)] hover:bg-[rgba(243,241,232,0.05)] hover:text-[#F3F1E8]"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="app-nav-marker"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        className="absolute inset-0 rounded-lg bg-[rgba(61,107,255,0.09)] border border-[rgba(61,107,255,0.18)]"
                      />
                    )}
                    {active && (
                      <motion.span
                        layoutId="app-nav-lane"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-[var(--tyre-signal)] shadow-[0_0_10px_rgba(61,107,255,0.6)]"
                      />
                    )}
                    <item.icon
                      className={`relative z-10 w-4 h-4 transition-colors duration-300 ${
                        active ? "text-[var(--tyre-signal)]" : "text-[rgba(243,241,232,0.4)]"
                      }`}
                    />
                    <span className="relative z-10">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Workspace + Copilot */}
      <div className="p-3 border-t border-[rgba(243,241,232,0.08)]">
        <button
          onClick={() => setWorkspaceOpen((v) => !v)}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[rgba(243,241,232,0.05)] transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-md bg-[var(--tyre-signal)] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
            {initialsOf(profile?.name ?? "TYRE")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-[#F3F1E8] truncate">
              {profile?.company ?? profile?.name ?? "Your workspace"}
            </div>
            <div className="text-[10px] text-[rgba(243,241,232,0.4)] truncate flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--tyre-signal)]" />
              {profile ? ROLE_LABEL[profile.role] : "Active"}
            </div>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-[rgba(243,241,232,0.35)] transition-transform duration-300 ${
              workspaceOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        {workspaceOpen && (
          <button
            onClick={() => {
              void logout().finally(() => exitToLanding());
            }}
            className="mt-1 w-full text-left px-2.5 py-2 rounded-lg text-[12px] text-[rgba(243,241,232,0.55)] hover:bg-[rgba(243,241,232,0.05)] hover:text-[#F3F1E8] transition-colors"
          >
            Sign out
          </button>
        )}

        <button
          onClick={() => setCopilotOpen(true)}
          className="mt-2 w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[rgba(61,107,255,0.2)] bg-[rgba(61,107,255,0.06)] hover:bg-[rgba(61,107,255,0.1)] transition-colors text-left"
        >
          <div className="w-6 h-6 rounded-md bg-[var(--tyre-signal)] flex items-center justify-center shrink-0">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-[#F3F1E8]">AskPilot</div>
            <div className="text-[10px] text-[rgba(243,241,232,0.4)]">Chat + voice operator</div>
          </div>
        </button>
      </div>
    </aside>
  );
}

export function AppTopbar() {
  const { exitToLanding, setAppView } = useTyreUI();
  const { profile } = useProfile();
  const [query, setQuery] = useState("");
  const [listening, setListening] = useState(false);

  /* voice is a core interaction — dictate straight into search */
  const dictate = () => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR || listening) return;
    const rec = new SR();
    rec.lang = "en-IN";
    rec.onresult = (e: any) => {
      const t = e.results?.[0]?.[0]?.transcript;
      if (t) setQuery(t);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  };

  return (
    <header className="sticky top-0 z-30 h-14 bg-[rgba(253,252,248,0.85)] backdrop-blur-xl border-b border-[var(--border)] flex items-center px-4 sm:px-6 gap-3">
      <button
        onClick={exitToLanding}
        className="lg:hidden p-1.5 -ml-1.5 rounded-md hover:bg-[rgba(18,16,11,0.05)]"
        aria-label="Back to landing"
      >
        <ArrowLeft className="w-4 h-4 text-[var(--tyre-ink)]" />
      </button>

      {/* Search — type or speak */}
      <div className="flex-1 max-w-md relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={listening ? "Listening…" : "Search vehicles, drivers, trips…"}
          className="w-full h-9 pl-9 pr-[74px] rounded-full bg-[var(--secondary)] border border-transparent focus:border-[var(--ring)] focus:bg-card focus:outline-none focus:shadow-[0_0_0_3px_rgba(64,98,232,0.15)] text-[13px] text-[var(--tyre-ink)] placeholder:text-[var(--muted-foreground)] transition-all duration-200"
        />
        <button
          onClick={dictate}
          aria-label="Search by voice"
          className={`absolute right-10 top-1/2 -translate-y-1/2 grid place-items-center w-6 h-6 rounded-full transition-colors ${
            listening ? "bg-[var(--tyre-ember)] text-white" : "text-[var(--muted-foreground)] hover:text-[var(--tyre-ink)]"
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
        </button>
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[var(--muted-foreground)] border border-[var(--border)] rounded px-1.5 py-0.5 bg-card">
          ⌘K
        </kbd>
      </div>

      <div className="flex-1" />

      {/* Live indicator */}
      <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--tyre-mint)] border border-[rgba(61,122,15,0.2)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--tyre-green-deep)] tyre-pulse-dot" />
        <span className="font-mono text-[10px] font-bold tracking-wider text-[var(--tyre-green-deep)]">LIVE</span>
      </div>

      {/* Notifications */}
      <NotificationsBell />

      {/* User */}
      <div className="flex items-center gap-2 pl-2 border-l border-[var(--border)]" title={profile?.name}>
        <div className="w-8 h-8 rounded-full bg-[var(--tyre-ink)] text-[var(--tyre-signal)] text-[11px] font-bold flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,250,235,0.15)]">
          {initialsOf(profile?.name ?? "TYRE")}
        </div>
      </div>

      {/* List freight — the ember action: it moves money */}
      <button
        onClick={() => setAppView("my_freight")}
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--tyre-ember)] hover:brightness-105 hover:shadow-[0_8px_20px_-8px_rgba(255,90,30,0.6)] text-white px-3.5 py-2 text-[12.5px] font-bold transition-all duration-200 active:scale-[0.97]"
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">List freight</span>
        <span className="sm:hidden">New</span>
      </button>
    </header>
  );
}
