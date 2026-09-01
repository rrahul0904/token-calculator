import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyGitHubWebhook(body: string, signature: string | null, secret: string): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function explicitRunIdFromText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /(?:\[token-intelligence-run:|\bti-run:)([A-Za-z0-9._:-]{8,180})\]?/i.exec(value);
  return match?.[1] ?? null;
}

export function safeRepositoryName(payload: Record<string, unknown>): string | null {
  const repository = payload.repository && typeof payload.repository === "object" ? payload.repository as Record<string, unknown> : null;
  return typeof repository?.full_name === "string" ? repository.full_name : null;
}

export function safeGitHubDelivery(headers: Headers): string | null {
  const value = headers.get("x-github-delivery");
  return value && /^[A-Za-z0-9-]{6,120}$/.test(value) ? value : null;
}
