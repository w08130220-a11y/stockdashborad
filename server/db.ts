import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  holdings,
  watchlist,
  cashFlows,
  trailingStops,
  cashBalance,
  priceAlerts,
  stockCache,
  type Holding,
  type InsertHolding,
  type WatchlistItem,
  type InsertWatchlistItem,
  type CashFlow,
  type InsertCashFlow,
  type InsertTrailingStop,
  type PriceAlert,
  type InsertPriceAlert,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((f) => {
    const v = user[f];
    if (v !== undefined) { values[f] = v ?? null; updateSet[f] = v ?? null; }
  });
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Holdings ───
export async function getHoldings(userId: number): Promise<Holding[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(holdings).where(eq(holdings.userId, userId));
}

export async function upsertHolding(data: InsertHolding & { id?: number }) {
  const db = await getDb();
  if (!db) return;
  if (data.id) {
    await db.update(holdings).set({
      symbol: data.symbol, name: data.name, shares: data.shares,
      avgCost: data.avgCost, sector: data.sector,
      market: data.market || "US", currency: data.currency || "USD",
    }).where(and(eq(holdings.id, data.id), eq(holdings.userId, data.userId)));
  } else {
    await db.insert(holdings).values({
      ...data,
      market: data.market || "US",
      currency: data.currency || "USD",
    }).onDuplicateKeyUpdate({
      set: {
        name: data.name, shares: data.shares, avgCost: data.avgCost,
        sector: data.sector, market: data.market || "US", currency: data.currency || "USD",
      },
    });
  }
}

export async function deleteHolding(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(holdings).where(and(eq(holdings.id, id), eq(holdings.userId, userId)));
}

// ─── Watchlist ───
export async function getWatchlist(userId: number): Promise<WatchlistItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(watchlist).where(eq(watchlist.userId, userId));
}

export async function addWatchlistItem(data: InsertWatchlistItem) {
  const db = await getDb();
  if (!db) return;
  await db.insert(watchlist).values({
    ...data,
    market: data.market || "US",
    currency: data.currency || "USD",
  }).onDuplicateKeyUpdate({
    set: { symbol: data.symbol, market: data.market || "US", currency: data.currency || "USD" },
  });
}

export async function deleteWatchlistItem(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(watchlist).where(and(eq(watchlist.id, id), eq(watchlist.userId, userId)));
}

// ─── Cash Flows ───
export async function getCashFlows(userId: number): Promise<CashFlow[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cashFlows).where(eq(cashFlows.userId, userId));
}

export async function upsertCashFlow(data: InsertCashFlow & { id?: number }) {
  const db = await getDb();
  if (!db) return;
  if (data.id) {
    await db.update(cashFlows).set({
      date: data.date, inflow: data.inflow, outflow: data.outflow, category: data.category, note: data.note,
    }).where(and(eq(cashFlows.id, data.id), eq(cashFlows.userId, data.userId)));
  } else {
    await db.insert(cashFlows).values(data);
  }
}

export async function deleteCashFlow(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(cashFlows).where(and(eq(cashFlows.id, id), eq(cashFlows.userId, userId)));
}

export async function bulkReplaceCashFlows(userId: number, rows: Array<{ date: string; inflow: string; outflow: string; category?: string }>) {
  const db = await getDb();
  if (!db) return;
  await db.delete(cashFlows).where(eq(cashFlows.userId, userId));
  if (rows.length > 0) {
    await db.insert(cashFlows).values(rows.map((r) => ({ userId, date: r.date, inflow: r.inflow, outflow: r.outflow, category: r.category })));
  }
}

// ─── Trailing Stops ───
export async function getTrailingStops(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(trailingStops).where(eq(trailingStops.userId, userId));
}

export async function upsertTrailingStop(data: InsertTrailingStop) {
  const db = await getDb();
  if (!db) return;
  await db.insert(trailingStops).values(data).onDuplicateKeyUpdate({
    set: {
      trailPct: data.trailPct,
      ...(data.takeProfitPrice !== undefined ? { takeProfitPrice: data.takeProfitPrice } : {}),
    },
  });
}

// ─── Cash Balance ───
export async function getCashBalance(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select().from(cashBalance).where(eq(cashBalance.userId, userId)).limit(1);
  return result[0] ? parseFloat(String(result[0].balance)) : 0;
}

export async function setCashBalance(userId: number, balance: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(cashBalance).values({ userId, balance: String(balance) })
    .onDuplicateKeyUpdate({ set: { balance: String(balance) } });
}

// ─── Price Alerts ───
export async function getPriceAlerts(userId: number): Promise<PriceAlert[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(priceAlerts).where(eq(priceAlerts.userId, userId));
}

export async function getActivePriceAlerts(): Promise<PriceAlert[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(priceAlerts).where(eq(priceAlerts.active, true));
}

export async function createPriceAlert(data: InsertPriceAlert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(priceAlerts).values(data);
}

export async function deletePriceAlert(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(priceAlerts).where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)));
}

export async function markAlertTriggered(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(priceAlerts).set({
    triggered: true,
    triggeredAt: new Date(),
    active: false,
  }).where(eq(priceAlerts.id, id));
}

export async function togglePriceAlert(id: number, userId: number, active: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(priceAlerts).set({ active }).where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)));
}

// ─── Stock Cache (persistent price cache) ───
export async function getStockCacheAll(): Promise<Array<{ symbol: string; data: string; updatedAt: Date }>> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(stockCache);
}

export async function upsertStockCache(symbol: string, data: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(stockCache).values({ symbol, data })
    .onDuplicateKeyUpdate({ set: { data, updatedAt: new Date() } });
}

export async function batchUpsertStockCache(entries: Array<{ symbol: string; data: string }>) {
  const db = await getDb();
  if (!db) return;
  for (const entry of entries) {
    await db.insert(stockCache).values(entry)
      .onDuplicateKeyUpdate({ set: { data: entry.data, updatedAt: new Date() } });
  }
}

// ─── Get all unique symbols across all users (for scheduler) ───
export async function getAllTrackedSymbols(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const holdingRows = await db.select({ symbol: holdings.symbol }).from(holdings);
  const watchlistRows = await db.select({ symbol: watchlist.symbol }).from(watchlist);
  const allSymbols = new Set([
    ...holdingRows.map(r => r.symbol),
    ...watchlistRows.map(r => r.symbol),
  ]);
  return Array.from(allSymbols);
}

// ─── Subscriptions ───
import { subscriptions, paymentHistory } from "../drizzle/schema";

export async function getUserSubscription(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return rows[0] || null;
}

export async function upsertSubscription(userId: number, data: {
  planId: "free" | "pro" | "premium";
  status: "active" | "trialing" | "past_due" | "canceled" | "expired" | "paused";
  billingCycle?: "monthly" | "yearly";
  paymentProvider?: "stripe" | "apple" | "google" | "manual";
  providerSubId?: string;
  providerCustomerId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  trialEndDate?: Date;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(subscriptions).values({
    userId,
    ...data,
  }).onDuplicateKeyUpdate({
    set: {
      planId: data.planId,
      status: data.status,
      billingCycle: data.billingCycle,
      paymentProvider: data.paymentProvider,
      providerSubId: data.providerSubId,
      providerCustomerId: data.providerCustomerId,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      trialEndDate: data.trialEndDate,
    },
  });
}

export async function cancelSubscription(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(subscriptions).set({
    cancelAtPeriodEnd: true,
  }).where(eq(subscriptions.userId, userId));
}

export async function addPaymentRecord(data: {
  userId: number;
  subscriptionId?: number;
  amount: string;
  currency: string;
  status: "succeeded" | "pending" | "failed" | "refunded";
  paymentProvider?: "stripe" | "apple" | "google" | "manual";
  providerPaymentId?: string;
  description?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(paymentHistory).values(data);
}

export async function getPaymentHistory(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(paymentHistory).where(eq(paymentHistory.userId, userId));
}
