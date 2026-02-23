/**
 * Subscription Router — 訂閱管理 API
 *
 * 初期 LAUNCH_MODE=true 時所有人免費享有 Pro 功能。
 * 未來接 Stripe / Apple IAP / Google Play Billing 時，
 * 只需要實作 webhook handler 即可。
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { getUserSubscription, upsertSubscription, cancelSubscription, getPaymentHistory } from "./db";
import { PLANS, LAUNCH_MODE, getEffectivePlan, withinLimit, type PlanId } from "@shared/plans";

export const subscriptionRouter = router({
  // ─── Get current user's subscription ───
  current: protectedProcedure.query(async ({ ctx }) => {
    const sub = await getUserSubscription(ctx.user.id);

    // Check if subscription has expired
    if (sub && sub.status === "active" && sub.currentPeriodEnd) {
      if (new Date() > sub.currentPeriodEnd) {
        // Auto-expire
        await upsertSubscription(ctx.user.id, {
          planId: "free",
          status: "expired",
        });
        return {
          planId: "free" as PlanId,
          status: "expired" as const,
          billingCycle: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          isLaunchMode: LAUNCH_MODE,
        };
      }
    }

    return {
      planId: (sub?.planId || "free") as PlanId,
      status: sub?.status || "active",
      billingCycle: sub?.billingCycle || null,
      currentPeriodEnd: sub?.currentPeriodEnd || null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd || false,
      isLaunchMode: LAUNCH_MODE,
    };
  }),

  // ─── Get all plan definitions ───
  plans: publicProcedure.query(() => {
    return {
      plans: Object.values(PLANS).map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        limits: {
          ...p.limits,
          maxHoldings: p.limits.maxHoldings === Infinity ? -1 : p.limits.maxHoldings,
          maxWatchlist: p.limits.maxWatchlist === Infinity ? -1 : p.limits.maxWatchlist,
          maxPriceAlerts: p.limits.maxPriceAlerts === Infinity ? -1 : p.limits.maxPriceAlerts,
        },
        badge: p.badge || null,
      })),
      launchMode: LAUNCH_MODE,
    };
  }),

  // ─── Check feature availability ───
  checkLimit: protectedProcedure
    .input(z.object({
      feature: z.enum(["maxHoldings", "maxWatchlist", "maxPriceAlerts"]),
      currentCount: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const sub = await getUserSubscription(ctx.user.id);
      const planId = (sub?.planId || "free") as PlanId;
      return withinLimit(planId, input.feature, input.currentCount);
    }),

  // ─── Create checkout session (Stripe) ───
  // Placeholder — implement when Stripe is set up
  createCheckout: protectedProcedure
    .input(z.object({
      planId: z.enum(["pro", "premium"]),
      billingCycle: z.enum(["monthly", "yearly"]),
      successUrl: z.string().url().optional(),
      cancelUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // TODO: Implement Stripe checkout session creation
      // const session = await stripe.checkout.sessions.create({
      //   customer_email: ctx.user.email,
      //   mode: "subscription",
      //   line_items: [{ price: PLANS[input.planId].stripePriceId[input.billingCycle], quantity: 1 }],
      //   success_url: input.successUrl || `${process.env.APP_URL}/subscription?success=true`,
      //   cancel_url: input.cancelUrl || `${process.env.APP_URL}/subscription?canceled=true`,
      //   metadata: { userId: String(ctx.user.id), planId: input.planId },
      // });
      // return { checkoutUrl: session.url };

      // For now, return a placeholder
      return {
        checkoutUrl: null as string | null,
        message: "Stripe 尚未設定，請聯繫管理員",
      };
    }),

  // ─── Cancel subscription ───
  cancel: protectedProcedure.mutation(async ({ ctx }) => {
    const sub = await getUserSubscription(ctx.user.id);
    if (!sub || sub.planId === "free") {
      return { success: false, message: "No active subscription" };
    }

    // TODO: Cancel on Stripe/Apple/Google side
    // if (sub.paymentProvider === "stripe" && sub.providerSubId) {
    //   await stripe.subscriptions.update(sub.providerSubId, { cancel_at_period_end: true });
    // }

    await cancelSubscription(ctx.user.id);
    return { success: true };
  }),

  // ─── Restore after cancellation (before period ends) ───
  restore: protectedProcedure.mutation(async ({ ctx }) => {
    const sub = await getUserSubscription(ctx.user.id);
    if (!sub || !sub.cancelAtPeriodEnd) {
      return { success: false, message: "No canceled subscription to restore" };
    }

    // TODO: Restore on Stripe side
    await upsertSubscription(ctx.user.id, {
      planId: sub.planId as PlanId,
      status: "active",
      cancelAtPeriodEnd: false,
    });
    return { success: true };
  }),

  // ─── Payment history ───
  payments: protectedProcedure.query(async ({ ctx }) => {
    const rows = await getPaymentHistory(ctx.user.id);
    return rows.map(r => ({
      id: r.id,
      amount: parseFloat(String(r.amount)),
      currency: r.currency,
      status: r.status,
      description: r.description,
      createdAt: r.createdAt,
    }));
  }),

  // ─── Admin: manually set a user's plan (for testing / manual upgrades) ───
  adminSetPlan: protectedProcedure
    .input(z.object({
      targetUserId: z.number(),
      planId: z.enum(["free", "pro", "premium"]),
      durationDays: z.number().min(1).default(30),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        return { success: false, message: "Admin only" };
      }
      const now = new Date();
      const end = new Date(now.getTime() + input.durationDays * 86400000);
      await upsertSubscription(input.targetUserId, {
        planId: input.planId,
        status: "active",
        paymentProvider: "manual",
        currentPeriodStart: now,
        currentPeriodEnd: end,
      });
      return { success: true };
    }),
});
