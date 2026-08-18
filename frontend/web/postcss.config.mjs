// Tailwind CSS v4 is driven entirely by the PostCSS plugin — there is no
// tailwind.config.js in v4 (config lives in CSS via @theme in styles/globals.css).
// Without this file, `@import "tailwindcss"` / `@import "tw-animate-css"` and the
// @theme/@apply directives are never processed, so no utilities are generated.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
