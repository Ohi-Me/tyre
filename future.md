# TYRE — Future Vision

The long-horizon roadmap lives in **NEXT.md §12 (Future Vision)** and the five "do-first"
initiatives (Realtime SSE, Job queue, Observability, Settlement/Tax, URL routing). This file
is the pointer + the operator-dashboard completion arc.

## Operator-dashboard completion arc (near-term)
Foundation: JWT auth + authFetch (refresh/logout/guard) + global toasts. Shipped on top of
it, workflow by workflow (see **audit_masterplan.md** for full detail): trip start/complete,
truck maintenance toggle, a Dispatch assign-truck modal (load+truck picker, real UPI escrow
release), a Notifications bell + inbox, a Billing view (invoice list + generate over the
GST/TDS/commission settlement engine), a Documents management view (full CRUD), and a direct
Add-Driver form.

Remaining, in priority order: notification-preferences settings UI → operator-facing load
cancel endpoint (currently internal-service-only) → add-vehicle backend (`POST /trucks` does
not exist) → the `fleet_manager` RBAC gap on `loads:assign` → document file upload (needs
object storage) → the tracking live map (currently a stylized mock).

## Beyond the dashboard (see NEXT.md)
Realtime event backbone, background job queue + outbox, OpenTelemetry/Sentry instrumentation,
object storage + OCR, predictive ETA/pricing, and a partner API platform — each composed over a
small set of durable primitives rather than added as one-off features.
