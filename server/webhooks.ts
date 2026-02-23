/**
 * 💳 Payment Webhook Handlers — Stripe / Apple IAP / Google Play Billing
 *
 * 這些都是佔位符。上線收費時依照金流服務商接入即可。
 *
 * 串接步驟:
 * 1. Stripe:  npm install stripe → 填入 STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET
 * 2. Apple:   APP 上架後接入 App Store Server Notifications v2
 * 3. Google:  APP 上架後接入 Real-time Developer Notifications (RTDN)
 *
 * 註冊 webhook route:  在 server/_core/index.ts 加入:
 *   import { registerPaymentWebhooks } from "../webhooks";
 *   registerPaymentWebhooks(app);
 */

import type { Express, Request, Response } from "express";
import { upsertSubscription, addPaymentRecord } from "./db";

// ─── ENV (填入後啟用) ───
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const APPLE_SHARED_SECRET = process.env.APPLE_SHARED_SECRET || "";
const GOOGLE_PACKAGE_NAME = process.env.GOOGLE_PACKAGE_NAME || "";

export function registerPaymentWebhooks(app: Express) {
  // ─── Stripe Webhook ───
  app.post("/api/webhooks/stripe", express_raw, async (req: Request, res: Response) => {
    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      return res.status(501).json({ error: "Stripe not configured" });
    }

    try {
      // TODO: Implement when Stripe is set up
      // const stripe = new Stripe(STRIPE_SECRET_KEY);
      // const sig = req.headers["stripe-signature"] as string;
      // const event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
      //
      // switch (event.type) {
      //   case "checkout.session.completed": {
      //     const session = event.data.object;
      //     const userId = Number(session.metadata?.userId);
      //     const planId = session.metadata?.planId as "pro" | "premium";
      //     await upsertSubscription(userId, {
      //       planId,
      //       status: "active",
      //       paymentProvider: "stripe",
      //       providerSubId: session.subscription as string,
      //       providerCustomerId: session.customer as string,
      //     });
      //     break;
      //   }
      //   case "customer.subscription.updated": { ... }
      //   case "customer.subscription.deleted": { ... }
      //   case "invoice.payment_succeeded": { ... }
      //   case "invoice.payment_failed": { ... }
      // }

      res.json({ received: true });
    } catch (err) {
      console.error("[Stripe Webhook] Error:", err);
      res.status(400).json({ error: "Webhook error" });
    }
  });

  // ─── Apple App Store Server Notification v2 ───
  app.post("/api/webhooks/apple", async (req: Request, res: Response) => {
    if (!APPLE_SHARED_SECRET) {
      return res.status(501).json({ error: "Apple IAP not configured" });
    }

    try {
      // TODO: Implement when APP is published on App Store
      // 1. Verify signedPayload JWT using Apple's root CA
      // 2. Decode the JWS transaction
      // 3. Handle notification types:
      //    - DID_RENEW → upsertSubscription(userId, { status: "active" })
      //    - EXPIRED → upsertSubscription(userId, { planId: "free", status: "expired" })
      //    - DID_CHANGE_RENEWAL_STATUS → update cancelAtPeriodEnd
      //    - REFUND → downgrade + addPaymentRecord(... status: "refunded")
      //
      // Reference: https://developer.apple.com/documentation/appstoreservernotifications

      res.json({ received: true });
    } catch (err) {
      console.error("[Apple Webhook] Error:", err);
      res.status(400).json({ error: "Webhook error" });
    }
  });

  // ─── Google Play Real-time Developer Notifications ───
  app.post("/api/webhooks/google", async (req: Request, res: Response) => {
    if (!GOOGLE_PACKAGE_NAME) {
      return res.status(501).json({ error: "Google Play Billing not configured" });
    }

    try {
      // TODO: Implement when APP is published on Google Play
      // 1. Verify the Pub/Sub message from Google
      // 2. Decode subscriptionNotification
      // 3. Call Google Play Developer API to get subscription details
      // 4. Handle notificationType:
      //    - SUBSCRIPTION_PURCHASED (4) → upsertSubscription(...)
      //    - SUBSCRIPTION_RENEWED (2) → upsertSubscription(... status: "active")
      //    - SUBSCRIPTION_CANCELED (3) → cancelAtPeriodEnd = true
      //    - SUBSCRIPTION_EXPIRED (13) → planId: "free", status: "expired"
      //    - SUBSCRIPTION_REVOKED (12) → immediate downgrade
      //
      // Reference: https://developer.android.com/google/play/billing

      res.json({ received: true });
    } catch (err) {
      console.error("[Google Webhook] Error:", err);
      res.status(400).json({ error: "Webhook error" });
    }
  });

  console.log("[Webhooks] Payment webhook routes registered: /api/webhooks/stripe, /api/webhooks/apple, /api/webhooks/google");
}

// Express raw body middleware for Stripe signature verification
function express_raw(req: Request, _res: Response, next: () => void) {
  // Stripe needs raw body for signature verification
  // When implementing: use express.raw({ type: "application/json" }) instead
  next();
}
