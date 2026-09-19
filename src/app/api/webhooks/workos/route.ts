import { WorkOS } from "@workos-inc/node";
import { processDirectoryLifecycleEvent } from "@/lib/enterprise/directory-sync";
import { resolveWorkosWebhookSecret } from "@/lib/workos/webhook-endpoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const apiKey = process.env.WORKOS_API_KEY?.trim();
  if (!apiKey) return Response.json({ error: "WORKOS_WEBHOOK_NOT_CONFIGURED" }, { status: 503, headers: noStore });
  const sigHeader = request.headers.get("workos-signature");
  if (!sigHeader) return Response.json({ error: "WORKOS_SIGNATURE_REQUIRED" }, { status: 401, headers: noStore });
  const verifiedSigHeader = sigHeader;

  const payload = await request.text();
  let normalized: { id: string; event: string; data: Record<string, unknown> };
  const explicitSecret = process.env.WORKOS_WEBHOOK_SECRET?.trim();
  const workos = new WorkOS(apiKey);

  async function verify(secret: string) {
    const event = await workos.webhooks.constructEvent({ payload, sigHeader: verifiedSigHeader, secret });
    return {
      id: String(event.id),
      event: String(event.event),
      data: event.data as unknown as Record<string, unknown>,
    };
  }

  try {
    const secret = await resolveWorkosWebhookSecret({ apiKey, explicitSecret });
    try {
      normalized = await verify(secret);
    } catch (error) {
      if (explicitSecret) throw error;
      const refreshed = await resolveWorkosWebhookSecret({ apiKey, forceRefresh: true });
      normalized = await verify(refreshed);
    }
  } catch (error) {
    if (error instanceof Error && (
      error.message === "WORKOS_WEBHOOK_NOT_CONFIGURED"
      || error.message === "WORKOS_WEBHOOK_ENDPOINT_NOT_READY"
      || error.message.startsWith("WORKOS_WEBHOOK_LIST_HTTP_")
    )) {
      return Response.json({ error: "WORKOS_WEBHOOK_NOT_CONFIGURED" }, { status: 503, headers: noStore });
    }
    return Response.json({ error: "WORKOS_WEBHOOK_SIGNATURE_INVALID" }, { status: 401, headers: noStore });
  }

  if (!normalized.event.startsWith("dsync.")) {
    return Response.json({ accepted: true, ignored: true, event: normalized.event }, { headers: noStore });
  }

  try {
    const result = await processDirectoryLifecycleEvent(normalized);
    if (!result.processed && "reason" in result && result.reason === "ORGANIZATION_NOT_FOUND") {
      return Response.json({ error: result.reason }, { status: 404, headers: noStore });
    }
    if (!result.processed && "reason" in result) {
      return Response.json({ error: result.reason }, { status: 400, headers: noStore });
    }
    return Response.json({ accepted: true, ...result }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && error.message === "DIRECTORY_SCOPE_VIOLATION") {
      return Response.json({ error: "DIRECTORY_SCOPE_VIOLATION" }, { status: 409, headers: noStore });
    }
    return Response.json({ error: "WORKOS_DIRECTORY_PROCESSING_FAILED" }, { status: 500, headers: noStore });
  }
}
