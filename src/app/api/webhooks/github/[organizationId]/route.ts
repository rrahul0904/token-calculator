import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { auditEvents, organizations, outcomes, runs, usageEvents } from "@/db/schema";
import { explicitRunIdFromText, safeGitHubDelivery, safeRepositoryName, verifyGitHubWebhook } from "@/lib/github/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;
function record(value: unknown): JsonRecord | null { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null; }
function string(value: unknown): string | null { return typeof value === "string" ? value : null; }
function number(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function bool(value: unknown): boolean | null { return typeof value === "boolean" ? value : null; }

async function resolveRun(organizationId: string, repo: string | null, sha: string | null, explicitRunId: string | null) {
  const db = getDb();
  if (explicitRunId) {
    const rows = await db.select().from(runs).where(and(eq(runs.organizationId, organizationId), eq(runs.id, explicitRunId))).limit(1);
    return rows[0] ? { run: rows[0], confidence: 1, association: "explicit" } : null;
  }
  if (!repo || !sha) return null;
  const rows = await db.select().from(runs).where(and(eq(runs.organizationId, organizationId), eq(runs.repo, repo), eq(runs.repoCommitSha, sha))).orderBy(desc(runs.startedAt)).limit(2);
  if (rows.length !== 1) return null;
  return { run: rows[0], confidence: 0.9, association: "strong" };
}

async function mergeOutcome(organizationId: string, runId: string, patch: Partial<{ status: string; commitSha: string | null; prNumber: number | null; ciPassed: boolean | null; merged: boolean | null; deploymentSuccessful: boolean | null; associationConfidence: number; metadata: JsonRecord }>) {
  const db = getDb();
  const existing = await db.select().from(outcomes).where(and(eq(outcomes.organizationId, organizationId), eq(outcomes.runId, runId))).limit(1);
  const now = new Date();
  if (existing[0]) {
    const previous = existing[0];
    await db.update(outcomes).set({
      status: patch.status ?? previous.status,
      commitSha: patch.commitSha !== undefined ? patch.commitSha : previous.commitSha,
      prNumber: patch.prNumber !== undefined ? patch.prNumber : previous.prNumber,
      ciPassed: patch.ciPassed !== undefined ? patch.ciPassed : previous.ciPassed,
      merged: patch.merged !== undefined ? patch.merged : previous.merged,
      deploymentSuccessful: patch.deploymentSuccessful !== undefined ? patch.deploymentSuccessful : previous.deploymentSuccessful,
      associationConfidence: (patch.associationConfidence ?? Number(previous.associationConfidence ?? 0)).toString(),
      metadata: { ...(previous.metadata as JsonRecord), ...(patch.metadata ?? {}) },
      updatedAt: now,
    }).where(eq(outcomes.id, previous.id));
    return previous.id;
  }
  const id = `out_${randomUUID()}`;
  await db.insert(outcomes).values({
    id,
    organizationId,
    runId,
    status: patch.status ?? "linked",
    commitSha: patch.commitSha ?? null,
    prNumber: patch.prNumber ?? null,
    ciPassed: patch.ciPassed ?? null,
    merged: patch.merged ?? null,
    deploymentSuccessful: patch.deploymentSuccessful ?? null,
    associationConfidence: (patch.associationConfidence ?? 0).toString(),
    metadata: patch.metadata ?? {},
  });
  return id;
}

export async function POST(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  if (!isDatabaseConfigured()) return Response.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "GITHUB_WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
  const { organizationId } = await context.params;
  const organization = await getDb().select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!organization[0]) return Response.json({ error: "ORGANIZATION_NOT_FOUND" }, { status: 404 });

  const raw = await request.text();
  if (!verifyGitHubWebhook(raw, request.headers.get("x-hub-signature-256"), secret)) return Response.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  const delivery = safeGitHubDelivery(request.headers);
  const event = request.headers.get("x-github-event") ?? "unknown";
  if (!delivery) return Response.json({ error: "INVALID_DELIVERY_ID" }, { status: 400 });
  let payload: JsonRecord;
  try { payload = JSON.parse(raw) as JsonRecord; } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }

  const db = getDb();
  const inserted = await db.insert(usageEvents).values({
    id: `evt_${randomUUID()}`,
    organizationId,
    sourceEventId: delivery,
    source: "github_webhook",
    eventType: `github.${event}`,
    occurredAt: new Date(),
    payload: { event, repository: safeRepositoryName(payload), action: string(payload.action) },
  }).onConflictDoNothing().returning({ id: usageEvents.id });
  if (!inserted[0]) return Response.json({ data: { duplicate: true } }, { status: 200, headers: { "Cache-Control": "no-store" } });

  const repo = safeRepositoryName(payload);
  let sha: string | null = null;
  let explicitRunId: string | null = null;
  let patch: Parameters<typeof mergeOutcome>[2] = { metadata: { githubEvent: event } };

  if (event === "pull_request") {
    const pr = record(payload.pull_request);
    const head = record(pr?.head);
    sha = string(head?.sha);
    explicitRunId = explicitRunIdFromText(pr?.body);
    const merged = bool(pr?.merged);
    const prNumber = number(payload.number);
    patch = { status: merged ? "merged" : "pull_request", commitSha: sha, prNumber, merged, metadata: { githubEvent: event, action: string(payload.action) } };
  } else if (event === "check_run") {
    const check = record(payload.check_run);
    sha = string(check?.head_sha);
    const conclusion = string(check?.conclusion);
    patch = { status: conclusion === "success" ? "ci_passed" : "ci_checked", commitSha: sha, ciPassed: conclusion === null ? null : conclusion === "success", metadata: { githubEvent: event, checkConclusion: conclusion } };
  } else if (event === "check_suite") {
    const check = record(payload.check_suite);
    sha = string(check?.head_sha);
    const conclusion = string(check?.conclusion);
    patch = { status: conclusion === "success" ? "ci_passed" : "ci_checked", commitSha: sha, ciPassed: conclusion === null ? null : conclusion === "success", metadata: { githubEvent: event, checkConclusion: conclusion } };
  } else if (event === "deployment_status") {
    const deployment = record(payload.deployment);
    const status = record(payload.deployment_status);
    sha = string(deployment?.sha);
    const state = string(status?.state);
    patch = { status: state === "success" ? "deployed" : "deployment_updated", commitSha: sha, deploymentSuccessful: state === null ? null : state === "success", metadata: { githubEvent: event, deploymentState: state } };
  } else if (event === "push") {
    sha = string(payload.after);
    const headCommit = record(payload.head_commit);
    explicitRunId = explicitRunIdFromText(headCommit?.message);
    patch = { status: "commit_observed", commitSha: sha, metadata: { githubEvent: event } };
  } else {
    return Response.json({ data: { accepted: true, linked: false, reason: "EVENT_NOT_USED_FOR_OUTCOME" } }, { status: 202, headers: { "Cache-Control": "no-store" } });
  }

  const resolved = await resolveRun(organizationId, repo, sha, explicitRunId);
  if (!resolved) return Response.json({ data: { accepted: true, linked: false, reason: "NO_UNAMBIGUOUS_RUN_ASSOCIATION" } }, { status: 202, headers: { "Cache-Control": "no-store" } });
  patch.associationConfidence = resolved.confidence;
  patch.metadata = { ...(patch.metadata ?? {}), association: resolved.association, repository: repo };
  const outcomeId = await mergeOutcome(organizationId, resolved.run.id, patch);
  await db.update(runs).set({ outcomeStatus: patch.status ?? null, repoCommitSha: sha ?? resolved.run.repoCommitSha, updatedAt: new Date() }).where(and(eq(runs.id, resolved.run.id), eq(runs.organizationId, organizationId)));
  await db.insert(auditEvents).values({ id: `aud_${randomUUID()}`, organizationId, actorType: "integration", actorId: "github", action: "github.outcome_linked", resourceType: "run", resourceId: resolved.run.id, details: { event, outcomeId, association: resolved.association } });
  return Response.json({ data: { accepted: true, linked: true, runId: resolved.run.id, outcomeId, association: resolved.association } }, { headers: { "Cache-Control": "no-store" } });
}
