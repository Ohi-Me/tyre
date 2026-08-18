/**
 * @tyre/i18n — public entrypoint.
 * Exposes locale registry, config, and helpers used by frontend/web and backend/ai/gateway (via JSON export).
 */

// Extensionless relative specifiers: Turbopack's RSC build fails to enumerate the
// names re-exported via `export *` when the source path carries a `.js` extension
// (it reports them as "export X doesn't exist"). Extensionless paths resolve to the
// sibling .ts files and re-export correctly.
export * from "./locales";
export * from "./config";

import { LOCALES } from "./locales";

/**
 * Resolve a driver's preferred locale into a fully-supported code,
 * walking the fallback chain. Used by the voice pipeline.
 */
export function resolveLocale(input: string | undefined | null): string {
  if (!input) return "en";
  const cfg = LOCALES.find((l) => l.code === input);
  if (cfg) return cfg.code;

  // Try the primary subtag (e.g. "pt-BR-x-formal" → "pt-BR")
  const subtag = input.split("-").slice(0, 2).join("-");
  const sub = LOCALES.find((l) => l.code === subtag);
  if (sub) return sub.code;

  // Try the language-only subtag (e.g. "pt" → "pt-BR")
  const lang = input.split("-")[0];
  const langMatch = LOCALES.find((l) => l.code === lang || l.code.startsWith(lang + "-"));
  if (langMatch) return langMatch.code;

  return "en";
}
