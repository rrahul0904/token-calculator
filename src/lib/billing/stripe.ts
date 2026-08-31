import Stripe from "stripe";
import type { Plan } from "@/db/schema";

let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.STRIPE_PRICE_PRO &&
      process.env.STRIPE_PRICE_TEAM,
  );
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_NOT_CONFIGURED");
  if (!stripeClient) stripeClient = new Stripe(key, { appInfo: { name: "Token Intelligence", version: "0.2.0" } });
  return stripeClient;
}

export function stripePriceForPlan(plan: "pro" | "team"): string | null {
  return plan === "pro" ? process.env.STRIPE_PRICE_PRO ?? null : process.env.STRIPE_PRICE_TEAM ?? null;
}

export function planFromStripePrice(priceId: string | null | undefined): Plan {
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId && priceId === process.env.STRIPE_PRICE_TEAM) return "team";
  return "free";
}

export function isSubscriptionEntitled(status: string): boolean {
  return ["active", "trialing"].includes(status);
}
