import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
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

  it("keeps release documentation aligned with the checked-in migration range", async () => {
    const inventory = await releaseMigrationInventory();
    const expectedRange = `\`${inventory.range[0]}\` through \`${inventory.range[1]}\``;
    const closure = await readFile(new URL("../docs/RELEASE_CLOSURE.md", import.meta.url), "utf8");
    const rollback = await readFile(new URL("../docs/ROLLBACK.md", import.meta.url), "utf8");

    expect(closure).toContain(expectedRange);
    expect(rollback).toContain(expectedRange);
    expect(closure).not.toContain("PR #14");
    expect(rollback).not.toContain("0000 through `0007`");
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
