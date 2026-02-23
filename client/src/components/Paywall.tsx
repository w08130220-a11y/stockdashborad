/**
 * 💎 Paywall — 升級彈窗
 *
 * 功能被限制時自動彈出，顯示方案比較和升級按鈕。
 * LAUNCH_MODE 下顯示「目前免費體驗中」。
 */

import { useState } from "react";
import { useSubscription, type PlanId } from "@/contexts/SubscriptionContext";
import { useI18n } from "@/contexts/I18nContext";
import { trpc } from "@/lib/trpc";
import { X, Check, Crown, Zap, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free: <Zap size={20} />,
  pro: <Crown size={20} />,
  premium: <Sparkles size={20} />,
};

const PLAN_COLORS: Record<string, string> = {
  free: "var(--muted-foreground)",
  pro: "var(--color-stock-blue, oklch(0.6 0.15 250))",
  premium: "var(--primary)",
};

export function Paywall() {
  const { isPaywallOpen, hidePaywall, paywallFeature, plans, planId, isLaunchMode } = useSubscription();
  const { t, locale } = useI18n();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");

  const checkoutMutation = trpc.subscription.createCheckout.useMutation({
    onSuccess(data) {
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank");
      } else {
        toast.info(data.message || t("sub.notReady"));
      }
    },
    onError() {
      toast.error(t("sub.checkoutError"));
    },
  });

  if (!isPaywallOpen) return null;

  const featureLabel = paywallFeature ? t(`sub.feature.${paywallFeature}`) : "";

  const featureRows: Array<{ key: string; label: string; free: boolean; pro: boolean; premium: boolean }> = [
    { key: "holdings", label: t("sub.feat.holdings"), free: true, pro: true, premium: true },
    { key: "watchlist", label: t("sub.feat.watchlist"), free: true, pro: true, premium: true },
    { key: "trailingStop", label: t("sub.feat.trailingStop"), free: false, pro: true, premium: true },
    { key: "excelImport", label: t("sub.feat.excelImport"), free: false, pro: true, premium: true },
    { key: "multiCurrency", label: t("sub.feat.multiCurrency"), free: false, pro: true, premium: true },
    { key: "realtimeRefresh", label: t("sub.feat.realtime"), free: false, pro: true, premium: true },
    { key: "priceAlerts", label: t("sub.feat.priceAlerts"), free: false, pro: true, premium: true },
    { key: "aiAnalysis", label: t("sub.feat.aiAnalysis"), free: false, pro: false, premium: true },
    { key: "exportPDF", label: t("sub.feat.exportPDF"), free: false, pro: false, premium: true },
    { key: "prioritySupport", label: t("sub.feat.prioritySupport"), free: false, pro: false, premium: true },
  ];

  const handleUpgrade = (targetPlan: PlanId) => {
    checkoutMutation.mutate({
      planId: targetPlan as "pro" | "premium",
      billingCycle,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) hidePaywall(); }}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl w-full overflow-hidden"
        style={{ maxWidth: 780, maxHeight: "90vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("sub.upgradeTitle")}</h2>
            {featureLabel && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("sub.featureRequires", { feature: featureLabel })}
              </p>
            )}
            {isLaunchMode && (
              <p className="text-xs mt-1 font-medium" style={{ color: "var(--color-stock-green)" }}>
                🎉 {t("sub.launchBanner")}
              </p>
            )}
          </div>
          <button onClick={hidePaywall} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center gap-2 py-4">
          <button
            onClick={() => setBillingCycle("monthly")}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              billingCycle === "monthly" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {t("sub.monthly")}
          </button>
          <button
            onClick={() => setBillingCycle("yearly")}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              billingCycle === "yearly" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {t("sub.yearly")} <span className="opacity-70">({t("sub.save17")})</span>
          </button>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-5 pb-2">
          {(["free", "pro", "premium"] as PlanId[]).map((pid) => {
            const plan = plans.find(p => p.id === pid);
            if (!plan) return null;
            const isCurrent = planId === pid;
            const isHighlighted = pid === "pro";
            const price = billingCycle === "yearly"
              ? locale === "zh-TW" ? plan.price.yearly.twd : plan.price.yearly.usd
              : locale === "zh-TW" ? plan.price.monthly.twd : plan.price.monthly.usd;
            const currSym = locale === "zh-TW" ? "NT$" : "$";
            const perMonth = billingCycle === "yearly" ? Math.round(price / 12) : price;

            return (
              <div
                key={pid}
                className="rounded-xl p-4 flex flex-col"
                style={{
                  border: isHighlighted ? `2px solid ${PLAN_COLORS[pid]}` : "1px solid var(--border)",
                  background: isHighlighted ? "var(--secondary)" : "var(--card)",
                  position: "relative",
                }}
              >
                {plan.badge && (
                  <span
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: PLAN_COLORS[pid] }}
                  >
                    {locale === "zh-TW" ? plan.badge : "POPULAR"}
                  </span>
                )}

                <div className="flex items-center gap-2 mb-2">
                  <span style={{ color: PLAN_COLORS[pid] }}>{PLAN_ICONS[pid]}</span>
                  <span className="font-bold text-foreground">
                    {locale === "zh-TW" ? plan.name["zh-TW"] : plan.name.en}
                  </span>
                </div>

                <div className="mb-3">
                  {price === 0 ? (
                    <span className="text-2xl font-bold text-foreground">{t("sub.free")}</span>
                  ) : (
                    <>
                      <span className="text-2xl font-bold text-foreground">{currSym}{perMonth}</span>
                      <span className="text-xs text-muted-foreground"> /{t("sub.perMonth")}</span>
                      {billingCycle === "yearly" && (
                        <div className="text-[10px] text-muted-foreground">
                          {t("sub.billedYearly", { total: `${currSym}${price}` })}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <p className="text-xs text-muted-foreground mb-3">
                  {locale === "zh-TW" ? plan.description["zh-TW"] : plan.description.en}
                </p>

                {/* Limits */}
                <div className="text-xs text-muted-foreground space-y-1 mb-4 flex-1">
                  <div>{t("sub.upTo")} {plan.limits.maxHoldings === -1 ? "∞" : plan.limits.maxHoldings} {t("sub.feat.holdings")}</div>
                  <div>{t("sub.upTo")} {plan.limits.maxWatchlist === -1 ? "∞" : plan.limits.maxWatchlist} {t("sub.feat.watchlist")}</div>
                  <div>{t("sub.upTo")} {plan.limits.maxPriceAlerts === -1 ? "∞" : plan.limits.maxPriceAlerts} {t("sub.feat.priceAlerts")}</div>
                </div>

                {/* CTA */}
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full py-2 rounded-lg text-xs font-medium bg-muted text-muted-foreground"
                  >
                    {t("sub.currentPlan")}
                  </button>
                ) : pid === "free" ? (
                  <div className="h-9" /> /* spacer */
                ) : (
                  <button
                    onClick={() => handleUpgrade(pid)}
                    disabled={checkoutMutation.isPending}
                    className="w-full py-2 rounded-lg text-xs font-bold text-white transition-colors hover:opacity-90"
                    style={{ backgroundColor: PLAN_COLORS[pid] }}
                  >
                    {checkoutMutation.isPending ? t("common.loading") : t("sub.upgrade")}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Feature Comparison Table */}
        <div className="px-5 py-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-muted-foreground font-medium">{t("sub.features")}</th>
                <th className="text-center py-2 text-muted-foreground font-medium w-16">Free</th>
                <th className="text-center py-2 font-medium w-16" style={{ color: PLAN_COLORS.pro }}>Pro</th>
                <th className="text-center py-2 font-medium w-16" style={{ color: PLAN_COLORS.premium }}>Premium</th>
              </tr>
            </thead>
            <tbody>
              {featureRows.map(row => (
                <tr key={row.key} className="border-b border-border/50">
                  <td className="py-1.5 text-foreground">{row.label}</td>
                  <td className="text-center">{row.free ? <Check size={14} className="inline text-green-600" /> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="text-center">{row.pro ? <Check size={14} className="inline text-green-600" /> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="text-center">{row.premium ? <Check size={14} className="inline text-green-600" /> : <span className="text-muted-foreground">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 text-center text-[10px] text-muted-foreground">
          {t("sub.footer")}
        </div>
      </div>
    </div>
  );
}
