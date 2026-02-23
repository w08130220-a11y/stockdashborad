/**
 * Stock Service — 透過 Python yfinance 微服務取得股價資料
 *
 * 資料來源: Python Flask yfinance service (localhost:5001)
 * 功能: 即時股價、技術指標 (RSI/Beta/MA/Sparkline)、台股中文名稱對照
 * 快取: 記憶體 TTL Cache + MySQL 持久化快取
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

// ─── yfinance Python Service ───
const YFINANCE_URL = (process.env.YFINANCE_API_URL || "http://localhost:5001").replace(/\/$/, "");
let _yfinanceAvailable: boolean | null = null;

async function checkYfinance(): Promise<boolean> {
  if (_yfinanceAvailable !== null) return _yfinanceAvailable;
  try { const r = await fetch(`${YFINANCE_URL}/health`, { signal: AbortSignal.timeout(3000) }); _yfinanceAvailable = r.ok; }
  catch { _yfinanceAvailable = false; }
  setTimeout(() => { _yfinanceAvailable = null; }, 300_000);
  if (!_yfinanceAvailable) {
    console.warn(`[StockService] yfinance service unavailable at ${YFINANCE_URL}`);
    console.warn("[StockService] 請啟動: source venv/bin/activate && python3 server/yfinance_service.py");
  }
  return _yfinanceAvailable;
}

// ─── Taiwan Stock Sector Mapping ───
const TW_SECTOR_MAP: Record<string, { name: string; sector: string }> = {
  "2330": { name: "台積電", sector: "半導體" }, "2303": { name: "聯電", sector: "半導體" },
  "2454": { name: "聯發科", sector: "半導體" }, "3711": { name: "日月光投控", sector: "半導體" },
  "2379": { name: "瑞昱", sector: "半導體" }, "3034": { name: "聯詠", sector: "半導體" },
  "2408": { name: "南亞科", sector: "半導體" }, "6415": { name: "矽力-KY", sector: "半導體" },
  "3529": { name: "力旺", sector: "半導體" }, "5274": { name: "信驊", sector: "半導體" },
  "6770": { name: "力積電", sector: "半導體" }, "3443": { name: "創意", sector: "半導體" },
  "2449": { name: "京元電子", sector: "半導體" }, "6488": { name: "環球晶", sector: "半導體" },
  "3661": { name: "世芯-KY", sector: "半導體" }, "2344": { name: "華邦電", sector: "半導體" },
  "6547": { name: "高端疫苗", sector: "生技" },
  "2317": { name: "鴻海", sector: "電子" }, "2382": { name: "廣達", sector: "電子" },
  "2353": { name: "宏碁", sector: "電子" }, "2357": { name: "華碩", sector: "電子" },
  "3231": { name: "緯創", sector: "電子" }, "2356": { name: "英業達", sector: "電子" },
  "2324": { name: "仁寶", sector: "電子" }, "2301": { name: "光寶科", sector: "電子" },
  "3017": { name: "奇鋐", sector: "電子" }, "2308": { name: "台達電", sector: "電子" },
  "2345": { name: "智邦", sector: "電子" }, "3037": { name: "欣興", sector: "電子" },
  "2327": { name: "國巨", sector: "電子" }, "3706": { name: "神達", sector: "電子" },
  "6669": { name: "緯穎", sector: "電子" }, "2395": { name: "研華", sector: "電子" },
  "2376": { name: "技嘉", sector: "電子" }, "3533": { name: "嘉澤", sector: "電子" },
  "2360": { name: "致茂", sector: "電子" }, "6153": { name: "嘉澤端子", sector: "電子" },
  "2409": { name: "友達", sector: "光電" }, "3481": { name: "群創", sector: "光電" },
  "2474": { name: "可成", sector: "光電" }, "3008": { name: "大立光", sector: "光電" },
  "6176": { name: "瑞儀", sector: "光電" },
  "2412": { name: "中華電", sector: "通訊" }, "3045": { name: "台灣大", sector: "通訊" },
  "4904": { name: "遠傳", sector: "通訊" }, "4906": { name: "正文", sector: "通訊" },
  "2498": { name: "宏達電", sector: "通訊" },
  "2881": { name: "富邦金", sector: "金融" }, "2882": { name: "國泰金", sector: "金融" },
  "2884": { name: "玉山金", sector: "金融" }, "2886": { name: "兆豐金", sector: "金融" },
  "2891": { name: "中信金", sector: "金融" }, "2880": { name: "華南金", sector: "金融" },
  "2883": { name: "開發金", sector: "金融" }, "2885": { name: "元大金", sector: "金融" },
  "2887": { name: "台新金", sector: "金融" }, "2888": { name: "新光金", sector: "金融" },
  "2890": { name: "永豐金", sector: "金融" }, "2892": { name: "第一金", sector: "金融" },
  "5880": { name: "合庫金", sector: "金融" }, "2801": { name: "彰銀", sector: "金融" },
  "2834": { name: "臺企銀", sector: "金融" },
  "2603": { name: "長榮", sector: "航運" }, "2609": { name: "陽明", sector: "航運" },
  "2615": { name: "萬海", sector: "航運" }, "2618": { name: "長榮航", sector: "航運" },
  "2610": { name: "華航", sector: "航運" },
  "2002": { name: "中鋼", sector: "鋼鐵" }, "2006": { name: "東和鋼鐵", sector: "鋼鐵" },
  "2014": { name: "中鴻", sector: "鋼鐵" }, "2023": { name: "燁輝", sector: "鋼鐵" },
  "1301": { name: "台塑", sector: "塑化" }, "1303": { name: "南亞", sector: "塑化" },
  "1326": { name: "台化", sector: "塑化" }, "6505": { name: "台塑化", sector: "塑化" },
  "1402": { name: "遠東新", sector: "塑化" },
  "1216": { name: "統一", sector: "食品" }, "1101": { name: "台泥", sector: "水泥" },
  "1102": { name: "亞泥", sector: "水泥" }, "2207": { name: "和泰車", sector: "汽車" },
  "2912": { name: "統一超", sector: "食品" }, "9910": { name: "豐泰", sector: "紡織" },
  "1590": { name: "亞德客-KY", sector: "機械" }, "9904": { name: "寶成", sector: "紡織" },
  "2105": { name: "正新", sector: "橡膠" }, "9921": { name: "巨大", sector: "自行車" },
  "8454": { name: "富邦媒", sector: "電商" }, "5871": { name: "中租-KY", sector: "租賃" },
  "6446": { name: "藥華藥", sector: "生技" }, "4743": { name: "合一", sector: "生技" },
  "6472": { name: "保瑞", sector: "生技" },
  "0050": { name: "元大台灣50", sector: "ETF" }, "0056": { name: "元大高股息", sector: "ETF" },
  "006205": { name: "元大標普500", sector: "ETF" }, "00878": { name: "國泰永續高股息", sector: "ETF" },
  "00881": { name: "國泰台灣5G+", sector: "ETF" }, "00885": { name: "富邦越南", sector: "ETF" },
  "00891": { name: "中信關鍵半導體", sector: "ETF" }, "00892": { name: "富邦台灣半導體", sector: "ETF" },
  "00893": { name: "國泰智能電動車", sector: "ETF" }, "00919": { name: "群益台灣精選高息", sector: "ETF" },
  "00929": { name: "復華台灣科技優息", sector: "ETF" }, "00940": { name: "元大台灣價值高息", sector: "ETF" },
};

const US_SECTOR_MAP: Record<string, string> = {
  "AAPL": "Technology", "MSFT": "Technology", "GOOGL": "Technology", "GOOG": "Technology",
  "META": "Technology", "NVDA": "Technology", "AMD": "Technology", "INTC": "Technology",
  "CRM": "Technology", "ADBE": "Technology", "ORCL": "Technology", "CSCO": "Technology",
  "AVGO": "Technology", "TXN": "Technology", "QCOM": "Technology", "MU": "Technology",
  "AMAT": "Technology", "LRCX": "Technology", "KLAC": "Technology", "MRVL": "Technology",
  "NOW": "Technology", "PANW": "Technology", "PLTR": "Technology", "SHOP": "Technology",
  "CRWD": "Technology", "DELL": "Technology", "IBM": "Technology",
  "AMZN": "Consumer Cyclical", "TSLA": "Consumer Cyclical", "HD": "Consumer Cyclical",
  "NKE": "Consumer Cyclical", "MCD": "Consumer Cyclical", "SBUX": "Consumer Cyclical",
  "PG": "Consumer Defensive", "KO": "Consumer Defensive", "PEP": "Consumer Defensive",
  "WMT": "Consumer Defensive", "COST": "Consumer Defensive",
  "JPM": "Financial Services", "BAC": "Financial Services", "GS": "Financial Services",
  "V": "Financial Services", "MA": "Financial Services",
  "JNJ": "Healthcare", "UNH": "Healthcare", "PFE": "Healthcare", "LLY": "Healthcare",
  "ABBV": "Healthcare", "MRK": "Healthcare", "MRNA": "Healthcare",
  "NFLX": "Communication Services", "DIS": "Communication Services",
  "BA": "Industrials", "CAT": "Industrials", "GE": "Industrials",
  "XOM": "Energy", "CVX": "Energy", "COP": "Energy",
  "NEE": "Utilities", "DUK": "Utilities",
  "AMT": "Real Estate", "PLD": "Real Estate",
  "LIN": "Basic Materials", "FCX": "Basic Materials",
  "SPY": "ETF", "QQQ": "ETF", "IWM": "ETF", "VTI": "ETF", "VOO": "ETF",
};

// ─── Symbol Helpers ───
function getTwBaseCode(s: string): string { return s.replace(/\.TW$|\.TWO$/i, "").trim(); }
function ensureYahooSymbol(s: string): string {
  const u = s.toUpperCase().trim();
  if (u.endsWith(".TW") || u.endsWith(".TWO")) return u;
  const b = u.replace(/\.TW$|\.TWO$/i, "");
  if (/^\d{4,6}$/.test(b)) return `${b}.TW`;
  return u;
}
function detectMarket(s: string): { market: "US" | "TW"; currency: "USD" | "TWD" } {
  const u = s.toUpperCase();
  if (u.endsWith(".TW") || u.endsWith(".TWO")) return { market: "TW", currency: "TWD" };
  if (/^\d{4,6}$/.test(u.replace(/\.TW$|\.TWO$/i, ""))) return { market: "TW", currency: "TWD" };
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
  const base = getTwBaseCode(ensureYahooSymbol(symbol));
  const tw = market === "TW" ? TW_SECTOR_MAP[base] : null;
  return {
    symbol, name: tw?.name || symbol, price: 0, prevClose: 0, change: 0, changePct: 0,
    high52w: 0, low52w: 0, ma50: 0, ma200: 0, rsi: 50, pe: null, divYield: 0,
    marketCap: null, sector: tw?.sector || US_SECTOR_MAP[symbol.toUpperCase()] || "Other",
    earningsGrowth: 0, targetPrice: null, volume: null, beta: 1.0, volatility30d: 20,
    sparkline: [], volCategory: "中波動",
  };
}

function mapYfinanceResponse(sym: string, data: any): StockFullData {
  const { market } = detectMarket(sym);
  const base = getTwBaseCode(ensureYahooSymbol(sym));
  const tw = market === "TW" ? TW_SECTOR_MAP[base] : null;
  return {
    symbol: sym, name: tw?.name || data.name || sym,
    price: data.price || 0, prevClose: data.prevClose || 0,
    change: data.change || 0, changePct: data.changePct || 0,
    high52w: data.high52w || 0, low52w: data.low52w || 0,
    ma50: data.ma50 || 0, ma200: data.ma200 || 0, rsi: data.rsi || 50,
    pe: data.pe || null, divYield: data.divYield || 0, marketCap: data.marketCap || null,
    sector: tw?.sector || data.sector || US_SECTOR_MAP[sym.toUpperCase()] || "Other",
    earningsGrowth: data.earningsGrowth || 0, targetPrice: data.targetPrice || null,
    volume: data.volume || null, beta: data.beta || 1.0, volatility30d: data.volatility30d || 20,
    sparkline: data.sparkline || [], volCategory: data.volCategory || "中波動",
  };
}

// ─── Core API Calls ───

async function fetchFromYfinance(symbol: string): Promise<StockFullData | null> {
  if (!(await checkYfinance())) return null;
  try {
    const r = await fetch(`${YFINANCE_URL}/full/${ensureYahooSymbol(symbol)}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || data.error) return null;
    return mapYfinanceResponse(symbol, data);
  } catch { return null; }
}

async function batchFetchFromYfinance(symbols: string[]): Promise<StockFullData[]> {
  if (!(await checkYfinance())) return symbols.map(createFallbackData);
  try {
    const r = await fetch(`${YFINANCE_URL}/batch_full`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: symbols.map(ensureYahooSymbol) }),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) return symbols.map(createFallbackData);
    const arr = await r.json() as any[];
    return symbols.map((sym, i) => arr[i] && !arr[i].error ? mapYfinanceResponse(sym, arr[i]) : createFallbackData(sym));
  } catch { return symbols.map(createFallbackData); }
}

// ─── Public Exports ───

async function getStockFullData(symbol: string): Promise<StockFullData> {
  const k = `full:${symbol}`;
  const c = cache.get<StockFullData>(k);
  if (c) return c;
  const data = await fetchFromYfinance(symbol);
  if (data && data.price > 0) { cache.set(k, data, TTL_FULL); return data; }
  return createFallbackData(symbol);
}

export async function batchGetFullData(symbols: string[]): Promise<StockFullData[]> {
  if (!symbols.length) return [];
  const results = new Map<string, StockFullData>();
  const uncached: string[] = [];
  for (const s of symbols) { const c = cache.get<StockFullData>(`full:${s}`); c ? results.set(s, c) : uncached.push(s); }
  if (uncached.length) {
    const fetched = await batchFetchFromYfinance(uncached);
    for (const d of fetched) { cache.set(`full:${d.symbol}`, d, TTL_FULL); results.set(d.symbol, d); }
  }
  return symbols.map(s => results.get(s) || createFallbackData(s));
}

export async function getQuote(symbol: string) {
  const f = await getStockFullData(symbol);
  return { symbol: f.symbol, price: f.price, name: f.name };
}

export async function batchGetQuotes(symbols: string[]) {
  const d = await batchGetFullData(symbols);
  return d.map(x => ({ symbol: x.symbol, price: x.price }));
}

export async function lookupStock(symbol: string) {
  const { market, currency } = detectMarket(symbol);
  const y = ensureYahooSymbol(symbol);
  const base = getTwBaseCode(y);
  const tw = market === "TW" ? TW_SECTOR_MAP[base] : null;
  const full = await getStockFullData(symbol);
  return { symbol: y, name: tw?.name || full.name || symbol, sector: tw?.sector || full.sector || US_SECTOR_MAP[symbol.toUpperCase()] || "Other", market, currency, price: full.price };
}

export function getCacheStats() { return cache.stats(); }
export const fetchViaYfinance = fetchFromYfinance;

// ─── DB Persistent Cache ───
import { getStockCacheAll, batchUpsertStockCache } from "./db";

export async function loadCacheFromDB(): Promise<number> {
  try {
    const rows = await getStockCacheAll();
    let n = 0;
    for (const r of rows) { try { const d = JSON.parse(r.data) as StockFullData; cache.set(`full:${d.symbol}`, d, TTL_DB_CACHE); n++; } catch {} }
    console.log(`[StockService] Loaded ${n} cached entries from DB`);
    return n;
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
