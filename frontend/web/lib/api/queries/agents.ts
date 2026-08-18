"use client";

/**
 * React-query hook for the AI agent activity stream (/api/v1/agents/activity).
 *
 * Powers the "Agent activity" panel in the dispatch view. Previously that panel
 * read a hardcoded empty array; this wires it to the real AgentLog feed that the
 * dispatch/pricing/payment agents write to on every load assignment, negotiation,
 * and escrow event.
 */
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/api/auth-fetch";

export interface AgentEvent {
  id: string;
  agent_name: string;
  event_type: string;
  payload: Record<string, unknown>;
  latency_ms: number;
  success: boolean;
  timestamp: string;
}

export const agentKeys = {
  all: ["agents"] as const,
  activity: () => [...agentKeys.all, "activity"] as const,
};

export function useAgentActivity(options?: { refetchInterval?: number }) {
  return useQuery<AgentEvent[]>({
    queryKey: agentKeys.activity(),
    queryFn: async () => {
      const res = await authFetch("/api/v1/agents/activity");
      if (!res.ok) throw new Error(`Failed to fetch agent activity: ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || "Failed to fetch agent activity");
      return json.data ?? [];
    },
    // Near-real-time: poll every 10s by default so the dispatch board stays live.
    refetchInterval: options?.refetchInterval ?? 10_000,
    staleTime: 5_000,
  });
}
