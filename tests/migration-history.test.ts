import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PRODUCTION_APPLIED_MIGRATIONS: Record<string, string> = {
  "0000_agent_economics_foundation.sql": "12e9654341fcba07d26a297fe3cb677a1af424497483de2a3d3ff0b8b63e8700",
  "0001_full_connectivity_controls.sql": "b327e56f9539d07db2b601f4d4000d468e8d32faf60fb6b8fa39acf2517abc99",
  "0002_tenant_reference_guards.sql": "a442392b0216c7a26d3f8253d7bf037696b46adb5d81631e2cae8e8c419c77d6",
  "0003_gap_closure_foundations.sql": "afe0556381f0505bc884340a9dfb696861437d70382f2a0fa03fd38ebec45f7f",
  "0004_provider_usage_import_rows.sql": "31258fef6ea79e30820f4bf73aea13a9d3d61dac4b7ce2921e8b66a49f7228e1",
  "0005_enterprise_directory_lifecycle.sql": "d27f9cbfda2ba1badaaaa9db46783163ebedf375a60f7f971e9c272f2408af75",
  "0006_data_controls.sql": "b6945fd5320fcdf110fc740e296fdb74b524686d60c8bdeff25f49b9d9f10606",
  "0007_platform_admin_operations.sql": "2cba8293a6363c473a1e7e8c979735eed3cde05d250965ae66930813609a8ce5",
};

describe("durable migration history", () => {
  it("never rewrites a migration already recorded in the production ledger", () => {
    for (const [name, expected] of Object.entries(PRODUCTION_APPLIED_MIGRATIONS)) {
      const content = readFileSync(resolve(process.cwd(), "drizzle", name));
      const actual = createHash("sha256").update(content).digest("hex");
      expect(actual, name).toBe(expected);
    }
  });
});
