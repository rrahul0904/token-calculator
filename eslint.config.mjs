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
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "packages/sdk-typescript/dist/**"]),
]);
