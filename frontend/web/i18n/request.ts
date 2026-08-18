/**
 * next-intl request config — v3.2 wedge.
 *
 * Y1: only 5 locales are loadable (hi, bho, en, bn, mr).
 * Any other locale code falls back to English.
 *
 * Each Y1 locale has a committed messages file in /messages/<locale>.json.
 * Y2+ locales will be added as they go live (see backend/shared/i18n/src/locales.ts phases).
 */

import { getRequestConfig } from "next-intl/server";
import { resolveLocale, Y1_ACTIVE_LOCALE_CODES } from "@tyre/i18n";

// Y1 only — these are the only locales with committed message files.
// Y2 expansion: add new locale codes here as they go live.
const SUPPORTED_LOCALES = new Set(Y1_ACTIVE_LOCALE_CODES);  // ["hi", "bho", "en", "bn", "mr"]

export default getRequestConfig(async ({ requestLocale }) => {
  // next-intl v4 passes `requestLocale` (a promise), not `locale`.
  // Resolve to a Y1-supported locale; falls back to "en" if not yet supported.
  const requested = resolveLocale((await requestLocale) ?? undefined);
  const locale = SUPPORTED_LOCALES.has(requested) ? requested : "en";

  // Always load English as the fallback base
  const en = (await import(`../messages/en.json`)).default;

  if (locale === "en") {
    return {
      locale: "en",
      messages: en,
      timeZone: "Asia/Kolkata",
      onError(error) {
        if (process.env.NODE_ENV !== "production") console.warn("[i18n]", error.message);
      },
    };
  }

  try {
    const messages = (await import(`../messages/${locale}.json`)).default;
    return {
      locale,
      messages: { ...en, ...messages },  // shallow merge — locale wins, English fills gaps
      timeZone: "Asia/Kolkata",
      fallback: "en",
      onError(error) {
        if (process.env.NODE_ENV !== "production") console.warn("[i18n]", error.message);
      },
    };
  } catch {
    // Locale file missing — English only
    return { locale: "en", messages: en, timeZone: "Asia/Kolkata" };
  }
});
