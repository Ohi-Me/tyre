/**
 * In-memory fallback store so the whole app runs STANDALONE — no Postgres,
 * Redis or AI gateway required — for local frontend+backend development.
 *
 * This does NOT replace the real infra code: every route still has its real
 * Postgres/Redis path. Standalone mode (env `TYRE_STANDALONE=1`, set in
 * frontend/web/.env.local) simply short-circuits to this in-memory store so nothing
 * tries to dial Docker. Flip the flag off later to use the real datastores.
 *
 * Data lives on globalThis so it survives Next.js dev hot-reloads (but is lost
 * on a full server restart — it's a dev convenience, not a database).
 */

export function isStandalone(): boolean {
  const v = process.env.TYRE_STANDALONE;
  return v === "1" || v === "true";
}

export type Lead = {
  name: string;
  phone: string;
  role: string;
  message: string;
  ip: string;
  ts: string;
};

class DevStore {
  private kv = new Map<string, { v: string; exp?: number }>();
  leads: Lead[] = [];
  leadCount = 0;
  private subscribers = new Set<string>();

  /** Returns false if the email was already subscribed. */
  addSubscriber(email: string): boolean {
    if (this.subscribers.has(email)) return false;
    this.subscribers.add(email);
    return true;
  }
  subscriberCount(): number {
    return this.subscribers.size;
  }

  /** SET key if absent, with TTL (seconds). Returns true if it was set. */
  setNX(key: string, ttlSec: number): boolean {
    this.gc();
    if (this.kv.has(key)) return false;
    this.kv.set(key, { v: "1", exp: Date.now() + ttlSec * 1000 });
    return true;
  }

  pushLead(lead: Lead): number {
    this.leads.unshift(lead);
    if (this.leads.length > 1000) this.leads.length = 1000;
    return ++this.leadCount;
  }

  count(): number {
    return this.leadCount;
  }

  private gc() {
    const now = Date.now();
    for (const [k, e] of this.kv) if (e.exp && e.exp < now) this.kv.delete(k);
  }
}

const g = globalThis as unknown as { __tyreDevStore?: DevStore };

export function devStore(): DevStore {
  if (!g.__tyreDevStore) g.__tyreDevStore = new DevStore();
  return g.__tyreDevStore;
}
