import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { providerUsageImports } from "@/db/gap-closure-schema";
import { providerUsageImportRows } from "@/db/import-schema";
import { requireTenant } from "@/lib/auth/session";
import { assertImportCommitSafe, previewProviderUsageImport } from "@/lib/imports/provider-usage";

const requestSchema = z.object({
  sourceIdentity: z.string().trim().min(1).max(240),
  provider: z.string().trim().min(1).max(120).optional(),
  format: z.enum(["csv", "json"]).optional(),
  text: z.string().min(1).max(10_000_000),
  commit: z.boolean().default(false),
});

function reply(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }

export async function GET() {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("usage:read");
    const rows = await getDb().select().from(providerUsageImports).where(eq(providerUsageImports.organizationId, tenant.organizationId)).orderBy(desc(providerUsageImports.createdAt)).limit(100);
    return reply({ data: rows });
  } catch (error) { return reply({ error: error instanceof Error ? error.message : "AUTHORIZATION_FAILED" }, 403); }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  try {
    const tenant = await requireTenant("integrations:manage");
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    const preview = previewProviderUsageImport(parsed.data.text, { sourceIdentity: parsed.data.sourceIdentity, provider: parsed.data.provider, format: parsed.data.format });
    if (!parsed.data.commit) return reply({ data: preview, committed: false });

    const existing = await getDb().select({ sourceHash: providerUsageImports.sourceHash }).from(providerUsageImports).where(eq(providerUsageImports.organizationId, tenant.organizationId));
    assertImportCommitSafe(preview, existing.map((row) => row.sourceHash));

    const periodStarts = preview.validRows.map((row) => Date.parse(row.periodStart));
    const periodEnds = preview.validRows.map((row) => Date.parse(row.periodEnd));
    const importId = `pui_${randomUUID()}`;
    await getDb().transaction(async (tx) => {
      await tx.insert(providerUsageImports).values({
        id: importId,
        organizationId: tenant.organizationId,
        provider: parsed.data.provider ?? preview.validRows[0]?.provider ?? "unknown",
        sourceIdentity: parsed.data.sourceIdentity,
        periodStart: new Date(Math.min(...periodStarts)),
        periodEnd: new Date(Math.max(...periodEnds)),
        sourceHash: preview.sourceHash,
        status: "committed",
        totalCostUsd: preview.totalCostUsd === null ? null : preview.totalCostUsd.toString(),
        rowCount: preview.validRows.length,
        provenance: preview.provenance,
        metadata: {
          format: preview.format,
          runAttributedCostUsd: preview.attribution.runAttributedCostUsd,
          unattributedCostUsd: preview.attribution.unattributedCostUsd,
          runAttributionCoveragePct: preview.attribution.runAttributionCoveragePct,
          rawContentStored: false,
        },
      });
      if (preview.validRows.length) {
        await tx.insert(providerUsageImportRows).values(preview.validRows.map((row) => ({
          id: `puir_${randomUUID()}`,
          organizationId: tenant.organizationId,
          importId,
          sourceRow: row.sourceRow,
          provider: row.provider,
          periodStart: new Date(row.periodStart),
          periodEnd: new Date(row.periodEnd),
          costUsd: row.costUsd === null ? null : row.costUsd.toString(),
          model: row.model,
          userReference: row.user,
          apiKeyReference: row.apiKey,
          projectReference: row.project,
          runReference: row.runId,
          tokens: row.tokens,
        })));
      }
    });
    return reply({ data: { importId, ...preview, validRows: undefined }, committed: true }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "IMPORT_FAILED";
    const status = message === "DUPLICATE_PROVIDER_USAGE_IMPORT" ? 409 : message === "IMPORT_HAS_INVALID_ROWS" || message === "IMPORT_HAS_NO_VALID_ROWS" ? 400 : 403;
    return reply({ error: message }, status);
  }
}
