import { db } from "@/lib/db";

/**
 * notify() — the single primitive for emitting a notification.
 *
 * Always writes an in-app row immediately (this is what the bell/inbox and the
 * dashboard panel read). For external channels (push/sms/whatsapp/email) it
 * resolves the user's per-category preferences and returns the channels that
 * SHOULD be dispatched — the actual delivery is handed to the channel workers
 * (see NEXT.md Feature 5; the queue/worker layer is the documented extension
 * point). Keeping delivery out of the request path is deliberate.
 */
export const NOTIFICATION_CATEGORIES = ["load", "payment", "trip", "document", "weather", "system"] as const;
export const NOTIFICATION_CHANNELS = ["in_app", "push", "sms", "whatsapp", "email"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotifyInput {
  orgId?: string | null;
  userId?: string | null;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  amount?: number | null;
  data?: Record<string, unknown> | null;
  /** External channels to attempt in addition to in-app (preference-gated). */
  channels?: NotificationChannel[];
}

export interface NotifyResult {
  id: string;
  dispatchedChannels: NotificationChannel[];
  suppressedChannels: NotificationChannel[];
}

/** Returns the external channels enabled for this user+category (default on). */
async function enabledChannels(
  userId: string | null | undefined,
  category: string,
  requested: NotificationChannel[],
): Promise<{ enabled: NotificationChannel[]; suppressed: NotificationChannel[] }> {
  if (!userId || requested.length === 0) return { enabled: [], suppressed: [] };
  let prefs: any[] = [];
  try {
    prefs = await (db as any).notificationPreference.findMany({ where: { userId, category } });
  } catch {
    // preferences table not migrated — default all requested to on
    return { enabled: requested, suppressed: [] };
  }
  const disabled = new Set(prefs.filter((p) => !p.enabled).map((p) => p.channel));
  const enabled = requested.filter((c) => !disabled.has(c));
  const suppressed = requested.filter((c) => disabled.has(c));
  return { enabled, suppressed };
}

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const external = (input.channels ?? []).filter((c) => c !== "in_app");
  const { enabled, suppressed } = await enabledChannels(input.userId, input.category, external);

  const row = await db.notification.create({
    data: {
      orgId: input.orgId ?? null,
      userId: input.userId ?? null,
      category: input.category,
      type: input.type,
      title: input.title,
      body: input.body,
      amount: input.amount ?? null,
      data: (input.data ?? undefined) as any,
      channel: "in_app",
      read: false,
    },
  });

  // Extension point: enqueue delivery jobs for `enabled` external channels here
  // (BullMQ workers per NEXT.md Feature 5). In-app is already delivered above.

  return {
    id: row.id,
    dispatchedChannels: ["in_app", ...enabled] as NotificationChannel[],
    suppressedChannels: suppressed,
  };
}
