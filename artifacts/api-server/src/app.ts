import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { constructWebhookEvent, getStripeSync } from "./lib/stripe";
import { handleStripeWebhook } from "./lib/billing";

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

    // 1) Verify signature and get the typed event (400 on bad signature).
    let event;
    try {
      event = await constructWebhookEvent(req.body, signature);
    } catch (error) {
      req.log.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Stripe webhook signature verification failed",
      );
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    // 2) Sync Stripe objects into the local `stripe` schema (best effort).
    try {
      const sync = await getStripeSync();
      await sync.processWebhook(req.body, signature);
    } catch (error) {
      req.log.error(
        { error: error instanceof Error ? error.message : String(error) },
        "stripe-replit-sync processWebhook failed",
      );
    }

    // 3) Apply entitlement changes. Return 500 on failure so Stripe retries.
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

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", router);

export default app;
