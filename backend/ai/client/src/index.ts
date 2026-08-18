/**
 * @tyre/ai-client — TypeScript HTTP client for the Python ai-gateway service.
 *
 * The Next.js web app calls this client, which routes to backend/ai/gateway (FastAPI).
 * Falls back to in-process Groq calls only when AI_GATEWAY_URL is unset (dev mode).
 */

import type {
  VoiceRequest,
  VoiceResponse,
  NegotiationInput,
  NegotiationResult,
  PricingInput,
  PricingResult,
  DispatchInput,
  DispatchResult,
  FraudInput,
  FraudResult,
  CopilotChatInput,
} from "@tyre/shared";

const GATEWAY_URL = process.env.AI_GATEWAY_URL ?? "";

/**
 * Escrow result types (TYRE v1.1 item #15).
 *
 * These mirror the Python dataclasses in
 * `backend/ai/gateway/app/ai/payments/upi_escrow.py` field-for-field, so a mismatch
 * between what the gateway returns and what a BFF route destructures is caught at
 * compile time instead of at runtime in the money path.
 */
export interface EscrowFundResult {
  success: boolean;
  razorpay_account_id: string;
  total_funded_inr: number;
  advance_amount_inr: number;
  balance_amount_inr: number;
  tyre_fee_inr: number;
  status: "FUNDED" | "FAILED";
  funding_latency_ms: number;
  simulated: boolean;
  error?: string;
}

export interface EscrowAdvanceResult {
  success: boolean;
  razorpay_transfer_id: string;
  upi_transaction_ref: string;
  amount_released_inr: number;
  release_latency_ms: number;
  driver_notified: boolean;
  simulated: boolean;
  error?: string;
}

export interface EscrowBalanceResult {
  success: boolean;
  razorpay_transfer_id: string;
  upi_transaction_ref: string;
  amount_released_inr: number;
  tyre_fee_inr: number;
  release_latency_ms: number;
  driver_notified: boolean;
  broker_notified: boolean;
  simulated: boolean;
  error?: string;
}

/** Envelope the /wedge/escrow/* routes wrap the dataclass in. */
export interface EscrowResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface EscrowFundInput {
  broker_id: string;
  load_id: string;
  load_amount_inr: number;
  advance_amount_inr: number;
}

export interface EscrowAdvanceInput {
  escrow_account_id: string;
  driver_phone: string;
  driver_upi_id: string;
  load_id: string;
  advance_amount_inr: number;
}

export interface EscrowBalanceInput {
  escrow_account_id: string;
  driver_phone: string;
  driver_upi_id: string;
  trip_id: string;
  load_id: string;
  balance_amount_inr: number;
  trigger: "GPS_POD" | "CONSIGNEE_CONFIRM" | "MANUAL";
  trigger_ref: string;
}

/**
 * SH-C4 fix: typed errors. Previously the client threw `new Error(...)` with the
 * gateway response body in the message — leaking internal state to BFF logs and
 * giving callers no way to distinguish timeout vs 5xx vs network error.
 *
 * SH-C5 fix: timeout + circuit breaker. Previously fetch() had no timeout — a
 * hung gateway request held a BFF worker indefinitely. Now uses AbortController
 * with a configurable timeout (default 30s) and a simple circuit breaker that
 * opens after 5 consecutive failures.
 *
 * SH-C4 fix: Authorization header. Previously no auth header was sent. Now sends
 * `Authorization: Bearer <TYRE_INTERNAL_SERVICE_TOKEN>` on every call, matching
 * the InternalAuthMiddleware on the gateway side.
 */

const GATEWAY_TIMEOUT_MS = Number(process.env.AI_GATEWAY_TIMEOUT_MS ?? 30_000);
const INTERNAL_TOKEN = process.env.TYRE_INTERNAL_SERVICE_TOKEN ?? "";

// Simple circuit breaker state (module-level, persists across requests in a single Node process)
let _consecutiveFailures = 0;
let _circuitOpenUntil = 0;
const CIRCUIT_OPEN_THRESHOLD = 5;
const CIRCUIT_OPEN_DURATION_MS = 30_000;  // 30s cooldown

/** SH-C6: typed error hierarchy. Callers can `catch (e) { if (e instanceof GatewayTimeoutError) ... }` */
export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly status: number,
    cause?: unknown,
  ) {
    super(message);
    this.name = "GatewayError";
    if (cause !== undefined) {
      // Assign cause via Object.defineProperty to avoid the `override` requirement
      Object.defineProperty(this, "cause", { value: cause, writable: false, configurable: false });
    }
  }
}
export class GatewayTimeoutError extends GatewayError {
  constructor(path: string, timeoutMs: number) {
    super(`Gateway timed out after ${timeoutMs}ms`, path, 0);
    this.name = "GatewayTimeoutError";
  }
}
export class GatewayUnavailableError extends GatewayError {
  constructor(path: string, cause: unknown) {
    super("Gateway unreachable (network error)", path, 0, cause);
    this.name = "GatewayUnavailableError";
  }
}
export class CircuitOpenError extends GatewayError {
  constructor(path: string) {
    super(`Circuit breaker open (too many consecutive failures)`, path, 503);
    this.name = "CircuitOpenError";
  }
}

function _recordSuccess() {
  _consecutiveFailures = 0;
  _circuitOpenUntil = 0;
}
function _recordFailure() {
  _consecutiveFailures++;
  if (_consecutiveFailures >= CIRCUIT_OPEN_THRESHOLD) {
    _circuitOpenUntil = Date.now() + CIRCUIT_OPEN_DURATION_MS;
    console.error(
      `[ai-client] circuit breaker opened after ${_consecutiveFailures} consecutive failures — ` +
      `fast-failing for ${CIRCUIT_OPEN_DURATION_MS}ms`
    );
  }
}
function _isCircuitOpen(): boolean {
  if (_circuitOpenUntil === 0) return false;
  if (Date.now() >= _circuitOpenUntil) {
    _circuitOpenUntil = 0;
    _consecutiveFailures = 0;  // half-open: allow one request through
    return false;
  }
  return true;
}

async function gatewayPost<T>(path: string, body: unknown): Promise<T> {
  if (!GATEWAY_URL) {
    throw new GatewayError(
      "AI_GATEWAY_URL is not set. Set it to point to backend/ai/gateway, " +
      "or use the in-process fallback (dev only) by importing from @tyre/ai-client/fallback.",
      path, 0,
    );
  }
  if (!INTERNAL_TOKEN) {
    throw new GatewayError(
      "TYRE_INTERNAL_SERVICE_TOKEN is not set. The gateway rejects all unauthenticated requests.",
      path, 0,
    );
  }
  if (_isCircuitOpen()) {
    throw new CircuitOpenError(path);
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), GATEWAY_TIMEOUT_MS);
  try {
    const res = await fetch(`${GATEWAY_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${INTERNAL_TOKEN}`,  // SH-C4 fix
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      _recordFailure();
      // SH-C6 fix: do NOT leak response body into error message — log server-side only
      const status = res.status;
      console.error(`[ai-client] ${path} failed: ${status}`);
      throw new GatewayError(`Gateway returned ${status}`, path, status);
    }
    _recordSuccess();
    return res.json() as Promise<T>;
  } catch (err: unknown) {
    if (err instanceof GatewayError) throw err;  // already typed above
    if (err instanceof Error && err.name === "AbortError") {
      _recordFailure();
      throw new GatewayTimeoutError(path, GATEWAY_TIMEOUT_MS);
    }
    // Network error (ECONNREFUSED, DNS, etc.)
    _recordFailure();
    throw new GatewayUnavailableError(path, err);
  } finally {
    clearTimeout(timeout);
  }
}

export const aiClient = {
  /** POST /voice/process — STT → NLU → MT → TTS pipeline */
  voice: (req: VoiceRequest) =>
    gatewayPost<VoiceResponse>("/voice/process", req),

  /** POST /agents/negotiate — game-theory counter-offer agent */
  negotiate: (input: NegotiationInput) =>
    gatewayPost<NegotiationResult>("/agents/negotiate", input),

  /** POST /agents/dispatch — load matching agent */
  dispatch: (input: DispatchInput) =>
    gatewayPost<DispatchResult>("/agents/dispatch", input),

  /** POST /agents/pricing — rate calculation with cost breakdown */
  pricing: (input: PricingInput) =>
    gatewayPost<PricingResult>("/agents/pricing", input),

  /** POST /agents/fraud — broker risk assessment */
  fraud: (input: FraudInput) =>
    gatewayPost<FraudResult>("/agents/fraud", input),

  /** POST /agents/copilot — chat with the operator copilot */
  copilot: (input: CopilotChatInput) =>
    gatewayPost<{ reply: string; timestamp: string }>("/agents/copilot", input),

  /**
   * Escrow — Phase 0 fix. `loads/assign` and `trips/[id]/complete` used to just write a
   * cosmetic `AgentLog` row claiming an advance/balance was released. These three calls
   * route to `backend/ai/gateway`'s real (sandbox) Razorpay-backed escrow service
   * (`app/ai/payments/upi_escrow.py`), which persists the actual ledger state back to
   * Postgres via `/api/v1/escrow/events` — see `docs/ARCHITECTURE.md` §6.
   */
  escrow: {
    fund: (input: EscrowFundInput) =>
      gatewayPost<EscrowResponse<EscrowFundResult>>("/wedge/escrow/fund", input),
    advance: (input: EscrowAdvanceInput) =>
      gatewayPost<EscrowResponse<EscrowAdvanceResult>>("/wedge/escrow/advance", input),
    balance: (input: EscrowBalanceInput) =>
      gatewayPost<EscrowResponse<EscrowBalanceResult>>("/wedge/escrow/balance", input),
  },

  /** GET /health — gateway health check (no auth required, exempt from circuit breaker) */
  health: async () => {
    if (!GATEWAY_URL) {
      throw new GatewayError("AI_GATEWAY_URL is not set", "/health", 0);
    }
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5_000);  // 5s for health check
    try {
      const res = await fetch(`${GATEWAY_URL}/health`, {
        signal: ctrl.signal,
        headers: INTERNAL_TOKEN ? { "authorization": `Bearer ${INTERNAL_TOKEN}` } : {},
      });
      if (!res.ok) {
        throw new GatewayError(`Health check failed: ${res.status}`, "/health", res.status);
      }
      return res.json() as Promise<{ status: string; agents: string[]; models: Record<string, string> }>;
    } catch (err: unknown) {
      if (err instanceof GatewayError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new GatewayTimeoutError("/health", 5_000);
      }
      throw new GatewayUnavailableError("/health", err);
    } finally {
      clearTimeout(timeout);
    }
  },
};
