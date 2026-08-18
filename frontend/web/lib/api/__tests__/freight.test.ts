/**
 * Freight marketplace server helpers — pure-function tests.
 * The money flow itself (₹49 on accept, refund on cancel) runs inside DB
 * transactions and is exercised end-to-end against the live API; these tests
 * pin the contract-level pieces: actor validation and serialization.
 */
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  FREIGHT_BOOKING_FEE_INR,
  actorId,
  serializeListing,
  serializeBooking,
} from "@/lib/freight/server";

function reqWithActor(actor?: string): NextRequest {
  return new NextRequest("http://localhost/api/v1/freight", {
    headers: actor ? { "x-tyre-actor": actor } : {},
  });
}

describe("actorId", () => {
  it("accepts a nanoid-style actor", () => {
    expect(actorId(reqWithActor("V1StGXR8_Z5jdHi6B-myT"))).toBe("V1StGXR8_Z5jdHi6B-myT");
  });
  it("rejects missing header", () => {
    expect(actorId(reqWithActor())).toBeNull();
  });
  it("rejects too-short ids", () => {
    expect(actorId(reqWithActor("abc"))).toBeNull();
  });
  it("rejects ids with invalid characters", () => {
    expect(actorId(reqWithActor("bad actor id; DROP TABLE"))).toBeNull();
  });
});

describe("fee constant", () => {
  it("is the flat ₹49 the product promises", () => {
    expect(FREIGHT_BOOKING_FEE_INR).toBe(49);
  });
});

describe("serializeListing", () => {
  const listing = {
    id: "l1",
    code: "FRT-0001",
    ownerId: "ownerAAAAAAAAAAAAAAA",
    ownerName: "Ramesh",
    phone: "9876543210",
    photoUrl: null,
    vehicleNumber: "BR01GA1234",
    vehicleType: "Container",
    capacityTons: 16,
    origin: "Patna",
    destination: "Delhi",
    ratePerKm: 28,
    expectedRate: 32000,
    description: "",
    status: "ACTIVE",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
  };

  it("maps camelCase to the snake_case API contract", () => {
    const s = serializeListing(listing);
    expect(s.code).toBe("FRT-0001");
    expect(s.vehicle_number).toBe("BR01GA1234");
    expect(s.capacity_tons).toBe(16);
    expect(s.created_at).toBe("2026-07-01T00:00:00.000Z");
  });

  it("marks ownership relative to the calling actor", () => {
    expect(serializeListing(listing, "ownerAAAAAAAAAAAAAAA").is_mine).toBe(true);
    expect(serializeListing(listing, "someoneElseBBBBBBBBB").is_mine).toBe(false);
    expect(serializeListing(listing).is_mine).toBe(false);
  });

  it("never leaks the raw ownerId", () => {
    expect(JSON.stringify(serializeListing(listing))).not.toContain("ownerAAAAAAAAAAAAAAA");
  });
});

describe("serializeBooking", () => {
  const booking = {
    id: "b1",
    listingId: "l1",
    bookerId: "bookerCCCCCCCCCCCCCC",
    bookerName: "Suresh",
    bookerPhone: "9123456789",
    pickup: "Patna",
    dropoff: "Delhi",
    note: "",
    status: "ACCEPTED",
    feeCharged: true,
    acceptedAt: new Date("2026-07-02T00:00:00Z"),
    cancelledAt: null,
    createdAt: new Date("2026-07-01T12:00:00Z"),
  };

  it("exposes fee state so the UI can promise the right refund", () => {
    const s = serializeBooking(booking);
    expect(s.status).toBe("ACCEPTED");
    expect(s.fee_charged).toBe(true);
    expect(s.accepted_at).toBe("2026-07-02T00:00:00.000Z");
    expect(s.cancelled_at).toBeNull();
  });

  it("marks bookings made by the calling actor", () => {
    expect(serializeBooking(booking, "bookerCCCCCCCCCCCCCC").is_mine).toBe(true);
    expect(serializeBooking(booking, "ownerAAAAAAAAAAAAAAA").is_mine).toBe(false);
  });
});
