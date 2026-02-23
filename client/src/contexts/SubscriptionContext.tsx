/**
 * 📦 Subscription Context — 前端訂閱狀態管理
 *
 * 提供:
 *   useSubscription()  — 取得當前方案、檢查功能權限
 *   useFeatureGate()   — 功能門檻 hook（超限自動彈出升級框）
 *   <SubscriptionProvider> — 包在 App 外層
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// Re-export plan types for convenience
export type PlanId = "free" | "pro" | "premium";
export type BillingCycle = "monthly" | "yearly";

interface PlanLimits {
  maxHoldings: number;
  maxWatchlist: number;
  maxPriceAlerts: number;
  trailingStop: boolean;
  excelImport: boolean;
  multiCurrency: boolean;
  realtimeRefresh: boolean;
  customRefreshInterval: boolean;
  aiAnalysis: boolean;
  prioritySupport: boolean;
  apiAccess: boolean;
  exportPDF: boolean;
}

interface PlanInfo {
  id: PlanId;
  name: { "zh-TW": string; en: string };
  description: { "zh-TW": string; en: string };
  price: {
    monthly: { usd: number; twd: number };
    yearly: { usd: number; twd: number };
  };
  limits: PlanLimits;
  badge: string | null;
}

interface SubscriptionState {
  // Current plan
  planId: PlanId;
  status: string;
  isLaunchMode: boolean;
  billingCycle: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;

  // All plans (for pricing page)
  plans: PlanInfo[];

  // Helpers
  isPro: boolean;
  isPremium: boolean;
  isPaid: boolean;

  // Feature checks
  hasFeature: (feature: keyof PlanLimits) => boolean;
  getLimit: (feature: "maxHoldings" | "maxWatchlist" | "maxPriceAlerts") => number;
  withinLimit: (feature: "maxHoldings" | "maxWatchlist" | "maxPriceAlerts", count: number) => boolean;

  // Actions
  showPaywall: (feature?: string) => void;
  hidePaywall: () => void;
  isPaywallOpen: boolean;
  paywallFeature: string | null;

  // Loading
  isLoading: boolean;
}

const SubscriptionContext = createContext<SubscriptionState | null>(null);

// ─── LAUNCH_MODE limits (matches shared/plans.ts Pro tier) ───
const LAUNCH_LIMITS: PlanLimits = {
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
};

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isAuthenticated = !!user;

  const { data: subData, isLoading: subLoading } = trpc.subscription.current.useQuery(
    undefined,
    { enabled: isAuthenticated, staleTime: 60000 }
  );

  const { data: plansData, isLoading: plansLoading } = trpc.subscription.plans.useQuery(
    undefined,
    { staleTime: 300000 }
  );

  const [isPaywallOpen, setPaywallOpen] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState<string | null>(null);

  const planId: PlanId = (subData?.planId as PlanId) || "free";
  const isLaunchMode = subData?.isLaunchMode ?? true;

  // Effective limits (launch mode = Pro for everyone)
  const effectivePlanId = isLaunchMode ? "pro" : planId;
  const effectiveLimits: PlanLimits = isLaunchMode
    ? LAUNCH_LIMITS
    : (plansData?.plans.find(p => p.id === planId)?.limits as PlanLimits) || LAUNCH_LIMITS;

  const hasFeature = useCallback(
    (feature: keyof PlanLimits) => !!effectiveLimits[feature],
    [effectiveLimits]
  );

  const getLimit = useCallback(
    (feature: "maxHoldings" | "maxWatchlist" | "maxPriceAlerts") => {
      const val = effectiveLimits[feature] as number;
      return val === -1 ? Infinity : val;
    },
    [effectiveLimits]
  );

  const withinLimit = useCallback(
    (feature: "maxHoldings" | "maxWatchlist" | "maxPriceAlerts", count: number) => {
      const limit = getLimit(feature);
      return count < limit;
    },
    [getLimit]
  );

  const showPaywall = useCallback((feature?: string) => {
    setPaywallFeature(feature || null);
    setPaywallOpen(true);
  }, []);

  const hidePaywall = useCallback(() => {
    setPaywallOpen(false);
    setPaywallFeature(null);
  }, []);

  const value: SubscriptionState = {
    planId: effectivePlanId,
    status: subData?.status || "active",
    isLaunchMode,
    billingCycle: subData?.billingCycle || null,
    cancelAtPeriodEnd: subData?.cancelAtPeriodEnd || false,
    currentPeriodEnd: subData?.currentPeriodEnd ? new Date(subData.currentPeriodEnd) : null,
    plans: (plansData?.plans || []) as PlanInfo[],
    isPro: effectivePlanId === "pro" || effectivePlanId === "premium",
    isPremium: effectivePlanId === "premium",
    isPaid: effectivePlanId !== "free",
    hasFeature,
    getLimit,
    withinLimit,
    showPaywall,
    hidePaywall,
    isPaywallOpen,
    paywallFeature,
    isLoading: subLoading || plansLoading,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}

/**
 * Feature Gate Hook — 檢查功能權限，超限自動彈出升級框
 *
 * 用法:
 *   const { allowed, gate } = useFeatureGate("trailingStop");
 *   if (!gate()) return; // 如果沒權限，會自動彈升級框
 */
export function useFeatureGate(feature: keyof PlanLimits) {
  const { hasFeature, showPaywall } = useSubscription();
  const allowed = hasFeature(feature);

  const gate = useCallback(() => {
    if (!allowed) {
      showPaywall(feature);
      return false;
    }
    return true;
  }, [allowed, feature, showPaywall]);

  return { allowed, gate };
}

/**
 * Limit Gate Hook — 檢查數量限制
 *
 * 用法:
 *   const { allowed, remaining, gate } = useLimitGate("maxHoldings", holdings.length);
 *   const handleAdd = () => { if (!gate()) return; // proceed };
 */
export function useLimitGate(
  feature: "maxHoldings" | "maxWatchlist" | "maxPriceAlerts",
  currentCount: number
) {
  const { withinLimit, getLimit, showPaywall } = useSubscription();
  const limit = getLimit(feature);
  const allowed = withinLimit(feature, currentCount);
  const remaining = Math.max(0, limit - currentCount);

  const gate = useCallback(() => {
    if (!allowed) {
      showPaywall(feature);
      return false;
    }
    return true;
  }, [allowed, feature, showPaywall]);

  return { allowed, remaining, limit, gate };
}
