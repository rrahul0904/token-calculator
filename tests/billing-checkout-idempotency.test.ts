import { describe, expect, it } from "vitest";
import { checkoutIdempotencyKey, checkoutQuantity } from "@/app/api/v1/billing/checkout/route";

describe("checkout idempotency", () => {
  it("enforces Pro as single-seat while preserving Team quantity", () => {
    expect(checkoutQuantity("pro", undefined)).toBe(1);
    expect(checkoutQuantity("pro", 1)).toBe(1);
    expect(checkoutQuantity("pro", 2)).toBeNull();
    expect(checkoutQuantity("team", 7)).toBe(7);
  });

  it("deduplicates repeated checkout clicks inside the five-minute release window", () => {
    const base = {
      organizationId: "org_release_test",
      plan: "team" as const,
      quantity: 4,
    };
    const first = checkoutIdempotencyKey({ ...base, now: 1_000_000 });
    const second = checkoutIdempotencyKey({ ...base, now: 1_000_100 });
    expect(second).toBe(first);
  });

  it("changes the key when plan, quantity or time window changes", () => {
    const first = checkoutIdempotencyKey({
      organizationId: "org_release_test",
      plan: "pro",
      quantity: 1,
      now: 1_000_000,
    });
    const later = checkoutIdempotencyKey({
      organizationId: "org_release_test",
      plan: "pro",
      quantity: 1,
      now: 1_400_000,
    });
    const team = checkoutIdempotencyKey({
      organizationId: "org_release_test",
      plan: "team",
      quantity: 2,
      now: 1_000_000,
    });
    expect(later).not.toBe(first);
    expect(team).not.toBe(first);
  });
});
