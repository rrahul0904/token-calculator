import { createHmac, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { alertDeliveries, alertEndpoints } from "@/db/controls-schema";
import { decryptSecret, encryptSecret } from "@/lib/security/vault";

export type AlertEventType =
  | "budget.warned"
  | "budget.blocked"
  | "run.killed"
  | "fallback.approval_required"
  | "provider.connection_failed"
  | "gateway.quota_exceeded";

export interface AlertEnvelope {
  eventType: AlertEventType;
  organizationId: string;
  resourceType: string;
  resourceId?: string | null;
  occurredAt?: Date;
  data: Record<string, unknown>;
}

function endpointAad(organizationId: string, endpointId: string) {
  return `token-intelligence:${organizationId}:alert-endpoint:${endpointId}:v1`;
}

export function encryptAlertUrl(url: string, organizationId: string, endpointId: string) {
  return encryptSecret(url, endpointAad(organizationId, endpointId));
}

export function decryptAlertUrl(ciphertext: string, organizationId: string, endpointId: string) {
  return decryptSecret(ciphertext, endpointAad(organizationId, endpointId));
}

export function isPrivateV4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value))) return true;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

export function isPrivateAddress(address: string) {
  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
  }
  return isPrivateV4(address);
}

export async function validateAlertDestination(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("INVALID_WEBHOOK_URL"); }
  if (url.protocol !== "https:") throw new Error("WEBHOOK_HTTPS_REQUIRED");
  if (url.username || url.password) throw new Error("WEBHOOK_USERINFO_FORBIDDEN");
  if (["localhost", "metadata.google.internal"].includes(url.hostname.toLowerCase())) throw new Error("WEBHOOK_PRIVATE_HOST_FORBIDDEN");
  const results = await lookup(url.hostname, { all: true, verbatim: true });
  if (!results.length || results.some((result) => isPrivateAddress(result.address))) throw new Error("WEBHOOK_PRIVATE_HOST_FORBIDDEN");
  return url.toString();
}

function signingSecret() {
  const secret = process.env.TOKEN_INTELLIGENCE_WEBHOOK_SECRET;
  if (!secret || secret.length < 24) throw new Error("WEBHOOK_SIGNING_SECRET_NOT_CONFIGURED");
  return secret;
}

export function signAlertPayload(timestamp: string, payload: string, secret = signingSecret()) {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

async function deliver(endpoint: typeof alertEndpoints.$inferSelect, envelope: AlertEnvelope) {
  const deliveryId = `ald_${randomUUID()}`;
  const occurredAt = (envelope.occurredAt ?? new Date()).toISOString();
  const payload = JSON.stringify({ id: deliveryId, type: envelope.eventType, occurredAt, resource: { type: envelope.resourceType, id: envelope.resourceId ?? null }, data: envelope.data });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signAlertPayload(timestamp, payload);
  const decryptedDestination = decryptAlertUrl(endpoint.encryptedUrl, endpoint.organizationId, endpoint.id);
  let finalStatus = 0;
  let delivered = false;
  let attempts = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    attempts = attempt + 1;
    try {
      // Re-resolve the hostname on every attempt; an endpoint that later resolves to
      // loopback/private/link-local space is refused rather than trusted forever.
      const destination = await validateAlertDestination(decryptedDestination);
      const response = await fetch(destination, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Token-Intelligence-Alerts/1.0", "x-ti-delivery": deliveryId, "x-ti-timestamp": timestamp, "x-ti-signature": `sha256=${signature}` },
        body: payload,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(2_500),
      });
      finalStatus = response.status;
      try { await response.body?.cancel(); } catch { /* response body is intentionally ignored */ }
      if (response.ok) { delivered = true; break; }
      if (response.status < 500 && response.status !== 429) break;
    } catch { /* bounded retry below */ }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
  }

  const now = new Date();
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(alertDeliveries).values({ id: deliveryId, organizationId: endpoint.organizationId, endpointId: endpoint.id, eventType: envelope.eventType, resourceType: envelope.resourceType, resourceId: envelope.resourceId ?? null, status: delivered ? "delivered" : "failed", statusCode: finalStatus || null, attemptCount: attempts, deliveredAt: delivered ? now : null });
    await tx.update(alertEndpoints).set(delivered ? { lastDeliveredAt: now, updatedAt: now } : { lastFailureAt: now, updatedAt: now }).where(and(eq(alertEndpoints.id, endpoint.id), eq(alertEndpoints.organizationId, endpoint.organizationId)));
  });
  return delivered;
}

export async function dispatchAlert(envelope: AlertEnvelope) {
  const endpoints = await getDb().select().from(alertEndpoints).where(and(eq(alertEndpoints.organizationId, envelope.organizationId), eq(alertEndpoints.enabled, true)));
  const matching = endpoints.filter((endpoint) => endpoint.eventTypes.length === 0 || endpoint.eventTypes.includes(envelope.eventType));
  const results = await Promise.allSettled(matching.map((endpoint) => deliver(endpoint, envelope)));
  return { configured: matching.length, delivered: results.filter((result) => result.status === "fulfilled" && result.value).length };
}
