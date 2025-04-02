/**
 * Converts meters to feet
 */
export const metersToFeet = (meters: number): number => {
  return Math.round(meters * 3.28084);
};

/**
 * Converts kilometers per hour to knots
 */
export const kmhToKnots = (kmh: number): number => {
  return Math.round(kmh * 0.539957);
};

/**
 * Converts meters per second to kilometers per hour
 */
export const mpsToKmh = (mps: number): number => {
  return mps * 3.6;
}; 