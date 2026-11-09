// Helpers for turning data values into pixel positions.

/**
 * A linear scale maps a value in [domainMin, domainMax] to a pixel position in
 * [rangeMin, rangeMax] in proportion:
 *
 *   fraction = (value - domainMin) / (domainMax - domainMin)   // 0 at domainMin, 1 at domainMax
 *   pixel    = rangeMin + fraction * (rangeMax - rangeMin)
 *
 * `invert` goes the other way, from a pixel back to a value.
 * For a y-axis, pass rangeMin as the bottom pixel and rangeMax as the top, because
 * SVG's y grows downward.
 */
export function linearScale(domainMin: number, domainMax: number, rangeMin: number, rangeMax: number) {
  const toPixel = (value: number) => {
    const fraction = (value - domainMin) / (domainMax - domainMin)
    return rangeMin + fraction * (rangeMax - rangeMin)
  }
  const invert = (pixel: number) => {
    const fraction = (pixel - rangeMin) / (rangeMax - rangeMin)
    return domainMin + fraction * (domainMax - domainMin)
  }
  return { toPixel, invert }
}

/**
 * Axis bounds that are whole multiples of `step` and contain [min, max].
 * Example: min −0.4, max 6.1, step 2 → { low: −2, high: 8 }
 */
export function roundedBounds(min: number, max: number, step: number): { low: number; high: number } {
  return { low: Math.floor(min / step) * step, high: Math.ceil(max / step) * step }
}

/** Every multiple of `step` from low to high, e.g. (−2, 8, 2) → [−2, 0, 2, 4, 6, 8]. */
export function ticksBetween(low: number, high: number, step: number): number[] {
  const ticks: number[] = []
  const count = Math.round((high - low) / step)
  for (let i = 0; i <= count; i++) {
    ticks.push(low + i * step)
  }
  return ticks
}

/** Keep a value inside [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
