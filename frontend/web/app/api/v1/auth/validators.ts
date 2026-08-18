/**
 * Validators for /api/v1/auth/* — ported & adapted from axle-platform's
 * `auth.validators.ts`, extended with TYRE's phone-first, multi-role model.
 */
import { z } from "zod";

export const registerSchema = z
  .object({
    name: z.string().min(2).max(100),
    role: z
      .enum(["driver", "shipper", "broker", "fleet_manager", "operator"])
      .default("driver"),
    email: z.string().email().optional(),
    phone: z.string().regex(/^\+?[0-9]{10,15}$/, "Invalid phone number").optional(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain an uppercase letter")
      .regex(/[0-9]/, "Password must contain a number"),
    orgSlug: z.string().optional(), // defaults to the Y1 wedge org if omitted
  })
  .refine((data) => data.email || data.phone, {
    message: "Either email or phone is required",
    path: ["email"],
  });

export const loginSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().optional(),
    password: z.string().min(1),
  })
  .refine((data) => data.email || data.phone, {
    message: "Either email or phone is required",
    path: ["email"],
  });

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
