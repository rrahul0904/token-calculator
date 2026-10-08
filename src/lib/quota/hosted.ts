import { createHmac } from "node:crypto";
import { z } from "zod";
import type { ProviderQuotaSnapshot } from "@/lib/quota/types";

const RECEIPT_ID_DOMAIN = "token-intelligence-hosted-quota-receipt-v1";

export const hostedQuotaWindowSchema = z.object({
  label: z.string().trim().min(1).max(120),
  remainingPercent: z.number().finite().min(0).max(100).nullable(),
  resetAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const hostedQuotaSnapshotSchema = z.object({
  provider: z.enum(["codex", "claude", "antigravity", "cursor", "copilot", "kiro", "grok", "opencode-go"]),
  authState: z.enum([
    "active",
    "signed_in_no_allocation",
    "not_signed_in",
    "unsupported_auth",
    "expired",
    "malformed",
    "unavailable",
  ]),
  source: z.literal("provider_reported"),
  fetchedAt: z.string().datetime({ offset: true }),
  accountRef: z.string().regex(/^(?:acct|org)_[a-f0-9]{12}$/).nullable(),
  plan: z.string().trim().min(1).max(120).nullable(),
  windows: z.array(hostedQuotaWindowSchema).max(64),
}).strict();

export const hostedQuotaBatchSchema = z.object({
  snapshots: z.array(hostedQuotaSnapshotSchema).min(1).max(20),
}).strict();

export type HostedQuotaSnapshot = z.infer<typeof hostedQuotaSnapshotSchema>;

/**
 * Build the exact payload allowed to leave the local quota monitor.
 * This is intentionally an allow-list rather than object spreading so future
 * local adapter fields cannot silently become hosted telemetry.
 */
export function toHostedQuotaSnapshot(snapshot: ProviderQuotaSnapshot): HostedQuotaSnapshot {
  return hostedQuotaSnapshotSchema.parse({
    provider: snapshot.provider,
    authState: snapshot.authState,
    source: snapshot.source,
    fetchedAt: snapshot.fetchedAt,
    accountRef: snapshot.accountRef,
    plan: snapshot.plan,
    windows: snapshot.windows.map((window) => ({
      label: window.label,
      remainingPercent: window.remainingPercent,
      resetAt: window.resetAt,
    })),
  });
}

/**
 * Stable receipt identity for hosted retries. Tenant identity is supplied by
 * authenticated server context, never by the upload payload. The snapshot has
 * already passed the strict hosted allow-list before it reaches this function.
 */
export function hostedQuotaReceiptId(options: {
  organizationId: string;
  projectId: string | null;
  snapshot: HostedQuotaSnapshot;
}): string {
  const canonical = JSON.stringify([
    options.organizationId,
    options.projectId ?? "",
    options.snapshot.provider,
    options.snapshot.authState,
    options.snapshot.source,
    options.snapshot.fetchedAt,
    options.snapshot.accountRef ?? "",
    options.snapshot.plan ?? "",
    options.snapshot.windows,
  ]);
  return `quota_${createHmac("sha256", RECEIPT_ID_DOMAIN).update(canonical).digest("hex").slice(0, 32)}`;
}
