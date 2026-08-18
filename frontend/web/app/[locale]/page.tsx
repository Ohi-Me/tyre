/**
 * Locale-aware home page.
 * Renders the premium TYRE UI (landing + app shell) inside the NextIntlClientProvider.
 */

import { setRequestLocale } from "next-intl/server";
import { TyreUIProvider } from "@/components/tyre/tyre-ui-provider";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TyreUIProvider />;
}
