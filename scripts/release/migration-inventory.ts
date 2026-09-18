import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

export interface ReleaseMigrationInventory {
  files: string[];
  count: number;
  range: [string, string];
}

export async function releaseMigrationInventory(directory = resolve("drizzle")): Promise<ReleaseMigrationInventory> {
  const files = (await readdir(directory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();

  if (files.length === 0) throw new Error("NO_RELEASE_MIGRATIONS_FOUND");

  const ordinals = files.map((name) => Number(name.slice(0, 4)));
  const expected = Array.from({ length: files.length }, (_, index) => index);
  const contiguous = ordinals.every((value, index) => value === expected[index]);
  if (!contiguous) {
    throw new Error(`NON_CONTIGUOUS_RELEASE_MIGRATIONS:${ordinals.join(",")}`);
  }

  return {
    files,
    count: files.length,
    range: [files[0].slice(0, 4), files.at(-1)!.slice(0, 4)],
  };
}
