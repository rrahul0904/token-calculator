import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { releaseMigrationInventory } from "../scripts/release/migration-inventory";

describe("release migration evidence", () => {
  it("matches the current checked-in migration set", async () => {
    const inventory = await releaseMigrationInventory();
    expect(inventory.count).toBe(12);
    expect(inventory.range).toEqual(["0000", "0011"]);
    expect(inventory.files[0]).toBe("0000_agent_economics_foundation.sql");
    expect(inventory.files.at(-1)).toBe("0011_verified_savings_revalidations.sql");
  });

  it("fails closed when migration numbering has a gap", async () => {
    const root = await mkdtemp(join(tmpdir(), "ti-migrations-"));
    const dir = join(root, "drizzle");
    await mkdir(dir);
    await writeFile(join(dir, "0000_first.sql"), "-- first\n");
    await writeFile(join(dir, "0002_gap.sql"), "-- gap\n");

    await expect(releaseMigrationInventory(dir)).rejects.toThrow(
      "NON_CONTIGUOUS_RELEASE_MIGRATIONS:0,2",
    );
  });
});
