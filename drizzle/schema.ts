import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  float,
  boolean,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Holdings ───
export const holdings = mysqlTable("holdings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  name: text("name").notNull(),
  shares: decimal("shares", { precision: 18, scale: 6 }).notNull(),
  avgCost: decimal("avgCost", { precision: 18, scale: 4 }).notNull(),
  sector: varchar("sector", { length: 64 }).default("Other"),
  market: mysqlEnum("market", ["US", "TW"]).default("US").notNull(),
  currency: mysqlEnum("currency", ["USD", "TWD"]).default("USD").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [uniqueIndex("holdings_user_symbol_idx").on(t.userId, t.symbol)]);

export type Holding = typeof holdings.$inferSelect;
export type InsertHolding = typeof holdings.$inferInsert;

// ─── Watchlist ───
export const watchlist = mysqlTable("watchlist", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  name: text("name").notNull(),
  sector: varchar("sector", { length: 64 }).default("Other"),
  market: mysqlEnum("market", ["US", "TW"]).default("US").notNull(),
  currency: mysqlEnum("currency", ["USD", "TWD"]).default("USD").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [uniqueIndex("watchlist_user_symbol_idx").on(t.userId, t.symbol)]);

export type WatchlistItem = typeof watchlist.$inferSelect;
export type InsertWatchlistItem = typeof watchlist.$inferInsert;

// ─── Cash Flows ───
export const cashFlows = mysqlTable("cash_flows", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  date: varchar("date", { length: 20 }).notNull(),
  inflow: decimal("inflow", { precision: 18, scale: 2 }).notNull().default("0"),
  outflow: decimal("outflow", { precision: 18, scale: 2 }).notNull().default("0"),
  category: varchar("category", { length: 64 }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CashFlow = typeof cashFlows.$inferSelect;
export type InsertCashFlow = typeof cashFlows.$inferInsert;

// ─── Trailing Stop Settings ───
export const trailingStops = mysqlTable("trailing_stops", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  trailPct: decimal("trailPct", { precision: 5, scale: 2 }).notNull().default("15"),
  takeProfitPrice: decimal("takeProfitPrice", { precision: 18, scale: 4 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [uniqueIndex("trailing_user_symbol_idx").on(t.userId, t.symbol)]);

// ─── Stock Price Cache (persistent across restarts) ───
export const stockCache = mysqlTable("stock_cache", {
  id: int("id").autoincrement().primaryKey(),
  symbol: varchar("symbol", { length: 20 }).notNull().unique(),
  data: text("data").notNull(), // JSON serialized StockFullData
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TrailingStop = typeof trailingStops.$inferSelect;
export type InsertTrailingStop = typeof trailingStops.$inferInsert;

// ─── Cash Balance ───
export const cashBalance = mysqlTable("cash_balance", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  balance: decimal("balance", { precision: 18, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CashBalance = typeof cashBalance.$inferSelect;

// ─── Price Alerts ───
export const priceAlerts = mysqlTable("price_alerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  alertType: mysqlEnum("alertType", ["above", "below"]).notNull(), // above = 警報價格高於, below = 警報價格低於
  targetPrice: decimal("targetPrice", { precision: 18, scale: 4 }).notNull(),
  note: varchar("note", { length: 255 }),
  triggered: boolean("triggered").default(false).notNull(),
  triggeredAt: timestamp("triggeredAt"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PriceAlert = typeof priceAlerts.$inferSelect;
export type InsertPriceAlert = typeof priceAlerts.$inferInsert;

// ─── Subscriptions ───
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),  // 1 active subscription per user
  planId: mysqlEnum("planId", ["free", "pro", "premium"]).default("free").notNull(),
  status: mysqlEnum("status", ["active", "trialing", "past_due", "canceled", "expired", "paused"]).default("active").notNull(),
  billingCycle: mysqlEnum("billingCycle", ["monthly", "yearly"]).default("monthly").notNull(),
  paymentProvider: mysqlEnum("paymentProvider", ["stripe", "apple", "google", "manual"]),
  providerSubId: varchar("providerSubId", { length: 255 }),  // Stripe sub ID / Apple receipt / Google token
  providerCustomerId: varchar("providerCustomerId", { length: 255 }), // Stripe customer ID
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
  trialEndDate: timestamp("trialEndDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

// ─── Payment History ───
export const paymentHistory = mysqlTable("payment_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  subscriptionId: int("subscriptionId"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  status: mysqlEnum("paymentStatus", ["succeeded", "pending", "failed", "refunded"]).default("pending").notNull(),
  paymentProvider: mysqlEnum("paymentProvider2", ["stripe", "apple", "google", "manual"]),
  providerPaymentId: varchar("providerPaymentId", { length: 255 }),
  description: varchar("description", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PaymentHistory = typeof paymentHistory.$inferSelect;
