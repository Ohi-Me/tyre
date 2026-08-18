/**
 * @tyre/api/trucks — schemas for the trucks domain.
 * BE-C1 fix: extracted from frontend/web/app/api/v1/trucks/route.ts.
 */
import { z } from "zod";

export const TruckListQuerySchema = z.object({
  status: z.string().optional(),
  driver_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
export type TruckListQuery = z.infer<typeof TruckListQuerySchema>;

export const TruckUpdateSchema = z.object({
  status: z.string().optional(),
  current_location: z.string().optional(),
  destination: z.string().optional(),
  cargo_loaded: z.boolean().optional(),
});
export type TruckUpdateInput = z.infer<typeof TruckUpdateSchema>;
