import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  getHoldings, upsertHolding, deleteHolding,
  getWatchlist, addWatchlistItem, deleteWatchlistItem,
  getCashFlows, upsertCashFlow, deleteCashFlow, bulkReplaceCashFlows,
  getTrailingStops, upsertTrailingStop,
  getCashBalance, setCashBalance,
  getPriceAlerts, createPriceAlert, deletePriceAlert, markAlertTriggered, togglePriceAlert, getActivePriceAlerts,
} from "./db";

import { batchGetFullData, lookupStock, batchGetQuotes, getCacheStats, flushCacheToDB } from "./stockService";
import { runDailyUpdate } from "./scheduler";
import { subscriptionRouter } from "./subscriptionRouter";

// Helper: detect market from symbol
function detectMarket(symbol: string): { market: "US" | "TW"; currency: "USD" | "TWD" } {
  const upper = symbol.toUpperCase();
  if (upper.endsWith(".TW") || upper.endsWith(".TWO")) {
    return { market: "TW", currency: "TWD" };
  }
  const base = upper.replace(/\.TW$|\.TWO$/i, "");
  if (/^\d{4,6}$/.test(base)) {
    return { market: "TW", currency: "TWD" };
  }
  return { market: "US", currency: "USD" };
}

// Helper: ensure symbol has .TW suffix for Taiwan stocks
function normalizeSymbol(symbol: string): string {
  const upper = symbol.toUpperCase().trim();
  if (upper.endsWith(".TW") || upper.endsWith(".TWO")) return upper;
  const base = upper.replace(/\.TW$|\.TWO$/i, "");
  if (/^\d{4,6}$/.test(base)) return `${base}.TW`;
  return upper;
}

// ─── Default seed data ───
const DEFAULT_HOLDINGS = [
  { symbol: "AAPL", name: "Apple Inc.", shares: "50", avgCost: "178.50", sector: "Technology", market: "US" as const, currency: "USD" as const },
  { symbol: "MSFT", name: "Microsoft Corp.", shares: "30", avgCost: "372.00", sector: "Technology", market: "US" as const, currency: "USD" as const },
  { symbol: "GOOGL", name: "Alphabet Inc.", shares: "20", avgCost: "141.80", sector: "Technology", market: "US" as const, currency: "USD" as const },
  { symbol: "NVDA", name: "NVIDIA Corp.", shares: "40", avgCost: "480.20", sector: "Technology", market: "US" as const, currency: "USD" as const },
  { symbol: "2330.TW", name: "台積電", shares: "1000", avgCost: "580.00", sector: "半導體", market: "TW" as const, currency: "TWD" as const },
  { symbol: "2317.TW", name: "鴻海", shares: "2000", avgCost: "105.00", sector: "電子", market: "TW" as const, currency: "TWD" as const },
  { symbol: "0050.TW", name: "元大台灣50", shares: "500", avgCost: "135.00", sector: "ETF", market: "TW" as const, currency: "TWD" as const },
  { symbol: "JPM", name: "JPMorgan Chase", shares: "35", avgCost: "195.60", sector: "Financial Services", market: "US" as const, currency: "USD" as const },
];

const DEFAULT_WATCHLIST = [
  { symbol: "TSLA", name: "Tesla Inc.", sector: "Consumer Cyclical", market: "US" as const, currency: "USD" as const },
  { symbol: "META", name: "Meta Platforms", sector: "Technology", market: "US" as const, currency: "USD" as const },
  { symbol: "2454.TW", name: "聯發科", sector: "半導體", market: "TW" as const, currency: "TWD" as const },
  { symbol: "2603.TW", name: "長榮", sector: "航運", market: "TW" as const, currency: "TWD" as const },
];

const DEFAULT_CASHFLOWS = [
  { date: "2025-01", inflow: "8000", outflow: "3200" },
  { date: "2025-02", inflow: "8000", outflow: "2800" },
  { date: "2025-03", inflow: "8500", outflow: "4100" },
  { date: "2025-04", inflow: "8000", outflow: "3600" },
  { date: "2025-05", inflow: "9200", outflow: "3900" },
  { date: "2025-06", inflow: "8000", outflow: "2500" },
];

export const appRouter = router({
  system: systemRouter,
  subscription: subscriptionRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Stock Quotes (via yfinance) ─── 
  stock: router({
    quotes: protectedProcedure
      .input(z.object({ symbols: z.array(z.string()) }))
      .query(async ({ input }) => {
        if (input.symbols.length === 0) return [];
        return batchGetQuotes(input.symbols);
      }),

    fullData: protectedProcedure
      .input(z.object({ symbols: z.array(z.string()) }))
      .query(async ({ input }) => {
        if (input.symbols.length === 0) return [];
        return batchGetFullData(input.symbols);
      }),

    singleFull: protectedProcedure
      .input(z.object({ symbol: z.string() }))
      .query(async ({ input }) => {
        const results = await batchGetFullData([input.symbol]);
        return results[0] || null;
      }),

    // Lookup stock info (name, sector, price) for adding new holdings
    lookup: protectedProcedure
      .input(z.object({ symbol: z.string() }))
      .query(async ({ input }) => {
        return lookupStock(input.symbol);
      }),

    cacheStats: protectedProcedure.query(() => {
      return getCacheStats();
    }),

    // Manual refresh: force re-fetch all symbols (bypasses cache)
    forceRefresh: protectedProcedure
      .input(z.object({ symbols: z.array(z.string()) }))
      .mutation(async ({ input }) => {
        const result = await runDailyUpdate(input.symbols);
        return result;
      }),

    // Flush in-memory cache to database for persistence
    flushCache: protectedProcedure.mutation(async () => {
      const count = await flushCacheToDB();
      return { flushed: count };
    }),
  }),

  // ─── Holdings ───
  holdings: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      let rows = await getHoldings(ctx.user.id);
      if (rows.length === 0) {
        for (const h of DEFAULT_HOLDINGS) {
          await upsertHolding({ userId: ctx.user.id, ...h });
        }
        rows = await getHoldings(ctx.user.id);
      }
      return rows.map((r) => ({
        id: r.id,
        symbol: r.symbol,
        name: r.name,
        shares: parseFloat(String(r.shares)),
        avgCost: parseFloat(String(r.avgCost)),
        sector: r.sector || "Other",
        market: (r.market || "US") as "US" | "TW",
        currency: (r.currency || "USD") as "USD" | "TWD",
      }));
    }),

    upsert: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        symbol: z.string().min(1),
        name: z.string().min(1),
        shares: z.number().positive(),
        avgCost: z.number().positive(),
        sector: z.string().default("Other"),
        market: z.enum(["US", "TW"]).optional(),
        currency: z.enum(["USD", "TWD"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const sym = normalizeSymbol(input.symbol);
        const detected = detectMarket(sym);
        await upsertHolding({
          userId: ctx.user.id,
          id: input.id,
          symbol: sym,
          name: input.name,
          shares: String(input.shares),
          avgCost: String(input.avgCost),
          sector: input.sector,
          market: input.market || detected.market,
          currency: input.currency || detected.currency,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteHolding(input.id, ctx.user.id);
        return { success: true };
      }),

    bulkImport: protectedProcedure
      .input(z.array(z.object({
        symbol: z.string().min(1),
        name: z.string().default(""),
        shares: z.number().positive(),
        avgCost: z.number().positive(),
        sector: z.string().default("Other"),
        market: z.enum(["US", "TW"]).optional(),
        currency: z.enum(["USD", "TWD"]).optional(),
      })))
      .mutation(async ({ ctx, input }) => {
        let imported = 0;
        let skipped = 0;
        for (const row of input) {
          try {
            const sym = normalizeSymbol(row.symbol);
            const detected = detectMarket(sym);
            await upsertHolding({
              userId: ctx.user.id,
              symbol: sym,
              name: row.name || sym,
              shares: String(row.shares),
              avgCost: String(row.avgCost),
              sector: row.sector || "Other",
              market: row.market || detected.market,
              currency: row.currency || detected.currency,
            });
            imported++;
          } catch {
            skipped++;
          }
        }
        return { success: true, imported, skipped };
      }),
  }),

  // ─── Watchlist ───
  watchlist: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      let rows = await getWatchlist(ctx.user.id);
      if (rows.length === 0) {
        for (const w of DEFAULT_WATCHLIST) {
          await addWatchlistItem({ userId: ctx.user.id, ...w });
        }
        rows = await getWatchlist(ctx.user.id);
      }
      return rows.map((r) => ({
        ...r,
        market: (r.market || "US") as "US" | "TW",
        currency: (r.currency || "USD") as "USD" | "TWD",
      }));
    }),

    add: protectedProcedure
      .input(z.object({
        symbol: z.string().min(1),
        name: z.string().default(""),
        sector: z.string().default("Other"),
        market: z.enum(["US", "TW"]).optional(),
        currency: z.enum(["USD", "TWD"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const sym = normalizeSymbol(input.symbol);
        const detected = detectMarket(sym);
        // Auto-lookup name and sector if not provided
        let name = input.name || sym;
        let sector = input.sector || "Other";
        try {
          const info = await lookupStock(sym);
          if (info) {
            name = input.name || info.name || sym;
            sector = (input.sector && input.sector !== "Other") ? input.sector : (info.sector || "Other");
          }
        } catch (e) {
          // Lookup failed, use defaults
        }
        await addWatchlistItem({
          userId: ctx.user.id,
          symbol: sym,
          name,
          sector,
          market: input.market || detected.market,
          currency: input.currency || detected.currency,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteWatchlistItem(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ─── Cash Flows ───
  cashflow: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      let rows = await getCashFlows(ctx.user.id);
      if (rows.length === 0) {
        for (const cf of DEFAULT_CASHFLOWS) {
          await upsertCashFlow({ userId: ctx.user.id, ...cf });
        }
        rows = await getCashFlows(ctx.user.id);
      }
      return rows.map((r) => ({
        id: r.id,
        date: r.date,
        inflow: parseFloat(String(r.inflow)),
        outflow: parseFloat(String(r.outflow)),
        note: r.note,
      }));
    }),

    upsert: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        date: z.string().min(1),
        inflow: z.number().min(0),
        outflow: z.number().min(0),
        note: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertCashFlow({
          userId: ctx.user.id,
          id: input.id,
          date: input.date,
          inflow: String(input.inflow),
          outflow: String(input.outflow),
          note: input.note,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteCashFlow(input.id, ctx.user.id);
        return { success: true };
      }),

    bulkReplace: protectedProcedure
      .input(z.array(z.object({
        date: z.string(),
        inflow: z.number(),
        outflow: z.number(),
      })))
      .mutation(async ({ ctx, input }) => {
        await bulkReplaceCashFlows(
          ctx.user.id,
          input.map((r) => ({ date: r.date, inflow: String(r.inflow), outflow: String(r.outflow) }))
        );
        return { success: true };
      }),

    getBalance: protectedProcedure.query(async ({ ctx }) => {
      const balance = await getCashBalance(ctx.user.id);
      return { balance };
    }),

    setBalance: protectedProcedure
      .input(z.object({ balance: z.number().min(0) }))
      .mutation(async ({ ctx, input }) => {
        await setCashBalance(ctx.user.id, input.balance);
        return { success: true };
      }),
  }),

  // ─── Price Alerts ───
  priceAlert: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await getPriceAlerts(ctx.user.id);
      return rows.map((r) => ({
        id: r.id,
        symbol: r.symbol,
        alertType: r.alertType as "above" | "below",
        targetPrice: parseFloat(String(r.targetPrice)),
        note: r.note || "",
        triggered: r.triggered,
        triggeredAt: r.triggeredAt,
        active: r.active,
        createdAt: r.createdAt,
      }));
    }),

    create: protectedProcedure
      .input(z.object({
        symbol: z.string().min(1),
        alertType: z.enum(["above", "below"]),
        targetPrice: z.number().positive(),
        note: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await createPriceAlert({
          userId: ctx.user.id,
          symbol: normalizeSymbol(input.symbol),
          alertType: input.alertType,
          targetPrice: String(input.targetPrice),
          note: input.note || null,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deletePriceAlert(input.id, ctx.user.id);
        return { success: true };
      }),

    toggle: protectedProcedure
      .input(z.object({ id: z.number(), active: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await togglePriceAlert(input.id, ctx.user.id, input.active);
        return { success: true };
      }),

    // Manual check: fetch current prices and fire notifications for triggered alerts
    checkAndNotify: protectedProcedure.mutation(async () => {
      const alerts = await getActivePriceAlerts();
      if (alerts.length === 0) return { triggered: 0 };

      // Group by symbol to batch fetch
      const symbols = Array.from(new Set(alerts.map((a) => a.symbol)));
      let triggered = 0;
      try {
        const quotes = await batchGetQuotes(symbols);
        const priceMap: Record<string, number> = {};
        quotes.forEach((q) => { priceMap[q.symbol] = q.price; });

        for (const alert of alerts) {
          const price = priceMap[alert.symbol];
          if (price === undefined || price === 0) continue;
          const target = parseFloat(String(alert.targetPrice));
          const hit = alert.alertType === "above" ? price >= target : price <= target;
          if (hit) {
            await markAlertTriggered(alert.id);
            const direction = alert.alertType === "above" ? "高於" : "低於";
            console.log(`[PriceAlert] 觸發: ${alert.symbol} $${price.toFixed(2)} ${direction} $${target.toFixed(2)}`);
            triggered++;
          }
        }
      } catch (e) {
        console.warn("[PriceAlert] check failed:", e);
      }
      return { triggered };
    }),
  }),

  // ─── Trailing Stops ───
  trailingStop: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await getTrailingStops(ctx.user.id);
      return rows.map((r) => ({
        symbol: r.symbol,
        trailPct: parseFloat(String(r.trailPct)),
      }));
    }),

    set: protectedProcedure
      .input(z.object({
        symbol: z.string().min(1),
        trailPct: z.number().min(1).max(50),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertTrailingStop({
          userId: ctx.user.id,
          symbol: normalizeSymbol(input.symbol),
          trailPct: String(input.trailPct),
        });
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
