import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomBytes } from "node:crypto";

/**
 * Core freight marketplace flow, end-to-end against the real API stack:
 *   create → list → get → update → book → accept (₹49 debited) → cancel (₹49 refunded) → delete
 *
 * Covers the FRT-1 race-fix path (sequence-generated FRT codes), owner-scoped
 * authorization (x-tyre-actor), and the booking money ledger.
 *
 * These are login-free (anonymous actor id), so no seed/auth is required.
 */

const actor = () => randomBytes(16).toString("hex"); // 32-char nanoid-compatible id

function h(id: string) {
  return { "x-tyre-actor": id, "content-type": "application/json" };
}

async function json(res: Awaited<ReturnType<APIRequestContext["post"]>>) {
  return { status: res.status(), body: await res.json() };
}

test.describe("freight marketplace", () => {
  const lister = actor();
  const booker = actor();
  let listingId = "";
  let listingCode = "";
  let bookingId = "";

  test("creates a listing with a sequence-generated code", async ({ request }) => {
    const res = await request.post("/api/v1/freight", {
      headers: h(lister),
      data: {
        owner_name: "E2E Owner",
        phone: "9876543210",
        vehicle_number: "MH12AB1234",
        vehicle_type: "Container",
        capacity_tons: 20,
        origin: "Pune",
        destination: "Mumbai",
        expected_rate: 15000,
      },
    });
    const { status, body } = await json(res);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.code).toMatch(/^FRT-\d+$/); // FRT-1 fix: sequence, not count()+1
    expect(body.data.is_mine).toBe(true);
    listingId = body.data.id;
    listingCode = body.data.code;
  });

  test("appears in the public list", async ({ request }) => {
    const res = await request.get("/api/v1/freight?q=Pune&limit=100");
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined(); // PERF-1: pagination envelope
    expect(body.data.some((l: any) => l.code === listingCode)).toBe(true);
  });

  test("rejects edits from a non-owner (403)", async ({ request }) => {
    const res = await request.patch(`/api/v1/freight/${listingId}`, {
      headers: h(booker),
      data: { origin: "Hacked" },
    });
    expect(res.status()).toBe(403);
  });

  test("owner can update", async ({ request }) => {
    const res = await request.patch(`/api/v1/freight/${listingId}`, {
      headers: h(lister),
      data: { expected_rate: 16000 },
    });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.data.expected_rate).toBe(16000);
  });

  test("a second actor can book it", async ({ request }) => {
    const res = await request.post(`/api/v1/freight/${listingId}/book`, {
      headers: h(booker),
      data: { booker_name: "E2E Booker", booker_phone: "9998887776", pickup: "Pune", dropoff: "Mumbai" },
    });
    const { status, body } = await json(res);
    expect([200, 201]).toContain(status);
    expect(body.success).toBe(true);
    bookingId = body.data.id;
  });

  test("lister accepts → ₹49 fee debited to payout ledger", async ({ request }) => {
    const accept = await request.patch(`/api/v1/freight/bookings/${bookingId}`, {
      headers: h(lister),
      data: { action: "accept" },
    });
    expect(accept.status()).toBe(200);

    const payouts = await request.get("/api/v1/freight/payouts", { headers: h(lister) });
    const body = await payouts.json();
    const fee = body.data?.entries?.find((e: any) => e.booking_id === bookingId && e.type === "BOOKING_FEE");
    expect(fee?.amount).toBe(-49);
  });

  test("cancel refunds the ₹49", async ({ request }) => {
    const cancel = await request.patch(`/api/v1/freight/bookings/${bookingId}`, {
      headers: h(booker),
      data: { action: "cancel" },
    });
    expect(cancel.status()).toBe(200);

    const payouts = await request.get("/api/v1/freight/payouts", { headers: h(lister) });
    const body = await payouts.json();
    const refund = body.data?.entries?.find((e: any) => e.booking_id === bookingId && e.type === "BOOKING_FEE_REFUND");
    expect(refund?.amount).toBe(49);
  });

  test("owner soft-deletes the listing", async ({ request }) => {
    const res = await request.delete(`/api/v1/freight/${listingId}`, { headers: h(lister) });
    expect(res.status()).toBe(200);
    const gone = await request.get(`/api/v1/freight/${listingId}`);
    expect(gone.status()).toBe(404);
  });
});
