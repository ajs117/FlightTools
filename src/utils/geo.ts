export function metersToFeet(meters: number): number {
  return Math.round(meters * 3.28084);
}

export function kmhToKnots(kmh: number): number {
  return Math.round(kmh * 0.539957);
}

export function metersToBananas(meters: number): number {
  return meters / 0.1905;
}

export function bananasToMeters(bananas: number): number {
  return bananas * 0.1905;
}

export function bananasToNauticalMiles(bananas: number): number {
  return (bananas * 0.1905) / 1852;
}

export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export interface InterpolatedPositionInput {
  lat: number;
  lng: number;
  name: string;
  timestamp?: number;
}

export function calculateInterpolatedPosition(
  startPos: InterpolatedPositionInput,
  speedKmh: number,
  headingDeg: number
): InterpolatedPositionInput {
  const now = Date.now();
  const timeDiffSec = (now - (startPos.timestamp ?? now)) / 1000;
  const distanceKm = (speedKmh * timeDiffSec) / 3600;

  const headingRad = (headingDeg * Math.PI) / 180;
  const lat1 = (startPos.lat * Math.PI) / 180;
  const lon1 = (startPos.lng * Math.PI) / 180;
  const d = distanceKm / 6371;

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(headingRad));
  const lon2 = lon1 + Math.atan2(
    Math.sin(headingRad) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lon2 * 180) / Math.PI,
    timestamp: now,
    name: startPos.name,
  };
}

export function bearingDegrees(start: [number, number], end: [number, number]): number {
  const startLat = (start[0] * Math.PI) / 180;
  const startLng = (start[1] * Math.PI) / 180;
  const endLat = (end[0] * Math.PI) / 180;
  const endLng = (end[1] * Math.PI) / 180;
  const dLng = endLng - startLng;
  const y = Math.sin(dLng) * Math.cos(endLat);
  const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  if (bearing < 0) bearing += 360;
  return bearing;
} 