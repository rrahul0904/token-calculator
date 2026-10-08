import { and, desc, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { providerQuotaSnapshots } from "@/db/quota-schema";
import { authenticateApiKey, authenticateRequest } from "@/lib/auth/api-auth";
import { hostedQuotaBatchSchema, hostedQuotaReceiptId } from "@/lib/quota/hosted";

const MAX_BYTES = 128 * 1024;

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return reply({ error: "PAYLOAD_TOO_LARGE", maxBytes: MAX_BYTES }, 413);

  // Quota receipts are telemetry metadata, so existing write:events API keys can
  // upload them without granting any provider credential capability.
  const principal = await authenticateApiKey(request, "write:events");
  if (!principal) return reply({ error: "API_KEY_REQUIRED", scope: "write:events" }, 401);

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) return reply({ error: "PAYLOAD_TOO_LARGE", maxBytes: MAX_BYTES }, 413);

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return reply({ error: "INVALID_JSON" }, 400);
  }

  const parsed = hostedQuotaBatchSchema.safeParse(json);
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  const now = new Date();
  const rows = parsed.data.snapshots.map((snapshot) => ({
    id: hostedQuotaReceiptId({
      organizationId: principal.organizationId,
      projectId: principal.projectId,
      snapshot,
    }),
    organizationId: principal.organizationId,
    projectId: principal.projectId,
    provider: snapshot.provider,
    authState: snapshot.authState,
    source: snapshot.source,
    fetchedAt: new Date(snapshot.fetchedAt),
    accountRef: snapshot.accountRef,
    plan: snapshot.plan,
    windows: snapshot.windows,
    receivedAt: now,
  }));

  const inserted = await getDb()
    .insert(providerQuotaSnapshots)
    .values(rows)
    .onConflictDoNothing({ target: providerQuotaSnapshots.id })
    .returning({ id: providerQuotaSnapshots.id, provider: providerQuotaSnapshots.provider });

  return reply({
    data: {
      accepted: inserted.length,
      duplicatesIgnored: rows.length - inserted.length,
      providers: [...new Set(inserted.map((row) => row.provider))],
      receivedAt: now.toISOString(),
    },
  }, inserted.length ? 201 : 200);
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const principal = await authenticateRequest(request);
  if (!principal) return reply({ error: "AUTH_REQUIRED" }, 401);

  const url = new URL(request.url);
  const provider = url.searchParams.get("provider")?.trim() || null;
  const requestedLimit = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(requestedLimit) ? Math.min(200, Math.max(1, Math.trunc(requestedLimit))) : 100;

  const filters = [eq(providerQuotaSnapshots.organizationId, principal.organizationId)];
  if (provider) filters.push(eq(providerQuotaSnapshots.provider, provider));
  if (principal.kind === "api_key" && principal.projectId) {
    filters.push(eq(providerQuotaSnapshots.projectId, principal.projectId));
  }

  const rows = await getDb()
    .select()
    .from(providerQuotaSnapshots)
    .where(and(...filters))
    .orderBy(desc(providerQuotaSnapshots.fetchedAt))
    .limit(limit);

  return reply({
    data: rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      authState: row.authState,
      source: row.source,
      fetchedAt: row.fetchedAt.toISOString(),
      accountRef: row.accountRef,
      plan: row.plan,
      windows: row.windows,
      receivedAt: row.receivedAt.toISOString(),
      projectId: row.projectId,
    })),
  });
}
