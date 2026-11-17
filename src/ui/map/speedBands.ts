// The current's arrows, shared by both maps: NOAA's seven speed bands with their colors,
// and the arrow shape (a line with an open V head).
//
// Each band's color is brighter than the one before (violet → magenta → rose → orange →
// amber → yellow → pale yellow, a plasma-like palette), so the fastest water stands out
// most and the order holds for color-blind readers.

/** NOAA's speed bands (knots): a speed under a band's `below` is in that band. */
export const SPEED_BANDS = [
  { below: 0.5, color: '#765dcf' },
  { below: 1.0, color: '#c851c1' },
  { below: 1.5, color: '#f86685' },
  { below: 2.0, color: '#fe8f5b' },
  { below: 2.5, color: '#feb354' },
  { below: 3.0, color: '#fed252' },
  { below: Infinity, color: '#f9f39b' },
]

/** Model spots slower than this get no arrow (no clear direction). */
export const MIN_ARROW_SPEED_KT = 0.05

/** The color of a speed's band. */
export function bandColor(speedKt: number): string {
  for (const band of SPEED_BANDS) {
    if (speedKt < band.below) return band.color
  }
  return SPEED_BANDS[SPEED_BANDS.length - 1].color
}

/**
 * A line arrow centered on (x, y), pointing along the unit vector (ux, uy), `length`
 * long, with an open V head, as two path strings: the shaft (tail to tip) and the head
 * (two strokes from points `head` back from the tip and 0.6 × head to either side):
 *   side point = tip − head × (ux, uy) ± 0.6 × head × (−uy, ux)
 * Separate so a dotted arrow can keep a solid head.
 */
export function arrowParts(x: number, y: number, ux: number, uy: number, length: number, head: number): { shaft: string; head: string } {
  const half = length / 2
  const tipX = x + ux * half
  const tipY = y + uy * half
  const backX = tipX - ux * head
  const backY = tipY - uy * head
  const sideX = -uy * head * 0.6
  const sideY = ux * head * 0.6
  const tail = `M${(x - ux * half).toFixed(1)},${(y - uy * half).toFixed(1)}`
  const tip = `${tipX.toFixed(1)},${tipY.toFixed(1)}`
  const left = `${(backX + sideX).toFixed(1)},${(backY + sideY).toFixed(1)}`
  const right = `${(backX - sideX).toFixed(1)},${(backY - sideY).toFixed(1)}`
  return { shaft: `${tail} L${tip}`, head: `M${left} L${tip} L${right}` }
}

/** The whole arrow (shaft and head) as one path string; see arrowParts. */
export function arrowPath(x: number, y: number, ux: number, uy: number, length: number, head: number): string {
  const parts = arrowParts(x, y, ux, uy, length, head)
  return `${parts.shaft} ${parts.head}`
}
