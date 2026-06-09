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
      { lookupKey: "plus_month", interval: "month", amount: 999 },
      { lookupKey: "plus_year", interval: "year", amount: 5999 },
    ],
  },
  {
    tier: "gold",
    name: "KixxMe Gold",
    description: "KixxMe Gold: la experiencia completa sin límites.",
    prices: [
      { lookupKey: "gold_month", interval: "month", amount: 1999 },
      { lookupKey: "gold_year", interval: "year", amount: 11999 },
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
  if (existing.data.length > 0) {
    console.log(`Price exists: ${spec.lookupKey} (${existing.data[0]!.id})`);
    return;
  }
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: spec.amount,
    currency: "eur",
    recurring: { interval: spec.interval },
    lookup_key: spec.lookupKey,
    metadata: { tier },
  });
  console.log(
    `Created price: ${spec.lookupKey} = ${(spec.amount / 100).toFixed(2)} EUR/${spec.interval} (${price.id})`,
  );
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
