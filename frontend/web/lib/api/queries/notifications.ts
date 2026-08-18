"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/api/auth-fetch";

export interface TyreNotification {
  id: string;
  org_id: string | null;
  user_id: string | null;
  category: string;
  type: string;
  title: string;
  body: string;
  amount: number | null;
  data: Record<string, unknown> | null;
  read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPreferenceRow {
  category: string;
  channels: Record<string, boolean>;
}

const notificationKeys = {
  all: ["notifications"] as const,
  list: (params: { read?: boolean; category?: string; limit?: number }) => ["notifications", "list", params] as const,
  preferences: ["notifications", "preferences"] as const,
};

/** Inbox: personal notifications + org broadcasts. Polled — no realtime transport yet. */
export function useNotifications(params?: { read?: boolean; category?: string; limit?: number }) {
  return useQuery<{ items: TyreNotification[]; unread: number }>({
    queryKey: notificationKeys.list(params ?? {}),
    queryFn: async () => {
      const search = new URLSearchParams();
      if (params?.read !== undefined) search.set("read", String(params.read));
      if (params?.category) search.set("category", params.category);
      search.set("limit", String(params?.limit ?? 20));
      const res = await authFetch(`/api/v1/notifications?${search.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch notifications: ${res.status}`);
      const json = await res.json();
      return { items: json.data ?? [], unread: json.meta?.unread ?? 0 };
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/** Mark specific ids (or the whole inbox) as read. */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ids?: string[]; all?: boolean }) => {
      const res = await authFetch("/api/v1/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) throw new Error(json?.error || `Failed: ${res.status}`);
      return json.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

/** The caller's per-category channel preference matrix. */
export function useNotificationPreferences() {
  return useQuery<NotificationPreferenceRow[]>({
    queryKey: notificationKeys.preferences,
    queryFn: async () => {
      const res = await authFetch("/api/v1/notifications/preferences");
      if (!res.ok) throw new Error(`Failed to fetch preferences: ${res.status}`);
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { category: string; channel: string; enabled: boolean }[]) => {
      const res = await authFetch("/api/v1/notifications/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) throw new Error(json?.error || `Failed: ${res.status}`);
      return json.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.preferences }),
  });
}
