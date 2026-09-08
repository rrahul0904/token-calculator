import process from "node:process";
import postgres from "postgres";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string, fallback?: string) {
  const value = argument(name) ?? fallback;
  if (!value?.trim()) throw new Error(`MISSING_DATABASE_IDENTITY_INPUT:${name}`);
  return value.trim();
}

const databaseUrl = required("database-url", process.env.DATABASE_URL);
const expectedProject = required("expected-project");
const expectedBranch = required("expected-branch");

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
  connect_timeout: 15,
});
try {
  const row = (await sql<{ project_id: string | null; branch_id: string | null; database_name: string }[]>`
    select
      current_setting('neon.project_id', true) as project_id,
      current_setting('neon.branch_id', true) as branch_id,
      current_database() as database_name
  `)[0];

  if (!row?.project_id || !row.branch_id) throw new Error("DATABASE_IS_NOT_IDENTIFIED_AS_NEON");
  if (row.project_id !== expectedProject) {
    throw new Error(`NEON_PROJECT_MISMATCH:expected=${expectedProject}:actual=${row.project_id}`);
  }
  if (row.branch_id !== expectedBranch) {
    throw new Error(`NEON_BRANCH_MISMATCH:expected=${expectedBranch}:actual=${row.branch_id}`);
  }

  process.stdout.write(JSON.stringify({
    provider: "neon",
    verified: true,
    projectId: row.project_id,
    branchId: row.branch_id,
    database: row.database_name,
  }, null, 2) + "\n");
} finally {
  await sql.end({ timeout: 3 });
}
