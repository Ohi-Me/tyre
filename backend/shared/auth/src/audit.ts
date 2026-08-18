/**
 * @tyre/auth/audit — append-only audit trail.
 *
 * Ported from axle-platform's `audit.service.ts`. TYRE's original three
 * source repos had no audit logging at all on auth or money-moving
 * actions, which the TYRE-Transformation-Report.md flagged under
 * "Missing Architecture" (idempotency / trust signals). This closes that
 * gap for auth events; the same helper should be called from the
 * payment/escrow and load-assignment routes as they're hardened.
 */

import { db } from "@tyre/db";

export interface AuditEntry {
  userId?: string | null;
  action: string; // e.g. "USER_LOGIN", "USER_REGISTERED", "ESCROW_RELEASED"
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType as any,
        entityId: entry.entityId,
        metadata: JSON.stringify(entry.metadata ?? {}),
        ipAddress: entry.ipAddress ?? null,
      },
    });
  } catch (err) {
    // Audit logging must never break the primary request flow.
    console.error("[audit] failed to record entry", entry.action, err);
  }
}
