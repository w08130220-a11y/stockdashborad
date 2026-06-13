import { useEffect, useState } from "react";

// 顯示距離銷毀剩餘時間（24 小時後消失）
function format(ms: number): string {
  if (ms <= 0) return "即將消失";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(ms / 1000)}s`;
}

export function Countdown({ expiresAt, className }: { expiresAt: Date | string; className?: string }) {
  const target = typeof expiresAt === "string" ? new Date(expiresAt).getTime() : expiresAt.getTime();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const remaining = target - now;
  const urgent = remaining < 60 * 60 * 1000; // 最後 1 小時

  return (
    <span className={className} style={{ color: urgent ? "#ff3d5e" : undefined }}>
      ⏳ {format(remaining)}
    </span>
  );
}
