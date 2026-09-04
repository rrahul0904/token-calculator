import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Client managers intentionally synchronize remote API state and persisted theme state after mount.
      // Keep those effects explicit; the release gate still enforces all other Next/React hook rules.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["src/db/schema.ts", "src/lib/openapi.ts"],
    rules: {
      // These declarative schema/spec modules retain small named helpers for generated/adjacent definitions.
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  globalIgnores([".next/**", ".vercel/**", "out/**", "build/**", "coverage/**", "packages/sdk-typescript/dist/**"]),
]);
