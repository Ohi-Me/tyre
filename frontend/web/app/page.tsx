/**
 * Root page — redirects to default locale.
 * The actual home page lives at /app/[locale]/page.tsx (locale-aware).
 */

import { redirect } from "next/navigation";
import { defaultLocale } from "@/i18n/routing";

export default function RootPage() {
  redirect(`/${defaultLocale}`);
}
