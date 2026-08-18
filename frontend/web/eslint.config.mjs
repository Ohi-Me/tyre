// ESLint v9 flat config. eslint-config-next v16 ships a native flat config
// (exports "." and "./core-web-vitals"), so consume it directly.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      // Vendored shadcn/ui primitives — kept verbatim from the registry.
      "components/ui/**",
    ],
  },
  ...(Array.isArray(nextCoreWebVitals) ? nextCoreWebVitals : [nextCoreWebVitals]),
  {
    rules: {
      // Literal quotes/apostrophes in JSX copy render fine; escaping all of them is
      // noise. (Next.js itself recommends disabling this for content-heavy UIs.)
      "react/no-unescaped-entities": "off",
      // React Compiler (react-hooks v7) advisories. These flag known-safe patterns
      // such as the stock shadcn `useIsMobile` matchMedia hook; keep them visible as
      // warnings rather than hard build-blocking errors.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
];

export default eslintConfig;
