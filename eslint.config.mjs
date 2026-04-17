import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // OAuth routes use <a> instead of <Link> intentionally — they need full-page
  // navigation to set cookies before redirecting to external OAuth providers.
  {
    files: ["src/app/page.tsx", "src/app/profile/page.tsx"],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    ".claude/**",
    "supabase/.temp/**",
  ]),
]);

export default eslintConfig;
