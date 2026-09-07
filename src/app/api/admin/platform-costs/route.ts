import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { platformCostEntries } from "@/db/schema";
import { PlatformAdminAuthorizationError, recordPlatformAdminAudit, requirePlatformAdmin } from "@/lib/admin/auth";

const entrySchema = z.object({ incurredAt: z.coerce.date(), service: z.string().min(1).max(80), category: z.string().min(1).max(80), environment: z.string().min(1).max(40).default("production"), amountUsd: z.number().finite().nonnegative(), evidenceSource: z.enum(["provider_measured", "invoice_import", "api_import", "manual", "estimated", "unavailable"]), externalReference: z.string().max(200).optional(), notes: z.string().max(1000).optional() });

export async function GET() {
  try { const admin = await requirePlatformAdmin(); await recordPlatformAdminAudit(admin, { action: "platform_cost.list", entityType: "platform_cost_entry" }); return Response.json(await getDb().select().from(platformCostEntries).orderBy(desc(platformCostEntries.incurredAt)).limit(200), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { if (error instanceof PlatformAdminAuthorizationError) return Response.json({ error: "PLATFORM_ADMIN_REQUIRED" }, { status: 403 }); throw error; }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin("finance"); const input = entrySchema.parse(await request.json()); const id = `pce_${randomUUID()}`;
    await getDb().insert(platformCostEntries).values({ id, incurredAt: input.incurredAt, service: input.service, category: input.category, environment: input.environment, amountUsd: input.amountUsd.toFixed(8), evidenceSource: input.evidenceSource, externalReference: input.externalReference ?? null, notes: input.notes ?? null, importedAt: new Date() });
    await recordPlatformAdminAudit(admin, { action: "platform_cost.create", entityType: "platform_cost_entry", entityId: id, metadata: { service: input.service, category: input.category, evidenceSource: input.evidenceSource } });
    return Response.json({ id }, { status: 201 });
  } catch (error) { if (error instanceof PlatformAdminAuthorizationError) return Response.json({ error: "PLATFORM_ADMIN_REQUIRED" }, { status: 403 }); if (error instanceof z.ZodError) return Response.json({ error: "INVALID_PLATFORM_COST_ENTRY", details: error.flatten() }, { status: 400 }); throw error; }
}
