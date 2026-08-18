/**
 * @tyre/api/loads — schemas for the loads domain.
 *
 * BE-C1 fix: extracted from frontend/web/app/api/v1/loads/route.ts.
 * These Zod schemas are the single source of truth for input validation
 * on every loads route. The route handler imports and uses them; the
 * frontend can also import them for client-side validation.
 */
import { z } from "zod";

export const LoadCreateSchema = z.object({
  broker_id: z.string().min(1).max(50),
  origin: z.string().min(2).max(200),
  origin_region: z.string().length(2).optional().default("IN"),
  destination: z.string().min(2).max(200),
  destination_region: z.string().length(2).optional().default("IN"),
  distance_km: z.number().int().positive().max(10000),
  weight_tons: z.number().positive().max(100),
  truck_type_req: z.string().min(1).max(50),
  goods_type: z.string().min(1).max(100),
  offered_rate: z.number().positive().max(1_000_000),
  advance_offered: z.number().nonnegative().max(1_000_000).optional().default(0),
});

export type LoadCreateInput = z.infer<typeof LoadCreateSchema>;

export const LoadListQuerySchema = z.object({
  status: z.string().optional(),
  broker_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

export type LoadListQuery = z.infer<typeof LoadListQuerySchema>;

export const LoadAssignSchema = z.object({
  load_id: z.string().min(1),
  truck_id: z.string().min(1),
  driver_phone: z.string().optional(),
});

export type LoadAssignInput = z.infer<typeof LoadAssignSchema>;

export const LoadMatchSchema = z.object({
  origin: z.string().min(2),
  destination: z.string().min(2),
  truck_type: z.string().optional(),
  driver_phone: z.string().optional(),
});

export type LoadMatchInput = z.infer<typeof LoadMatchSchema>;
