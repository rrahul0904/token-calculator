export function isTrustedStripePortalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "billing.stripe.com" && !url.username && !url.password;
  } catch {
    return false;
  }
}
