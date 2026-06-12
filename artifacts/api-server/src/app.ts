import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import type Stripe from "stripe";
import router from "./routes";
import { logger } from "./lib/logger";
import { getStripeSync } from "./lib/stripe";
import { handleStripeWebhook } from "./lib/billing";
import { handleRevenueCatWebhook, verifyWebhookAuth } from "./lib/revenuecat";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());

// Stripe webhook MUST be registered before express.json() so it receives the
// raw body required for signature verification. Placed after pino-http so
// req.log is available.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sigHeader = req.headers["stripe-signature"];
    const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }
    if (!Buffer.isBuffer(req.body)) {
      req.log.error(
        "Stripe webhook body is not a Buffer — express.json() ran before this route",
      );
      res.status(500).json({ error: "Webhook misconfigured" });
      return;
    }

    // 1) Verify signature AND sync Stripe objects into the local `stripe`
    // schema. stripe-replit-sync owns the managed-webhook signing secret, so
    // verification happens here. A signature failure is a bad/forged request
    // (400, no retry); any other failure is transient (500, Stripe retries).
    try {
      const sync = await getStripeSync();
      await sync.processWebhook(req.body, signature);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/signature|no signatures found|unable to extract/i.test(message)) {
        req.log.warn({ error: message }, "Stripe webhook signature invalid");
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
      req.log.error({ error: message }, "stripe-replit-sync processWebhook failed");
      res.status(500).json({ error: "Webhook processing failed" });
      return;
    }

    // 2) The payload is now verified, so parse it into a typed event and apply
    // entitlement changes. Return 500 on failure so Stripe retries.
    let event: Stripe.Event;
    try {
      event = JSON.parse(req.body.toString("utf8")) as Stripe.Event;
    } catch {
      req.log.error("Stripe webhook payload was not valid JSON after verification");
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    try {
      await handleStripeWebhook(event, req.log);
      res.status(200).json({ received: true });
    } catch (error) {
      req.log.error(
        {
          type: event.type,
          error: error instanceof Error ? error.message : String(error),
        },
        "Stripe entitlement handling failed",
      );
      res.status(500).json({ error: "Entitlement handling failed" });
    }
  },
);

// 15 MB: a base64-encoded payload is ~33% larger than its bytes, so an 8 MB
// chat photo arrives as ≈10.7 MB of JSON — a 10 MB cap would 413 it before any
// route validation runs. Per-route decoded-size caps stay the real limits.
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// RevenueCat webhook (native in-app purchase entitlements). Unlike Stripe there
// is no HMAC body signature — RevenueCat authenticates with a shared secret in
// the Authorization header — so this can run AFTER express.json(). Kept OUT of
// the OpenAPI contract (machine-to-machine, like the Stripe webhook).
app.post("/api/revenuecat/webhook", async (req, res) => {
  const authHeader = req.headers["authorization"];
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!verifyWebhookAuth(header)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    await handleRevenueCatWebhook(req.body, req.log);
    res.status(200).json({ received: true });
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "RevenueCat entitlement handling failed",
    );
    res.status(500).json({ error: "Entitlement handling failed" });
  }
});

app.use("/api", router);

export default app;
