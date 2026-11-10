// Wind units. Wind is stored in knots everywhere (NOAA measures in knots) and shown in
// mph, the unit most weather apps use (the current stays in knots). Its direction is
// stored in degrees and shown as a compass point.

/** 1 knot = 1.15078 mph */
const MPH_PER_KNOT = 1.15078

/** knots → mph:  mph = knots × 1.15078 */
export function knotsToMph(knots: number): number {
  return knots * MPH_PER_KNOT
}

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
