import { desc } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { verifiedSavings } from "@/db/gap-closure-schema";
import { reverifyExperimentSavings } from "@/lib/evaluations/verified-savings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

function reverifyAgeDays() {
  const configured = Number(process.env.TOKEN_INTELLIGENCE_VERIFIED_SAVINGS_REVERIFY_DAYS ?? 7);
  return Number.isFinite(configured) ? Math.min(Math.max(Math.floor(configured), 1), 90) : 7;
}

async function execute(request: Request) {
  if (!isDatabaseConfigured()) return Response.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  if (!process.env.CRON_SECRET) return Response.json({ error: "REVERIFICATION_CRON_NOT_CONFIGURED" }, { status: 503 });
  if (!authorized(request)) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const db = getDb();
  const ageDays = reverifyAgeDays();
  const cutoff = Date.now() - ageDays * 86_400_000;
  const rows = await db.select().from(verifiedSavings).orderBy(desc(verifiedSavings.verifiedAt)).limit(5000);
  const latestByExperiment = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!latestByExperiment.has(row.experimentId)) latestByExperiment.set(row.experimentId, row);
  const due = [...latestByExperiment.values()]
    .filter((row) => row.verifiedAt.getTime() <= cutoff)
    .slice(0, 100);

  const results: Array<Record<string, unknown>> = [];
  for (const snapshot of due) {
    const outcome = await reverifyExperimentSavings(db, snapshot.organizationId, snapshot.experimentId, "scheduled_reverification");
    results.push({
      organizationId: snapshot.organizationId,
      experimentId: snapshot.experimentId,
      priorVersion: snapshot.version,
      result: outcome.kind,
      status: outcome.kind === "revalidated" ? outcome.status : outcome.kind,
      resultingVersion: outcome.kind === "revalidated" ? outcome.record.version : null,
    });
  }

  return Response.json({
    data: {
      ageDays,
      experimentsDue: due.length,
      experimentsChecked: results.length,
      results,
      executedAt: new Date().toISOString(),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = execute;
export const POST = execute;
