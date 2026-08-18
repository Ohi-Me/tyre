// @tyre/api — barrel re-export of all domain submodules.
// Route handlers in frontend/web/app/api/v1/* import from here.
//
// NOTE: only auth, loads, trucks, and trips have actual TypeScript modules
// (index.ts + schemas.ts + service.ts). The other domains (pricing, escrow,
// trust, fastag, voice, webhooks) are README-only stubs from the 3-repo merge
// — their route handlers live directly in frontend/web/app/api/v1/* and import
// @tyre/db directly. The broken barrel exports were removed to avoid
// "Module not found" errors if anyone ever imports @tyre/api.
export * from "./auth";
export * from "./loads";
export * from "./trucks";
export * from "./trips";
