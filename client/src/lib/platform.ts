/**
 * Platform detection — 預留給未來 Capacitor APP 版
 *
 * 用法:
 *   import { platform, isNative, isIOS, isAndroid } from "@/lib/platform";
 *
 *   if (isNative) {
 *     // APP 專用邏輯 (e.g. Haptics, Push Notifications)
 *   }
 */

export type Platform = "web" | "pwa" | "ios" | "android";

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "web";

  // Capacitor native detection (future)
  const win = window as any;
  if (win.Capacitor?.isNativePlatform?.()) {
    return win.Capacitor.getPlatform?.() === "ios" ? "ios" : "android";
  }

  // PWA detection (installed to home screen)
  if (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (navigator as any).standalone === true
  ) {
    return "pwa";
  }

  return "web";
}

export const platform: Platform = detectPlatform();
export const isNative = platform === "ios" || platform === "android";
export const isIOS = platform === "ios";
export const isAndroid = platform === "android";
export const isPWA = platform === "pwa";
export const isWeb = platform === "web";

/**
 * Safe area insets helper — for notch devices
 * Returns CSS env() values or 0px fallback
 */
export const safeArea = {
  top: "env(safe-area-inset-top, 0px)",
  bottom: "env(safe-area-inset-bottom, 0px)",
  left: "env(safe-area-inset-left, 0px)",
  right: "env(safe-area-inset-right, 0px)",
};

/**
 * Haptic feedback (placeholder — Capacitor Haptics plugin)
 * Will be implemented when Capacitor is added
 */
export function hapticFeedback(_style: "light" | "medium" | "heavy" = "light") {
  // TODO: Implement with @capacitor/haptics when APP is built
  // if (isNative) { Haptics.impact({ style: ImpactStyle[_style.toUpperCase()] }); }
}

/**
 * Status bar style (placeholder — Capacitor StatusBar plugin)
 */
export function setStatusBarStyle(_style: "light" | "dark") {
  // TODO: Implement with @capacitor/status-bar when APP is built
}
