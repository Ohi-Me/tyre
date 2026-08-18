# Webhook Registration Runbook

Both webhook **handlers** ship in the codebase. What remains is registering the URLs
in the Razorpay and Meta dashboards and setting the matching secrets. This is the
external half of TYRE v1.1 items #6 and #7.

## 1. Razorpay payout webhook (item #6)

Handler: `frontend/web/app/api/v1/webhooks/razorpay/route.ts` (HMAC-verified, already shipped).

1. Razorpay Dashboard → **Settings → Webhooks → Add New Webhook**.
2. URL: `https://<your-domain>/api/v1/webhooks/razorpay`
3. Secret: the value of `TYRE_RAZORPAY_WEBHOOK_SECRET` (must match the env/secret exactly).
4. Subscribe to events: `payout.processed`, `payout.failed`, `payout.reversed`.
5. Save, then fire a **sandbox** payout to confirm a live call arrives.

**Done when:** a sandbox payout completion/failure triggers a webhook call and
`UpiEscrowTransaction.status` updates to `SUCCESS` (confirmed) or `FAILED`.

## 2. WhatsApp inbound webhook (item #7)

Handlers:
- BFF (Meta-facing): `frontend/web/app/api/v1/webhooks/whatsapp/route.ts` — GET verification
  handshake + POST proxy.
- Gateway (processing): `POST /wedge/whatsapp/webhook` in `backend/ai/gateway/app/api/wedge.py`
  — parses Meta's envelope and dispatches to `driver_bot.py`.

1. Set `TYRE_WHATSAPP_VERIFY_TOKEN` (any random string: `openssl rand -hex 16`) in both
   the BFF env and the k8s secret.
2. Meta App Dashboard → **WhatsApp → Configuration → Webhook → Edit**.
3. Callback URL: `https://<your-domain>/api/v1/webhooks/whatsapp`
4. Verify token: the same `TYRE_WHATSAPP_VERIFY_TOKEN` value.
5. Click **Verify and Save** — Meta sends a GET `hub.challenge`; the route echoes it back.
6. Subscribe to the **messages** field.

**Done when:** Meta's dashboard shows the webhook as **Active** and a real inbound
message ("load chahiye") triggers `driver_bot.py` and a reply.

> Note: voice/image inbound messages arrive as media IDs that require a follow-up
> Graph API media download. The webhook currently flattens text/button/interactive
> messages inline; media handling is a follow-up (out of v1.1 scope).

## 3. Telegram inbound webhook (broker channel — Week 1 of the WhatsApp↔Telegram bridge)

Telegram is the **broker** side of the bridge. It's simpler than WhatsApp — no Meta
Business verification, no KYC, free unlimited messaging, no GET handshake. Auth is a
single shared `secret_token` header set when calling `/bot<token>/setWebhook`.

Handlers:
- BFF (Telegram-facing): `frontend/web/app/api/v1/webhooks/telegram/route.ts` — verifies
  `X-Telegram-Bot-Api-Secret-Token` and proxies to the gateway.
- Gateway (processing): `POST /wedge/telegram/webhook` in `backend/ai/gateway/app/api/wedge.py`
  — runs the broker bot and sends the reply via the bot client.

### 3.1 Create the bot

1. In Telegram, message [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, follow the prompts to name it (e.g. "TYRE Broker Bot") and pick a
   username ending in `bot` (e.g. `tyrebroker_bot`).
3. BotFather returns a bot token like `123456:ABC-DEF...`. Set it as `TYRE_TELEGRAM_BOT_TOKEN`
   in both the BFF env and the k8s secret.

### 3.2 Generate the webhook secret

```bash
# 1-256 chars of [A-Za-z0-9_-] per Telegram's spec.
openssl rand -hex 32
```

Set this as `TYRE_TELEGRAM_WEBHOOK_SECRET` in both the BFF env and the k8s secret. The
BFF will reject any inbound webhook whose `X-Telegram-Bot-Api-Secret-Token` header
doesn't match; the gateway re-verifies the same header (defence in depth).

### 3.3 Register the webhook with Telegram

Run this once after deploying (or any time the public URL changes):

```bash
# From any shell with the gateway's Python env available:
python -c "
import asyncio
from app.config import settings
from app.ai.telegram.bot_client import set_webhook, get_me

async def main():
    me = await get_me()
    print('Bot identity:', me)
    result = await set_webhook(
        webhook_url='https://<your-domain>/api/v1/webhooks/telegram',
        secret_token=settings.telegram_webhook_secret,
    )
    print('setWebhook:', result)

asyncio.run(main())
"
```

Idempotent — calling it again with the same URL just refreshes the secret. To unset
the webhook (e.g. for local dev with `getUpdates` polling), call `setWebhook` with
`webhook_url=""`.

### 3.4 Broker onboarding flow

Brokers link their Telegram chat to their Broker row via:

1. Open `https://t.me/<your-bot-username>` in Telegram.
2. Tap **Start** (or send `/start`). The bot greets them with link instructions.
3. Send `/link BRK-CODE +91XXXXXXXXXX` (e.g. `/link BRK-PAT-001 +919876543210`). The
   broker code is shown in the TYRE dashboard; the phone must match what's on file.
4. On success, the bot confirms the link. From then on, every load request, GPS
   arrival, and payment confirmation for that broker is pushed to this Telegram chat.

Optional deep-link onboarding: share `https://t.me/<bot>?start=BRK-PAT-001` from the
dashboard. Tapping it opens the bot with `/start BRK-PAT-001` pre-filled, which
attempts the link immediately (still requires the broker to send their phone in a
follow-up `/link` if the phone check is enforced — Week 2 will add OTP).

**Done when:** a broker can `/link`, see `/status` confirm the link, and `/loads`
returns their open loads with inline broadcast/cancel buttons.

> Note: Week 1 ships the bot, webhook, broker onboarding, and proactive send paths
> (load request push, payment confirmation push). The actual cross-channel routing
> (driver WhatsApp → broker Telegram and vice versa) ships in Week 2 as the bridge
> agent (`app/agents/bridge.py`); Week 3 adds the nearby-driver broadcast.

## 4. Bridge agent — cross-channel routing (Week 2 of the WhatsApp↔Telegram bridge)

The bridge agent (`backend/ai/gateway/app/agents/bridge.py`) is the single source
of truth for "when X happens on side A, what should side B see?" It subscribes to
events from both bots and routes notifications to the other channel.

### 4.1 Event flow

```
Driver (WhatsApp)                  Bridge Agent                Broker (Telegram)
     │                                  │                            │
     │── "load chahiye" ───────────────▶│                            │
     │   (driver_load_search)            │── 📦 New load req ───────▶│
     │                                  │   from Ramesh              │
     │                                  │   Patna→Delhi              │
     │                                  │                            │
     │── "1" (accept) ─────────────────▶│                            │
     │   (driver_load_accept)            │── ✅ Load accepted ──────▶│
     │                                  │   TYRE-0001 · ₹10K adv     │
     │                                  │                            │
     │── "loaded" ─────────────────────▶│                            │
     │   (driver_status_loaded)          │── 📦 Cargo loaded ───────▶│
     │                                  │   🚛 BR01GA1234 in transit │
     │                                  │                            │
     │── "reached Delhi" ──────────────▶│                            │
     │   (driver_status_reached)         │── 📍 Reached destination ▶│
     │                                  │   GPS verified ✅          │
     │                                  │                            │
     │── POD photo ────────────────────▶│                            │
     │   (driver_pod_uploaded)           │── 📸 POD uploaded ───────▶│
     │                                  │   Waiting for consignee    │
     │                                  │                            │
     │── "truck kharab" ───────────────▶│                            │
     │   (driver_emergency)              │── 🚨 DRIVER EMERGENCY ───▶│
     │                                  │   Ramesh · +91... · NH48   │
     │                                  │                            │
     │                                  │◀── ❌ Cancel ──────────────│
     │◀─ "Load cancelled by broker" ────│   (broker_cancel_load)     │
     │   (WhatsApp push)                 │── ✅ Cancelled ──────────▶│
     │                                  │   Driver notified ✅       │
     │                                  │                            │
     │◀─ "₹35,000 balance released" ────│◀── 💰 Release Balance ─────│
     │   (WhatsApp push)                 │   (broker_release_balance) │
     │                                  │── ✅ Balance released ───▶│
     │                                  │   ₹35K · upi_xyz_789       │
```

### 4.2 Driver → Broker events (WhatsApp → Telegram)

The WhatsApp driver bot calls `_fire_bridge_event()` (defined at the bottom of
`driver_bot.py`) at each driver event point. The bridge agent resolves the
linked broker's Telegram chat_id via one of:
  - explicit `broker_chat_id` field (when the caller already knows it)
  - `tyre_code` → `GET /api/v1/loads/by-tyre-code` → broker's telegram_chat_id
  - `driver_phone` → `GET /api/v1/trips/active` → load → broker's telegram_chat_id

If no linked broker is found, the event is a no-op (logged, not an error).

| Event                  | When fired                                  | Broker gets                                          |
|------------------------|---------------------------------------------|------------------------------------------------------|
| `driver_load_search`   | Driver WhatsApps "load chahiye"             | 📦 New load req · driver name + phone + route        |
| `driver_load_accept`   | Driver replies "1" / "accept TYRE-XXXX"     | ✅ Load accepted · advance amount                    |
| `driver_status_loaded` | Driver replies "loaded"                     | 📦 Cargo loaded · truck number · in transit          |
| `driver_status_reached`| Driver replies "reached"                    | 📍 Reached destination · GPS verified                |
| `driver_pod_uploaded`  | Driver sends POD photo                      | 📸 POD uploaded · photo link · waiting for consignee |
| `driver_emergency`     | Driver sends "help" / "truck kharab"        | 🚨 DRIVER EMERGENCY · driver + description           |

### 4.3 Broker → Driver events (Telegram → WhatsApp)

The Telegram broker bot's callback router (`_route_callback` in `broker_bot.py`)
dispatches `cancel`, `release`, and `broadcast` button presses to the bridge
agent. The bridge calls the real BFF route, then pushes a WhatsApp notification
to the driver and acks the broker back on Telegram.

| Event                     | Trigger                           | BFF route called                          | Driver gets (WhatsApp)              | Broker gets (Telegram ack)         |
|---------------------------|-----------------------------------|-------------------------------------------|-------------------------------------|------------------------------------|
| `broker_cancel_load`      | Broker presses ❌ Cancel          | `POST /api/v1/loads/cancel`               | "⚠️ Load cancelled by broker"       | "❌ Cancelled · DB updated ✅"     |
| `broker_release_balance`  | Broker presses 💰 Release Balance | `POST /api/v1/trips/release-balance`      | "✅ ₹X balance released · UPI ref"  | "✅ Balance released · amount + ref"|
| `broker_broadcast`        | Broker presses 📢 Broadcast      | (Week 3 stub — no BFF call yet)           | (none yet)                          | "📢 Broadcast queued (Week 3)"     |

### 4.4 Payment agent → broker Telegram

The Payment agent (`app/agents/payment.py`) fires `payment_advance` and
`payment_balance` events to the bridge agent whenever money actually moves
(Razorpay advance or balance release). The bridge pushes a confirmation to the
linked broker's Telegram. The driver gets their WhatsApp confirmation separately
(from `driver_bot.send_payment_confirmation` for advances, or
`consignee_confirm._notify_parties` for balances) — the bridge's job here is
only the broker leg.

### 4.5 New BFF routes (Week 2)

| Route                                          | Auth           | Purpose                                                       |
|------------------------------------------------|----------------|---------------------------------------------------------------|
| `POST /api/v1/loads/cancel`                    | internal-svc   | Cancel a load by tyre_code; frees the truck + cancels the trip|
| `GET  /api/v1/loads/by-tyre-code?code=TYRE-XX` | internal-svc   | Load + broker telegram_chat_id lookup (for bridge resolution) |
| `GET  /api/v1/trips/active?driver_phone=...`   | internal-svc   | Driver's current PLANNED/IN_PROGRESS trip + broker info       |
| `POST /api/v1/trips/release-balance`           | internal-svc   | Broker-initiated balance release → PaymentAgent → Razorpay    |

All four are `requireInternalService` gated (shared bearer token, no end-user
JWT). The broker's identity is verified earlier in the flow by the broker bot's
`/link` command before they ever see the action buttons, so no RBAC is needed
on these routes.

### 4.6 Failure-mode contract

The bridge agent follows the same "fail loud in logs, not silently" rule as the
rest of the codebase:

1. **Bridge failures never crash the caller.** `_fire_bridge_event()` in both
   `driver_bot.py` and `payment.py` wraps the bridge call in a try/except and
   logs the error. A Telegram outage on the broker side must never delay a
   driver's WhatsApp reply, and a bridge bug must never crash a money-moving
   flow.
2. **No linked broker = no-op, not an error.** If no broker is linked to the
   driver's active trip, the event is dropped with `reason: no_linked_broker`
   in the AgentResult data. This is the common case during onboarding.
3. **BFF failures surface to the broker.** If `broker_cancel_load` or
   `broker_release_balance` fails at the BFF, the broker gets a Telegram ack
   saying "⚠️ failed" so they know to retry from the dashboard.
4. **Money-moving logic stays in the Payment agent.** The bridge never calls
   Razorpay directly — `broker_release_balance` calls the BFF route which calls
   the Payment agent, keeping all money-moving logic in one audited place.

## 5. Nearby-driver broadcast (Week 3 of the WhatsApp↔Telegram bridge)

The highest-ROI feature for the Indian trucking wedge. Currently brokers call
10-20 drivers to find a truck for a load; this collapses it to 1 tap on
Telegram + 30 seconds of WhatsApp delivery. The first broker who can fill a
truck in 5 minutes instead of 60 wins every shipper — that's the marketplace
moat.

### 5.1 Architecture

```
Broker (Telegram)              Bridge Agent              Broadcast Service           BFF                    Driver (WhatsApp)
     │                              │                          │                       │                          │
     │── 📢 Broadcast ─────────────▶│                          │                       │                          │
     │   (broker_broadcast)          │                          │                       │                          │
     │                              │── resolve load ─────────▶│                       │                          │
     │                              │   (origin GPS)            │                       │                          │
     │                              │── anti-spam check ──────▶│                       │                          │
     │                              │   (≤3/load/10min)         │                       │                          │
     │                              │                          │── find nearby ───────▶│                          │
     │                              │                          │   drivers (50km)       │                          │
     │                              │                          │◀─ drivers[] ─────────│                          │
     │                              │                          │                          │                          │
     │                              │                          │── WhatsApp blast ─────────────────────────────────▶│ (driver 1)
     │                              │                          │── WhatsApp blast ─────────────────────────────────▶│ (driver 2)
     │                              │                          │── WhatsApp blast ─────────────────────────────────▶│ (driver 3)
     │                              │                          │   ...up to 50…                                     │
     │                              │                          │                          │                          │
     │                              │                          │── persist BroadcastLog ▶│                          │
     │                              │                          │   (audit + anti-spam)    │                          │
     │                              │◀─ BroadcastResult ───────│                       │                          │
     │◀─ "✅ 47 drivers notified" ──│                          │                       │                          │
     │   (with top 3 closest)        │                          │                       │                          │
     │                              │                          │                       │                          │
     │                              │                          │                       │◀─ "accept TYRE-0001" ────│ (first driver)
     │                              │                          │                       │   → load assigned         │
```

### 5.2 Components

| Component | File | Role |
|-----------|------|------|
| Broadcast service | `backend/ai/gateway/app/ai/broadcast/nearby_driver_broadcast.py` | Orchestrates the blast: query → cap → concurrent WhatsApp sends → persist log |
| Bridge agent hook | `backend/ai/gateway/app/agents/bridge.py::_on_broker_broadcast` | Resolves load GPS, runs anti-spam check, calls service, acks broker |
| Programmatic route | `POST /wedge/broadcast/nearby-drivers` | For dashboard / API callers (broker Telegram button goes through bridge instead) |
| Nearby query | `GET /api/v1/drivers/nearby` | BFF route — bounding-box SQL + haversine + per-driver rate limit |
| Anti-spam check | `GET /api/v1/loads/[code]/broadcast-allowed` | BFF route — ≤3 broadcasts/load/10min |
| Log persistence | `POST /api/v1/broadcasts` | BFF route — writes BroadcastLog row |
| History | `GET /api/v1/loads/[code]/broadcasts` | BFF route — last 50 broadcasts for a load |

### 5.3 Anti-spam rules

Two layers of rate limiting, both enforced by the BFF:

1. **Per-load** (`/loads/[code]/broadcast-allowed`): a broker can broadcast the
   same load at most **3 times in 10 minutes**. Prevents a frustrated broker
   from spamming the same load every 30 seconds. Returns `{allowed, reason,
   recent_count, max, window_min}`.

2. **Per-driver** (inside `/drivers/nearby`): a driver receives at most **5
   broadcasts per hour**. Drivers over the limit are silently filtered out of
   the nearby query before the blast — the broker can still broadcast the load,
   just not to those drivers. Queried from `BroadcastLog.outcomes` JSON (last
   1 hour of rows).

There's also a hard cap of **50 drivers per blast** (`MAX_DRIVERS_PER_BLAST`),
enforced in the broadcast service. This is well within the WhatsApp Business
API's 1000 business-initiated conversations / 24h limit, and keeps the blast
focused on the closest matches.

### 5.4 Nearby query — no PostGIS dependency

The query uses a **bounding-box pre-filter in SQL** followed by an **in-app
haversine distance check**:

```sql
-- Pre-filter: drivers inside a ±0.45° box around the origin (50km / 111km/deg)
SELECT * FROM drivers
WHERE status = 'AVAILABLE'
  AND current_lat BETWEEN :min_lat AND :max_lat
  AND current_lng BETWEEN :min_lng AND :max_lng
  AND deleted_at IS NULL
  AND (:truck_type IS NULL OR truck_type = :truck_type)
```

Then in TypeScript, the route computes `haversineKm(origin, driver.currentLat/Lng)`
for each candidate, filters to `<= radius_km`, sorts ascending, and caps at 50.

This is correct for the 50km radii Y1 uses (the box is ±0.45° which is ~50km
at India's latitude). PostGIS is the right answer at 10K+ drivers or for
arbitrary polygon queries; for the wedge we keep it dependency-free.

### 5.5 Localization

The WhatsApp load offer is sent in the driver's preferred locale (hi / bho / en),
falling back to English for any unknown locale. Each offer includes:
- 🔖 Load code (TYRE-XXXX)
- 📍 Origin label + → destination
- 📏 Distance from driver's current location
- 💰 Rate (₹X)
- 💸 Advance (₹Y)
- 🚛 Truck type required
- "Reply 'accept TYRE-XXXX' to accept"

The first driver to reply `accept TYRE-XXXX` on WhatsApp gets the load (the
existing WhatsApp driver bot's `_handle_load_accept` handles this — no new
code needed).

### 5.6 Failure-mode contract

1. **Per-driver failures don't stop the blast.** Each WhatsApp send returns a
   `BroadcastOutcome` (delivered / failed / skipped), never raises. One
   driver's WhatsApp failure must not stop the other 49.
2. **Bounded concurrency.** WhatsApp sends are fanned out 10 at a time
   (`PER_DRIVER_SEND_CONCURRENCY`) to avoid thundering herd on Meta's API.
3. **BroadcastLog persistence is best-effort.** If the BFF is unavailable,
   the broadcast still ran; we just lose the audit trail (logged, not crashed).
4. **Service failures return BroadcastResult, never raise.** A BFF timeout,
   invalid coords, or missing tyre_code all return `success=False` with a
   clear `error` field.
5. **Broker always gets an ack.** Three cases: success (✅ N notified, top 3
   closest shown), 0 drivers found (suggests widening radius), failure (clear
   error message).

### 5.7 Schema changes (Week 3)

- `Driver.currentLat` / `Driver.currentLng` (nullable floats) — GPS coords for
  the nearby query. Composite index on `(status, current_lat, current_lng)`.
- `Load.originLat` / `Load.originLng` / `Load.destinationLat` / `Load.destinationLng`
  (nullable floats) — the broadcast service needs the load's origin GPS.
- New `BroadcastLog` model — audit trail (tyre_code, broker_code, origin GPS,
  radius, drivers_found/notified/failed, per-driver outcomes as JSON, initiated_by).

Migration: `backend/database/migrations/20260704090000_add_driver_gps_and_broadcast_log/migration.sql`

### 5.8 Setting driver GPS coordinates

Drivers don't directly type their lat/lng. The coordinates come from:
1. **WhatsApp location sharing** — when a driver sends a WhatsApp location
   pin, the WhatsApp driver bot parses it and updates `Driver.currentLat/Lng`
   via the BFF (TODO: wire this in the voice pipeline — Week 4).
2. **GPS pings during active trips** — the `GpsPing` model already captures
   per-trip GPS; a periodic job can promote the latest ping to
   `Driver.currentLat/Lng` when the trip ends (TODO: Week 4).
3. **Voice onboarding** — when a driver says "Main Patna mein hoon" the voice
   pipeline geocodes "Patna" and stores the coords (TODO: Week 4).

Until these are wired, the broker can manually set a driver's GPS from the
dashboard's driver edit page. Drivers without GPS coords are invisible to the
nearby query — the broadcast just won't reach them.
