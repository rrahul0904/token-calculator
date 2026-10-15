import { describe, expect, it } from "vitest";
import { isTrustedStripePortalUrl } from "../scripts/release/stripe-url";

describe("Stripe portal URL validation", () => {
  it("accepts the exact HTTPS customer portal origin", () => {
    expect(isTrustedStripePortalUrl("https://billing.stripe.com/p/session/example")).toBe(true);
  });

  it.each([
    "https://evilstripe.com/p/session/example",
    "https://billing.stripe.com.evil.example/p/session/example",
    "https://portal.billing.stripe.com/p/session/example",
    "http://billing.stripe.com/p/session/example",
    "https://user:pass@billing.stripe.com/p/session/example",
    "not a URL",
  ])("rejects untrusted URL %s", (url) => {
    expect(isTrustedStripePortalUrl(url)).toBe(false);
  });
});
