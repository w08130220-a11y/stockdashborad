// ─── Formatting helpers ───
export const fmt = (n: number | null | undefined, digits = 2): string => {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

export const fmtCompact = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${fmt(n)}`;
};

export const pct = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
};

export const pctAbs = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
};

// ─── Signal computation ───
export type SignalType = "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  high52w: number;
  low52w: number;
  ma50: number;
  ma200: number;
  rsi: number;
  pe: number | null;
  divYield: number;
  marketCap: number | null;
  sector: string;
  earningsGrowth: number;
  targetPrice: number | null;
  volume: number | null;
  beta?: number;
  volatility30d?: number;
  sparkline?: number[];
  volCategory?: string;
}

export interface HoldingRow {
  id: number;
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  sector: string;
  market: "US" | "TW";
  currency: "USD" | "TWD";
}

export interface EnrichedHolding extends HoldingRow, StockQuote {
  value: number;
  cost: number;
  pnl: number;
  pnlPct: number;
}

export interface SignalReason {
  label: string;       // Short label shown in tooltip
  met: boolean;        // Whether this condition is satisfied
  bullish: boolean;    // true = bullish factor, false = bearish factor
}

export function computeSignal(q: StockQuote): { signal: SignalType; score: number; reasons: SignalReason[] } {
  const { rsi, price, ma50, ma200, earningsGrowth, targetPrice } = q;
  const aboveMA50 = price > ma50;
  const aboveMA200 = price > ma200;
  const upside = targetPrice ? ((targetPrice - price) / price) * 100 : 0;

  // Build reason list for tooltip
  const reasons: SignalReason[] = [
    { label: `RSI ${rsi.toFixed(1)} (超賣 <30)`, met: rsi < 30, bullish: true },
    { label: `RSI ${rsi.toFixed(1)} (偏低 <45)`, met: rsi >= 30 && rsi < 45, bullish: true },
    { label: `RSI ${rsi.toFixed(1)} (偏高 >65)`, met: rsi > 65, bullish: false },
    { label: `RSI ${rsi.toFixed(1)} (超買 >75)`, met: rsi > 75, bullish: false },
    { label: `價格 > MA50 (${fmt(ma50)})`, met: aboveMA50, bullish: true },
    { label: `價格 < MA50 (${fmt(ma50)})`, met: !aboveMA50, bullish: false },
    { label: `價格 > MA200 (${fmt(ma200)})`, met: aboveMA200, bullish: true },
    { label: `價格 < MA200 (${fmt(ma200)})`, met: !aboveMA200, bullish: false },
    { label: `目標價上漲空間 +${upside.toFixed(1)}%`, met: upside > 5, bullish: true },
    { label: `目標價下跌空間 ${upside.toFixed(1)}%`, met: upside < -10, bullish: false },
    { label: `盈餘成長 +${earningsGrowth.toFixed(1)}%`, met: earningsGrowth > 15, bullish: true },
    { label: `盈餘衰退 ${earningsGrowth.toFixed(1)}%`, met: earningsGrowth < 0, bullish: false },
  ];

  if (rsi < 30 && aboveMA200 && earningsGrowth > 15) return { signal: "STRONG BUY", score: 92, reasons };
  if (rsi < 35 && aboveMA50 && upside > 15) return { signal: "STRONG BUY", score: 88, reasons };
  if (rsi < 45 && aboveMA50) return { signal: "BUY", score: 72, reasons };
  if (rsi < 50 && aboveMA200 && upside > 5) return { signal: "BUY", score: 65, reasons };
  if (rsi > 75 && !aboveMA50 && earningsGrowth < 0) return { signal: "STRONG SELL", score: 8, reasons };
  if (rsi > 70 && !aboveMA200) return { signal: "STRONG SELL", score: 12, reasons };
  if (rsi > 65 && !aboveMA50) return { signal: "SELL", score: 25, reasons };
  if (rsi > 60 && upside < -10) return { signal: "SELL", score: 30, reasons };
  return { signal: "HOLD", score: 50, reasons };
}

export function volCategoryLabel(vol: number): { en: string; zh: string; key: string } {
  if (vol >= 25) return { en: "High", zh: "高波動", key: "high" };
  if (vol >= 15) return { en: "Medium", zh: "中波動", key: "mid" };
  return { en: "Low", zh: "低波動", key: "low" };
}

export function volCategoryColor(cat: string): string {
  if (cat === "高波動" || cat === "High" || cat === "high") return "var(--color-stock-red)";
  if (cat === "中波動" || cat === "Medium" || cat === "mid") return "var(--color-stock-yellow)";
  return "var(--color-stock-green)";
}

export function signalColor(signal: SignalType): string {
  if (signal === "STRONG BUY") return "var(--color-stock-green)";
  if (signal === "BUY") return "oklch(0.62 0.12 155)";
  if (signal === "SELL") return "oklch(0.62 0.12 25)";
  if (signal === "STRONG SELL") return "var(--color-stock-red)";
  return "var(--color-muted-foreground)";
}

export function signalBg(signal: SignalType): string {
  if (signal === "STRONG BUY") return "var(--color-stock-green-bg)";
  if (signal === "BUY") return "var(--color-stock-green-bg)";
  if (signal === "SELL") return "var(--color-stock-red-bg)";
  if (signal === "STRONG SELL") return "var(--color-stock-red-bg)";
  return "var(--muted)";
}

// ─── Trailing Stop ───
export function computeTrailingStop(price: number, high52w: number, trailPct: number) {
  const trailPrice = +(high52w * (1 - trailPct / 100)).toFixed(2);
  const distance = +(((price - trailPrice) / price) * 100).toFixed(1);
  const triggered = price <= trailPrice;
  return { trailPrice, distance, triggered };
}

export function computeTakeProfit(price: number, targetPrice: number | null) {
  if (!targetPrice || targetPrice <= 0) return { targetPrice: null, distance: 0, triggered: false };
  const distance = +(((targetPrice - price) / price) * 100).toFixed(1);
  const triggered = price >= targetPrice;
  return { targetPrice, distance, triggered };
}

// ─── Sector color map ───
export const SECTOR_COLORS: Record<string, string> = {
  // US sectors (Yahoo Finance categories)
  "Technology": "var(--chart-4)",
  "Consumer Cyclical": "var(--chart-5)",
  "Consumer Defensive": "oklch(0.65 0.12 80)",
  "Financial Services": "var(--chart-1)",
  "Healthcare": "var(--chart-2)",
  "Communication Services": "var(--color-stock-blue)",
  "Industrials": "oklch(0.65 0.1 310)",
  "Energy": "var(--color-stock-yellow)",
  "Utilities": "var(--color-stock-green)",
  "Real Estate": "oklch(0.65 0.1 280)",
  "Basic Materials": "oklch(0.65 0.1 200)",
  // Legacy US sector names (for backward compatibility)
  "Tech": "var(--chart-4)",
  "Consumer": "var(--chart-5)",
  "Finance": "var(--chart-1)",
  "Telecom": "var(--color-stock-blue)",
  "Materials": "oklch(0.65 0.1 200)",
  // 台股板塊
  "半導體": "var(--chart-4)",
  "電子": "var(--chart-3)",
  "光電": "oklch(0.62 0.12 250)",
  "通訊": "var(--color-stock-blue)",
  "ETF": "oklch(0.55 0.15 260)",
  "航運": "oklch(0.65 0.1 200)",
  "金融": "var(--chart-1)",
  "鋼鐵": "oklch(0.65 0.1 280)",
  "塑化": "oklch(0.62 0.1 60)",
  "食品": "var(--chart-5)",
  "水泥": "oklch(0.6 0.08 90)",
  "紡織": "oklch(0.62 0.1 340)",
  "機械": "oklch(0.65 0.1 310)",
  "汽車": "oklch(0.6 0.12 30)",
  "橡膠": "oklch(0.55 0.1 120)",
  "自行車": "oklch(0.62 0.12 155)",
  "電商": "oklch(0.6 0.15 320)",
  "租賃": "oklch(0.58 0.1 180)",
  "生技": "var(--chart-2)",
  "傳產": "oklch(0.65 0.1 310)",
  "化工": "var(--color-stock-yellow)",
  Other: "var(--muted-foreground)",
};

// Helper: detect market from symbol
// Pure numeric codes (e.g. 2330, 6013) or codes ending with .TW/.TWO are Taiwan stocks
export function detectMarket(symbol: string): { market: "US" | "TW"; currency: "USD" | "TWD" } {
  const upper = symbol.toUpperCase();
  if (upper.endsWith(".TW") || upper.endsWith(".TWO")) {
    return { market: "TW", currency: "TWD" };
  }
  // Pure numeric codes like 2330, 6013, 00878 are Taiwan stocks
  const base = upper.replace(/\.TW$|\.TWO$/i, "");
  if (/^\d{4,6}$/.test(base)) {
    return { market: "TW", currency: "TWD" };
  }
  return { market: "US", currency: "USD" };
}
