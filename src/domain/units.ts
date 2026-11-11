// Wind units. Wind is stored in knots everywhere (NOAA measures in knots) and shown in
// mph, the unit most weather apps use (the current stays in knots). Its direction is
// stored in degrees and shown as a compass point.

/** 1 knot = 1.15078 mph */
const MPH_PER_KNOT = 1.15078

/** knots → mph:  mph = knots × 1.15078 */
export function knotsToMph(knots: number): number {
  return knots * MPH_PER_KNOT
}

/** mph → knots:  knots = mph ÷ 1.15078 */
export function mphToKnots(mph: number): number {
  return mph / MPH_PER_KNOT
}

/** Compass points in order, clockwise from north, 22.5° apart. */
const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

/**
 * Degrees → the nearest of 16 compass points: 235° → "SW".
 *   index = round(degrees / 22.5), and 16 (= 360°) wraps back to 0 (N)
 */
export function compassPoint(degrees: number): string {
  let index = Math.round(degrees / 22.5)
  if (index === 16) index = 0
  return COMPASS_POINTS[index]
}

/**
 * A compass point → degrees: "WNW" → 292.5. Null if it isn't one of the 16 points.
 *   degrees = position in the list × 22.5   (N = 0, E = 90, S = 180, W = 270)
 */
export function compassPointToDegrees(point: string): number | null {
  const index = COMPASS_POINTS.indexOf(point)
  if (index === -1) return null
  return index * 22.5
}
