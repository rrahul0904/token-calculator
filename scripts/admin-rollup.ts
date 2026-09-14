import { closeDb, isDatabaseConfigured } from "@/db/client";
import { rollupPlatformDay } from "@/lib/admin/data";

async function main() {
  if (!isDatabaseConfigured()) throw new Error("DATABASE_URL is required for admin:rollup");
  const requested = process.argv[2];
  const day = requested ? new Date(`${requested}T00:00:00.000Z`) : undefined;
  if (day && Number.isNaN(day.valueOf())) throw new Error("Use an ISO date, for example: npm run admin:rollup -- 2026-09-03");
  const metrics = await rollupPlatformDay(day);
  process.stdout.write(`${JSON.stringify({ day: metrics.day.toISOString().slice(0, 10), runs: metrics.runs, registrations: metrics.registrations })}\n`);
}
main().finally(() => closeDb());
