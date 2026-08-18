"use client";

/**
 * Assign truck → load dialog. The load+truck picker over POST /api/v1/loads/assign
 * (RBAC loads:assign). Success releases the UPI advance (or reports why it
 * couldn't) — surfaced verbatim from the API's message field so dispatchers see
 * the real settlement outcome, not a generic "done" toast.
 */
import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLoads, useAssignLoad, type Load } from "@/lib/api/queries/loads";
import { useTrucks } from "@/lib/api/queries/trucks";
import { Loader2, Truck as TruckIcon, Package, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const OPEN_STATUSES = new Set(["NEW", "OPEN", "PENDING", "PUBLISHED"]);

function isUnassigned(l: Load) {
  return !["ASSIGNED", "IN_TRANSIT", "DELIVERED", "CANCELLED"].includes(l.status);
}

const selectCls =
  "w-full h-10 px-3 rounded-lg bg-[#F3F4F6] border border-transparent focus:border-[#F97316]/40 focus:bg-white focus:outline-none text-[13px] transition-colors disabled:opacity-60";
const labelCls = "block text-[11.5px] font-semibold text-[#374151] mb-1.5";

export function AssignDialog({
  open,
  onOpenChange,
  initialLoadId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialLoadId?: string | null;
}) {
  const { data: loads } = useLoads();
  const { data: trucks } = useTrucks();
  const assign = useAssignLoad();

  const [loadId, setLoadId] = useState("");
  const [truckId, setTruckId] = useState("");

  const openLoads = useMemo(() => (loads ?? []).filter(isUnassigned), [loads]);
  const idleTrucks = useMemo(() => (trucks ?? []).filter((t) => t.status === "IDLE"), [trucks]);

  useEffect(() => {
    if (open) {
      setLoadId(initialLoadId && openLoads.some((l) => l.id === initialLoadId) ? initialLoadId : "");
      setTruckId("");
    }
  }, [open, initialLoadId, openLoads]);

  const selectedLoad = openLoads.find((l) => l.id === loadId) ?? null;
  const selectedTruck = idleTrucks.find((t) => t.id === truckId) ?? null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!loadId || !truckId) {
      toast.error("Pick a load and a truck");
      return;
    }
    try {
      const result = await assign.mutateAsync({ load_id: loadId, truck_id: truckId });
      toast.success(result.message || `${result.load_code} assigned to ${result.truck_number}`);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Assignment failed";
      toast.error(msg.includes("403") ? "You do not have permission to assign loads" : msg);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-extrabold tracking-tight text-[#181410]">
            Assign truck to load
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3.5">
          <div>
            <label className={labelCls}>Load</label>
            <select className={selectCls} value={loadId} onChange={(e) => setLoadId(e.target.value)} disabled={assign.isPending}>
              <option value="">
                {openLoads.length === 0 ? "No open loads" : "Select a load…"}
              </option>
              {openLoads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.tyre_code} — {l.origin} → {l.destination} (₹{l.offered_rate.toLocaleString("en-IN")})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Truck</label>
            <select className={selectCls} value={truckId} onChange={(e) => setTruckId(e.target.value)} disabled={assign.isPending}>
              <option value="">
                {idleTrucks.length === 0 ? "No idle trucks available" : "Select a truck…"}
              </option>
              {idleTrucks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.vehicle_number} — {t.truck_type ?? "Truck"}{t.current_location ? ` · ${t.current_location}` : ""}
                </option>
              ))}
            </select>
          </div>

          {selectedLoad && selectedTruck && (
            <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#F8FAFC] border border-black/[0.05] text-[12px]">
              <div className="flex items-center gap-1.5 min-w-0 font-semibold text-[#181410]">
                <Package className="w-3.5 h-3.5 text-[#71717A] shrink-0" />
                <span className="truncate">{selectedLoad.tyre_code}</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-[#a1a1aa] shrink-0" />
              <div className="flex items-center gap-1.5 min-w-0 font-semibold text-[#181410]">
                <TruckIcon className="w-3.5 h-3.5 text-[#71717A] shrink-0" />
                <span className="truncate">{selectedTruck.vehicle_number}</span>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={assign.isPending || !loadId || !truckId}
            className="w-full h-11 rounded-xl bg-[#FF6A2B] hover:brightness-105 disabled:opacity-50 text-white text-[13.5px] font-semibold transition-all active:scale-[0.99] flex items-center justify-center gap-2"
          >
            {assign.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {assign.isPending ? "Assigning…" : "Assign & release advance"}
          </button>
          <p className="text-[10.5px] text-[#9CA3AF] text-center">
            Creates a trip and attempts to release the UPI advance to the driver.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
