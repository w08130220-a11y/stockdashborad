/**
 * Scheduler — 每日定時更新股價快照
 *
 * 台股：每日 06:00 CST (UTC+8) = 22:00 UTC 前一天
 * 美股：每日 06:00 EST (UTC-5) = 11:00 UTC
 *
 * 策略：
 * - 每日 06:00 (本地時間) 自動拉取所有持股 + 觀察清單的最新收盤價
 * - 快取寫入 DB（stock_cache 表），避免重啟後遺失
 * - 開盤時間可選擇 5 分鐘更新（需手動啟用）
 */

import { batchGetFullData, flushCacheToDB, loadCacheFromDB, type StockFullData } from "./stockService";

// ─── Schedule Config ───
const DAILY_UPDATE_HOUR = 6;  // 每天早上 6 點 (server local time)
const DAILY_UPDATE_MIN = 0;

let _schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let _isRunning = false;

// ─── Calculate ms until next scheduled time ───
function msUntilNext(hour: number, min: number): number {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, min, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

// ─── Run daily update ───
export async function runDailyUpdate(symbols: string[]): Promise<{ updated: number; failed: number }> {
  if (_isRunning) {
    console.log("[Scheduler] Update already in progress, skipping");
    return { updated: 0, failed: 0 };
  }
  _isRunning = true;
  console.log(`[Scheduler] Starting daily update for ${symbols.length} symbols...`);

  let updated = 0;
  let failed = 0;

  try {
    // Process in smaller batches to avoid rate limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      try {
        const results = await batchGetFullData(batch);
        updated += results.filter(r => r.price > 0).length;
        failed += results.filter(r => r.price === 0).length;
      } catch (err) {
        console.warn(`[Scheduler] Batch failed:`, err);
        failed += batch.length;
      }
      // Pause between batches to respect rate limits
      if (i + BATCH_SIZE < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // Flush cache to DB for persistence
    await flushCacheToDB();
    console.log(`[Scheduler] Daily update complete: ${updated} updated, ${failed} failed`);
  } catch (err) {
    console.error("[Scheduler] Daily update error:", err);
  } finally {
    _isRunning = false;
  }

  return { updated, failed };
}

// ─── Start scheduler ───
export function startScheduler(getSymbolsFn: () => Promise<string[]>) {
  const scheduleNext = () => {
    const ms = msUntilNext(DAILY_UPDATE_HOUR, DAILY_UPDATE_MIN);
    const nextRun = new Date(Date.now() + ms);
    console.log(`[Scheduler] Next daily update at ${nextRun.toLocaleString()} (in ${Math.round(ms / 60000)} min)`);

    _schedulerTimer = setTimeout(async () => {
      try {
        const symbols = await getSymbolsFn();
        if (symbols.length > 0) {
          await runDailyUpdate(symbols);
        }
      } catch (err) {
        console.error("[Scheduler] Failed to get symbols:", err);
      }
      // Schedule next run
      scheduleNext();
    }, ms);
  };

  // Load persisted cache from DB on startup
  loadCacheFromDB().then(() => {
    console.log("[Scheduler] Loaded cached stock data from DB");
  }).catch(err => {
    console.warn("[Scheduler] Failed to load cache from DB:", err);
  });

  scheduleNext();
}

export function stopScheduler() {
  if (_schedulerTimer) {
    clearTimeout(_schedulerTimer);
    _schedulerTimer = null;
  }
}
