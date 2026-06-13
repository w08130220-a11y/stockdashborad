/**
 * Cleanup Scheduler — 24 小時自動銷毀
 *
 * 每隔數分鐘掃描一次：
 *  - 已過期且擁有者「未保存」的貼文 → 連同磁碟媒體檔一起刪除
 *  - 已過期但擁有者「已保存」的貼文 → 標記 archived（從動態消失，僅留在本人封存頁）
 */

import { reapExpiredPosts } from "./db";
import { deleteMediaFiles } from "./media";

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 每 5 分鐘掃描一次

let _timer: ReturnType<typeof setInterval> | null = null;

export async function runCleanup(): Promise<{ removed: number; filesDeleted: number }> {
  try {
    const mediaUrls = await reapExpiredPosts();
    const filesDeleted = await deleteMediaFiles(mediaUrls);
    if (mediaUrls.length > 0) {
      console.log(`[Cleanup] 銷毀 ${mediaUrls.length} 則過期貼文，刪除 ${filesDeleted} 個媒體檔`);
    }
    return { removed: mediaUrls.length, filesDeleted };
  } catch (err) {
    console.error("[Cleanup] 銷毀過期貼文失敗:", err);
    return { removed: 0, filesDeleted: 0 };
  }
}

export function startCleanupScheduler(): void {
  // 啟動時先跑一次，再定期執行
  void runCleanup();
  _timer = setInterval(() => { void runCleanup(); }, CLEANUP_INTERVAL_MS);
  console.log(`[Cleanup] 排程啟動，每 ${CLEANUP_INTERVAL_MS / 60000} 分鐘銷毀過期貼文`);
}

export function stopCleanupScheduler(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
