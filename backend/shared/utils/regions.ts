/**
 * Region registry — each Region has its own currency, default locale,
 * diesel price, toll model, compliance APIs, and payment rails.
 *
 * Adding a new region = add one entry here + translations.
 */

// Region type is now a string union derived from the REGIONS object itself,
// avoiding dependency on the Prisma-generated enum (which may not be available
// in all build contexts). See SH-C7 fix.
type Region = string;

export interface RegionConfig {
  code: Region;
  name: string;
  currency: string;        // ISO 4217
  default_locale: string;  // BCP-47
  diesel_price_per_liter: number;
  toll_per_km: number;
  driver_allowance_per_day: number;
  compliance_apis: {
    gst?: boolean;          // India: GSTIN verification
    e_way_bill?: boolean;   // India
    fastag?: boolean;       // India
    sat?: boolean;          // Brazil: CST/IE
    cnpj?: boolean;         // Brazil
    rfc?: boolean;          // Mexico
    vat?: boolean;          // UAE/Gulf
    tin?: boolean;          // Africa
  };
  payment_rails: string[]; // ["upi", "razorpay"] / ["mpesa"] / ["pix"] / ["stripe"]
  distance_unit: "km" | "mi";
  driving_side: "left" | "right";
}

export const REGIONS: Record<Region, RegionConfig> = {
  IN: {
    code: "IN", name: "India", currency: "INR", default_locale: "hi",
    diesel_price_per_liter: 92, toll_per_km: 3.5, driver_allowance_per_day: 500,
    compliance_apis: { gst: true, e_way_bill: true, fastag: true },
    payment_rails: ["upi", "razorpay", "bank_transfer"],
    distance_unit: "km", driving_side: "left",
  },
  BD: {
    code: "BD", name: "Bangladesh", currency: "BDT", default_locale: "bn",
    diesel_price_per_liter: 120, toll_per_km: 2.8, driver_allowance_per_day: 800,
    compliance_apis: { tin: true },
    payment_rails: ["bkash", "nagad", "bank_transfer"],
    distance_unit: "km", driving_side: "left",
  },
  PK: {
    code: "PK", name: "Pakistan", currency: "PKR", default_locale: "ur",
    diesel_price_per_liter: 280, toll_per_km: 3.0, driver_allowance_per_day: 2500,
    compliance_apis: { tin: true },
    payment_rails: ["easypaisa", "jazzcash", "bank_transfer"],
    distance_unit: "km", driving_side: "left",
  },
  NP: {
    code: "NP", name: "Nepal", currency: "NPR", default_locale: "ne",
    diesel_price_per_liter: 175, toll_per_km: 2.0, driver_allowance_per_day: 1200,
    compliance_apis: { vat: true },
    payment_rails: ["esewa", "khalti", "bank_transfer"],
    distance_unit: "km", driving_side: "left",
  },
  LK: {
    code: "LK", name: "Sri Lanka", currency: "LKR", default_locale: "si",
    diesel_price_per_liter: 350, toll_per_km: 4.0, driver_allowance_per_day: 4500,
    compliance_apis: { vat: true },
    payment_rails: ["bank_transfer"],
    distance_unit: "km", driving_side: "left",
  },
  NG: {
    code: "NG", name: "Nigeria", currency: "NGN", default_locale: "ha",
    diesel_price_per_liter: 1500, toll_per_km: 150, driver_allowance_per_day: 15000,
    compliance_apis: { tin: true },
    payment_rails: ["paystack", "flutterwave", "bank_transfer"],
    distance_unit: "km", driving_side: "right",
  },
  KE: {
    code: "KE", name: "Kenya", currency: "KES", default_locale: "sw",
    diesel_price_per_liter: 195, toll_per_km: 25, driver_allowance_per_day: 3000,
    compliance_apis: { tin: true },
    payment_rails: ["mpesa", "bank_transfer"],
    distance_unit: "km", driving_side: "left",
  },
  GH: {
    code: "GH", name: "Ghana", currency: "GHS", default_locale: "ak",
    diesel_price_per_liter: 14, toll_per_km: 2.0, driver_allowance_per_day: 200,
    compliance_apis: { tin: true },
    payment_rails: ["mtn_momo", "bank_transfer"],
    distance_unit: "km", driving_side: "right",
  },
  ZA: {
    code: "ZA", name: "South Africa", currency: "ZAR", default_locale: "zu",
    diesel_price_per_liter: 25, toll_per_km: 3.5, driver_allowance_per_day: 650,
    compliance_apis: { vat: true },
    payment_rails: ["ozow", "bank_transfer"],
    distance_unit: "km", driving_side: "left",
  },
  EG: {
    code: "EG", name: "Egypt", currency: "EGP", default_locale: "ar",
    diesel_price_per_liter: 12, toll_per_km: 1.5, driver_allowance_per_day: 400,
    compliance_apis: { vat: true },
    payment_rails: ["fawry", "bank_transfer"],
    distance_unit: "km", driving_side: "right",
  },
  BR: {
    code: "BR", name: "Brazil", currency: "BRL", default_locale: "pt-BR",
    diesel_price_per_liter: 6.5, toll_per_km: 0.85, driver_allowance_per_day: 220,
    compliance_apis: { cnpj: true, sat: true },
    payment_rails: ["pix", "stripe", "bank_transfer"],
    distance_unit: "km", driving_side: "right",
  },
  MX: {
    code: "MX", name: "Mexico", currency: "MXN", default_locale: "es-MX",
    diesel_price_per_liter: 24, toll_per_km: 3.0, driver_allowance_per_day: 800,
    compliance_apis: { rfc: true },
    payment_rails: ["stripe", "oxxo", "bank_transfer"],
    distance_unit: "km", driving_side: "right",
  },
  CO: {
    code: "CO", name: "Colombia", currency: "COP", default_locale: "es-CO",
    diesel_price_per_liter: 14500, toll_per_km: 1500, driver_allowance_per_day: 80000,
    compliance_apis: { vat: true },
    payment_rails: ["wompi", "bank_transfer"],
    distance_unit: "km", driving_side: "right",
  },
  PE: {
    code: "PE", name: "Peru", currency: "PEN", default_locale: "es-PE",
    diesel_price_per_liter: 16, toll_per_km: 1.8, driver_allowance_per_day: 120,
    compliance_apis: { vat: true },
    payment_rails: ["niubiz", "bank_transfer"],
    distance_unit: "km", driving_side: "right",
  },
  AE: {
    code: "AE", name: "UAE", currency: "AED", default_locale: "ar",
    diesel_price_per_liter: 3.0, toll_per_km: 0.5, driver_allowance_per_day: 150,
    compliance_apis: { vat: true },
    payment_rails: ["stripe", "bank_transfer"],
    distance_unit: "km", driving_side: "right",
  },
  SA: {
    code: "SA", name: "Saudi Arabia", currency: "SAR", default_locale: "ar",
    diesel_price_per_liter: 2.3, toll_per_km: 0.4, driver_allowance_per_day: 200,
    compliance_apis: { vat: true },
    payment_rails: ["mada", "stripe", "bank_transfer"],
    distance_unit: "km", driving_side: "right",
  },
  ID: {
    code: "ID", name: "Indonesia", currency: "IDR", default_locale: "id",
    diesel_price_per_liter: 14600, toll_per_km: 1200, driver_allowance_per_day: 250000,
    compliance_apis: { vat: true },
    payment_rails: ["midtrans", "bank_transfer"],
    distance_unit: "km", driving_side: "left",
  },
  VN: {
    code: "VN", name: "Vietnam", currency: "VND", default_locale: "vi",
    diesel_price_per_liter: 24000, toll_per_km: 2000, driver_allowance_per_day: 600000,
    compliance_apis: { vat: true },
    payment_rails: ["vnpt_epay", "bank_transfer"],
    distance_unit: "km", driving_side: "right",
  },
  TH: {
    code: "TH", name: "Thailand", currency: "THB", default_locale: "th",
    diesel_price_per_liter: 33, toll_per_km: 2.5, driver_allowance_per_day: 800,
    compliance_apis: { vat: true },
    payment_rails: ["omise", "bank_transfer"],
    distance_unit: "km", driving_side: "left",
  },
  PH: {
    code: "PH", name: "Philippines", currency: "PHP", default_locale: "fil",
    diesel_price_per_liter: 65, toll_per_km: 5.5, driver_allowance_per_day: 1500,
    compliance_apis: { vat: true },
    payment_rails: ["gcash", "paymongo", "bank_transfer"],
    distance_unit: "km", driving_side: "right",
  },
};

export function getRegionConfig(region: Region): RegionConfig {
  return REGIONS[region] ?? REGIONS.IN!;
}
