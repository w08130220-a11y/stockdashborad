"""
yfinance microservice — runs on port 5001
Provides stock data endpoints consumed by the Node.js tRPC backend.
"""
import json
import math
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Optional

import numpy as np
import pandas as pd
import yfinance as yf
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)


# ─── TTL Memory Cache ───
class TTLCache:
    """Thread-safe in-memory cache with per-key TTL."""

    def __init__(self):
        self._store: dict[str, tuple[Any, float]] = {}  # key -> (value, expire_at)
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expire_at = entry
            if time.time() > expire_at:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl: int) -> None:
        with self._lock:
            self._store[key] = (value, time.time() + ttl)

    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def stats(self) -> dict:
        with self._lock:
            now = time.time()
            total = len(self._store)
            alive = sum(1 for _, (_, exp) in self._store.items() if exp > now)
            return {"total_keys": total, "alive_keys": alive}


_cache = TTLCache()

# TTL constants (seconds)
TTL_QUOTE = 30          # Real-time price: 30 seconds
TTL_BETA = 3600         # Beta (1-year calc): 1 hour
TTL_VOLATILITY = 3600   # 30-day volatility: 1 hour
TTL_SPARKLINE = 1800    # Sparkline (60-day history): 30 minutes
TTL_FULL = 30           # Full data bundle: 30 seconds (price-driven)


def safe_float(val, default=None):
    try:
        if val is None or (isinstance(val, float) and math.isnan(val)):
            return default
        return float(val)
    except Exception:
        return default


def safe_int(val, default=None):
    try:
        if val is None:
            return default
        return int(val)
    except Exception:
        return default


def _flatten_download(df: pd.DataFrame) -> pd.DataFrame:
    """Flatten MultiIndex columns from yf.download (yfinance >= 0.2.x)."""
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    return df


def compute_beta(ticker_symbol: str, period: str = "1y") -> float:
    """Compute beta against SPY over the given period (cached 1 hour)."""
    cache_key = f"beta:{ticker_symbol}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        end = datetime.today()
        start = end - timedelta(days=365)
        stock = _flatten_download(yf.download(ticker_symbol, start=start, end=end, progress=False, auto_adjust=True))
        spy = _flatten_download(yf.download("SPY", start=start, end=end, progress=False, auto_adjust=True))
        if stock.empty or spy.empty:
            result = 1.0
        else:
            sr = stock["Close"].pct_change().dropna()
            mr = spy["Close"].pct_change().dropna()
            combined = pd.concat([sr, mr], axis=1).dropna()
            if len(combined) < 20:
                result = 1.0
            else:
                combined.columns = ["stock", "market"]
                cov = combined["stock"].cov(combined["market"])
                var = combined["market"].var()
                result = round(float(cov / var), 3) if var != 0 else 1.0
    except Exception:
        result = 1.0
    _cache.set(cache_key, result, TTL_BETA)
    return result


def compute_volatility_30d(ticker_symbol: str) -> float:
    """Annualised 30-day historical volatility (%) (cached 1 hour)."""
    cache_key = f"vol30d:{ticker_symbol}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        end = datetime.today()
        start = end - timedelta(days=60)
        data = _flatten_download(yf.download(ticker_symbol, start=start, end=end, progress=False, auto_adjust=True))
        if data.empty or len(data) < 5:
            result = 20.0
        else:
            returns = data["Close"].pct_change().dropna()
            result = round(float(returns.tail(30).std()) * math.sqrt(252) * 100, 2)
    except Exception:
        result = 20.0
    _cache.set(cache_key, result, TTL_VOLATILITY)
    return result


def get_sparkline(ticker_symbol: str, points: int = 20) -> list:
    """Return last `points` closing prices for sparkline (cached 30 min)."""
    cache_key = f"sparkline:{ticker_symbol}:{points}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        end = datetime.today()
        start = end - timedelta(days=60)
        data = _flatten_download(yf.download(ticker_symbol, start=start, end=end, progress=False, auto_adjust=True))
        if data.empty:
            result = []
        else:
            closes = data["Close"].dropna().tail(points).tolist()
            result = [round(float(c), 4) for c in closes]
    except Exception:
        result = []
    if result:  # Only cache non-empty results
        _cache.set(cache_key, result, TTL_SPARKLINE)
    return result


def fetch_quote(symbol: str) -> dict:
    """Fetch a comprehensive quote for a single symbol (cached 30 sec)."""
    cache_key = f"quote:{symbol}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached
    result = _fetch_quote_uncached(symbol)
    _cache.set(cache_key, result, TTL_QUOTE)
    return result


def _fetch_quote_uncached(symbol: str) -> dict:
    """Internal: fetch quote without cache."""
    try:
        tk = yf.Ticker(symbol)
        try:
            info = tk.info or {}
        except Exception:
            info = {}
        hist = tk.history(period="5d")
        hist_1y = tk.history(period="1y")

        # Flatten multi-level columns if present (yfinance >= 0.2.x)
        if isinstance(hist.columns, pd.MultiIndex):
            hist.columns = hist.columns.get_level_values(0)
        if isinstance(hist_1y.columns, pd.MultiIndex):
            hist_1y.columns = hist_1y.columns.get_level_values(0)

        price = safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
        prev_close = safe_float(info.get("previousClose") or info.get("regularMarketPreviousClose"))

        if price is None and not hist.empty and "Close" in hist.columns:
            price = round(float(hist["Close"].iloc[-1]), 4)
        if prev_close is None and not hist.empty and "Close" in hist.columns and len(hist) >= 2:
            prev_close = round(float(hist["Close"].iloc[-2]), 4)
        if price is None and not hist_1y.empty and "Close" in hist_1y.columns:
            price = round(float(hist_1y["Close"].iloc[-1]), 4)
        if price is None:
            price = 0.0
        if prev_close is None:
            prev_close = price

        change = round(price - prev_close, 4)
        change_pct = round((change / prev_close * 100) if prev_close else 0, 4)

        high_52w = safe_float(info.get("fiftyTwoWeekHigh"))
        low_52w = safe_float(info.get("fiftyTwoWeekLow"))
        if high_52w is None and not hist_1y.empty and "High" in hist_1y.columns:
            high_52w = round(float(hist_1y["High"].max()), 4)
        if low_52w is None and not hist_1y.empty and "Low" in hist_1y.columns:
            low_52w = round(float(hist_1y["Low"].min()), 4)

        ma50 = safe_float(info.get("fiftyDayAverage"))
        ma200 = safe_float(info.get("twoHundredDayAverage"))
        if ma50 is None and not hist_1y.empty and "Close" in hist_1y.columns and len(hist_1y) >= 50:
            ma50 = round(float(hist_1y["Close"].tail(50).mean()), 4)
        if ma200 is None and not hist_1y.empty and "Close" in hist_1y.columns and len(hist_1y) >= 200:
            ma200 = round(float(hist_1y["Close"].tail(200).mean()), 4)

        close_series = hist_1y["Close"] if (not hist_1y.empty and "Close" in hist_1y.columns) else pd.Series(dtype=float)
        rsi = compute_rsi(close_series)

        return {
            "symbol": symbol.upper(),
            "name": info.get("longName") or info.get("shortName") or symbol,
            "price": price,
            "prevClose": prev_close,
            "change": change,
            "changePct": change_pct,
            "high52w": high_52w or price * 1.2,
            "low52w": low_52w or price * 0.8,
            "ma50": ma50 or price,
            "ma200": ma200 or price,
            "rsi": rsi,
            "pe": safe_float(info.get("trailingPE") or info.get("forwardPE")),
            "divYield": round((safe_float(info.get("dividendYield")) or 0) * 100, 4),
            "marketCap": safe_float(info.get("marketCap")),
            "sector": info.get("sector") or "Other",
            "earningsGrowth": round((safe_float(info.get("earningsGrowth")) or 0) * 100, 2),
            "targetPrice": safe_float(info.get("targetMeanPrice")),
            "volume": safe_int(info.get("volume") or info.get("regularMarketVolume")),
        }
    except Exception as e:
        return {
            "symbol": symbol.upper(),
            "name": symbol,
            "price": 0.0,
            "prevClose": 0.0,
            "change": 0.0,
            "changePct": 0.0,
            "high52w": 0.0,
            "low52w": 0.0,
            "ma50": 0.0,
            "ma200": 0.0,
            "rsi": 50.0,
            "pe": None,
            "divYield": 0.0,
            "marketCap": None,
            "sector": "Other",
            "earningsGrowth": 0.0,
            "targetPrice": None,
            "volume": None,
            "error": str(e),
        }


def compute_rsi(series: pd.Series, period: int = 14) -> float:
    """Compute RSI from a price series."""
    try:
        if len(series) < period + 1:
            return 50.0
        delta = series.diff().dropna()
        gain = delta.clip(lower=0)
        loss = (-delta).clip(lower=0)
        avg_gain = gain.ewm(com=period - 1, min_periods=period).mean().iloc[-1]
        avg_loss = loss.ewm(com=period - 1, min_periods=period).mean().iloc[-1]
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return round(float(100 - 100 / (1 + rs)), 2)
    except Exception:
        return 50.0


# ─── Endpoints ───

@app.route("/health")
def health():
    return jsonify({"status": "ok", "cache": _cache.stats()})


@app.route("/cache/clear", methods=["POST"])
def cache_clear():
    """Force-clear all cached entries (useful after market open/close)."""
    body = request.get_json(force=True) or {}
    symbol = body.get("symbol")
    if symbol:
        sym = symbol.upper()
        for prefix in ["quote", "beta", "vol30d", "sparkline"]:
            _cache.delete(f"{prefix}:{sym}")
            _cache.delete(f"sparkline:{sym}:20")
        return jsonify({"cleared": sym})
    # Clear all
    _cache._store.clear()
    return jsonify({"cleared": "all"})


@app.route("/quotes", methods=["POST"])
def quotes():
    """POST { symbols: ["AAPL", "MSFT", ...] } → list of quotes."""
    body = request.get_json(force=True) or {}
    symbols = body.get("symbols", [])
    if not symbols:
        return jsonify([])
    results = []
    for sym in symbols:
        q = fetch_quote(sym.upper())
        results.append(q)
    return jsonify(results)


@app.route("/quote/<symbol>")
def single_quote(symbol):
    return jsonify(fetch_quote(symbol.upper()))


@app.route("/beta/<symbol>")
def beta_endpoint(symbol):
    b = compute_beta(symbol.upper())
    return jsonify({"symbol": symbol.upper(), "beta": b})


@app.route("/volatility/<symbol>")
def volatility_endpoint(symbol):
    v = compute_volatility_30d(symbol.upper())
    return jsonify({"symbol": symbol.upper(), "volatility30d": v})


@app.route("/sparkline/<symbol>")
def sparkline_endpoint(symbol):
    data = get_sparkline(symbol.upper())
    return jsonify({"symbol": symbol.upper(), "data": data})


@app.route("/full/<symbol>")
def full_data(symbol):
    """Full data including beta, volatility, sparkline for one symbol."""
    sym = symbol.upper()
    quote = fetch_quote(sym)
    beta = compute_beta(sym)
    vol = compute_volatility_30d(sym)
    spark = get_sparkline(sym)

    vol_category = "低波動"
    if beta > 1.2 or vol > 25:
        vol_category = "高波動"
    elif beta > 0.8 or vol > 15:
        vol_category = "中波動"

    return jsonify({
        **quote,
        "beta": beta,
        "volatility30d": vol,
        "sparkline": spark,
        "volCategory": vol_category,
    })


@app.route("/batch_full", methods=["POST"])
def batch_full():
    """POST { symbols: [...] } → full data for each symbol (beta + vol + sparkline)."""
    body = request.get_json(force=True) or {}
    symbols = [s.upper() for s in body.get("symbols", [])]
    if not symbols:
        return jsonify([])

    results = []
    for sym in symbols:
        try:
            quote = fetch_quote(sym)
            beta = compute_beta(sym)
            vol = compute_volatility_30d(sym)
            spark = get_sparkline(sym)

            vol_category = "低波動"
            if beta > 1.2 or vol > 25:
                vol_category = "高波動"
            elif beta > 0.8 or vol > 15:
                vol_category = "中波動"

            results.append({
                **quote,
                "beta": beta,
                "volatility30d": vol,
                "sparkline": spark,
                "volCategory": vol_category,
            })
        except Exception as e:
            results.append({"symbol": sym, "error": str(e)})
    return jsonify(results)


if __name__ == "__main__":
    import socket
    import sys
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("0.0.0.0", 5001))
        s.close()
        app.run(host="0.0.0.0", port=5001, debug=False)
    except OSError:
        # Port already in use — another instance is running, exit gracefully
        s.close()
        sys.exit(0)
