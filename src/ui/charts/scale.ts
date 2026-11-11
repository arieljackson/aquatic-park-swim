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

/** Every multiple of `step` from low to high, e.g. (−2, 8, 2) → [−2, 0, 2, 4, 6, 8]. */
export function ticksBetween(low: number, high: number, step: number): number[] {
  const ticks: number[] = []
  const count = Math.round((high - low) / step)
  for (let i = 0; i <= count; i++) {
    ticks.push(low + i * step)
  }
  return ticks
}
