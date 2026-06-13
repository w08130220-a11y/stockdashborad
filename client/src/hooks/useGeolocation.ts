import { useCallback, useEffect, useState } from "react";

export type GeoState = {
  lat: number | null;
  lng: number | null;
  loading: boolean;
  error: string | null;
};

// 取得使用者目前位置（瀏覽器 Geolocation API）
export function useGeolocation(auto = true) {
  const [state, setState] = useState<GeoState>({
    lat: null,
    lng: null,
    loading: auto,
    error: null,
  });

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((s) => ({ ...s, loading: false, error: "此裝置不支援定位" }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          loading: false,
          error: null,
        });
      },
      (err) => {
        setState((s) => ({
          ...s,
          loading: false,
          error: err.code === err.PERMISSION_DENIED ? "需要開啟定位權限才能看到附近的分享" : "無法取得位置",
        }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }, []);

  useEffect(() => {
    if (auto) request();
  }, [auto, request]);

  return { ...state, request };
}
