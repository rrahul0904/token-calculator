import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import postgres from "postgres";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
    connect_timeout: 15,
    idle_timeout: 5,
  });

  let lockAcquired = false;
  try {
    await sql`select pg_advisory_lock(hashtext('token-intelligence:migrations'))`;
    lockAcquired = true;
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS _token_intelligence_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    const directory = resolve(process.cwd(), "drizzle");
    const names = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
    for (const name of names) {
      const source = await readFile(resolve(directory, name), "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const existing = await sql<{ checksum: string }[]>`select checksum from _token_intelligence_migrations where name = ${name}`;
      if (existing[0]) {
        if (existing[0].checksum !== checksum) throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${name}`);
        console.log(`skip ${name} (already applied)`);
        continue;
      }
      console.log(`apply ${name}`);
      await sql.begin(async (tx) => {
        await tx.unsafe(source);
        await tx`insert into _token_intelligence_migrations (name, checksum) values (${name}, ${checksum})`;
      });
    }
    console.log(`migrations complete (${names.length} files discovered)`);
  } finally {
    if (lockAcquired) {
      try {
        await sql`select pg_advisory_unlock(hashtext('token-intelligence:migrations'))`;
      } catch {
        // The connection may already be unavailable; closing below is still required.
      }
    }
    await sql.end({ timeout: 3 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
