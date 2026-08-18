"use client";

/**
 * Analytics — every chart on this screen is fed by live API data:
 * revenue + lanes from /api/v1/dashboard, marketplace activity and the
 * ₹49 fee revenue from /api/v1/freight/stats. No mock arrays.
 */
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { IndianRupee, Route, Store, TrendingUp } from "lucide-react";
import { SceneLoader } from "../loading/scene-loader";
import { useDashboard } from "@/lib/api/queries/dashboard";
import { useFreightStats } from "@/lib/api/queries/freight";

function formatINRShort(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n}`;
}
function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

const TYPE_COLORS = ["#F97316", "#3B82F6", "#8B5CF6", "#0EA5E9", "#06B6D4", "#10B981"];

const tooltipStyle = {
  background: "white",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: "12px",
  fontSize: "12px",
  boxShadow: "0 8px 24px -12px rgba(0,0,0,0.2)",
};

export function AnalyticsView() {
  const { data, isLoading } = useDashboard();
  const { data: freight } = useFreightStats();

  if (isLoading || !data) {
    return <SceneLoader scene="analytics" />;
  }

  const vehicleTypeData = (freight?.listings.by_vehicle_type ?? []).map((v, i) => ({
    name: v.vehicle_type,
    value: v.count,
    fill: TYPE_COLORS[i % TYPE_COLORS.length],
  }));

  const bookingsPerDay = (freight?.bookings.per_day ?? []).map((d) => ({
    day: new Date(d.date).toLocaleDateString("en-IN", { weekday: "short" }),
    bookings: d.bookings,
  }));

  return (
    <div className="p-5 sm:p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight text-[#1F2937]">Analytics</h1>
        <p className="text-[12.5px] text-[#6B7280] mt-0.5">
          Revenue, lanes and freight marketplace performance — live
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi
          label="Revenue · week"
          value={formatINRShort(data.insights.totalRevenue)}
          sub={`${data.insights.totalTrips} trips`}
          icon={TrendingUp}
          tone="bg-[#EBFBD6] text-[#3F8A12]"
        />
        <Kpi
          label="Avg revenue / trip"
          value={formatINRShort(data.insights.avgRevenuePerTrip)}
          sub={`${data.insights.onTimeDelivery}% on-time`}
          icon={IndianRupee}
          tone="bg-[#FFF3E0] text-[#F97316]"
        />
        <Kpi
          label="Marketplace bookings"
          value={String(freight?.bookings.total ?? 0)}
          sub={`${freight?.bookings.completed ?? 0} completed · ${freight?.bookings.cancelled ?? 0} cancelled`}
          icon={Store}
          tone="bg-[#EFF6FF] text-[#3B82F6]"
        />
        <Kpi
          label="Fee revenue (₹49/booking)"
          value={formatINR(freight?.fees.net_revenue ?? 0)}
          sub={`${freight?.fees.charged_count ?? 0} net fees collected`}
          icon={IndianRupee}
          tone="bg-[#1F2937] text-white"
        />
      </div>

      {/* Revenue trend */}
      <div className="rounded-2xl border border-black/[0.06] bg-white p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[14px] font-semibold text-[#1F2937]">Revenue trend</h2>
            <div className="text-[11.5px] text-[#6B7280]">Fleet revenue per day</div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#EBFBD6]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3F8A12] tyre-pulse-dot" />
            <span className="text-[10.5px] font-semibold text-[#3F8A12]">Live</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data.insights.revenuePoints} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F97316" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatINRShort(v)}
              width={56}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: "#71717A", fontWeight: 600 }}
              formatter={(v: number | string) => [formatINR(Number(v)), "Revenue"]}
            />
            <Area type="monotone" dataKey="revenue" stroke="#F97316" strokeWidth={2.5} fill="url(#revenueGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Marketplace bookings per day */}
        <div className="rounded-2xl border border-black/[0.06] bg-white p-5">
          <div className="mb-4">
            <h2 className="text-[14px] font-semibold text-[#1F2937]">Marketplace bookings · 7d</h2>
            <div className="text-[11.5px] text-[#6B7280]">
              Booking requests per day · {freight?.bookings.pending ?? 0} pending now
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={bookingsPerDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
              <Bar dataKey="bookings" fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Listings by vehicle type */}
        <div className="rounded-2xl border border-black/[0.06] bg-white p-5">
          <div className="mb-2">
            <h2 className="text-[14px] font-semibold text-[#1F2937]">Listings by vehicle type</h2>
            <div className="text-[11.5px] text-[#6B7280]">
              {freight?.listings.total ?? 0} listings · {freight?.listings.active ?? 0} available now
            </div>
          </div>
          {vehicleTypeData.length === 0 ? (
            <p className="text-[12px] text-[#9CA3AF] text-center py-16">No listings yet.</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={190}>
                <PieChart>
                  <Pie
                    data={vehicleTypeData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {vehicleTypeData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {vehicleTypeData.map((v) => (
                  <div key={v.name} className="flex items-center gap-2 text-[12px]">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: v.fill }} />
                    <span className="text-[#374151] flex-1">{v.name}</span>
                    <span className="font-bold text-[#1F2937] tabular-nums">{v.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lane leaderboard — from real loads */}
      <div className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden">
        <div className="p-4 border-b border-black/[0.06] flex items-center gap-2">
          <Route className="w-4 h-4 text-[#6B7280]" />
          <h2 className="text-[14px] font-semibold text-[#1F2937]">Lane leaderboard</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-[#FAFAFA] text-[10.5px] uppercase tracking-wider text-[#71717A]">
                <th className="text-left px-4 py-2.5 font-semibold">Lane</th>
                <th className="text-right px-4 py-2.5 font-semibold">Loads</th>
                <th className="text-right px-4 py-2.5 font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.insights.topRoutes.map((r, i) => (
                <tr key={`${r.origin}-${r.destination}`} className="border-t border-black/[0.04] hover:bg-[#FAFAFA]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-[#a1a1aa] w-4">{i + 1}</span>
                      <span className="font-semibold text-[#1F2937]">
                        {r.origin} → {r.destination}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{r.tripsCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold">{formatINRShort(r.revenue)}</td>
                </tr>
              ))}
              {data.insights.topRoutes.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-[#9CA3AF]">
                    No lane data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof TrendingUp;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="text-[20px] font-bold tracking-tight text-[#1F2937] tabular-nums">{value}</div>
      <div className="text-[11.5px] text-[#71717A] mt-0.5">{label}</div>
      <div className="text-[10px] text-[#9CA3AF] mt-0.5">{sub}</div>
    </div>
  );
}
