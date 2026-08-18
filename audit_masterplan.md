# TYRE Operator Dashboard — Audit Masterplan (living tracker)

Honest, workflow-by-workflow status of the authenticated operator platform. Updated as
workflows are wired to real backends through `authFetch` (JWT + refresh).

Legend: **WIRED** = calls real API end-to-end · **PARTIAL** = some actions wired ·
**MISSING-UI** = backend exists, no UI yet · **MISSING-BACKEND** = no endpoint (do not invent) ·
**MOCK** = intentionally faked pending an external dependency.

## Foundation
| Capability | Status | Notes |
|---|---|---|
| JWT auth (login/register) | WIRED | auth-gate → /api/v1/auth/{login,register}; tokens stored; local fallback keeps demo working. |
| Refresh on 401 + retry | WIRED | authFetch rotates via /auth/refresh; verified by execution. |
| Logout + revoke | WIRED | sidebar → /auth/logout + local wipe. |
| Session expiry → auth gate | WIRED | SESSION_EXPIRED event clears profile; provider re-renders gate. |
| Auth header auto-attach | WIRED | drivers/trucks/trips/loads/invoices/documents/notifications hooks route through authFetch. |
| Global toast host | WIRED | Toaster mounted in provider (previously every toast was a no-op). |

## Modules
| Module | Workflow | Endpoint | Status |
|---|---|---|---|
| Drivers | list / filter / search | GET /drivers | WIRED |
| Drivers | onboard (create) | POST /drivers (RBAC drivers:manage) | WIRED (this pass) — direct "Add Driver" dialog + toasts + invalidation; voice onboarding kept as a secondary path. |
| Fleet | list / filter / search | GET /trucks | WIRED |
| Fleet | maintenance ↔ service | PATCH /trucks/[id] (trucks:manage) | WIRED — per-row toggle, toasts, invalidation, RBAC 403 surfaced. |
| Fleet | add vehicle | — | MISSING-BACKEND — no POST /trucks; vehicles are created via driver voice onboarding. |
| Trips | list / filter / search / CSV export | GET /trips | WIRED — status filter + client CSV export. |
| Trips | start trip | POST /trips/[id]/start (trips:self) | WIRED. |
| Trips | complete trip (POD → balance) | POST /trips/[id]/complete (trips:complete) | WIRED. |
| Trips | cancel | POST /loads/cancel | MISSING-UI (operator) — endpoint is requireInternalService (bridge agent only), not operator-reachable. Needs an operator-facing cancel endpoint. |
| Dispatch | live board + agent activity | GET /trips, /agents/activity | WIRED. |
| Dispatch | assign truck → load | POST /loads/assign (loads:assign) | WIRED (this pass) — "Awaiting dispatch" list + Assign-truck modal (load+truck picker), toasts surface the real escrow outcome, RBAC 403 handled. Note: `fleet_manager` role currently has no `loads:*`/`loads:assign` grant in the RBAC matrix, so only `operator`/`admin` can assign — flagged, not changed, since RBAC edits are out of this pass's scope. |
| Marketplace / My Freight | freight CRUD, book, accept/reject/cancel/complete, pause/delete | /freight/* | WIRED (pre-existing) — now with working toasts. |
| Tracking | live map | — | MOCK — needs a tiles/geocoding provider (Mapbox/MapLibre). Real trip data is shown. |
| Payments | payout ledger | /freight/payouts | WIRED (read). Invoicing/settlement: see Billing. |
| Billing / Invoices | generate/list/detail | POST/GET /invoices (billing:manage) | WIRED (this pass) — Billing view (filterable list + summary cards) + Generate-invoice dialog (completed-trip picker, intra/inter GST toggle), idempotent per trip. |
| Analytics | revenue/fee stats | /freight/stats, /reports/* | WIRED (read). |
| Documents | CRUD + expiry | /documents, /documents/[id] | WIRED (this pass) — dedicated Documents view: filterable list, add/edit dialog (truck- or driver-linked), delete, expiry-status badges. File field is a URL, not an upload — object storage is still MISSING-BACKEND (see NEXT.md). |
| Notifications | inbox / read / preferences | /notifications* | WIRED (this pass) — topbar bell with unread badge, dropdown inbox (personal + org-broadcast), mark-one/mark-all read, polled every 30s. Preferences API is built but has no settings-page UI yet (MISSING-UI, lower priority). |
| Voice AI | process / onboard | /voice/*, /onboarding/voice | WIRED. |
| AskPilot / Copilot | chat | /copilot/chat | WIRED. |
| Settings | profile / prefs | (local profile) | PARTIAL — mostly local; server-side profile + notification-preferences UI pending. |

## Highest-priority remaining (next passes)
1. **Notification preferences UI** — the API (`GET/PUT /notifications/preferences`) is built; no settings-page toggle matrix yet.
2. **Operator-facing load cancel endpoint** (MISSING-BACKEND) — add a role-gated cancel to complement the internal one.
3. **Add-vehicle backend** (MISSING-BACKEND) — no `POST /trucks`; vehicles are currently only created via driver voice onboarding.
4. **fleet_manager RBAC gap** — `fleet_manager` lacks `loads:*`/`loads:assign`, so a fleet manager (not just operator/admin) cannot use the new Dispatch assign modal. Needs a product decision, not just a code change.
5. **Document file upload** — current form takes a URL; real upload needs object storage (S3/MinIO) per NEXT.md.
6. **Tracking live map** — still a stylized mock; needs a tiles/geocoding provider.

## Verification note
All UI wired this engagement is parse-verified (esbuild) and the auth refresh logic is
execution-verified. Full runtime verification (real login against a seeded DB, a protected
mutation succeeding) requires `pnpm db:migrate && pnpm db:generate && pnpm seed && pnpm dev`
locally — not runnable in this environment.
