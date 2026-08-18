/**
 * Root layout — minimal. The locale-aware layout at app/[locale]/layout.tsx
 * handles fonts, NextIntlClientProvider, dir, and metadata.
 */

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
