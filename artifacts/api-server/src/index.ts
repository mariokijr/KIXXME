import { runMigrations } from "stripe-replit-sync";
import app from "./app";
import { logger } from "./lib/logger";
import { getStripeSync } from "./lib/stripe";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Initialise the Stripe integration. Degrades gracefully: schema migration only
 * needs DATABASE_URL, while the managed-webhook + backfill steps need the Stripe
 * connection. If Stripe is not yet connected, the server still boots and serves
 * all non-Stripe routes.
 */
async function initStripe(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set — skipping Stripe schema migration");
    return;
  }

  try {
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");
  } catch (err) {
    logger.error({ err }, "Failed to run Stripe schema migrations");
  }

  try {
    const sync = await getStripeSync();

    const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (domain) {
      await sync.findOrCreateManagedWebhook(`https://${domain}/api/stripe/webhook`);
      logger.info("Stripe managed webhook ready");
    } else {
      logger.warn("REPLIT_DOMAINS not set — skipping managed webhook setup");
    }

    sync
      .syncBackfill()
      .then(() => logger.info("Stripe data backfill complete"))
      .catch((err) => logger.error({ err }, "Stripe data backfill failed"));
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Stripe not connected — skipping webhook/backfill setup",
    );
  }
}

async function start(): Promise<void> {
  await initStripe();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

start();
