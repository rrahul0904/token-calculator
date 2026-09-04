import { randomUUID } from "node:crypto";
import * as z from "zod";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { inferenceEndpoints, pricingOverrides } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

const schema = z.object({
  endpointId: z.string().min(1).max(240),
  values: z.object({
    input: z.number().nonnegative().nullable().optional(),
    cachedInput: z.number().nonnegative().nullable().optional(),
    cacheWrite: z.number().nonnegative().nullable().optional(),
    output: z.number().nonnegative().nullable().optional(),
  }).refine((value) => Object.keys(value).length > 0, "At least one price field is required"),
  reason: z.string().trim().min(8).max(500),
  expiresAt: z.string().datetime().nullable().optional(),
});

function authorized(request: Request) {
  const secret = process.env.PRICING_ADMIN_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === "Bearer " + secret;
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return Response.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  if (!process.env.PRICING_ADMIN_SECRET) return Response.json({ error: "PRICING_ADMIN_NOT_CONFIGURED" }, { status: 503 });
  if (!authorized(request)) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, { status: 400 });
  const db = getDb();
  const endpoint = (await db.select({ id: inferenceEndpoints.id }).from(inferenceEndpoints).where(eq(inferenceEndpoints.id, parsed.data.endpointId)).limit(1))[0];
  if (!endpoint) return Response.json({ error: "ENDPOINT_NOT_FOUND" }, { status: 404 });
  const row = (await db.insert(pricingOverrides).values({
    id: "price_override_" + randomUUID(),
    endpointId: parsed.data.endpointId,
    values: parsed.data.values,
    reason: parsed.data.reason,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  }).returning())[0];
  return Response.json({ data: row }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
