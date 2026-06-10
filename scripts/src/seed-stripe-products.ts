import type Stripe from "stripe";
import { getUncachableStripeClient } from "./lib/stripe.js";

/**
 * Idempotently create the KixxMe subscription products and prices in Stripe.
 *
 * Prices use stable `lookup_key`s (plus_month, plus_year, gold_month,
 * gold_year) so the checkout route can resolve them directly without depending
 * on the synced stripe.* tables. Safe to run multiple times.
 *
 * Run with: pnpm --filter @workspace/scripts run seed-stripe
 */

type PlanSpec = {
  tier: "plus" | "gold";
  name: string;
  description: string;
  prices: { lookupKey: string; interval: "month" | "year"; amount: number }[];
};

// Amounts in cents (EUR).
const PLANS: PlanSpec[] = [
  {
    tier: "plus",
    name: "KixxMe Plus",
    description: "KixxMe Plus: funciones premium para conectar más.",
    prices: [
      { lookupKey: "plus_month", interval: "month", amount: 499 },
      { lookupKey: "plus_year", interval: "year", amount: 2999 },
    ],
  },
  {
    tier: "gold",
    name: "KixxMe Gold",
    description: "KixxMe Gold: la experiencia completa sin límites.",
    prices: [
      { lookupKey: "gold_month", interval: "month", amount: 999 },
      { lookupKey: "gold_year", interval: "year", amount: 5999 },
    ],
  },
];

async function findOrCreateProduct(
  stripe: Stripe,
  plan: PlanSpec,
): Promise<Stripe.Product> {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const existing = products.data.find((p) => p.metadata?.tier === plan.tier);
  if (existing) {
    console.log(`Product exists: ${existing.name} (${existing.id})`);
    return existing;
  }
  const created = await stripe.products.create({
    name: plan.name,
    description: plan.description,
    metadata: { tier: plan.tier },
  });
  console.log(`Created product: ${created.name} (${created.id})`);
  return created;
}

async function ensurePrice(
  stripe: Stripe,
  product: Stripe.Product,
  tier: string,
  spec: { lookupKey: string; interval: "month" | "year"; amount: number },
): Promise<void> {
  const existing = await stripe.prices.list({
    lookup_keys: [spec.lookupKey],
    active: true,
    limit: 1,
  });
  const current = existing.data[0];

  // Already at the target amount/currency/interval — nothing to migrate. Just
  // make sure the tier metadata is present (webhook entitlement relies on it).
  if (
    current &&
    current.unit_amount === spec.amount &&
    current.currency === "eur" &&
    current.recurring?.interval === spec.interval
  ) {
    if (current.metadata?.tier !== tier) {
      await stripe.prices.update(current.id, { metadata: { tier } });
    }
    console.log(`Price up-to-date: ${spec.lookupKey} (${current.id})`);
    return;
  }

  // Backfill tier metadata on the OLD price BEFORE moving the lookup_key away.
  // After the transfer the old price loses its lookup_key, so the Stripe webhook
  // can only resolve an existing subscriber's tier via `price.metadata.tier`. If
  // it were missing, the next renewal would resolve tier=null and silently
  // downgrade a still-paying subscriber to free.
  if (current && current.metadata?.tier !== tier) {
    await stripe.prices.update(current.id, { metadata: { tier } });
  }

  // Stripe prices are immutable, so "changing" an amount means creating a NEW
  // price and atomically transferring the stable lookup_key onto it (removing it
  // from the old price). Checkout/upgrades resolve by lookup_key, so they pick
  // up the new amount with no further code changes.
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: spec.amount,
    currency: "eur",
    recurring: { interval: spec.interval },
    lookup_key: spec.lookupKey,
    transfer_lookup_key: true,
    metadata: { tier },
  });

  if (current) {
    // Archive the superseded price so it no longer appears as active. Existing
    // subscriptions keep renewing on it (standard Stripe behavior).
    await stripe.prices.update(current.id, { active: false });
    console.log(
      `Replaced price: ${spec.lookupKey} ${((current.unit_amount ?? 0) / 100).toFixed(2)} -> ${(spec.amount / 100).toFixed(2)} EUR/${spec.interval} (${price.id})`,
    );
  } else {
    console.log(
      `Created price: ${spec.lookupKey} = ${(spec.amount / 100).toFixed(2)} EUR/${spec.interval} (${price.id})`,
    );
  }
}

async function main(): Promise<void> {
  const stripe = await getUncachableStripeClient();
  console.log("Seeding KixxMe products and prices in Stripe...");

  for (const plan of PLANS) {
    const product = await findOrCreateProduct(stripe, plan);
    for (const price of plan.prices) {
      await ensurePrice(stripe, product, plan.tier, price);
    }
  }

  console.log("Done. Webhooks/backfill will sync this into the stripe schema.");
}

main().catch((err) => {
  console.error("Error seeding Stripe products:", err);
  process.exit(1);
});
