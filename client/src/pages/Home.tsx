import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { useSubscription, useLimitGate, useFeatureGate } from "@/contexts/SubscriptionContext";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Sparkline } from "@/components/Sparkline";
import {
  fmt, fmtCompact, pct, pctAbs,
  computeSignal, computeTrailingStop, computeTakeProfit,
  volCategoryColor, volCategoryLabel, signalColor, signalBg,
  SECTOR_COLORS, detectMarket,
  type EnrichedHolding, type StockQuote, type SignalType, type SignalReason,
} from "@/lib/stockUtils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  Sun, Moon, TrendingUp, TrendingDown, AlertTriangle, Plus, Trash2,
  RefreshCw, Upload, DollarSign, Activity, BarChart2, Eye, EyeOff, Bell,
  ChevronUp, ChevronDown, Loader2, Edit2, Check, X, Globe, Shield,
} from "lucide-react";

// ─── Types ───
type MarketFilter = "ALL" | "US" | "TW";

interface WatchlistEnriched extends StockQuote {
  id: number;
  signal: SignalType;
  score: number;
  reasons: SignalReason[];
  market: "US" | "TW";
  currency: "USD" | "TWD";
}

// ─── Market Tab Selector ───
function MarketTabs({ value, onChange, t }: { value: MarketFilter; onChange: (v: MarketFilter) => void; t: (k: string) => string }) {
  const tabs: { key: MarketFilter; label: string }[] = [
    { key: "ALL", label: t("market.all") },
    { key: "US", label: t("market.us") },
    { key: "TW", label: t("market.tw") },
  ];
  return (
    <div className="flex gap-1 bg-muted rounded-lg p-0.5">
      {tabs.map((tab) => (
        <button key={tab.key} onClick={() => onChange(tab.key)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${value === tab.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Gauge Component ───
function Gauge({ score }: { score: number }) {
  const color = score >= 70 ? "var(--color-stock-green)" : score >= 40 ? "var(--color-stock-yellow)" : "var(--color-stock-red)";
  return (
    <svg width={52} height={36} viewBox="0 0 52 36">
      <path d="M6 32 A20 20 0 0 1 46 32" fill="none" stroke="var(--border)" strokeWidth="4" strokeLinecap="round" />
      <path d="M6 32 A20 20 0 0 1 46 32" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * 62.8} 62.8`} />
      <text x="26" y="34" textAnchor="middle" fontSize="10" fontWeight="700" fill={color}>{score}</text>
    </svg>
  );
}

// ─── Signal Badge ───
function SignalBadge({ signal }: { signal: SignalType }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      letterSpacing: "0.04em",
      background: signalBg(signal), color: signalColor(signal),
      border: `1px solid ${signalColor(signal)}40`,
    }}>
      {signal}
    </span>
  );
}

// ─── Signal Badge with Tooltip ───
function SignalBadgeWithTooltip({ signal, reasons, locale }: { signal: SignalType; reasons: SignalReason[]; locale: string }) {
  const [show, setShow] = useState(false);
  const metReasons = reasons.filter((r) => r.met);
  return (
    <div className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
        letterSpacing: "0.04em", cursor: "help",
        background: signalBg(signal), color: signalColor(signal),
        border: `1px solid ${signalColor(signal)}40`,
      }}>
        {signal}
        <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
      </span>
      {show && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          zIndex: 50, minWidth: 200, maxWidth: 280,
          background: "var(--popover)", color: "var(--popover-foreground)",
          border: "1px solid var(--border)", borderRadius: 10,
          padding: "10px 12px", boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          fontSize: 11,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12, color: signalColor(signal) }}>
            {signal}
          </div>
          {metReasons.length === 0 ? (
            <div style={{ color: "var(--muted-foreground)" }}>{locale === "zh-TW" ? "無資料" : "No data"}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {metReasons.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: r.bullish ? "var(--color-stock-green)" : "var(--color-stock-red)",
                  }} />
                  <span style={{ color: r.bullish ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>
                    {r.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Vol Badge ───
function VolBadge({ cat, locale }: { cat: string; locale: string }) {
  const color = volCategoryColor(cat);
  const isHigh = cat === "高波動" || cat === "High" || cat === "high";
  const isMid = cat === "中波動" || cat === "Medium" || cat === "mid";
  const bg = isHigh ? "var(--color-stock-red-bg)" : isMid ? "var(--color-stock-yellow-bg)" : "var(--color-stock-green-bg)";
  const label = isHigh ? (locale === "zh-TW" ? "高波動" : "High") : isMid ? (locale === "zh-TW" ? "中波動" : "Medium") : (locale === "zh-TW" ? "低波動" : "Low");
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600, background: bg, color, border: `1px solid ${color}30` }}>
      {label}
    </span>
  );
}

// ─── Stat Card ───
function StatCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
        {icon && <span style={{ color: color || "var(--primary)" }}>{icon}</span>}
        {label}
      </div>
      <div className="text-2xl font-bold tracking-tight" style={{ color: color || "var(--foreground)" }}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ─── Loading Skeleton ───
function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 animate-pulse">
      <div className="h-4 bg-muted rounded w-1/3 mb-3" />
      <div className="h-6 bg-muted rounded w-2/3 mb-2" />
      <div className="h-3 bg-muted rounded w-1/2" />
    </div>
  );
}

// ─── Mock sparkline fallback ───
function mockSparkline(base: number): number[] {
  const arr: number[] = [];
  let v = base;
  for (let i = 0; i < 20; i++) {
    v = v * (1 + (Math.random() - 0.49) * 0.03);
    arr.push(v);
  }
  return arr;
}

// ─── Currency formatter helper ───
function fmtCurrency(amount: number, currency: "USD" | "TWD"): string {
  if (currency === "TWD") {
    return `NT$${amount.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `$${fmt(amount)}`;
}

function fmtCurrencyCompact(amount: number, currency: "USD" | "TWD"): string {
  const prefix = currency === "TWD" ? "NT$" : "$";
  const abs = Math.abs(amount);
  if (currency === "TWD") {
    if (abs >= 1e8) return `${prefix}${(amount / 1e8).toFixed(2)}億`;
    if (abs >= 1e4) return `${prefix}${(amount / 1e4).toFixed(1)}萬`;
    return `${prefix}${amount.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  if (abs >= 1e12) return `${prefix}${(amount / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${prefix}${(amount / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${prefix}${(amount / 1e6).toFixed(2)}M`;
  return `${prefix}${fmt(amount)}`;
}

// ─── Market badge ───
function MarketBadge({ market }: { market: "US" | "TW" }) {
  const isUS = market === "US";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${isUS ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
      {isUS ? "🇺🇸" : "🇹🇼"} {market}
    </span>
  );
}

// ═══════════════════════════════════════════════════════
// ─── Main Dashboard ───
// ═══════════════════════════════════════════════════════
export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const { t, locale, toggleLocale, formatCurrency } = useI18n();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { isLaunchMode, isPro, hasFeature: checkFeature, showPaywall: showUpgrade } = useSubscription();
  const [activeTab, setActiveTab] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [refreshKey, setRefreshKey] = useState(0);

  // ─── Holdings data ───
  const { data: holdingsDb, refetch: refetchHoldings } = trpc.holdings.list.useQuery(undefined, { enabled: isAuthenticated });
  const upsertHolding = trpc.holdings.upsert.useMutation({ onSuccess: () => refetchHoldings() });
  const deleteHoldingMut = trpc.holdings.delete.useMutation({ onSuccess: () => refetchHoldings() });
  const bulkImportHoldingMut = trpc.holdings.bulkImport.useMutation({ onSuccess: () => refetchHoldings() });

  const holdingSymbols = useMemo(() => (holdingsDb || []).map((h) => h.symbol), [holdingsDb]);
  const holdingSymbolsStable = useMemo(() => holdingSymbols, [JSON.stringify(holdingSymbols)]);
  const { data: stockData, isLoading: stockLoading, refetch: refetchStock } = trpc.stock.fullData.useQuery(
    { symbols: holdingSymbolsStable },
    { enabled: holdingSymbolsStable.length > 0, staleTime: 25000 }
  );

  // ─── Watchlist data ───
  const { data: watchlistDb, refetch: refetchWatchlist } = trpc.watchlist.list.useQuery(undefined, { enabled: isAuthenticated });
  const addWatchMut = trpc.watchlist.add.useMutation({ onSuccess: () => refetchWatchlist() });
  const deleteWatchMut = trpc.watchlist.delete.useMutation({ onSuccess: () => refetchWatchlist() });

  const watchSymbols = useMemo(() => (watchlistDb || []).map((w) => w.symbol), [watchlistDb]);
  const watchSymbolsStable = useMemo(() => watchSymbols, [JSON.stringify(watchSymbols)]);
  const { data: watchStockData, isLoading: watchLoading, refetch: refetchWatchStock } = trpc.stock.fullData.useQuery(
    { symbols: watchSymbolsStable },
    { enabled: watchSymbolsStable.length > 0, staleTime: 25000 }
  );

  // ─── Cash flow data ───
  const { data: cashFlowsDb, refetch: refetchCashFlows } = trpc.cashflow.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: balanceData, refetch: refetchBalance } = trpc.cashflow.getBalance.useQuery(undefined, { enabled: isAuthenticated });
  const upsertCashFlow = trpc.cashflow.upsert.useMutation({ onSuccess: () => refetchCashFlows() });
  const deleteCashFlow = trpc.cashflow.delete.useMutation({ onSuccess: () => refetchCashFlows() });
  const bulkReplaceCashFlow = trpc.cashflow.bulkReplace.useMutation({ onSuccess: () => refetchCashFlows() });
  const setBalanceMut = trpc.cashflow.setBalance.useMutation({ onSuccess: () => refetchBalance() });

  // ─── Trailing stop data ───
  const { data: trailingStopsDb, refetch: refetchTrailing } = trpc.trailingStop.list.useQuery(undefined, { enabled: isAuthenticated });
  const setTrailingMut = trpc.trailingStop.set.useMutation({ onSuccess: () => refetchTrailing() });

  // ─── Price alerts data ───
  const { data: priceAlertsDb, refetch: refetchAlerts } = trpc.priceAlert.list.useQuery(undefined, { enabled: isAuthenticated });
  const createAlertMut = trpc.priceAlert.create.useMutation({ onSuccess: () => refetchAlerts() });
  const deleteAlertMut = trpc.priceAlert.delete.useMutation({ onSuccess: () => refetchAlerts() });
  const toggleAlertMut = trpc.priceAlert.toggle.useMutation({ onSuccess: () => refetchAlerts() });
  const checkAlertsMut = trpc.priceAlert.checkAndNotify.useMutation({
    onSuccess: (data) => {
      refetchAlerts();
      if (data.triggered > 0) {
        toast.success(locale === "zh-TW" ? `觸發 ${data.triggered} 個價格警報` : `${data.triggered} alerts triggered`);
      } else {
        toast.info(locale === "zh-TW" ? "目前無警報觸發" : "No alerts triggered");
      }
    },
  });

  // ─── Enrich holdings with market/currency ───
  const enrichedHoldings: EnrichedHolding[] = useMemo(() => {
    if (!holdingsDb || !stockData) return [];
    const deduped = holdingsDb.reduce((acc, h) => {
      acc.set(h.symbol, h);
      return acc;
    }, new Map<string, typeof holdingsDb[0]>());
    return Array.from(deduped.values()).map((h) => {
      const q = (stockData as StockQuote[]).find((s) => s.symbol === h.symbol);
      const price = q?.price || h.avgCost;
      const value = h.shares * price;
      const cost = h.shares * h.avgCost;
      const pnl = value - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      const detected = detectMarket(h.symbol);
      return {
        ...h,
        market: (h as any).market || detected.market,
        currency: (h as any).currency || detected.currency,
        ...(q || {
          symbol: h.symbol, name: h.name, price, prevClose: price,
          change: 0, changePct: 0, high52w: price * 1.2, low52w: price * 0.8,
          ma50: price, ma200: price, rsi: 50, pe: null, divYield: 0,
          marketCap: null, sector: h.sector, earningsGrowth: 0, targetPrice: null, volume: null,
        }),
        sparkline: q?.sparkline?.length ? q.sparkline : mockSparkline(price),
        value, cost, pnl, pnlPct,
      } as EnrichedHolding;
    });
  }, [holdingsDb, stockData]);

  // ─── Enrich watchlist ───
  const enrichedWatchlist: WatchlistEnriched[] = useMemo(() => {
    if (!watchlistDb || !watchStockData) return [];
    return watchlistDb.map((w) => {
      const q = (watchStockData as StockQuote[]).find((s) => s.symbol === w.symbol);
      const base = q || {
        symbol: w.symbol, name: w.name, price: 100, prevClose: 100,
        change: 0, changePct: 0, high52w: 120, low52w: 80,
        ma50: 100, ma200: 100, rsi: 50, pe: null, divYield: 0,
        marketCap: null, sector: w.sector || "Other", earningsGrowth: 0, targetPrice: null, volume: null,
      } as StockQuote;
      const { signal, score, reasons } = computeSignal(base);
      const detected = detectMarket(w.symbol);
      return { id: w.id, ...base, signal, score, reasons, market: (w as any).market || detected.market, currency: (w as any).currency || detected.currency };
    });
  }, [watchlistDb, watchStockData]);

  // ─── Trailing stop + take profit map ───
  const trailingPctMap = useMemo(() => {
    const map: Record<string, number> = {};
    (trailingStopsDb || []).forEach((t) => { map[t.symbol] = t.trailPct; });
    return map;
  }, [trailingStopsDb]);

  const takeProfitMap = useMemo(() => {
    const map: Record<string, number | null> = {};
    (trailingStopsDb || []).forEach((t) => { map[t.symbol] = t.takeProfitPrice ?? null; });
    return map;
  }, [trailingStopsDb]);

  // ─── Auto-refresh every 30s ───
  useEffect(() => {
    const id = setInterval(() => {
      refetchStock();
      refetchWatchStock();
      setLastUpdate(new Date());
      setRefreshKey((k) => k + 1);
    }, 30000);
    return () => clearInterval(id);
  }, [refetchStock, refetchWatchStock]);

  const handleManualRefresh = () => {
    refetchStock();
    refetchWatchStock();
    setLastUpdate(new Date());
    toast.success(locale === "zh-TW" ? "數據已更新" : "Data refreshed");
  };

  // ─── Portfolio totals by currency ───
  const usHoldings = enrichedHoldings.filter((h) => h.market === "US");
  const twHoldings = enrichedHoldings.filter((h) => h.market === "TW");
  const usTotalValue = usHoldings.reduce((s, h) => s + h.value, 0);
  const usTotalCost = usHoldings.reduce((s, h) => s + h.cost, 0);
  const twTotalValue = twHoldings.reduce((s, h) => s + h.value, 0);
  const twTotalCost = twHoldings.reduce((s, h) => s + h.cost, 0);
  const totalValue = usTotalValue + twTotalValue; // mixed for display
  const totalCost = usTotalCost + twTotalCost;
  const totalPnL = totalValue - totalCost;
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
  const cashBalance = balanceData?.balance || 0;

  // ─── Login gate ───
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-8">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <BarChart2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">{t("app.title")}</h1>
          <p className="text-muted-foreground text-sm max-w-sm">
            {locale === "zh-TW" ? "Hedge Fund 風格的專業投資組合管理系統" : "Professional portfolio management system"}
          </p>
        </div>
        <div className="flex gap-3">
          <Button size="lg" onClick={() => (window.location.href = getLoginUrl())}>
            {locale === "zh-TW" ? "登入開始使用" : "Sign In"}
          </Button>
          <Button size="lg" variant="outline" onClick={toggleLocale} className="gap-2">
            <Globe size={16} /> {t("lang.switch")}
          </Button>
        </div>
      </div>
    );
  }

  const TABS = [
    { label: t("nav.overview"), icon: <BarChart2 size={14} /> },
    { label: t("nav.trailingStop"), icon: <Activity size={14} /> },
    { label: t("nav.cashflow"), icon: <DollarSign size={14} /> },
    { label: t("nav.watchlist"), icon: <Eye size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-background transition-colors duration-200">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="container">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">S</div>
              <div>
                <div className="text-sm font-bold text-foreground leading-tight">{t("app.title")}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  Portfolio Intelligence
                  {isLaunchMode && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold" style={{ background: "var(--color-stock-green-bg, #e6f9e8)", color: "var(--color-stock-green, #16a34a)" }}>{t("sub.badge.launch")}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                {lastUpdate.toLocaleTimeString(locale === "zh-TW" ? "zh-TW" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <button onClick={handleManualRefresh} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title={locale === "zh-TW" ? "手動更新" : "Refresh"}>
                <RefreshCw size={15} />
              </button>
              <button onClick={toggleLocale} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title={t("lang.switch")}>
                <Globe size={15} />
              </button>
              <button onClick={toggleTheme} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title={locale === "zh-TW" ? "切換主題" : "Toggle theme"}>
                {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
              </button>
              <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-[10px]">
                  {user?.name?.charAt(0) || "U"}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="container">
          <div className="flex gap-0 border-b border-transparent -mb-px overflow-x-auto">
            {TABS.map((tab, i) => (
              <button key={i} onClick={() => {
                // Gate premium features: tab 1 = trailing stop
                if (i === 1 && !checkFeature("trailingStop")) { showUpgrade("trailingStop"); return; }
                setActiveTab(i);
              }}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === i ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ─── Content ─── */}
      <main className="container py-6">
        {activeTab === 0 && (
          <OverviewTab
            holdings={enrichedHoldings} loading={stockLoading}
            usTotalValue={usTotalValue} usTotalCost={usTotalCost}
            twTotalValue={twTotalValue} twTotalCost={twTotalCost}
            cashBalance={cashBalance}
            onUpsert={(data) => upsertHolding.mutate(data)}
            onDelete={(id) => deleteHoldingMut.mutate({ id })}
            onBalanceChange={(b) => setBalanceMut.mutate({ balance: b })}
            onBulkImport={(rows) => bulkImportHoldingMut.mutate(rows)}
            t={t} locale={locale}
          />
        )}
        {activeTab === 1 && (
          <TrailingStopTab
            holdings={enrichedHoldings} trailingPctMap={trailingPctMap}
            takeProfitMap={takeProfitMap}
            onSetTrailing={(symbol, pct, tp) => setTrailingMut.mutate({ symbol, trailPct: pct, takeProfitPrice: tp })}
            t={t} locale={locale}
          />
        )}
        {activeTab === 2 && (
          <CashFlowTab
            records={cashFlowsDb || []} holdings={enrichedHoldings} loading={false}
            cashBalance={cashBalance}
            onUpsert={(data) => upsertCashFlow.mutate(data)}
            onDelete={(id) => deleteCashFlow.mutate({ id })}
            onBulkReplace={(rows) => bulkReplaceCashFlow.mutate(rows)}
            onBalanceChange={(b) => setBalanceMut.mutate({ balance: b })}
            t={t} locale={locale}
          />
        )}
        {activeTab === 3 && (
          <WatchlistTab
            watchlist={enrichedWatchlist} loading={watchLoading}
            onAdd={(symbol) => addWatchMut.mutate({ symbol })}
            onDelete={(id) => deleteWatchMut.mutate({ id })}
            priceAlerts={priceAlertsDb || []}
            onCreateAlert={(data) => createAlertMut.mutate(data)}
            onDeleteAlert={(id) => deleteAlertMut.mutate({ id })}
            onToggleAlert={(id, active) => toggleAlertMut.mutate({ id, active })}
            onCheckAlerts={() => checkAlertsMut.mutate()}
            t={t} locale={locale}
          />
        )}
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        {t("app.title")} · {locale === "zh-TW" ? "數據每 30 秒自動更新" : "Auto-refresh every 30s"} · Powered by Twelve Data API
      </footer>
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// ─── TAB 1: Overview ───
// ═══════════════════════════════════════════════════════
function OverviewTab({
  holdings, loading, usTotalValue, usTotalCost, twTotalValue, twTotalCost,
  cashBalance, onUpsert, onDelete, onBalanceChange, onBulkImport, t, locale,
}: {
  holdings: EnrichedHolding[]; loading: boolean;
  usTotalValue: number; usTotalCost: number;
  twTotalValue: number; twTotalCost: number;
  cashBalance: number;
  onUpsert: (data: any) => void;
  onDelete: (id: number) => void;
  onBalanceChange: (b: number) => void;
  onBulkImport: (rows: any[]) => void;
  t: (k: string) => string; locale: string;
}) {
  const [filterVol, setFilterVol] = useState("all");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("ALL");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHolding, setNewHolding] = useState({ symbol: "", shares: "", avgCost: "", name: "", sector: "" });
  const [lookupLoading, setLookupLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Subscription gates
  const { withinLimit, hasFeature, showPaywall } = useSubscription();
  const canAddHolding = withinLimit("maxHoldings", holdings.length);
  const canImportExcel = hasFeature("excelImport");
  const [editField, setEditField] = useState<string>("");
  const [editValue, setEditValue] = useState("");
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const usPnl = usTotalValue - usTotalCost;
  const usPnlPct = usTotalCost > 0 ? (usPnl / usTotalCost) * 100 : 0;
  const twPnl = twTotalValue - twTotalCost;
  const twPnlPct = twTotalCost > 0 ? (twPnl / twTotalCost) * 100 : 0;

  const filtered = holdings.filter((h) => {
    if (marketFilter !== "ALL" && h.market !== marketFilter) return false;
    if (filterVol === "all") return true;
    const cat = h.volCategory || "";
    if (filterVol === "high") return cat === "高波動" || cat === "High" || cat === "high";
    if (filterVol === "mid") return cat === "中波動" || cat === "Medium" || cat === "mid";
    if (filterVol === "low") return cat === "低波動" || cat === "Low" || cat === "low";
    return true;
  });

  const sectorData = Object.entries(
    filtered.reduce((acc, h) => { acc[h.sector] = (acc[h.sector] || 0) + h.value; return acc; }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value: +value.toFixed(2) })).sort((a, b) => b.value - a.value);

  // Auto-lookup stock info when symbol is entered
  const lookupUtils = trpc.useUtils();
  const handleSymbolBlur = async () => {
    const sym = newHolding.symbol.trim();
    if (!sym) return;
    setLookupLoading(true);
    try {
      const info = await lookupUtils.stock.lookup.fetch({ symbol: sym });
      if (info) {
        setNewHolding(prev => ({
          ...prev,
          symbol: info.symbol,
          name: prev.name || info.name || info.symbol,
          sector: prev.sector || info.sector || "Other",
        }));
      }
    } catch (e) {
      console.warn("Lookup failed:", e);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleAdd = () => {
    if (!newHolding.symbol || !newHolding.shares || !newHolding.avgCost) return;
    const detected = detectMarket(newHolding.symbol);
    onUpsert({
      symbol: newHolding.symbol.toUpperCase(),
      shares: +newHolding.shares,
      avgCost: +newHolding.avgCost,
      name: newHolding.name || newHolding.symbol.toUpperCase(),
      sector: newHolding.sector || "Other",
      market: detected.market,
      currency: detected.currency,
    });
    setNewHolding({ symbol: "", shares: "", avgCost: "", name: "", sector: "" });
    setShowAddForm(false);
    toast.success(locale === "zh-TW" ? `${newHolding.symbol.toUpperCase()} 已新增` : `${newHolding.symbol.toUpperCase()} added`);
  };

  const startEdit = (id: number, field: string, value: number) => {
    setEditingId(id); setEditField(field); setEditValue(String(value));
  };
  const saveEdit = (h: EnrichedHolding) => {
    const val = parseFloat(editValue);
    if (isNaN(val) || val <= 0) { setEditingId(null); return; }
    onUpsert({
      symbol: h.symbol, shares: editField === "shares" ? val : h.shares,
      avgCost: editField === "avgCost" ? val : h.avgCost,
      name: h.name, sector: h.sector, market: h.market, currency: h.currency,
    });
    setEditingId(null);
    toast.success(locale === "zh-TW" ? "已更新" : "Updated");
  };

  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws) as any[];
        const rows = data.map((r) => {
          const symbol = String(r.symbol || r.Symbol || r["代號"] || "").toUpperCase();
          const detected = detectMarket(symbol);
          return {
            symbol, shares: Number(r.shares || r.Shares || r["股數"] || 0),
            avgCost: Number(r.avgCost || r.AvgCost || r["均價"] || 0),
            name: String(r.name || r.Name || r["名稱"] || r["公司"] || symbol),
            sector: String(r.sector || r.Sector || r["板塊"] || "Other"),
            market: detected.market, currency: detected.currency,
          };
        }).filter((r) => r.symbol && r.shares > 0);
        if (rows.length) setImportPreview(rows);
        else toast.error(locale === "zh-TW" ? "無有效資料" : "No valid data");
      } catch { toast.error(locale === "zh-TW" ? "檔案解析失敗" : "Parse failed"); }
    };
    reader.readAsArrayBuffer(file); e.target.value = "";
  };

  const currSym = (h: EnrichedHolding) => h.currency === "TWD" ? "NT$" : "$";
  const fmtH = (h: EnrichedHolding, n: number) => h.currency === "TWD" ? `NT$${n.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : `$${fmt(n)}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Summary Cards - separated by market */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={`🇺🇸 ${t("overview.totalValue")}`} value={`$${fmt(usTotalValue)}`}
          sub={`${t("overview.totalPnl")}: ${usPnl >= 0 ? "+" : ""}$${fmt(Math.abs(usPnl))} (${pct(usPnlPct)})`}
          color={usPnl >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)"} icon={<TrendingUp size={13} />} />
        <StatCard label={`🇹🇼 ${t("overview.totalValue")}`} value={`NT$${twTotalValue.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          sub={`${t("overview.totalPnl")}: ${twPnl >= 0 ? "+" : ""}NT$${Math.abs(twPnl).toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (${pct(twPnlPct)})`}
          color={twPnl >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)"} icon={<TrendingUp size={13} />} />
        <StatCard label={t("overview.holdingCount")} value={`${holdings.length} ${locale === "zh-TW" ? "檔" : ""}`}
          sub={`🇺🇸 ${holdings.filter(h => h.market === "US").length} / 🇹🇼 ${holdings.filter(h => h.market === "TW").length}`}
          icon={<BarChart2 size={13} />} />
        <StatCard label={locale === "zh-TW" ? "現金水位" : "Cash Balance"} value={`$${fmt(cashBalance)}`} icon={<DollarSign size={13} />} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sector Distribution */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold mb-3">{t("overview.sectorDist")}</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={sectorData} cx="50%" cy="45%" outerRadius={65} innerRadius={35} paddingAngle={2} dataKey="value" nameKey="name"
                label={({ name, percent, cx, cy, midAngle, outerRadius: oR }) => {
                  const RADIAN = Math.PI / 180;
                  const radius = oR + 20;
                  const x = cx + radius * Math.cos(-midAngle * RADIAN);
                  const y = cy + radius * Math.sin(-midAngle * RADIAN);
                  return (
                    <text x={x} y={y} fill="var(--foreground)" fontSize={10} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central">
                      {name} {(percent * 100).toFixed(0)}%
                    </text>
                  );
                }}
                labelLine={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              >
                {sectorData.map((entry) => <Cell key={entry.name} fill={SECTOR_COLORS[entry.name] || "var(--muted-foreground)"} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* P&L Ranking */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold mb-3">{t("overview.pnlRank")}</div>
          <div className="flex flex-col gap-2">
            {[...filtered].sort((a, b) => b.pnlPct - a.pnlPct).slice(0, 8).map((h) => (
              <div key={`${h.id}-${h.symbol}`} className="flex items-center gap-2">
                <MarketBadge market={h.market} />
                <span className="w-16 font-bold text-xs">{h.symbol}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.abs(h.pnlPct) * 2)}%`, background: h.pnlPct >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }} />
                </div>
                <span className="w-14 text-right text-xs font-semibold" style={{ color: h.pnlPct >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>{pct(h.pnlPct)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">{t("overview.holdings")}</span>
            <MarketTabs value={marketFilter} onChange={setMarketFilter} t={t} />
          </div>
          {/* US / TW P&L Summary */}
          <div className="flex items-center gap-4 flex-1 justify-center">
            {usTotalCost > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-muted/50">
                <span className="text-[10px] text-muted-foreground font-medium">{locale === "zh-TW" ? "美股損益" : "US P&L"}</span>
                <span className="text-xs font-bold" style={{ color: usPnl >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>
                  {usPnl >= 0 ? "+" : "-"}${fmt(Math.abs(usPnl))}
                </span>
                <span className="text-[10px]" style={{ color: usPnl >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>
                  ({pct(usPnlPct)})
                </span>
              </div>
            )}
            {twTotalCost > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-muted/50">
                <span className="text-[10px] text-muted-foreground font-medium">{locale === "zh-TW" ? "台股損益" : "TW P&L"}</span>
                <span className="text-xs font-bold" style={{ color: twPnl >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>
                  {twPnl >= 0 ? "+" : "-"}NT${Math.abs(twPnl).toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
                <span className="text-[10px]" style={{ color: twPnl >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>
                  ({pct(twPnlPct)})
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Vol filter */}
            <div className="flex gap-1 bg-muted rounded-lg p-0.5">
              {[
                { key: "all", label: t("overview.volAll") },
                { key: "high", label: t("overview.volHigh") },
                { key: "mid", label: t("overview.volMid") },
                { key: "low", label: t("overview.volLow") },
              ].map((f) => (
                <button key={f.key} onClick={() => setFilterVol(f.key)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${filterVol === f.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => {
              if (!canAddHolding) { showPaywall("maxHoldings"); return; }
              setShowAddForm(!showAddForm);
            }} className="gap-1 text-xs h-7">
              <Plus size={11} /> {t("overview.addHolding")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              if (!canImportExcel) { showPaywall("excelImport"); return; }
              fileRef.current?.click();
            }} className="gap-1 text-xs h-7">
              <Upload size={11} /> {t("overview.bulkImport")}
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleBulkImport} />
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="p-4 border-b border-border bg-muted/20 flex flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">{t("form.symbol")}</label>
              <div className="relative">
                <input value={newHolding.symbol} onChange={(e) => setNewHolding({ ...newHolding, symbol: e.target.value.toUpperCase() })}
                  onBlur={handleSymbolBlur}
                  placeholder={t("form.symbolPlaceholder")} className="w-28 px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground" />
                {lookupLoading && <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">{t("form.shares")}</label>
              <input type="number" value={newHolding.shares} onChange={(e) => setNewHolding({ ...newHolding, shares: e.target.value })}
                placeholder="100" className="w-20 px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">{t("form.avgCost")}</label>
              <input type="number" step="0.01" value={newHolding.avgCost} onChange={(e) => setNewHolding({ ...newHolding, avgCost: e.target.value })}
                placeholder="150.00" className="w-24 px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">{t("form.name")}</label>
              <input value={newHolding.name} onChange={(e) => setNewHolding({ ...newHolding, name: e.target.value })}
                placeholder="Apple Inc." className="w-28 px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">{t("form.sector")}</label>
              <input value={newHolding.sector} onChange={(e) => setNewHolding({ ...newHolding, sector: e.target.value })}
                placeholder="Tech" className="w-20 px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground" />
            </div>
            <Button size="sm" onClick={handleAdd} className="gap-1 text-xs h-8"><Plus size={11} /> {t("form.add")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)} className="text-xs h-8">{t("form.cancel")}</Button>
          </div>
        )}

        {/* Import preview modal */}
        {importPreview && (
          <div className="p-4 border-b border-border bg-muted/20">
            <div className="text-sm font-semibold mb-2">{locale === "zh-TW" ? `預覽匯入 ${importPreview.length} 筆` : `Preview ${importPreview.length} rows`}</div>
            <div className="overflow-x-auto max-h-40 mb-3">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border">
                  {[t("overview.symbol"), locale === "zh-TW" ? "市場" : "Market", t("overview.shares"), t("overview.avgCost"), t("overview.name"), t("overview.sector")].map((h, i) => (
                    <th key={i} className="px-2 py-1 text-left font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr></thead>
                <tbody>{importPreview.map((r, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-2 py-1 font-bold">{r.symbol}</td>
                    <td className="px-2 py-1"><MarketBadge market={r.market} /></td>
                    <td className="px-2 py-1">{r.shares}</td>
                    <td className="px-2 py-1">{r.currency === "TWD" ? "NT$" : "$"}{r.avgCost}</td>
                    <td className="px-2 py-1">{r.name}</td>
                    <td className="px-2 py-1">{r.sector}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { onBulkImport(importPreview); setImportPreview(null); toast.success(locale === "zh-TW" ? `已匯入 ${importPreview.length} 筆` : `Imported ${importPreview.length} rows`); }} className="gap-1 text-xs">
                <Check size={11} /> {t("form.confirm")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setImportPreview(null)} className="text-xs">{t("form.cancel")}</Button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {[locale === "zh-TW" ? "市場" : "Mkt", t("overview.symbol"), t("overview.name"), t("overview.shares"), t("overview.avgCost"),
                  t("overview.price"), t("overview.marketValue"), t("overview.pnl"), t("overview.pnlPct"),
                  t("overview.beta"), t("overview.volCategory"), t("overview.sparkline"), ""].map((h, i) => (
                  <th key={i} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && filtered.length === 0 ? (
                <tr><td colSpan={13} className="px-4 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={13} className="px-4 py-8 text-center text-muted-foreground text-sm">{t("overview.noHoldings")}</td></tr>
              ) : (
                filtered.map((h) => (
                  <tr key={`${h.id}-${h.symbol}`} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5"><MarketBadge market={h.market} /></td>
                    <td className="px-3 py-2.5 font-bold text-foreground text-sm">{h.symbol}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[100px] truncate">{h.name}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {editingId === h.id && editField === "shares" ? (
                        <input autoFocus type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(h); if (e.key === "Escape") setEditingId(null); }}
                          onBlur={() => saveEdit(h)}
                          className="w-16 px-1.5 py-0.5 rounded border border-primary bg-background text-sm" />
                      ) : (
                        <button onClick={() => startEdit(h.id, "shares", h.shares)}
                          className="flex items-center gap-1 hover:text-primary transition-colors group">
                          {h.shares}<Edit2 size={10} className="opacity-0 group-hover:opacity-100 text-muted-foreground" />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {editingId === h.id && editField === "avgCost" ? (
                        <input autoFocus type="number" step="0.01" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(h); if (e.key === "Escape") setEditingId(null); }}
                          onBlur={() => saveEdit(h)}
                          className="w-20 px-1.5 py-0.5 rounded border border-primary bg-background text-sm" />
                      ) : (
                        <button onClick={() => startEdit(h.id, "avgCost", h.avgCost)}
                          className="flex items-center gap-1 hover:text-primary transition-colors group">
                          {fmtH(h, h.avgCost)}<Edit2 size={10} className="opacity-0 group-hover:opacity-100 text-muted-foreground" />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold" style={{ color: h.changePct >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>
                      {fmtH(h, h.price)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">{fmtH(h, h.value)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs" style={{ color: h.pnl >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>
                      {h.pnl >= 0 ? "+" : ""}{fmtH(h, Math.abs(h.pnl))}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-semibold" style={{ color: h.pnlPct >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>
                      {pct(h.pnlPct)}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono">{h.beta?.toFixed(2) || "—"}</td>
                    <td className="px-3 py-2.5"><VolBadge cat={h.volCategory || (locale === "zh-TW" ? "低波動" : "Low")} locale={locale} /></td>
                    <td className="px-3 py-2.5"><Sparkline data={h.sparkline || []} color="auto" width={64} height={24} /></td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => { onDelete(h.id); toast.success(`${h.symbol} ${locale === "zh-TW" ? "已移除" : "removed"}`); }} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// ─── TAB 2: Stop Loss & Take Profit ───
// ═══════════════════════════════════════════════════════
function TrailingStopTab({
  holdings, trailingPctMap, takeProfitMap, onSetTrailing, t, locale,
}: {
  holdings: EnrichedHolding[];
  trailingPctMap: Record<string, number>;
  takeProfitMap: Record<string, number | null>;
  onSetTrailing: (symbol: string, pct: number, tp?: number | null) => void;
  t: (k: string) => string; locale: string;
}) {
  const [localPcts, setLocalPcts] = useState<Record<string, number>>({});
  const [localTargets, setLocalTargets] = useState<Record<string, string>>({});
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("ALL");

  const getPct = (symbol: string) => localPcts[symbol] ?? trailingPctMap[symbol] ?? 15;
  const getTarget = (symbol: string): number | null => {
    if (localTargets[symbol] !== undefined) {
      const v = parseFloat(localTargets[symbol]);
      return isNaN(v) || v <= 0 ? null : v;
    }
    return takeProfitMap[symbol] ?? null;
  };

  const filteredHoldings = holdings.filter((h) => marketFilter === "ALL" || h.market === marketFilter);

  const stopTriggered = filteredHoldings.filter((h) => {
    const p = getPct(h.symbol);
    return computeTrailingStop(h.price, h.high52w, p).triggered;
  });

  const tpTriggered = filteredHoldings.filter((h) => {
    const tp = getTarget(h.symbol);
    return tp ? computeTakeProfit(h.price, tp).triggered : false;
  });

  const fmtP = (h: EnrichedHolding, n: number, digits = 2) => h.currency === "TWD" ? `NT$${n.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : `$${fmt(n, digits)}`;

  const saveTarget = (symbol: string) => {
    const tp = getTarget(symbol);
    const pct = getPct(symbol);
    onSetTrailing(symbol, pct, tp);
    setEditingTarget(null);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label={locale === "zh-TW" ? "監控持股" : "Monitored"} value={`${filteredHoldings.length} ${locale === "zh-TW" ? "檔" : ""}`} icon={<Activity size={13} />} />
        <StatCard label={t("ts.triggered")} value={`${stopTriggered.length} ${locale === "zh-TW" ? "檔" : ""}`} color={stopTriggered.length > 0 ? "var(--color-stock-red)" : "var(--color-stock-green)"} icon={<AlertTriangle size={13} />} />
        <StatCard label={t("ts.tpTriggered")} value={`${tpTriggered.length} ${locale === "zh-TW" ? "檔" : ""}`} color={tpTriggered.length > 0 ? "var(--color-stock-green)" : undefined} icon={<TrendingUp size={13} />} />
        <StatCard label={locale === "zh-TW" ? "平均回撤設定" : "Avg Drawdown"} value={`${(Object.values({ ...trailingPctMap, ...localPcts }).reduce((s, v) => s + v, 0) / Math.max(1, Object.values({ ...trailingPctMap, ...localPcts }).length)).toFixed(1)}%`} icon={<TrendingDown size={13} />} />
        <StatCard label={locale === "zh-TW" ? "安全持股" : "Safe Holdings"} value={`${filteredHoldings.length - stopTriggered.length} ${locale === "zh-TW" ? "檔" : ""}`} color="var(--color-stock-green)" icon={<Shield size={13} />} />
      </div>

      {/* Market filter */}
      <div className="flex items-center gap-3">
        <MarketTabs value={marketFilter} onChange={setMarketFilter} t={t} />
      </div>

      {/* Stop Loss Alert */}
      {stopTriggered.length > 0 && (
        <div className="rounded-xl border-2 p-4 flex items-start gap-3" style={{ borderColor: "var(--color-stock-red)", background: "var(--color-stock-red-bg)" }}>
          <AlertTriangle size={18} style={{ color: "var(--color-stock-red)", flexShrink: 0, marginTop: 1 }} />
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--color-stock-red)" }}>
              {locale === "zh-TW" ? "⚠️ 停損警報" : "⚠️ Stop Loss Alert"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {stopTriggered.map((h) => h.symbol).join("、")} {locale === "zh-TW" ? "已跌破追蹤停損線，建議評估是否執行停損。" : "broke trailing stop line. Consider taking action."}
            </div>
          </div>
        </div>
      )}

      {/* Take Profit Alert */}
      {tpTriggered.length > 0 && (
        <div className="rounded-xl border-2 p-4 flex items-start gap-3" style={{ borderColor: "var(--color-stock-green)", background: "var(--color-stock-green-bg, #e6f9e8)" }}>
          <TrendingUp size={18} style={{ color: "var(--color-stock-green)", flexShrink: 0, marginTop: 1 }} />
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--color-stock-green)" }}>
              {locale === "zh-TW" ? "🎯 停利達標" : "🎯 Take Profit Reached"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {tpTriggered.map((h) => h.symbol).join("、")} {locale === "zh-TW" ? "已達到目標價，建議評估是否獲利了結。" : "reached target price. Consider taking profit."}
            </div>
          </div>
        </div>
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredHoldings.map((h) => {
          const trailPct = getPct(h.symbol);
          const targetPrice = getTarget(h.symbol);
          const { trailPrice, distance, triggered: isStopTriggered } = computeTrailingStop(h.price, h.high52w, trailPct);
          const { triggered: isTpTriggered, distance: tpDistance } = computeTakeProfit(h.price, targetPrice);
          const barWidth = Math.max(0, Math.min(100, ((h.price - h.low52w) / (h.high52w - h.low52w)) * 100));
          const trailBarPos = Math.max(0, Math.min(100, ((trailPrice - h.low52w) / (h.high52w - h.low52w)) * 100));

          const borderColor = isStopTriggered ? "var(--color-stock-red)" : isTpTriggered ? "var(--color-stock-green)" : "var(--border)";
          const borderWidth = isStopTriggered || isTpTriggered ? 2 : 1;

          return (
            <div key={`${h.id}-${h.symbol}`} className="rounded-xl border bg-card p-4 flex flex-col gap-3 transition-all"
              style={{ borderColor, borderWidth }}>
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <MarketBadge market={h.market} />
                    <span className="font-bold text-base text-foreground">{h.symbol}</span>
                    <VolBadge cat={h.volCategory || "Low"} locale={locale} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{h.name}</div>
                </div>
                <div className="flex gap-1">
                  {isStopTriggered && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--color-stock-red-bg)", color: "var(--color-stock-red)" }}>
                      <AlertTriangle size={9} /> {locale === "zh-TW" ? "停損" : "Stop"}
                    </span>
                  )}
                  {isTpTriggered && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--color-stock-green-bg, #e6f9e8)", color: "var(--color-stock-green)" }}>
                      <TrendingUp size={9} /> {locale === "zh-TW" ? "達標" : "Target"}
                    </span>
                  )}
                </div>
              </div>

              {/* Price + Cost + P&L row */}
              <div className="grid grid-cols-4 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">{locale === "zh-TW" ? "現價" : "Price"}</div>
                  <div className="font-bold text-base font-mono">{fmtP(h, h.price)}</div>
                  <div className="text-xs" style={{ color: h.changePct >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>{pct(h.changePct)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("ts.costBasis")}</div>
                  <div className="font-semibold font-mono text-sm">{fmtP(h, h.avgCost)}</div>
                  <div className="text-[10px] text-muted-foreground">{h.shares} {locale === "zh-TW" ? "股" : "sh"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("ts.unrealizedPnl")}</div>
                  <div className="font-semibold font-mono text-sm" style={{ color: h.pnl >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>
                    {h.pnl >= 0 ? "+" : ""}{fmtP(h, Math.abs(h.pnl))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("ts.roi")}</div>
                  <div className="font-bold font-mono text-sm" style={{ color: h.pnlPct >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>
                    {pct(h.pnlPct)}
                  </div>
                </div>
              </div>

              {/* Stop Loss + Take Profit lines */}
              <div className="grid grid-cols-3 gap-2 text-sm border-t border-border pt-2">
                <div>
                  <div className="text-xs text-muted-foreground">{t("ts.stopLine")}</div>
                  <div className="font-semibold font-mono" style={{ color: "var(--color-stock-red)" }}>{fmtP(h, trailPrice)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("ts.high52w")}</div>
                  <div className="font-semibold font-mono">{fmtP(h, h.high52w)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("ts.takeProfit")}</div>
                  {editingTarget === h.symbol ? (
                    <input autoFocus type="number" step="0.01"
                      value={localTargets[h.symbol] ?? (targetPrice || "")}
                      onChange={(e) => setLocalTargets((p) => ({ ...p, [h.symbol]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") saveTarget(h.symbol); if (e.key === "Escape") setEditingTarget(null); }}
                      onBlur={() => saveTarget(h.symbol)}
                      className="w-full px-1.5 py-0.5 rounded border border-primary bg-background text-sm font-mono" />
                  ) : (
                    <button onClick={() => setEditingTarget(h.symbol)}
                      className="flex items-center gap-1 font-semibold font-mono hover:text-primary transition-colors group"
                      style={{ color: targetPrice ? (isTpTriggered ? "var(--color-stock-green)" : "var(--foreground)") : "var(--muted-foreground)" }}>
                      {targetPrice ? fmtP(h, targetPrice) : (locale === "zh-TW" ? "點擊設定" : "Set")}
                      <Edit2 size={9} className="opacity-0 group-hover:opacity-100 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>

              {/* Price bar */}
              <div className="relative h-5">
                <div className="absolute inset-y-0 left-0 right-0 flex items-center">
                  <div className="w-full h-2 rounded-full bg-muted overflow-visible relative">
                    <div className="h-full rounded-full transition-all" style={{ width: `${barWidth}%`, background: isStopTriggered ? "var(--color-stock-red)" : "var(--color-stock-green)" }} />
                    {/* Stop loss marker */}
                    <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full" style={{ left: `${trailBarPos}%`, background: "var(--color-stock-red)" }} title={`${t("ts.stopLine")}: ${fmtP(h, trailPrice)}`} />
                    {/* Take profit marker */}
                    {targetPrice && (() => {
                      const tpPos = Math.max(0, Math.min(100, ((targetPrice - h.low52w) / (h.high52w - h.low52w)) * 100));
                      return <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full" style={{ left: `${tpPos}%`, background: "var(--color-stock-green)" }} title={`${t("ts.takeProfit")}: ${fmtP(h, targetPrice)}`} />;
                    })()}
                    {/* Current price dot */}
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-card shadow" style={{ left: `calc(${barWidth}% - 6px)`, background: isStopTriggered ? "var(--color-stock-red)" : "var(--color-stock-green)" }} />
                  </div>
                </div>
                <div className="absolute -bottom-4 left-0 text-[9px] text-muted-foreground">{fmtP(h, h.low52w, 0)}</div>
                <div className="absolute -bottom-4 right-0 text-[9px] text-muted-foreground">{fmtP(h, h.high52w, 0)}</div>
              </div>

              {/* Distance to stop + Distance to target */}
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("ts.distance")}</span>
                  <span className="font-semibold" style={{ color: distance > 8 ? "var(--color-stock-green)" : distance > 3 ? "var(--color-stock-yellow)" : "var(--color-stock-red)" }}>
                    {distance > 0 ? `+${distance}%` : `${distance}%`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("ts.tpDistance")}</span>
                  <span className="font-semibold" style={{ color: targetPrice ? (isTpTriggered ? "var(--color-stock-green)" : "var(--foreground)") : "var(--muted-foreground)" }}>
                    {targetPrice ? (tpDistance > 0 ? `${tpDistance}%` : `${locale === "zh-TW" ? "已達標" : "Reached"}`) : (locale === "zh-TW" ? "—" : "—")}
                  </span>
                </div>
              </div>

              {/* Drawdown slider */}
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground whitespace-nowrap">{t("ts.drawdown")}</span>
                <input type="range" min={5} max={30} step={1} value={trailPct}
                  onChange={(e) => setLocalPcts((p) => ({ ...p, [h.symbol]: +e.target.value }))}
                  onMouseUp={() => onSetTrailing(h.symbol, getPct(h.symbol), getTarget(h.symbol))}
                  onTouchEnd={() => onSetTrailing(h.symbol, getPct(h.symbol), getTarget(h.symbol))}
                  className="flex-1 h-1.5" />
                <span className="font-bold w-8 text-right text-primary">{trailPct}%</span>
              </div>

              <div className="flex justify-end">
                <Sparkline data={h.sparkline || []} color="auto" width={80} height={24} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// ─── TAB 3: Cash Flow ───
// ═══════════════════════════════════════════════════════
function CashFlowTab({
  records, holdings, loading, cashBalance,
  onUpsert, onDelete, onBulkReplace, onBalanceChange, t, locale,
}: {
  records: any[]; holdings: EnrichedHolding[]; loading: boolean;
  cashBalance: number;
  onUpsert: (data: any) => void;
  onDelete: (id: number) => void;
  onBulkReplace: (rows: any[]) => void;
  onBalanceChange: (b: number) => void;
  t: (k: string) => string; locale: string;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRecord, setNewRecord] = useState({ date: "", type: "income" as "income" | "expense", amount: "", category: "", note: "" });
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceVal, setBalanceVal] = useState(String(cashBalance));
  const [viewRange, setViewRange] = useState<"6m" | "12m" | "all">("6m");
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Calculations ───
  const sortedRecords = [...records].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const now = new Date();
  const rangeMonths = viewRange === "6m" ? 6 : viewRange === "12m" ? 12 : 999;

  // Generate last N months as "YYYY-MM"
  const monthKeys: string[] = [];
  for (let i = Math.min(rangeMonths, 12) - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // Monthly aggregation
  const monthlyMap: Record<string, { income: number; expense: number }> = {};
  for (const k of monthKeys) monthlyMap[k] = { income: 0, expense: 0 };
  for (const r of sortedRecords) {
    const m = r.date ? r.date.substring(0, 7) : null;
    if (m && monthlyMap[m]) {
      if (r.type === "income") monthlyMap[m].income += r.amount;
      else monthlyMap[m].expense += r.amount;
    }
  }

  const monthlyData = monthKeys.map((k) => ({
    month: k,
    label: `${k.substring(2, 4)}/${k.substring(5)}`, // "24/01" format
    income: monthlyMap[k]?.income || 0,
    expense: monthlyMap[k]?.expense || 0,
    net: (monthlyMap[k]?.income || 0) - (monthlyMap[k]?.expense || 0),
  }));

  // Cumulative net worth trend (cash balance + net cashflow accumulation)
  let cumulative = cashBalance;
  const netWorthTrend = monthlyData.map((m) => {
    cumulative += m.net;
    return { month: m.label, value: cumulative };
  });

  // Totals
  const totalIncome = records.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const totalExpense = records.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  const netCashflow = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? ((netCashflow / totalIncome) * 100) : 0;

  // This month's data
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = records.filter((r) => r.date?.startsWith(thisMonthKey));
  const thisIncome = thisMonth.filter(r => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const thisExpense = thisMonth.filter(r => r.type === "expense").reduce((s, r) => s + r.amount, 0);

  // Expense by category
  const catData = Object.entries(
    records.filter(r => r.type === "expense").reduce((acc, r) => {
      acc[r.category || "其他"] = (acc[r.category || "其他"] || 0) + r.amount;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value: +(value as number).toFixed(0) })).sort((a, b) => b.value - a.value);

  // Investment performance
  const usHoldings = holdings.filter(h => h.market === "US");
  const twHoldings = holdings.filter(h => h.market === "TW");
  const usCost = usHoldings.reduce((s, h) => s + h.cost, 0);
  const usValue = usHoldings.reduce((s, h) => s + h.value, 0);
  const usPnl = usValue - usCost;
  const twCost = twHoldings.reduce((s, h) => s + h.cost, 0);
  const twValue = twHoldings.reduce((s, h) => s + h.value, 0);
  const twPnl = twValue - twCost;

  const CAT_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280"];

  const handleAdd = () => {
    if (!newRecord.date || !newRecord.amount) return;
    onUpsert({ date: newRecord.date, type: newRecord.type, amount: +newRecord.amount, category: newRecord.category || (newRecord.type === "income" ? (locale === "zh-TW" ? "薪資" : "Salary") : (locale === "zh-TW" ? "生活" : "Living")), note: newRecord.note });
    setNewRecord({ date: "", type: "income", amount: "", category: "", note: "" });
    setShowAddForm(false);
    toast.success(locale === "zh-TW" ? "已新增記錄" : "Record added");
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws) as any[];
        const rows = data.map((r) => ({
          date: String(r.date || r.Date || r["日期"] || new Date().toISOString().slice(0, 10)),
          type: (String(r.type || r.Type || r["類型"] || "").toLowerCase().includes("exp") || String(r.type || r.Type || r["類型"] || "").includes("支出")) ? "expense" as const : "income" as const,
          amount: Math.abs(Number(r.amount || r.Amount || r["金額"] || 0)),
          category: String(r.category || r.Category || r["分類"] || "Other"),
          note: String(r.note || r.Note || r["備註"] || ""),
        })).filter((r) => r.amount > 0);
        if (rows.length) { onBulkReplace(rows); toast.success(locale === "zh-TW" ? `已匯入 ${rows.length} 筆` : `Imported ${rows.length} rows`); }
        else toast.error(locale === "zh-TW" ? "無有效資料" : "No valid data");
      } catch { toast.error(locale === "zh-TW" ? "檔案解析失敗" : "Parse failed"); }
    };
    reader.readAsArrayBuffer(file); e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── Row 1: Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground mb-1">{locale === "zh-TW" ? "本月收入" : "This Month Income"}</div>
          <div className="text-lg font-bold" style={{ color: "var(--color-stock-green)" }}>+${fmt(thisIncome)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground mb-1">{locale === "zh-TW" ? "本月支出" : "This Month Expense"}</div>
          <div className="text-lg font-bold" style={{ color: "var(--color-stock-red)" }}>-${fmt(thisExpense)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground mb-1">{locale === "zh-TW" ? "淨現金流" : "Net Cash Flow"}</div>
          <div className="text-lg font-bold" style={{ color: netCashflow >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>
            {netCashflow >= 0 ? "+" : "-"}${fmt(Math.abs(netCashflow))}
          </div>
          <div className="text-[10px] text-muted-foreground">{locale === "zh-TW" ? "儲蓄率" : "Savings"}: {savingsRate.toFixed(1)}%</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground mb-1">{locale === "zh-TW" ? "投資總值" : "Portfolio Value"}</div>
          <div className="text-lg font-bold">${fmt(usValue + twValue)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground mb-1">{locale === "zh-TW" ? "現金水位" : "Cash Balance"}</div>
          {editingBalance ? (
            <div className="flex items-center gap-1">
              <input autoFocus type="number" value={balanceVal} onChange={(e) => setBalanceVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { onBalanceChange(+balanceVal); setEditingBalance(false); } if (e.key === "Escape") setEditingBalance(false); }}
                onBlur={() => { onBalanceChange(+balanceVal); setEditingBalance(false); }}
                className="w-24 px-1.5 py-0.5 rounded border border-primary bg-background text-sm font-bold" />
            </div>
          ) : (
            <button onClick={() => { setBalanceVal(String(cashBalance)); setEditingBalance(true); }}
              className="text-lg font-bold text-foreground flex items-center gap-1 group">
              ${fmt(cashBalance)}<Edit2 size={10} className="opacity-0 group-hover:opacity-100 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* ── Row 2: Monthly Chart + Category Pie ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly Income/Expense Chart */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">{locale === "zh-TW" ? "月度收支" : "Monthly Income & Expense"}</span>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-muted rounded-lg p-0.5">
                {(["6m", "12m", "all"] as const).map(r => (
                  <button key={r} onClick={() => setViewRange(r)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${viewRange === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                    {r === "6m" ? "6M" : r === "12m" ? "1Y" : locale === "zh-TW" ? "全部" : "All"}
                  </button>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)} className="gap-1 text-xs h-7">
                <Plus size={11} /> {locale === "zh-TW" ? "新增" : "Add"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="gap-1 text-xs h-7">
                <Upload size={11} /> {locale === "zh-TW" ? "匯入" : "Import"}
              </Button>
              <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleUpload} />
            </div>
          </div>

          {showAddForm && (
            <div className="p-3 mb-3 rounded-lg bg-muted/20 border border-border flex flex-wrap gap-2 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">{t("cf.date")}</label>
                <input type="date" value={newRecord.date} onChange={(e) => setNewRecord({ ...newRecord, date: e.target.value })}
                  className="w-36 px-2 py-1.5 rounded-lg border border-border bg-background text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">{t("cf.type")}</label>
                <select value={newRecord.type} onChange={(e) => setNewRecord({ ...newRecord, type: e.target.value as "income" | "expense" })}
                  className="w-24 px-2 py-1.5 rounded-lg border border-border bg-background text-sm">
                  <option value="income">{t("cf.income")}</option>
                  <option value="expense">{t("cf.expense")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">{t("cf.amount")}</label>
                <input type="number" value={newRecord.amount} onChange={(e) => setNewRecord({ ...newRecord, amount: e.target.value })}
                  placeholder="1000" className="w-24 px-2 py-1.5 rounded-lg border border-border bg-background text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">{t("cf.category")}</label>
                <input value={newRecord.category} onChange={(e) => setNewRecord({ ...newRecord, category: e.target.value })}
                  placeholder={locale === "zh-TW" ? "薪資" : "Salary"} className="w-20 px-2 py-1.5 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">{t("cf.note")}</label>
                <input value={newRecord.note} onChange={(e) => setNewRecord({ ...newRecord, note: e.target.value })}
                  placeholder={locale === "zh-TW" ? "備註" : "Note"} className="w-24 px-2 py-1.5 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground" />
              </div>
              <Button size="sm" onClick={handleAdd} className="gap-1 text-xs h-8"><Plus size={11} /> {t("form.add")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)} className="text-xs h-8">{t("form.cancel")}</Button>
            </div>
          )}

          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} width={50}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <RechartsTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name]} />
              <Bar dataKey="income" name={locale === "zh-TW" ? "收入" : "Income"} fill="var(--color-stock-green)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" name={locale === "zh-TW" ? "支出" : "Expense"} fill="var(--color-stock-red)" radius={[3, 3, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Expense Category Pie */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold mb-3">{locale === "zh-TW" ? "支出分類" : "Expense Categories"}</div>
          {catData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={catData} cx="50%" cy="50%" outerRadius={55} innerRadius={30} paddingAngle={2} dataKey="value" nameKey="name">
                    {catData.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
                {catData.slice(0, 6).map((c, i) => (
                  <div key={c.name} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                    <span className="text-[10px] text-muted-foreground">{c.name} ${fmt(c.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">{t("common.noData")}</div>
          )}
        </div>
      </div>

      {/* ── Row 3: Investment P&L Cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* US Performance */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">🇺🇸 {locale === "zh-TW" ? "美股績效" : "US Performance"}</span>
            {usCost > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{
              background: usPnl >= 0 ? "var(--color-stock-green-bg)" : "var(--color-stock-red-bg)",
              color: usPnl >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)",
            }}>{usPnl >= 0 ? "+" : ""}${fmt(usPnl)} ({pct(usCost > 0 ? (usPnl / usCost) * 100 : 0)})</span>}
          </div>
          <div className="flex flex-col gap-2">
            {usHoldings.length === 0 && <div className="text-xs text-muted-foreground text-center py-3">{t("common.noData")}</div>}
            {[...usHoldings].sort((a, b) => b.pnlPct - a.pnlPct).slice(0, 6).map((h) => (
              <div key={`${h.id}-${h.symbol}`} className="flex items-center gap-2">
                <span className="w-14 font-bold text-xs">{h.symbol}</span>
                <span className="w-16 text-right text-[10px] text-muted-foreground">{h.currency === "TWD" ? "NT$" : "$"}{h.price.toLocaleString()}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.abs(h.pnlPct) * 2)}%`, background: h.pnlPct >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }} />
                </div>
                <span className="w-14 text-right text-xs font-semibold" style={{ color: h.pnlPct >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>{pct(h.pnlPct)}</span>
              </div>
            ))}
          </div>
        </div>
        {/* TW Performance */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">🇹🇼 {locale === "zh-TW" ? "台股績效" : "TW Performance"}</span>
            {twCost > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{
              background: twPnl >= 0 ? "var(--color-stock-green-bg)" : "var(--color-stock-red-bg)",
              color: twPnl >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)",
            }}>{twPnl >= 0 ? "+" : ""}NT${Math.abs(twPnl).toLocaleString("zh-TW", { maximumFractionDigits: 0 })} ({pct(twCost > 0 ? (twPnl / twCost) * 100 : 0)})</span>}
          </div>
          <div className="flex flex-col gap-2">
            {twHoldings.length === 0 && <div className="text-xs text-muted-foreground text-center py-3">{t("common.noData")}</div>}
            {[...twHoldings].sort((a, b) => b.pnlPct - a.pnlPct).slice(0, 6).map((h) => (
              <div key={`${h.id}-${h.symbol}`} className="flex items-center gap-2">
                <span className="w-14 font-bold text-xs">{h.symbol.replace(".TW", "")}</span>
                <span className="w-12 text-right text-[10px] text-muted-foreground">{TW_SECTOR_MAP_CLIENT[h.symbol.replace(".TW", "")] || ""}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.abs(h.pnlPct) * 2)}%`, background: h.pnlPct >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }} />
                </div>
                <span className="w-14 text-right text-xs font-semibold" style={{ color: h.pnlPct >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>{pct(h.pnlPct)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 4: Records Table ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <span className="text-sm font-semibold">{locale === "zh-TW" ? "現金流記錄" : "Cash Flow Records"}</span>
          <span className="text-xs text-muted-foreground">{records.length} {locale === "zh-TW" ? "筆" : "records"}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {[t("cf.date"), t("cf.type"), t("cf.amount"), t("cf.category"), t("cf.note"), ""].map((h, i) => (
                  <th key={i} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">{t("cf.noRecords")}</td></tr>
              ) : (
                [...records].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 30).map((r: any) => (
                  <tr key={r.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 text-xs font-mono">{r.date}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{
                        background: r.type === "income" ? "var(--color-stock-green-bg)" : "var(--color-stock-red-bg)",
                        color: r.type === "income" ? "var(--color-stock-green)" : "var(--color-stock-red)",
                      }}>{r.type === "income" ? t("cf.income") : t("cf.expense")}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold" style={{ color: r.type === "income" ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>
                      {r.type === "income" ? "+" : "-"}${fmt(r.amount)}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.category}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.note}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => onDelete(r.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// TW sector name lookup for CashFlowTab
const TW_SECTOR_MAP_CLIENT: Record<string, string> = {
  "2330": "台積電", "2317": "鴻海", "2454": "聯發科", "2308": "台達電", "2382": "廣達",
  "3037": "欣興", "6153": "嘉澤端子", "3231": "緯創", "2881": "富邦金", "2882": "國泰金",
  "2884": "玉山金", "2886": "兆豐金", "2891": "中信金", "0050": "元大台灣50",
};


// ═══════════════════════════════════════════════════════
// ─── TAB 4: Watchlist ───
// ═══════════════════════════════════════════════════════
function WatchlistTab({
  watchlist, loading, onAdd, onDelete,
  priceAlerts, onCreateAlert, onDeleteAlert, onToggleAlert, onCheckAlerts,
  t, locale,
}: {
  watchlist: any[]; loading: boolean;
  onAdd: (symbol: string) => void;
  onDelete: (id: number) => void;
  priceAlerts: any[];
  onCreateAlert: (data: any) => void;
  onDeleteAlert: (id: number) => void;
  onToggleAlert: (id: number, active: boolean) => void;
  onCheckAlerts: () => void;
  t: (k: string) => string; locale: string;
}) {
  const [newSymbol, setNewSymbol] = useState("");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("ALL");
  const [showAlerts, setShowAlerts] = useState(false);
  const [alertForm, setAlertForm] = useState({ symbol: "", type: "above" as "above" | "below", price: "", note: "" });

  // Subscription gates
  const { withinLimit, showPaywall } = useSubscription();
  const canAddWatch = withinLimit("maxWatchlist", watchlist.length);
  const canAddAlert = withinLimit("maxPriceAlerts", priceAlerts.length);

  const filtered = watchlist.filter((w: any) => {
    if (marketFilter === "ALL") return true;
    const detected = detectMarket(w.symbol);
    return detected.market === marketFilter;
  });

  const handleAdd = () => {
    if (!newSymbol.trim()) return;
    if (!canAddWatch) { showPaywall("maxWatchlist"); return; }
    onAdd(newSymbol.trim().toUpperCase());
    setNewSymbol("");
    toast.success(locale === "zh-TW" ? `${newSymbol.toUpperCase()} 已加入觀察` : `${newSymbol.toUpperCase()} added to watchlist`);
  };

  const handleCreateAlert = () => {
    if (!alertForm.symbol || !alertForm.price) return;
    if (!canAddAlert) { showPaywall("maxPriceAlerts"); return; }
    onCreateAlert({ symbol: alertForm.symbol.toUpperCase(), type: alertForm.type, targetPrice: +alertForm.price, note: alertForm.note });
    setAlertForm({ symbol: "", type: "above", price: "", note: "" });
    toast.success(locale === "zh-TW" ? "警報已建立" : "Alert created");
  };

  const activeAlerts = priceAlerts.filter((a: any) => a.active);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{t("wl.title")}</span>
          <MarketTabs value={marketFilter} onChange={setMarketFilter} t={t} />
        </div>
        <div className="flex items-center gap-2">
          <input value={newSymbol} onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder={t("wl.symbolPlaceholder")}
            className="w-32 px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground" />
          <Button size="sm" onClick={handleAdd} className="gap-1 text-xs h-8"><Plus size={11} /> {t("wl.addSymbol")}</Button>
          <Button size="sm" variant="outline" onClick={() => setShowAlerts(!showAlerts)} className="gap-1 text-xs h-8 relative">
            <Bell size={11} /> {t("wl.priceAlerts")}
            {activeAlerts.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center">{activeAlerts.length}</span>}
          </Button>
        </div>
      </div>

      {/* Price Alerts Panel */}
      {showAlerts && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">{t("wl.priceAlerts")}</span>
            <Button size="sm" variant="outline" onClick={onCheckAlerts} className="gap-1 text-xs h-7">
              <RefreshCw size={11} /> {t("wl.checkNow")}
            </Button>
          </div>
          {/* Add alert form */}
          <div className="flex flex-wrap gap-2 items-end mb-3 p-3 rounded-lg bg-muted/20 border border-border">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">{t("form.symbol")}</label>
              <input value={alertForm.symbol} onChange={(e) => setAlertForm({ ...alertForm, symbol: e.target.value.toUpperCase() })}
                placeholder="AAPL" className="w-24 px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">{locale === "zh-TW" ? "條件" : "Condition"}</label>
              <select value={alertForm.type} onChange={(e) => setAlertForm({ ...alertForm, type: e.target.value as "above" | "below" })}
                className="w-20 px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground">
                <option value="above">{t("wl.alertAbove")}</option>
                <option value="below">{t("wl.alertBelow")}</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">{t("wl.targetPrice")}</label>
              <input type="number" step="0.01" value={alertForm.price} onChange={(e) => setAlertForm({ ...alertForm, price: e.target.value })}
                placeholder="200" className="w-24 px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">{t("cf.note")}</label>
              <input value={alertForm.note} onChange={(e) => setAlertForm({ ...alertForm, note: e.target.value })}
                className="w-24 px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground" />
            </div>
            <Button size="sm" onClick={handleCreateAlert} className="gap-1 text-xs h-8"><Plus size={11} /> {t("form.add")}</Button>
          </div>
          {/* Alert list */}
          <div className="flex flex-col gap-1.5">
            {priceAlerts.map((a: any) => (
              <div key={a.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/20">
                <MarketBadge market={detectMarket(a.symbol).market} />
                <span className="font-bold">{a.symbol}</span>
                <span className="text-muted-foreground">{a.type === "above" ? "≥" : "≤"}</span>
                <span className="font-mono font-semibold">${a.targetPrice}</span>
                {a.note && <span className="text-muted-foreground">({a.note})</span>}
                <span className="flex-1" />
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${a.active ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`}>
                  {a.active ? t("wl.alertActive") : t("wl.alertTriggered")}
                </span>
                <button onClick={() => onToggleAlert(a.id, !a.active)} className="text-muted-foreground hover:text-primary">
                  {a.active ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
                <button onClick={() => onDeleteAlert(a.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {priceAlerts.length === 0 && <div className="text-xs text-muted-foreground text-center py-3">{t("common.noData")}</div>}
          </div>
        </div>
      )}

      {/* Watchlist Cards */}
      {loading && filtered.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t("wl.noWatchlist")}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((w: any) => {
            const detected = detectMarket(w.symbol);
            const currSym = detected.currency === "TWD" ? "NT$" : "$";
            const fmtW = (n: number) => detected.currency === "TWD" ? `NT$${n.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : `$${fmt(n)}`;

            return (
              <div key={w.id || w.symbol} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 hover:shadow-md transition-all">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <MarketBadge market={detected.market} />
                      <span className="font-bold text-base text-foreground">{w.symbol}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{w.name}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <SignalBadgeWithTooltip signal={w.signal} reasons={w.reasons || []} locale={locale} />
                    <button onClick={() => onDelete(w.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold font-mono text-foreground">{fmtW(w.price)}</span>
                  <span className="text-sm font-semibold" style={{ color: w.changePct >= 0 ? "var(--color-stock-green)" : "var(--color-stock-red)" }}>
                    {w.changePct >= 0 ? "+" : ""}{w.changePct?.toFixed(2)}%
                  </span>
                </div>

                {/* Score gauge */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${w.score || 50}%`, background: (w.score || 50) >= 65 ? "var(--color-stock-green)" : (w.score || 50) <= 35 ? "var(--color-stock-red)" : "var(--color-stock-yellow)" }} />
                  </div>
                  <span className="text-xs font-bold w-8 text-right">{w.score || 50}</span>
                </div>

                {/* Indicators grid */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-muted-foreground">{t("wl.rsi")}</span><div className="font-semibold font-mono">{w.rsi?.toFixed(1) || "—"}</div></div>
                  <div><span className="text-muted-foreground">{t("wl.pe")}</span><div className="font-semibold font-mono">{w.pe?.toFixed(1) || "—"}</div></div>
                  <div><span className="text-muted-foreground">{t("wl.divYield")}</span><div className="font-semibold font-mono">{w.divYield?.toFixed(2) || "—"}%</div></div>
                  <div><span className="text-muted-foreground">Beta</span><div className="font-semibold font-mono">{w.beta?.toFixed(2) || "—"}</div></div>
                  <div><span className="text-muted-foreground">{t("ts.high52w")}</span><div className="font-semibold font-mono">{fmtW(w.high52w || 0)}</div></div>
                  <div><span className="text-muted-foreground">{t("wl.targetPrice")}</span><div className="font-semibold font-mono">{w.targetPrice ? fmtW(w.targetPrice) : "—"}</div></div>
                </div>

                {/* Sparkline */}
                <div className="flex justify-end">
                  <Sparkline data={w.sparkline || []} color="auto" width={100} height={28} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
