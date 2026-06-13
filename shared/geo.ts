// 地理計算工具（前後端共用）

export const NEARBY_RADIUS_KM = 3; // 只能看到附近 3 公里

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Haversine 距離（公里）
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// 以中心點 + 半徑算出經緯度 bounding box（先用方框粗篩，再用 Haversine 精算）
export function boundingBox(center: { lat: number; lng: number }, radiusKm: number) {
  const latDelta = radiusKm / 111.32; // 1 緯度 ≈ 111.32 km
  const lngDelta = radiusKm / (111.32 * Math.cos(toRad(center.lat)) || 1e-6);
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

export function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
