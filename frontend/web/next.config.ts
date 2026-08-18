import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// FE-C10 fix: security headers — CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // The @tyre/* workspace packages ship TypeScript source (main: ./src/index.ts),
  // so Next must transpile them rather than treat them as prebuilt JS.
  transpilePackages: [
    "@tyre/shared",
    "@tyre/db",
    "@tyre/i18n",
    "@tyre/ai-client",
    "@tyre/auth",
  ],
  typedRoutes: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-dialog"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // FE-C10 fix: apply security headers to all routes
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  // Standalone build needs these copied into .next/standalone
  // FE-H11 fix: only copy the 5 Y1-loadable locale files, not all 123
  outputFileTracingIncludes: {
    "/*": ["./messages/{en,hi,bho,bn,mr}.json", "./public/**/*"],
  },
};

export default withNextIntl(nextConfig);
