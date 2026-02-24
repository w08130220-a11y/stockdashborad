/**
 * Stock Service — Twelve Data API (primary) + yfinance fallback
 *
 * Primary: Twelve Data REST API (https://api.twelvedata.com)
 *   - US stocks: Real-time (Basic plan+)
 *   - Taiwan stocks: EOD (Pro plan, symbol format: 2330:XTAI)
 *   - Built-in batch quote, time_series
 *
 * Fallback: Python yfinance micro-service (localhost:5001)
 *
 * Cache: Memory TTL Cache + MySQL persistent cache
 */

// ─── TTL Memory Cache ───
interface CacheEntry<T> { value: T; expireAt: number; }
class TTLCache {
  private store = new Map<string, CacheEntry<unknown>>();
  get<T>(key: string): T | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (Date.now() > e.expireAt) { this.store.delete(key); return null; }
    return e.value as T;
  }
  set<T>(key: string, value: T, ttlMs: number) { this.store.set(key, { value, expireAt: Date.now() + ttlMs }); }
  stats() { const now = Date.now(); let alive = 0; this.store.forEach(e => { if (e.expireAt > now) alive++; }); return { total: this.store.size, alive }; }
  getStore() { return this.store; }
}
const cache = new TTLCache();
const TTL_FULL = 30_000;
const TTL_DB_CACHE = 86_400_000;

// ─── Config ───
const TWELVE_DATA_KEY = process.env.TWELVE_DATA_API_KEY || "";
const TWELVE_DATA_BASE = "https://api.twelvedata.com";
const YFINANCE_URL = (process.env.YFINANCE_API_URL || "http://localhost:5001").replace(/\/$/, "");
let _yfinanceAvailable: boolean | null = null;
async function checkYfinance(): Promise<boolean> {
  if (_yfinanceAvailable !== null) return _yfinanceAvailable;
  try { const r = await fetch(`${YFINANCE_URL}/health`, { signal: AbortSignal.timeout(3000) }); _yfinanceAvailable = r.ok; }
  catch { _yfinanceAvailable = false; }
  setTimeout(() => { _yfinanceAvailable = null; }, 300_000);
  return _yfinanceAvailable;
}

// ─── Taiwan / US Sector Mapping ───
const TW_SECTOR_MAP: Record<string, { name: string; sector: string }> = {
  "2330": { name: "台積電", sector: "半導體" }, "2303": { name: "聯電", sector: "半導體" },
  "2454": { name: "聯發科", sector: "半導體" }, "3711": { name: "日月光投控", sector: "半導體" },
  "2379": { name: "瑞昱", sector: "半導體" }, "3034": { name: "聯詠", sector: "半導體" },
  "2408": { name: "南亞科", sector: "半導體" }, "6415": { name: "矽力-KY", sector: "半導體" },
  "3661": { name: "世芯-KY", sector: "半導體" }, "5274": { name: "信驊", sector: "半導體" },
  "3443": { name: "創意", sector: "半導體" }, "6147": { name: "頎邦", sector: "半導體" },
  "2317": { name: "鴻海", sector: "電子" }, "2382": { name: "廣達", sector: "電子" },
  "3231": { name: "緯創", sector: "電子" }, "2356": { name: "英業達", sector: "電子" },
  "2353": { name: "宏碁", sector: "電子" }, "2357": { name: "華碩", sector: "電子" },
  "4938": { name: "和碩", sector: "電子" }, "3037": { name: "欣興", sector: "電子" },
  "6669": { name: "緯穎", sector: "電子" }, "2345": { name: "智邦", sector: "電子" },
  "2474": { name: "可成", sector: "電子" }, "6153": { name: "嘉澤端子", sector: "電子" },
  "2308": { name: "台達電", sector: "電子" }, "2301": { name: "光寶科", sector: "電子" },
  "3008": { name: "大立光", sector: "光電" }, "2395": { name: "研華", sector: "電子" },
  "2912": { name: "統一超", sector: "食品" }, "1216": { name: "統一", sector: "食品" },
  "2884": { name: "玉山金", sector: "金融" }, "2881": { name: "富邦金", sector: "金融" },
  "2882": { name: "國泰金", sector: "金融" }, "2886": { name: "兆豐金", sector: "金融" },
  "2891": { name: "中信金", sector: "金融" }, "2885": { name: "元大金", sector: "金融" },
  "2880": { name: "華南金", sector: "金融" }, "2883": { name: "開發金", sector: "金融" },
  "2892": { name: "第一金", sector: "金融" }, "2887": { name: "台新金", sector: "金融" },
  "2890": { name: "永豐金", sector: "金融" },
  "1301": { name: "台塑", sector: "塑化" }, "1303": { name: "南亞", sector: "塑化" },
  "1326": { name: "台化", sector: "塑化" }, "6505": { name: "台塑化", sector: "塑化" },
  "2002": { name: "中鋼", sector: "鋼鐵" }, "1101": { name: "台泥", sector: "水泥" },
  "2207": { name: "和泰車", sector: "汽車" }, "9910": { name: "豐泰", sector: "紡織" },
  "1590": { name: "亞德客-KY", sector: "機械" }, "9904": { name: "寶成", sector: "紡織" },
  "2105": { name: "正新", sector: "橡膠" }, "9921": { name: "巨大", sector: "自行車" },
  "8454": { name: "富邦媒", sector: "電商" }, "5871": { name: "中租-KY", sector: "租賃" },
  "6446": { name: "藥華藥", sector: "生技" }, "4743": { name: "合一", sector: "生技" },
  "6472": { name: "保瑞", sector: "生技" },
  "0050": { name: "元大台灣50", sector: "ETF" }, "0056": { name: "元大高股息", sector: "ETF" },
  "006205": { name: "元大標普500", sector: "ETF" }, "00878": { name: "國泰永續高股息", sector: "ETF" },
  "00881": { name: "國泰台灣5G+", sector: "ETF" }, "00919": { name: "群益台灣精選高息", sector: "ETF" },
  "00929": { name: "復華台灣科技優息", sector: "ETF" }, "00940": { name: "元大台灣價值高息", sector: "ETF" },
};
const US_SECTOR_MAP: Record<string, string> = {
  "AAPL": "Technology", "MSFT": "Technology", "GOOGL": "Technology", "META": "Technology",
  "NVDA": "Technology", "AMD": "Technology", "INTC": "Technology", "AVGO": "Technology",
  "CRM": "Technology", "ADBE": "Technology", "ORCL": "Technology", "CSCO": "Technology",
  "TXN": "Technology", "QCOM": "Technology", "MU": "Technology", "AMAT": "Technology",
  "NOW": "Technology", "PANW": "Technology", "PLTR": "Technology", "CRWD": "Technology",
  "AMZN": "Consumer Cyclical", "TSLA": "Consumer Cyclical", "HD": "Consumer Cyclical",
  "NKE": "Consumer Cyclical", "MCD": "Consumer Cyclical", "SBUX": "Consumer Cyclical",
  "PG": "Consumer Defensive", "KO": "Consumer Defensive", "PEP": "Consumer Defensive",
  "WMT": "Consumer Defensive", "COST": "Consumer Defensive",
  "JPM": "Financial Services", "BAC": "Financial Services", "GS": "Financial Services",
  "V": "Financial Services", "MA": "Financial Services",
  "JNJ": "Healthcare", "UNH": "Healthcare", "LLY": "Healthcare", "ABBV": "Healthcare",
  "NFLX": "Communication Services", "DIS": "Communication Services",
  "BA": "Industrials", "CAT": "Industrials", "GE": "Industrials",
  "XOM": "Energy", "CVX": "Energy", "NEE": "Utilities",
  "SPY": "ETF", "QQQ": "ETF", "VTI": "ETF", "VOO": "ETF",
};

// ─── Symbol Helpers ───
function getTwBaseCode(s: string): string { return s.replace(/\.TW$|\.TWO$/i, "").replace(/:XTAI$/i, "").trim(); }
function toTwelveDataSymbol(s: string): string {
  const u = s.toUpperCase().trim();
  if (u.includes(":XTAI")) return u;
  const base = u.replace(/\.TW$|\.TWO$/i, "");
  if (/^\d{4,6}$/.test(base)) return `${base}:XTAI`;
  return u;
}
function toYfinanceSymbol(s: string): string {
  const u = s.toUpperCase().trim();
  if (u.endsWith(".TW") || u.endsWith(".TWO")) return u;
  const base = u.replace(/:XTAI$/i, "").replace(/\.TW$|\.TWO$/i, "");
  if (/^\d{4,6}$/.test(base)) return `${base}.TW`;
  return u;
}
function canonicalSymbol(s: string): string {
  const u = s.toUpperCase().trim();
  const base = u.replace(/:XTAI$/i, "").replace(/\.TW$|\.TWO$/i, "");
  if (/^\d{4,6}$/.test(base)) return `${base}.TW`;
  return base;
}
function detectMarket(s: string): { market: "US" | "TW"; currency: "USD" | "TWD" } {
  const u = s.toUpperCase();
  if (u.includes(":XTAI") || u.endsWith(".TW") || u.endsWith(".TWO")) return { market: "TW", currency: "TWD" };
  if (/^\d{4,6}$/.test(u.replace(/\.TW$|\.TWO$|:XTAI$/i, ""))) return { market: "TW", currency: "TWD" };
  return { market: "US", currency: "USD" };
}

// ─── Data Types ───
export interface StockFullData {
  symbol: string; name: string; price: number; prevClose: number;
  change: number; changePct: number; high52w: number; low52w: number;
  ma50: number; ma200: number; rsi: number; pe: number | null;
  divYield: number; marketCap: number | null; sector: string;
  earningsGrowth: number; targetPrice: number | null; volume: number | null;
  beta: number; volatility30d: number; sparkline: number[]; volCategory: string;
}
function createFallbackData(symbol: string): StockFullData {
  const { market } = detectMarket(symbol);
  const base = getTwBaseCode(symbol);
  const tw = market === "TW" ? TW_SECTOR_MAP[base] : null;
  const c = canonicalSymbol(symbol);
  return { symbol: c, name: tw?.name || c, price: 0, prevClose: 0, change: 0, changePct: 0,
    high52w: 0, low52w: 0, ma50: 0, ma200: 0, rsi: 50, pe: null, divYield: 0,
    marketCap: null, sector: tw?.sector || US_SECTOR_MAP[c] || "Other",
    earningsGrowth: 0, targetPrice: null, volume: null, beta: 1.0, volatility30d: 20,
    sparkline: [], volCategory: "中波動" };
}

// ─── Technical Calculation Helpers ───
function calcMA(closes: number[], p: number): number {
  if (closes.length < p) return 0;
  return closes.slice(0, p).reduce((a, b) => a + b, 0) / p;
}
function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let g = 0, l = 0;
  for (let i = 0; i < period; i++) { const d = closes[i] - closes[i + 1]; if (d > 0) g += d; else l -= d; }
  const ag = g / period, al = l / period;
  if (al === 0) return 100;
  return 100 - (100 / (1 + ag / al));
}
function calcVol(closes: number[], days = 30): number {
  if (closes.length < days + 1) return 20;
  const ret: number[] = [];
  for (let i = 0; i < days && i < closes.length - 1; i++)
    if (closes[i + 1] > 0) ret.push(Math.log(closes[i] / closes[i + 1]));
  if (ret.length < 5) return 20;
  const m = ret.reduce((a, b) => a + b, 0) / ret.length;
  const v = ret.reduce((a, b) => a + (b - m) ** 2, 0) / ret.length;
  return Math.sqrt(v) * Math.sqrt(252) * 100;
}
function calcBeta(sc: number[], bc: number[], days = 60): number {
  const n = Math.min(days, sc.length - 1, bc.length - 1);
  if (n < 10) return 1.0;
  const sr: number[] = [], br: number[] = [];
  for (let i = 0; i < n; i++) {
    if (sc[i + 1] > 0 && bc[i + 1] > 0) {
      sr.push((sc[i] - sc[i + 1]) / sc[i + 1]);
      br.push((bc[i] - bc[i + 1]) / bc[i + 1]);
    }
  }
  if (sr.length < 10) return 1.0;
  const ms = sr.reduce((a, b) => a + b, 0) / sr.length;
  const mb = br.reduce((a, b) => a + b, 0) / br.length;
  let cov = 0, vb = 0;
  for (let i = 0; i < sr.length; i++) { cov += (sr[i] - ms) * (br[i] - mb); vb += (br[i] - mb) ** 2; }
  return vb > 0 ? cov / vb : 1.0;
}
function volCat(v: number): string { return v >= 35 ? "高波動" : v >= 20 ? "中波動" : "低波動"; }

// ─── Twelve Data API ───
async function tdFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  if (!TWELVE_DATA_KEY) return null;
  const url = new URL(`${TWELVE_DATA_BASE}${path}`);
  url.searchParams.set("apikey", TWELVE_DATA_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const r = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
    if (!r.ok) { console.warn(`[TwelveData] ${path} HTTP ${r.status}`); return null; }
    const data = await r.json();
    if (data.code === 400 || data.code === 401 || data.status === "error") {
      console.warn(`[TwelveData] ${path} error:`, data.message || data); return null;
    }
    return data;
  } catch (e) { console.warn(`[TwelveData] fetch error:`, e); return null; }
}

let _bench: { us: number[]; tw: number[]; at: number } | null = null;
async function getBenchCloses(): Promise<{ us: number[]; tw: number[] }> {
  if (_bench && Date.now() - _bench.at < 3600_000) return _bench;
  const [spy, tw50] = await Promise.all([
    tdFetch("/time_series", { symbol: "SPY", interval: "1day", outputsize: "200" }),
    tdFetch("/time_series", { symbol: "0050:XTAI", interval: "1day", outputsize: "200" }),
  ]);
  const us = spy?.values?.map((v: any) => +v.close).filter((n: number) => !isNaN(n)) || [];
  const tw = tw50?.values?.map((v: any) => +v.close).filter((n: number) => !isNaN(n)) || [];
  _bench = { us, tw, at: Date.now() };
  return _bench;
}

async function fetchFromTwelveData(symbols: string[]): Promise<StockFullData[]> {
  if (!TWELVE_DATA_KEY || !symbols.length) return symbols.map(createFallbackData);
  const tdSyms = symbols.map(toTwelveDataSymbol);
  const symStr = tdSyms.join(",");

  // Batch quote + time_series in parallel (2 credits/symbol)
  const [quoteRaw, tsRaw] = await Promise.all([
    tdFetch("/quote", { symbol: symStr }),
    tdFetch("/time_series", { symbol: symStr, interval: "1day", outputsize: "200" }),
  ]);
  if (!quoteRaw) return symbols.map(createFallbackData);

  // Parse quotes
  const quotes: Record<string, any> = {};
  if (tdSyms.length === 1) quotes[tdSyms[0]] = quoteRaw;
  else for (const k of Object.keys(quoteRaw)) quotes[k] = quoteRaw[k];

  // Parse time series
  const series: Record<string, number[]> = {};
  if (tsRaw) {
    if (tdSyms.length === 1 && tsRaw.values)
      series[tdSyms[0]] = tsRaw.values.map((v: any) => +v.close).filter((n: number) => !isNaN(n));
    else for (const k of Object.keys(tsRaw))
      if (tsRaw[k]?.values) series[k] = tsRaw[k].values.map((v: any) => +v.close).filter((n: number) => !isNaN(n));
  }

  const bench = await getBenchCloses();

  return symbols.map((raw, i) => {
    const td = tdSyms[i];
    const q = quotes[td];
    const closes = series[td] || [];
    const c = canonicalSymbol(raw);
    const { market } = detectMarket(raw);
    const base = getTwBaseCode(raw);
    const tw = market === "TW" ? TW_SECTOR_MAP[base] : null;

    if (!q || q.code === 400 || q.status === "error") return createFallbackData(raw);

    const price = +q.close || 0;
    const prevClose = +q.previous_close || 0;
    const change = +q.change || (price - prevClose);
    const changePct = +q.percent_change || (prevClose > 0 ? (change / prevClose) * 100 : 0);
    const vol = calcVol(closes, 30);
    const bc = market === "TW" ? bench.tw : bench.us;

    return {
      symbol: c, name: tw?.name || q.name || c,
      price, prevClose, change, changePct,
      high52w: +(q.fifty_two_week?.high) || 0,
      low52w: +(q.fifty_two_week?.low) || 0,
      ma50: calcMA(closes, 50), ma200: calcMA(closes, 200),
      rsi: calcRSI(closes), pe: +q.pe || null,
      divYield: +q.dividend_yield || 0, marketCap: null,
      sector: tw?.sector || US_SECTOR_MAP[c] || q.exchange || "Other",
      earningsGrowth: 0, targetPrice: null, volume: +q.volume || null,
      beta: +calcBeta(closes, bc).toFixed(2),
      volatility30d: +vol.toFixed(1), sparkline: closes.slice(0, 30).reverse(),
      volCategory: volCat(vol),
    };
  });
}

// ─── yfinance Fallback ───
async function fetchFromYfinance(symbols: string[]): Promise<StockFullData[]> {
  if (!(await checkYfinance())) return symbols.map(createFallbackData);
  try {
    const r = await fetch(`${YFINANCE_URL}/batch_full`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: symbols.map(toYfinanceSymbol) }),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) return symbols.map(createFallbackData);
    const arr = await r.json() as any[];
    return symbols.map((sym, i) => {
      const d = arr[i]; if (!d || d.error) return createFallbackData(sym);
      const { market } = detectMarket(sym);
      const base = getTwBaseCode(sym); const tw = market === "TW" ? TW_SECTOR_MAP[base] : null;
      const c = canonicalSymbol(sym);
      return { symbol: c, name: tw?.name || d.name || c,
        price: d.price || 0, prevClose: d.prevClose || 0, change: d.change || 0, changePct: d.changePct || 0,
        high52w: d.high52w || 0, low52w: d.low52w || 0, ma50: d.ma50 || 0, ma200: d.ma200 || 0,
        rsi: d.rsi || 50, pe: d.pe || null, divYield: d.divYield || 0, marketCap: d.marketCap || null,
        sector: tw?.sector || d.sector || US_SECTOR_MAP[c] || "Other",
        earningsGrowth: 0, targetPrice: null, volume: d.volume || null,
        beta: d.beta || 1.0, volatility30d: d.volatility30d || 20,
        sparkline: d.sparkline || [], volCategory: d.volCategory || "中波動" };
    });
  } catch { return symbols.map(createFallbackData); }
}

// ─── Public API ───
export async function batchGetFullData(symbols: string[]): Promise<StockFullData[]> {
  if (!symbols.length) return [];
  const results = new Map<string, StockFullData>();
  const uncached: string[] = [];
  for (const s of symbols) {
    const c = cache.get<StockFullData>(`full:${canonicalSymbol(s)}`);
    c ? results.set(s, c) : uncached.push(s);
  }
  if (uncached.length) {
    let fetched: StockFullData[];
    if (TWELVE_DATA_KEY) {
      fetched = await fetchFromTwelveData(uncached);
      if (fetched.every(d => d.price === 0)) {
        console.warn("[StockService] TwelveData all-zero, trying yfinance fallback");
        fetched = await fetchFromYfinance(uncached);
      }
    } else {
      fetched = await fetchFromYfinance(uncached);
    }
    for (const d of fetched) { cache.set(`full:${d.symbol}`, d, TTL_FULL); results.set(uncached[fetched.indexOf(d)] || d.symbol, d); }
  }
  return symbols.map(s => results.get(s) || cache.get<StockFullData>(`full:${canonicalSymbol(s)}`) || createFallbackData(s));
}
export async function getQuote(symbol: string) { const [f] = await batchGetFullData([symbol]); return { symbol: f.symbol, price: f.price, name: f.name }; }
export async function batchGetQuotes(symbols: string[]) { return (await batchGetFullData(symbols)).map(x => ({ symbol: x.symbol, price: x.price })); }
export async function lookupStock(symbol: string) {
  const { market, currency } = detectMarket(symbol);
  const base = getTwBaseCode(symbol); const tw = market === "TW" ? TW_SECTOR_MAP[base] : null;
  const c = canonicalSymbol(symbol); const [full] = await batchGetFullData([symbol]);
  return { symbol: c, name: tw?.name || full.name || c, sector: tw?.sector || full.sector || US_SECTOR_MAP[c] || "Other", market, currency, price: full.price };
}
export function getCacheStats() { return cache.stats(); }
export const fetchViaYfinance = async (s: string) => (await fetchFromYfinance([s]))[0] || null;

// ─── DB Persistent Cache ───
import { getStockCacheAll, batchUpsertStockCache } from "./db";
export async function loadCacheFromDB(): Promise<number> {
  try {
    const rows = await getStockCacheAll(); let n = 0;
    for (const r of rows) { try { const d = JSON.parse(r.data) as StockFullData; cache.set(`full:${d.symbol}`, d, TTL_DB_CACHE); n++; } catch {} }
    console.log(`[StockService] Loaded ${n} cached entries from DB`); return n;
  } catch (e) { console.warn("[StockService] DB cache load failed:", e); return 0; }
}
export async function flushCacheToDB(): Promise<number> {
  try {
    const entries: { symbol: string; data: string }[] = [];
    const now = Date.now();
    cache.getStore().forEach((e, k) => { if (k.startsWith("full:") && e.expireAt > now) entries.push({ symbol: (e.value as StockFullData).symbol, data: JSON.stringify(e.value) }); });
    if (entries.length) { await batchUpsertStockCache(entries); console.log(`[StockService] Flushed ${entries.length} entries to DB`); }
    return entries.length;
  } catch (e) { console.warn("[StockService] DB cache flush failed:", e); return 0; }
}
