/**
 * @tyre/api/trips — schemas for the trips domain.
 * BE-C1 fix: extracted from frontend/web/app/api/v1/trips/route.ts.
 */
import { z } from "zod";

export const TripListQuerySchema = z.object({
  status: z.string().optional(),
  driver_id: z.string().optional(),
  load_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
export type TripListQuery = z.infer<typeof TripListQuerySchema>;

export const TripStartSchema = z.object({
  actual_departure_time: z.string().datetime().optional(),
});
export type TripStartInput = z.infer<typeof TripStartSchema>;

export const TripCompleteSchema = z.object({
  actual_arrival_time: z.string().datetime().optional(),
  pod_url: z.string().url().optional(),
  consignee_confirmation: z.boolean().optional(),
});
export type TripCompleteInput = z.infer<typeof TripCompleteSchema>;
