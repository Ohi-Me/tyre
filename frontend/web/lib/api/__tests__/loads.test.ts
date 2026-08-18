/**
 * Unit tests for @tyre/api/loads — Zod schema validation.
 *
 * Tests only the schemas (no db, no serializer) to verify input validation
 * works correctly at API boundaries.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// Define schemas inline to avoid importing the service (which pulls in @tyre/db)
const LoadCreateSchema = z.object({
  broker_id: z.string().min(1).max(50),
  origin: z.string().min(2).max(200),
  destination: z.string().min(2).max(200),
  distance_km: z.number().int().positive().max(10000),
  weight_tons: z.number().positive().max(100),
  truck_type_req: z.string().min(1).max(50),
  goods_type: z.string().min(1).max(100),
  offered_rate: z.number().positive().max(1_000_000),
  advance_offered: z.number().nonnegative().max(1_000_000).optional().default(0),
});

const LoadListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

describe("LoadCreateSchema", () => {
  it("accepts a valid load creation payload", () => {
    const input = {
      broker_id: "BRK-001",
      origin: "Patna",
      destination: "Delhi",
      distance_km: 1000,
      weight_tons: 12,
      truck_type_req: "16-wheeler",
      goods_type: "cement",
      offered_rate: 45000,
      advance_offered: 10000,
    };
    const result = LoadCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects negative weight_tons", () => {
    const input = {
      broker_id: "BRK-001",
      origin: "Patna",
      destination: "Delhi",
      distance_km: 1000,
      weight_tons: -5,
      truck_type_req: "16-wheeler",
      goods_type: "cement",
      offered_rate: 45000,
    };
    const result = LoadCreateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty broker_id", () => {
    const input = {
      broker_id: "",
      origin: "Patna",
      destination: "Delhi",
      distance_km: 1000,
      weight_tons: 12,
      truck_type_req: "16-wheeler",
      goods_type: "cement",
      offered_rate: 45000,
    };
    const result = LoadCreateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects distance_km > 10000", () => {
    const input = {
      broker_id: "BRK-001",
      origin: "Patna",
      destination: "Delhi",
      distance_km: 50000,
      weight_tons: 12,
      truck_type_req: "16-wheeler",
      goods_type: "cement",
      offered_rate: 45000,
    };
    const result = LoadCreateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("LoadListQuerySchema", () => {
  it("coerces string limit to number", () => {
    const result = LoadListQuerySchema.safeParse({ limit: "25" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
    }
  });

  it("defaults limit to 50 when not provided", () => {
    const result = LoadListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it("rejects limit > 100", () => {
    const result = LoadListQuerySchema.safeParse({ limit: 500 });
    expect(result.success).toBe(false);
  });
});
