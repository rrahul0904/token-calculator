import { WorkOS } from "@workos-inc/node";
import { processDirectoryLifecycleEvent } from "@/lib/enterprise/directory-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const apiKey = process.env.WORKOS_API_KEY;
  const secret = process.env.WORKOS_WEBHOOK_SECRET;
  if (!apiKey || !secret) return Response.json({ error: "WORKOS_WEBHOOK_NOT_CONFIGURED" }, { status: 503, headers: noStore });
  const sigHeader = request.headers.get("workos-signature");
  if (!sigHeader) return Response.json({ error: "WORKOS_SIGNATURE_REQUIRED" }, { status: 401, headers: noStore });

  const payload = await request.text();
  let normalized: { id: string; event: string; data: Record<string, unknown> };
  try {
    const workos = new WorkOS(apiKey);
    const event = await workos.webhooks.constructEvent({ payload, sigHeader, secret });
    normalized = {
      id: String(event.id),
      event: String(event.event),
      data: event.data as unknown as Record<string, unknown>,
    };
  } catch {
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
