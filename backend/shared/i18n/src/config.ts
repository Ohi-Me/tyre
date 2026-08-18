/**
 * next-intl configuration — v3.2 wedge.
 *
 * Y1: only 5 locales are loaded (hi, bho, en, bn, mr).
 * Other 110 locales are registered for Y2+ but not loaded in Y1 builds.
 */

// Extensionless: this package declares an `exports` map, under which Turbopack's
// edge bundle fails to resolve the `.js`-suffixed sibling specifier.
import { LOCALES, Y1_ACTIVE_LOCALE_CODES, Y1_LOCALES, type LocaleConfig } from "./locales";

/**
 * Y1 active locales — what next-intl routing uses.
 * Y2 will expand this list as new locales go live.
 */
export const locales = Y1_ACTIVE_LOCALE_CODES;  // ["hi", "bho", "en", "bn", "mr"]
export const allLocales = LOCALES.map((l) => l.code);  // 123 total — for future expansion
export const defaultLocale = "hi";  // Hindi is the Y1 wedge default (Bihar-Jharkhand-UP)
export const localePrefix = "as-needed" as const;

export const localeConfigs: Record<string, LocaleConfig> = Object.fromEntries(
  Y1_LOCALES.map((l) => [l.code, l])
);

// App-level routing config (locales list + default). This is TYRE's own shape, not
// next-intl's per-request IntlConfig (which uses a singular `locale`).
export const i18nConfig = {
  locales,
  defaultLocale,
  localePrefix,
};

/**
 * Time zone defaults per region — used for date/number formatting.
 * Y1 is India-only.
 */
export const REGION_TIMEZONES: Record<string, string> = {
  IN: "Asia/Kolkata",
  // Y2+ regions:
  BD: "Asia/Dhaka",
  PK: "Asia/Karachi",
  NP: "Asia/Kathmandu",
  LK: "Asia/Colombo",
  NG: "Africa/Lagos",
  KE: "Africa/Nairobi",
  GH: "Africa/Accra",
  ZA: "Africa/Johannesburg",
  EG: "Africa/Cairo",
  BR: "America/Sao_Paulo",
  MX: "America/Mexico_City",
  CO: "America/Bogota",
  PE: "America/Lima",
  AE: "Asia/Dubai",
  SA: "Asia/Riyadh",
  ID: "Asia/Jakarta",
  VN: "Asia/Ho_Chi_Minh",
  TH: "Asia/Bangkok",
  PH: "Asia/Manila",
};
