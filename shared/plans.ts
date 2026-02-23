/**
 * 📦 Subscription Plan Definitions
 *
 * 共享於前後端，定義方案等級、功能上限、價格
 * 初期全部免費 (LAUNCH_MODE = true 時所有人享有 Pro 等級)
 * 上線收費時把 LAUNCH_MODE 改成 false 即可
 */

// ─── Launch Mode Toggle ───
// true = 全員免費享有 Pro 功能（初期推廣）
// false = 依照 subscription 記錄判斷等級
export const LAUNCH_MODE = true;

// ─── Plan IDs ───
export type PlanId = "free" | "pro" | "premium";

// ─── Feature Limits ───
export interface PlanLimits {
  maxHoldings: number;        // 持股上限
  maxWatchlist: number;       // 觀察清單上限
  maxPriceAlerts: number;     // 價格警報上限
  trailingStop: boolean;      // 停損停利功能
  excelImport: boolean;       // Excel/CSV 匯入
  multiCurrency: boolean;     // 多幣別（台美股）
  realtimeRefresh: boolean;   // 即時刷新（vs 每日一次）
  customRefreshInterval: boolean; // 自訂刷新頻率
  aiAnalysis: boolean;        // AI 分析建議（未來）
  prioritySupport: boolean;   // 優先客服
  apiAccess: boolean;         // REST API 存取（未來 APP 用）
  exportPDF: boolean;         // 匯出 PDF 報告（未來）
}

// ─── Plan Definition ───
export interface PlanDefinition {
  id: PlanId;
  name: { "zh-TW": string; en: string };
  description: { "zh-TW": string; en: string };
  price: {
    monthly: { usd: number; twd: number };
    yearly: { usd: number; twd: number };   // 年繳折扣
  };
  limits: PlanLimits;
  badge?: string;       // e.g. "推薦", "POPULAR"
  stripePriceId?: {     // Stripe Price ID（未來串接用）
    monthly: string;
    yearly: string;
  };
  revenueCatId?: string; // RevenueCat Product ID（APP 內購用）
}

// ─── Plan Catalog ───
export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: { "zh-TW": "免費方案", en: "Free" },
    description: {
      "zh-TW": "基本持股追蹤，適合入門投資者",
      en: "Basic portfolio tracking for beginners",
    },
    price: {
      monthly: { usd: 0, twd: 0 },
      yearly: { usd: 0, twd: 0 },
    },
    limits: {
      maxHoldings: 5,
      maxWatchlist: 3,
      maxPriceAlerts: 1,
      trailingStop: false,
      excelImport: false,
      multiCurrency: false,
      realtimeRefresh: false,
      customRefreshInterval: false,
      aiAnalysis: false,
      prioritySupport: false,
      apiAccess: false,
      exportPDF: false,
    },
  },

  pro: {
    id: "pro",
    name: { "zh-TW": "Pro 方案", en: "Pro" },
    description: {
      "zh-TW": "進階分析工具，適合活躍投資者",
      en: "Advanced analytics for active investors",
    },
    price: {
      monthly: { usd: 9.99, twd: 299 },
      yearly: { usd: 99, twd: 2990 },     // ~17% off
    },
    badge: "推薦",
    limits: {
      maxHoldings: 30,
      maxWatchlist: 20,
      maxPriceAlerts: 10,
      trailingStop: true,
      excelImport: true,
      multiCurrency: true,
      realtimeRefresh: true,
      customRefreshInterval: false,
      aiAnalysis: false,
      prioritySupport: false,
      apiAccess: true,
      exportPDF: false,
    },
    stripePriceId: {
      monthly: "", // TODO: Fill after Stripe setup
      yearly: "",
    },
    revenueCatId: "pro_monthly", // TODO: Fill after RevenueCat setup
  },

  premium: {
    id: "premium",
    name: { "zh-TW": "Premium 方案", en: "Premium" },
    description: {
      "zh-TW": "無限制功能，適合專業投資人與機構",
      en: "Unlimited features for professionals",
    },
    price: {
      monthly: { usd: 19.99, twd: 599 },
      yearly: { usd: 199, twd: 5990 },    // ~17% off
    },
    limits: {
      maxHoldings: Infinity,
      maxWatchlist: Infinity,
      maxPriceAlerts: Infinity,
      trailingStop: true,
      excelImport: true,
      multiCurrency: true,
      realtimeRefresh: true,
      customRefreshInterval: true,
      aiAnalysis: true,
      prioritySupport: true,
      apiAccess: true,
      exportPDF: true,
    },
    stripePriceId: {
      monthly: "",
      yearly: "",
    },
    revenueCatId: "premium_monthly",
  },
};

// ─── Helper: Get effective plan for a user ───
export function getEffectivePlan(userPlan: PlanId | null | undefined): PlanDefinition {
  // Launch mode: everyone gets Pro
  if (LAUNCH_MODE) return PLANS.pro;
  return PLANS[userPlan || "free"] || PLANS.free;
}

// ─── Helper: Check if a feature is available ───
export function hasFeature(
  userPlan: PlanId | null | undefined,
  feature: keyof PlanLimits
): boolean {
  const plan = getEffectivePlan(userPlan);
  return !!plan.limits[feature];
}

// ─── Helper: Check if within limit ───
export function withinLimit(
  userPlan: PlanId | null | undefined,
  feature: "maxHoldings" | "maxWatchlist" | "maxPriceAlerts",
  currentCount: number
): { allowed: boolean; limit: number; remaining: number } {
  const plan = getEffectivePlan(userPlan);
  const limit = plan.limits[feature] as number;
  return {
    allowed: currentCount < limit,
    limit,
    remaining: Math.max(0, limit - currentCount),
  };
}

// ─── Subscription status types ───
export type SubscriptionStatus =
  | "active"         // 訂閱中
  | "trialing"       // 試用期
  | "past_due"       // 逾期未付
  | "canceled"       // 已取消（到期前仍有效）
  | "expired"        // 已過期
  | "paused";        // 暫停

export type BillingCycle = "monthly" | "yearly";
export type PaymentProvider = "stripe" | "apple" | "google" | "manual";
