/**
 * /[locale]/pricing — standalone pricing page (opened from the landing nav).
 */
import { setRequestLocale } from "next-intl/server";
import { PricingPage } from "@/components/tyre/landing/pricing-page";

export default async function Pricing({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PricingPage />;
}
