// The COVE map's arrows from NOAA's SFBOFS model: one per model point, at the model's own
// position, with that point's value (no averaging).
//
// - In open water they're the data: solid, colored by speed.
// - In sheltered water (the cove, and the harbor behind the Hyde Street Pier) they're the
//   eddies: the model doesn't include the piers, so they're only a rough guide (drawn
//   faded, gray and dotted).
// - An arrow that would touch land, a pier, a dock or the breakwater is left out.

import type { CurrentField, CurrentSnapshot } from '../../domain/currentField'
import { COVE_WATER, HARBOR_WATER, insideArea } from '../../domain/coveCurrent'
import { BREAKWATERS, DOCKS, LAND, PIERS } from './coveShapes'
import { project, toMapVector } from './projection'
import type { MapPoint } from './projection'
import { MIN_ARROW_SPEED_KT } from './speedBands'

/** Arrow length, in map units (about meters); every model arrow on the COVE map is this long. */
export const COVE_ARROW_LENGTH = 70
/** How close (map units) an arrow may come to a dock or the breakwater (both drawn as lines). */
const LINE_CLEARANCE = 8
/** Points along an arrow that are checked against land and piers. */
const CHECKS_ALONG_ARROW = 10

/** The part of the map the COVE view shows, with a margin so arrows at the edge still show. */
const VIEW = { left: 250, right: 1350, top: -50, bottom: 770 }

export type CoveArrow = {
  x: number // center, map units
  y: number
  ux: number // direction, a unit vector in map units
  uy: number
  speedKt: number
  sheltered: boolean // in the cove or the harbor: an eddy
}

type ModelSpot = { index: number; at: MapPoint; sheltered: boolean }

// ------------------------------------------------------------------ Shapes

/** A path string made of M, L and Z (as build.py writes them) → its lists of points. */
function parsePath(d: string): MapPoint[][] {
  const lines: MapPoint[][] = []
  for (const part of d.split('M')) {
    if (part.trim() === '') continue
    const points: MapPoint[] = []
    for (const pair of part.replace('Z', '').split('L')) {
      const [x, y] = pair.split(',').map(Number)
      points.push({ x, y })
    }
    lines.push(points)
  }
  return lines
}

/**
 * Is (x, y) inside the ring? Ray casting: follow a line from the point to the right and
 * count how many edges it crosses; an odd count means inside. An edge from a to b
 * crosses that line where
 *   crossing x = a.x + (y − a.y) × (b.x − a.x) / (b.y − a.y)
 */
function insideRing(p: MapPoint, ring: MapPoint[]): boolean {
  let inside = false
  let previous = ring[ring.length - 1]
  for (const point of ring) {
    const spansY = point.y > p.y !== previous.y > p.y
    if (spansY) {
      const crossingX = point.x + ((p.y - point.y) * (previous.x - point.x)) / (previous.y - point.y)
      if (p.x < crossingX) inside = !inside
    }
    previous = point
  }
  return inside
}

/**
 * Distance from p to the segment a–b: the nearest point on the segment is at
 *   t = ((p − a) · (b − a)) / |b − a|²,  kept between 0 and 1
 */
function distanceToSegment(p: MapPoint, a: MapPoint, b: MapPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  let t = 0
  if (lengthSquared > 0) t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

let solidRings: MapPoint[][] | null = null
let thinLines: MapPoint[][] | null = null

/** True if p is on land or a pier, or within LINE_CLEARANCE of a dock or the breakwater. */
function blocked(p: MapPoint): boolean {
  if (solidRings === null) solidRings = [...parsePath(LAND), ...parsePath(PIERS)]
  if (thinLines === null) thinLines = [...parsePath(DOCKS), ...parsePath(BREAKWATERS)]
  for (const ring of solidRings) {
    if (insideRing(p, ring)) return true
  }
  for (const line of thinLines) {
    for (let i = 0; i < line.length - 1; i++) {
      if (distanceToSegment(p, line[i], line[i + 1]) < LINE_CLEARANCE) return true
    }
  }
  return false
}

/**
 * Does the arrow centered on `at` along (ux, uy) stay clear? Checked at points spread
 * along it:  point = center + (k / CHECKS_ALONG_ARROW − ½) × length × direction
 */
function arrowIsClear(at: MapPoint, ux: number, uy: number): boolean {
  for (let k = 0; k <= CHECKS_ALONG_ARROW; k++) {
    const along = (k / CHECKS_ALONG_ARROW - 0.5) * COVE_ARROW_LENGTH
    if (blocked({ x: at.x + ux * along, y: at.y + uy * along })) return false
  }
  return true
}

// ------------------------------------------------------------------ Spots and arrows

const spotsByPoints = new WeakMap<CurrentField['points'], ModelSpot[]>()

/** The model points on the COVE map, placed on it and marked sheltered or not; worked out once per mesh. */
function coveSpots(points: CurrentField['points']): ModelSpot[] {
  const cached = spotsByPoints.get(points)
  if (cached !== undefined) return cached
  const spots: ModelSpot[] = []
  points.forEach((point, index) => {
    const at = project(point.lat, point.lon)
    if (at.x < VIEW.left || at.x > VIEW.right || at.y < VIEW.top || at.y > VIEW.bottom) return
    const sheltered = insideArea(point.lat, point.lon, COVE_WATER) || insideArea(point.lat, point.lon, HARBOR_WATER)
    spots.push({ index, at, sheltered })
  })
  spotsByPoints.set(points, spots)
  return spots
}

/** The COVE map's model arrows at one moment (the model's values blended to that time). */
export function coveModelArrows(points: CurrentField['points'], snapshot: CurrentSnapshot): CoveArrow[] {
  const arrows: CoveArrow[] = []
  for (const spot of coveSpots(points)) {
    const east = snapshot.east[spot.index]
    const north = snapshot.north[spot.index]
    const speedKt = Math.hypot(east, north)
    if (speedKt < MIN_ARROW_SPEED_KT) continue
    const direction = toMapVector(east / speedKt, north / speedKt)
    if (!arrowIsClear(spot.at, direction.x, direction.y)) continue
    arrows.push({ x: spot.at.x, y: spot.at.y, ux: direction.x, uy: direction.y, speedKt, sheltered: spot.sheltered })
  }
  return arrows
}
