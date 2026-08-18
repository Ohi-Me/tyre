"use client";

/**
 * Notifications bell — topbar dropdown inbox over /api/v1/notifications*.
 * Personal + org-broadcast rows, unread badge, mark-one / mark-all read.
 * Polls every 30s (no realtime transport yet — see NEXT.md §Realtime SSE).
 */
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Loader2, Package, Wallet, Route, FileWarning, CloudSun, Info } from "lucide-react";
import { useNotifications, useMarkNotificationsRead, type TyreNotification } from "@/lib/api/queries/notifications";

const CATEGORY_ICON: Record<string, typeof Bell> = {
  load: Package,
  payment: Wallet,
  trip: Route,
  document: FileWarning,
  weather: CloudSun,
  system: Info,
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useNotifications({ limit: 20 });
  const markRead = useMarkNotificationsRead();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  function markOne(n: TyreNotification) {
    if (n.read) return;
    markRead.mutate({ ids: [n.id] });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-full hover:bg-[rgba(18,16,11,0.05)] transition-colors"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
      >
        <Bell className="w-4 h-4 text-[var(--muted-foreground)]" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--tyre-ember)] text-white text-[9.5px] font-bold flex items-center justify-center leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] max-h-[420px] rounded-2xl border border-black/[0.08] bg-white shadow-[0_20px_45px_-15px_rgba(18,16,11,0.25)] overflow-hidden z-40 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06] shrink-0">
            <span className="text-[13px] font-bold text-[#181410]">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => markRead.mutate({ all: true })}
                disabled={markRead.isPending}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#71717A] hover:text-[#181410] disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto tyre-scroll flex-1">
            {isLoading ? (
              <div className="px-4 py-8 flex items-center justify-center text-[#a1a1aa]">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="w-5 h-5 text-[#a1a1aa] mx-auto mb-2" />
                <div className="text-[12px] font-semibold text-[#181410]">You're all caught up</div>
                <div className="text-[11px] text-[#71717A] mt-1">New assignments, payments, and alerts land here.</div>
              </div>
            ) : (
              items.map((n) => {
                const Icon = CATEGORY_ICON[n.category] ?? Info;
                return (
                  <button
                    key={n.id}
                    onClick={() => markOne(n)}
                    className={`w-full text-left px-4 py-3 border-b border-black/[0.04] last:border-0 hover:bg-[#FAFAFA] transition-colors flex items-start gap-2.5 ${
                      n.read ? "opacity-60" : ""
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                        n.read ? "bg-[#F4F4F5]" : "bg-[#FFF3EC]"
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${n.read ? "text-[#a1a1aa]" : "text-[#FF6A2B]"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12.5px] font-semibold text-[#181410] truncate">{n.title}</span>
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[var(--tyre-ember)] shrink-0" />}
                      </div>
                      <div className="text-[11.5px] text-[#71717A] mt-0.5 leading-snug line-clamp-2">{n.body}</div>
                      <div className="text-[10px] text-[#a1a1aa] mt-1">{timeAgo(n.created_at)}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
