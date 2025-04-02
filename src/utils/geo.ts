/**
 * Represents a waypoint on a map
 */
export interface Waypoint {
  lat: number;
  lng: number;
  ident?: string;
  name?: string;
  type?: 'airport' | 'waypoint';
}

/**
 * Represents an interpolated position on a map
 */
export interface InterpolatedPosition {
  lat: number;
  lng: number;
  name?: string;
  timestamp?: number;
}

/**
 * Calculate bearing between two geographic points
 */
export const calculateBearing = (start: [number, number], end: [number, number]): number => {
  const startLat = start[0] * Math.PI / 180;
  const startLng = start[1] * Math.PI / 180;
  const endLat = end[0] * Math.PI / 180;
  const endLng = end[1] * Math.PI / 180;

  const dLng = endLng - startLng;

  const y = Math.sin(dLng) * Math.cos(endLat);
  const x = Math.cos(startLat) * Math.sin(endLat) -
            Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);

  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  if (bearing < 0) {
    bearing += 360;
  }
  return bearing;
};

/**
 * Calculate distance between two points using Haversine formula
 * @returns Distance in meters
 */
export const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // Distance in meters
};

/**
 * Calculate interpolated position based on start, speed, and heading
 */
export const calculateInterpolatedPosition = (
  startPos: InterpolatedPosition, 
  speed: number, 
  heading: number
): InterpolatedPosition => {
  const now = Date.now();
  const timeDiff = (now - (startPos.timestamp ?? now)) / 1000; // Convert to seconds
  const distance = (speed * timeDiff) / 3600; // Convert km/h to km

  // Convert heading to radians
  const headingRad = (heading * Math.PI) / 180;
  
  // Calculate new position using great circle formula
  const lat1 = startPos.lat * Math.PI / 180;
  const lng1 = startPos.lng * Math.PI / 180;
  const d = distance / 6371; // Earth's radius in km

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
    Math.cos(lat1) * Math.sin(d) * Math.cos(headingRad)
  );

  const lng2 = lng1 + Math.atan2(
    Math.sin(headingRad) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    lat: lat2 * 180 / Math.PI,
    lng: lng2 * 180 / Math.PI,
    timestamp: now,
    name: startPos.name
  };
}; 