"use client";

import { useState } from "react";
import { useTyreUI } from "@/lib/tyre/store";
import { User, Bell, Globe, Shield, CreditCard, LogOut } from "lucide-react";

export function SettingsView() {
  const { exitToLanding } = useTyreUI();
  const [activeTab, setActiveTab] = useState<"profile" | "notifications" | "billing" | "security">("profile");

  return (
    <div className="p-5 sm:p-8 max-w-5xl mx-auto">
      <div className="mb-7">
        <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-[#181410] mb-2">
          Settings
        </h1>
        <p className="text-[13.5px] text-[#71717A]">
          Manage your account, notifications, billing, and security
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Tabs */}
        <aside className="space-y-1">
          {[
            { id: "profile", label: "Profile", icon: User },
            { id: "notifications", label: "Notifications", icon: Bell },
            { id: "billing", label: "Billing", icon: CreditCard },
            { id: "security", label: "Security", icon: Shield },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                activeTab === t.id
                  ? "bg-[#181410] text-white"
                  : "text-[#3f3f46] hover:bg-black/[0.04]"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
          <div className="h-px bg-black/[0.06] my-2" />
          <button
            onClick={exitToLanding}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-[#71717A] hover:bg-black/[0.04]"
          >
            <LogOut className="w-3.5 h-3.5" />
            Exit to landing
          </button>
        </aside>

        {/* Panel */}
        <div className="lg:col-span-3 rounded-2xl border border-black/[0.06] bg-white p-6">
          {activeTab === "profile" && (
            <div>
              <h2 className="text-[14px] font-semibold text-[#181410] mb-1">Profile</h2>
              <p className="text-[12px] text-[#71717A] mb-5">
                Your fleet operator profile on TYRE
              </p>

              <div className="flex items-center gap-4 mb-5 pb-5 border-b border-black/[0.06]">
                <div className="w-16 h-16 rounded-2xl tyre-bg-gradient flex items-center justify-center text-white text-[18px] font-bold">
                  VY
                </div>
                <div>
                  <div className="text-[15px] font-bold text-[#181410]">Vikas Yadav</div>
                  <div className="text-[12px] text-[#71717A]">Fleet operator · Shahi Garage · Patna</div>
                  <button className="text-[11.5px] font-semibold text-[#8FE03A] mt-1 hover:underline">
                    Change avatar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full name" value="Vikas Yadav" />
                <Field label="Phone" value="+91 98350 11234" />
                <Field label="UPI ID" value="shahi.garage@upi" />
                <Field label="GSTIN" value="10AAACS1234M1Z5" />
                <Field label="Languages" value="Hindi · Bhojpuri · English" />
                <Field label="Joined" value="312 days ago" />
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button className="px-4 py-2 rounded-full text-[12.5px] font-semibold text-[#3f3f46] hover:bg-black/[0.04]">
                  Cancel
                </button>
                <button className="px-4 py-2 rounded-full bg-[#181410] text-white text-[12.5px] font-semibold hover:bg-[#27272A]">
                  Save changes
                </button>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div>
              <h2 className="text-[14px] font-semibold text-[#181410] mb-5">Notifications</h2>
              <div className="space-y-4">
                {[
                  { label: "New load matches", sub: "When a load matches your truck type", on: true },
                  { label: "Payment released", sub: "UPI advance or balance release", on: true },
                  { label: "Trip status changes", sub: "Loading, in-transit, delivered", on: true },
                  { label: "Trust score change", sub: "When your score moves ±5 points", on: false },
                  { label: "WhatsApp voice bot", sub: "Voice notes when you have no smartphone", on: true },
                ].map((n) => (
                  <div
                    key={n.label}
                    className="flex items-center justify-between py-3 border-b border-black/[0.04] last:border-0"
                  >
                    <div>
                      <div className="text-[13px] font-semibold text-[#181410]">{n.label}</div>
                      <div className="text-[11.5px] text-[#71717A]">{n.sub}</div>
                    </div>
                    <div
                      className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${
                        n.on ? "tyre-bg-gradient" : "bg-[#E4E4E7]"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                          n.on ? "left-[18px]" : "left-0.5"
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "billing" && (
            <div>
              <h2 className="text-[14px] font-semibold text-[#181410] mb-5">Billing</h2>
              <div className="rounded-2xl bg-[#181410] text-white p-5 mb-5">
                <div className="text-[11px] uppercase tracking-wider text-white/60 mb-2">
                  Current plan
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[28px] font-bold">Broker</span>
                  <span className="text-white/60 text-[13px]">· ₹2,000/mo</span>
                </div>
                <div className="text-[11.5px] text-white/55 mt-1">
                  Renews Aug 12, 2026 · 47 loads posted this month
                </div>
                <button className="mt-4 px-3 py-1.5 rounded-full bg-white text-[#181410] text-[11.5px] font-semibold">
                  Manage plan
                </button>
              </div>
              <div className="space-y-2">
                {["Jul 2026 · ₹2,000", "Jun 2026 · ₹2,000", "May 2026 · ₹2,000"].map((b) => (
                  <div
                    key={b}
                    className="flex items-center justify-between p-3 rounded-lg border border-black/[0.06]"
                  >
                    <div className="text-[12.5px] font-semibold text-[#181410]">{b}</div>
                    <button className="text-[11.5px] font-semibold text-[#8FE03A] hover:underline">
                      Invoice
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div>
              <h2 className="text-[14px] font-semibold text-[#181410] mb-5">Security</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl border border-black/[0.06]">
                  <div>
                    <div className="text-[13px] font-semibold text-[#181410]">Two-factor authentication</div>
                    <div className="text-[11.5px] text-[#71717A]">SMS OTP at every login</div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[10.5px] font-semibold">
                    Enabled
                  </span>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl border border-black/[0.06]">
                  <div>
                    <div className="text-[13px] font-semibold text-[#181410]">UPI PIN</div>
                    <div className="text-[11.5px] text-[#71717A]">Required for all escrow releases</div>
                  </div>
                  <button className="text-[11.5px] font-semibold text-[#8FE03A] hover:underline">
                    Reset PIN
                  </button>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl border border-black/[0.06]">
                  <div>
                    <div className="text-[13px] font-semibold text-[#181410]">Active sessions</div>
                    <div className="text-[11.5px] text-[#71717A]">2 devices · Patna iPhone 14, Ranchi Chrome</div>
                  </div>
                  <button className="text-[11.5px] font-semibold text-[#71717A] hover:text-[#181410]">
                    Manage
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-[#71717A] mb-1.5">{label}</div>
      <div className="h-10 px-3 flex items-center rounded-lg bg-[#F4F4F5] text-[13px] font-medium text-[#181410]">
        {value}
      </div>
    </div>
  );
}
