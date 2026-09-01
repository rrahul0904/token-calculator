import { WorkOS } from "@workos-inc/node";
import { processDirectoryLifecycleEvent } from "@/lib/enterprise/directory-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const apiKey = process.env.WORKOS_API_KEY;
  const secret = process.env.WORKOS_WEBHOOK_SECRET;
  if (!apiKey || !secret) return Response.json({ error: "WORKOS_WEBHOOK_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const sigHeader = request.headers.get("workos-signature");
  if (!sigHeader) return Response.json({ error: "WORKOS_SIGNATURE_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const payload = await request.text();
  try {
    const workos = new WorkOS(apiKey);
    const event = workos.webhooks.constructEvent({ payload, sigHeader, secret });
    const normalized = {
      id: String(event.id),
      event: String(event.event),
      data: event.data as unknown as Record<string, unknown>,
    };
    if (!normalized.event.startsWith("dsync.")) {
      return Response.json({ accepted: true, ignored: true, event: normalized.event }, { headers: { "Cache-Control": "no-store" } });
    }
    const result = await processDirectoryLifecycleEvent(normalized);
    if (!result.processed && "reason" in result && result.reason === "ORGANIZATION_NOT_FOUND") {
      return Response.json({ error: result.reason }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (!result.processed && "reason" in result) {
      return Response.json({ error: result.reason }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ accepted: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "WORKOS_WEBHOOK_SIGNATURE_INVALID" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}
