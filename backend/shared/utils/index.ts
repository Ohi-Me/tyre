/**
 * @tyre/shared — types, enums, and Zod schemas shared across web + ai-gateway + mobile.
 * Single source of truth so the TypeScript frontend and the Python backend never drift.
 *
 * Source layout (under backend/shared/):
 *   utils/      — main entry, regions, helpers
 *   types/      — TypeScript domain types + Zod schemas
 *   constants/  — enums + constant tables
 */

export * from "../types/index.js";
export * from "../types/schemas.js";
export * from "../constants/index.js";
export * from "./regions.js";
