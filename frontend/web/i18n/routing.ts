/**
 * next-intl routing config — wired to @tyre/i18n locale list.
 */

import { defineRouting } from "next-intl/routing";
import { locales, defaultLocale } from "@tyre/i18n/config";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
});

// Re-export so callers (e.g. app/page.tsx) can import { defaultLocale } from here.
export { defaultLocale };
