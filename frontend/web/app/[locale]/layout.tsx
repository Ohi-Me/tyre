/**
 * Root layout — applies locale, direction (LTR/RTL), and theme.
 */

import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { setRequestLocale, getMessages, getTranslations } from "next-intl/server";
import { Inter, Bricolage_Grotesque, Playfair_Display, Noto_Sans_Devanagari, Noto_Naskh_Arabic } from "next/font/google";
import { routing } from "../../i18n/routing";
import { LOCALES, isRTL, Y1_ACTIVE_LOCALE_CODES } from "@tyre/i18n";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/lib/api/query-provider";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Display typeface — expressive grotesque with character, for hero + section headings.
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-display", display: "swap" });
// Editorial serif — used italic for emphasis words mid-sentence (Noomo-style).
const serif = Playfair_Display({ subsets: ["latin"], weight: ["500", "600"], style: ["italic", "normal"], variable: "--font-serif", display: "swap" });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-devanagari", display: "swap" });
const arabic = Noto_Naskh_Arabic({ subsets: ["arabic"], variable: "--font-arabic", display: "swap" });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });
  const title = t("seo_title");
  const description = t("seo_description");
  const url = `/${locale}`;

  return {
    title,
    description,
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://tyre.in"),
    applicationName: "TYRE",
    keywords: [
      "Indian trucking", "freight", "voice AI", "UPI escrow", "Bhojpuri", "load matching",
      "logistics India", "fleet operating system", "Patna", "Delhi corridor",
    ],
    alternates: {
      canonical: url,
      // Only advertise locales that actually have committed message files.
      languages: Object.fromEntries(Y1_ACTIVE_LOCALE_CODES.map((c) => [c, `/${c}`])),
    },
    openGraph: {
      type: "website",
      siteName: "TYRE",
      title,
      description,
      url,
      locale,
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

export function generateStaticParams() {
  return LOCALES.map((l) => ({ locale: l.code }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();
  const dir = isRTL(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className={`${inter.variable} ${display.variable} ${serif.variable} ${devanagari.variable} ${arabic.variable} font-sans antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <QueryProvider>{children}</QueryProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
