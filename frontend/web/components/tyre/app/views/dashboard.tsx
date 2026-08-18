"use client";

/**
 * DASHBOARD v2 — "The morning yard."
 *
 * The operator's first look of the day, in the Asphalt & Signal identity:
 * one asphalt hero KPI (money — the reason the app is open) with a lit top
 * edge, three paper KPIs, mono tabular numerals everywhere, chart lines in
 * leaf/signal, ember reserved for money actions and status heat. Cards keep
 * the same information architecture — they just stop looking like a slate
 * SaaS template.
 */
import { useDashboard, type DashboardData } from "@/lib/api/queries/dashboard";
import { SceneLoader } from "../loading/scene-loader";
import { useProfile } from "@/lib/tyre/profile";
import { CheckCircle2, Circle } from "lucide-react";
import { useFreightStats } from "@/lib/api/queries/freight";
import { useTyreUI } from "@/lib/tyre/store";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  IndianRupee,
  Route,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const EXPO = [0.19, 1, 0.22, 1] as const;

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}
function formatINRShort(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n}`;
}

export function DashboardView() {
  const { data, isLoading, error } = useDashboard();
  const { data: freight } = useFreightStats();
  const { setAppView } = useTyreUI();
  const { profile } = useProfile();

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-[rgba(217,53,38,0.3)] bg-[rgba(217,53,38,0.06)] p-6 text-center">
          <div className="text-[14px] font-semibold text-[var(--destructive)]">Failed to load dashboard</div>
          <div className="text-[12.5px] mt-1 text-[var(--destructive)] opacity-80">{(error as Error).message}</div>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return <SceneLoader scene="dashboard" />;
  }

  const kpis = [
    {
      label: "Revenue today",
      value: formatINRShort(data.todayRevenue),
      sub: `${data.tripsCompletedToday} trips completed`,
      icon: IndianRupee,
      cls: "tyre-card-dark text-[#F3F1E8]",
      iconCls: "bg-[rgba(61,107,255,0.12)] text-[var(--tyre-signal)]",
      subCls: "text-[rgba(243,241,232,0.5)]",
    },
    {
      label: "Active trips",
      value: String(data.activeTripsCount),
      sub: `${data.openLoadsCount} open loads waiting`,
      icon: Route,
      cls: "bg-card border border-[var(--border)]",
      iconCls: "bg-[var(--tyre-mint)] text-[var(--tyre-green-deep)]",
      subCls: "text-[var(--muted-foreground)]",
    },
    {
      label: "Fleet utilization",
      value: `${data.truckUtilization}%`,
      sub: `${data.activeTrucks}/${data.totalTrucks} trucks on the road`,
      icon: Truck,
      cls: "bg-card border border-[var(--border)]",
      iconCls: "bg-[rgba(255,90,30,0.1)] text-[var(--tyre-ember)]",
      subCls: "text-[var(--muted-foreground)]",
    },
    {
      label: "Marketplace",
      value: String(freight?.listings.active ?? 0),
      sub: `${freight?.bookings.pending ?? 0} booking requests pending`,
      icon: Store,
      cls: "bg-card border border-[var(--border)]",
      iconCls: "bg-[var(--secondary)] text-[var(--tyre-ink-soft)]",
      subCls: "text-[var(--muted-foreground)]",
    },
  ];

  const isEmpty =
    data.totalTrucks === 0 && data.activeTripsCount === 0 && (freight?.listings.total ?? 0) === 0;

  return (
    <div className="p-5 sm:p-6 space-y-5 max-w-[1500px] mx-auto">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="tyre-display text-[24px] text-[var(--tyre-ink)]">
            {profile ? `Welcome, ${profile.name.split(" ")[0]}` : "Dashboard"}
          </h1>
          <p className="text-[12.5px] text-[var(--muted-foreground)] mt-1">
            Fleet, marketplace and money — at a glance
          </p>
        </div>
        <div className="tyre-num text-[11px] text-[var(--muted-foreground)]">
          Updated {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {/* First steps — the account is never "empty", it's already 1/3 done */}
      {isEmpty && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EXPO }}
          className="rounded-2xl border border-[rgba(61,107,255,0.25)] bg-[var(--tyre-mint)] p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-[14.5px] font-bold text-[var(--tyre-ink)]">You&apos;re 1 of 3 steps in</h2>
              <p className="text-[12px] text-[var(--muted-foreground)] mt-0.5">
                Two more and your first leg can start earning.
              </p>
            </div>
            <span className="tyre-num text-[12px] font-bold text-[var(--tyre-green-deep)]">33%</span>
          </div>
          <div className="grid sm:grid-cols-3 gap-2.5">
            <div className="flex items-center gap-2.5 rounded-xl bg-card border border-[var(--border)] px-3.5 py-3 opacity-70">
              <CheckCircle2 className="w-4.5 h-4.5 w-[18px] h-[18px] text-[var(--tyre-green-deep)] shrink-0" />
              <div>
                <div className="text-[12.5px] font-semibold text-[var(--tyre-ink)] line-through decoration-[rgba(18,16,11,0.3)]">
                  Create your profile
                </div>
                <div className="text-[10.5px] text-[var(--muted-foreground)]">Done</div>
              </div>
            </div>
            <button
              onClick={() => setAppView("fleet")}
              className="flex items-center gap-2.5 rounded-xl bg-card border border-[var(--border)] px-3.5 py-3 text-left hover:border-[var(--tyre-signal)] hover:shadow-[0_8px_20px_-10px_rgba(61,107,255,0.35)] transition-all duration-200"
            >
              <Circle className="w-[18px] h-[18px] text-[var(--muted-foreground)] shrink-0" />
              <div>
                <div className="text-[12.5px] font-semibold text-[var(--tyre-ink)]">Add your first vehicle</div>
                <div className="text-[10.5px] text-[var(--muted-foreground)]">~1 minute</div>
              </div>
            </button>
            <button
              onClick={() => setAppView("my_freight")}
              className="flex items-center gap-2.5 rounded-xl bg-card border border-[var(--border)] px-3.5 py-3 text-left hover:border-[var(--tyre-signal)] hover:shadow-[0_8px_20px_-10px_rgba(61,107,255,0.35)] transition-all duration-200"
            >
              <Circle className="w-[18px] h-[18px] text-[var(--muted-foreground)] shrink-0" />
              <div>
                <div className="text-[12.5px] font-semibold text-[var(--tyre-ink)]">List your first leg</div>
                <div className="text-[10.5px] text-[var(--muted-foreground)]">₹0 · fee only when booked</div>
              </div>
            </button>
          </div>
        </motion.section>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.45, ease: EXPO }}
            className={`rounded-2xl p-4 ${k.cls}`}
          >
            <div className="flex items-center justify-between">
              <span className={`font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] ${k.subCls}`}>
                {k.label}
              </span>
              <span className={`grid place-items-center w-8 h-8 rounded-xl ${k.iconCls}`}>
                <k.icon className="w-4 h-4" />
              </span>
            </div>
            <div className="tyre-num text-[26px] font-extrabold tracking-tight mt-1.5">{k.value}</div>
            <div className={`text-[11px] mt-0.5 ${k.subCls}`}>{k.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* Revenue chart + freight activity */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-5">
        {/* Revenue */}
        <section className="rounded-2xl border border-[var(--border)] bg-card p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="text-[14px] font-bold text-[var(--tyre-ink)]">Revenue this week</h2>
              <div className="tyre-num text-[11.5px] text-[var(--muted-foreground)]">
                {formatINRShort(data.insights.totalRevenue)} total · {data.insights.totalTrips} trips
              </div>
            </div>
            <button
              onClick={() => setAppView("analytics")}
              className="tyre-link inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--tyre-green-deep)]"
            >
              Analytics <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="h-56 mt-3 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.insights.revenuePoints}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4062E8" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#4062E8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10.5, fill: "#8F8B7E" }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10.5, fill: "#8F8B7E" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatINRShort(v)}
                  width={52}
                />
                <Tooltip
                  formatter={(v: number | string) => [formatINR(Number(v)), "Revenue"]}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(18,16,11,0.08)",
                    background: "#FDFCF8",
                    fontSize: 12,
                    boxShadow: "0 8px 24px -12px rgba(28,22,12,0.25)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#4062E8"
                  strokeWidth={2.5}
                  fill="url(#revGrad)"
                  animationDuration={900}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* Top routes strip */}
          <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-3 gap-2">
            {data.insights.topRoutes.slice(0, 3).map((r) => (
              <div
                key={`${r.origin}-${r.destination}`}
                className="flex items-center justify-between rounded-lg bg-[var(--secondary)] px-3 py-2"
              >
                <span className="text-[11.5px] font-semibold text-[var(--tyre-ink-soft)] truncate">
                  {r.origin} → {r.destination}
                </span>
                <span className="tyre-num text-[11.5px] font-bold text-[var(--tyre-ink)] ml-2 shrink-0">
                  {formatINRShort(r.revenue)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Freight marketplace activity */}
        <section className="rounded-2xl border border-[var(--border)] bg-card p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-bold text-[var(--tyre-ink)]">Freight marketplace</h2>
            <button
              onClick={() => setAppView("marketplace")}
              className="tyre-link inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--tyre-green-deep)]"
            >
              Open <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <MiniStat label="Listings" value={freight?.listings.total ?? 0} />
            <MiniStat label="Bookings" value={freight?.bookings.total ?? 0} />
            <MiniStat label="Fee revenue" value={formatINR(freight?.fees.net_revenue ?? 0)} accent />
          </div>

          {/* Bookings per day sparkline */}
          <div className="h-20 -mx-1 mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={freight?.bookings.per_day ?? []}>
                <defs>
                  <linearGradient id="bkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2C46C8" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#2C46C8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  formatter={(v: number | string) => [v, "Bookings"]}
                  labelFormatter={(l) =>
                    new Date(String(l)).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                  }
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid rgba(18,16,11,0.08)",
                    background: "#FDFCF8",
                    fontSize: 11,
                  }}
                />
                <Area type="monotone" dataKey="bookings" stroke="#2C46C8" strokeWidth={2} fill="url(#bkGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Recent bookings */}
          <div className="flex-1 space-y-2 overflow-hidden">
            {(freight?.recent ?? []).length === 0 ? (
              <p className="text-[11.5px] text-[var(--muted-foreground)] text-center py-4">
                No bookings yet — the first one shows up here.
              </p>
            ) : (
              (freight?.recent ?? []).slice(0, 4).map((b) => (
                <div key={b.id} className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-[var(--secondary)] grid place-items-center shrink-0">
                    <Truck className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11.5px] font-semibold text-[var(--tyre-ink)] truncate">
                      {b.booker_name} → {b.vehicle_number}
                    </div>
                    <div className="tyre-num text-[10px] text-[var(--muted-foreground)]">
                      {new Date(b.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                  <span
                    className={`px-1.5 py-0.5 rounded font-mono text-[9px] font-bold shrink-0 ${
                      b.status === "ACCEPTED"
                        ? "bg-[var(--tyre-mint)] text-[var(--tyre-green-deep)]"
                        : b.status === "PENDING"
                          ? "bg-[rgba(255,90,30,0.1)] text-[var(--tyre-orange-deep)]"
                          : b.status === "CANCELLED"
                            ? "bg-[rgba(217,53,38,0.08)] text-[var(--destructive)]"
                            : "bg-[var(--secondary)] text-[var(--muted-foreground)]"
                    }`}
                  >
                    {b.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Active trips + notifications */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-5">
        {/* Active trips */}
        <section className="rounded-2xl border border-[var(--border)] bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-bold text-[var(--tyre-ink)]">Live trips</h2>
            <button
              onClick={() => setAppView("trips")}
              className="tyre-link inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--tyre-green-deep)]"
            >
              All trips <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {data.activeTrips.length === 0 ? (
            <p className="text-[12px] text-[var(--muted-foreground)] text-center py-8">
              No trips running right now.
            </p>
          ) : (
            <div className="space-y-3">
              {data.activeTrips.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-[var(--tyre-mint)] grid place-items-center shrink-0">
                    <Route className="w-4 h-4 text-[var(--tyre-green-deep)]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-bold text-[var(--tyre-ink)] truncate">
                        {t.origin} → {t.destination}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[var(--tyre-mint)] text-[var(--tyre-green-deep)] font-mono text-[9px] font-bold shrink-0">
                        {t.status}
                      </span>
                    </div>
                    <div className="text-[10.5px] text-[var(--muted-foreground)] truncate">
                      {t.truckNumber} · {t.driverName}
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-[var(--secondary)] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: "var(--tyre-gradient)" }}
                        initial={{ width: 0 }}
                        animate={{ width: `${t.progress}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="tyre-num text-[12.5px] font-bold text-[var(--tyre-ink)]">
                      {formatINRShort(t.rate)}
                    </div>
                    <div className="tyre-num text-[9.5px] text-[var(--muted-foreground)]">
                      {formatINRShort(t.advance)} advance
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Notifications */}
        <section className="rounded-2xl border border-[var(--border)] bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-[var(--muted-foreground)]" />
            <h2 className="text-[14px] font-bold text-[var(--tyre-ink)]">Activity</h2>
          </div>
          <div className="space-y-3">
            {data.notifications.slice(0, 5).map((n) => (
              <div key={n.id} className="flex items-start gap-2.5">
                <span
                  className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                    n.type === "payment_received"
                      ? "bg-[var(--tyre-green-deep)]"
                      : n.type === "load_available"
                        ? "bg-[#4062E8]"
                        : n.type === "weather_alert"
                          ? "bg-[var(--tyre-ember)]"
                          : "bg-[var(--muted-foreground)]"
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-[var(--tyre-ink)]">{n.title}</div>
                  <div className="text-[11px] text-[var(--muted-foreground)] truncate">{n.body}</div>
                </div>
                {n.amount != null && (
                  <span className="ml-auto tyre-num text-[11.5px] font-bold text-[var(--tyre-green-deep)] shrink-0">
                    {formatINRShort(n.amount)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => setAppView("payments")}
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] py-2 text-[11.5px] font-semibold text-[var(--tyre-ink-soft)] hover:bg-[var(--muted)] transition-colors"
          >
            <Wallet className="w-3.5 h-3.5" />
            Go to payments
          </button>
        </section>
      </div>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${accent ? "bg-[var(--tyre-mint)]" : "bg-[var(--secondary)]"}`}>
      <div className={`tyre-num text-[15px] font-extrabold ${accent ? "text-[var(--tyre-green-deep)]" : "text-[var(--tyre-ink)]"}`}>
        {value}
      </div>
      <div className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)] mt-0.5">
        {label}
      </div>
    </div>
  );
}

export type { DashboardData };
