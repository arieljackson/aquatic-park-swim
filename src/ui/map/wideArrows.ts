// Where the BAY map's arrows go, and which of the SFBOFS model's points each one shows.
//
// One even triangular grid (each row shifted half a step) over the BAY view (WIDE_VIEW), SPACING
// map units (about meters) apart, fixed to the map. A spot is skipped if it's on land or
// a pier, or has no model point near it. Each spot's current is a weighted average of the
// model's nearby points: the weights are worked out once per mesh here, and applied to
// each moment's values when drawing.

import type { MapPoint } from './projection'
import { LAND, PIERS, WIDE_VIEW } from './wideShapes'

/** Distance between neighboring arrows, in map units (about meters). */
const SPACING = 300
/** Model points further than this from a spot (map units) don't count toward it. */
const REACH = 170

export type WideSpot = {
  x: number
  y: number
  neighbors: number[] // indexes into the mesh points
  weights: number[] // the same order; they add up to 1
}

// ------------------------------------------------------------------ Land

type Ring = { points: MapPoint[]; left: number; top: number; right: number; bottom: number }

/** A path string made of M, L and Z (as build.py writes them) → its rings, with bounding boxes. */
function parseRings(d: string): Ring[] {
  const rings: Ring[] = []
  for (const part of d.split('M')) {
    if (part.trim() === '') continue
    const points: MapPoint[] = []
    for (const pair of part.replace('Z', '').split('L')) {
      const [x, y] = pair.split(',').map(Number)
      points.push({ x, y })
    }
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    for (const p of points) {
      left = Math.min(left, p.x)
      right = Math.max(right, p.x)
      top = Math.min(top, p.y)
      bottom = Math.max(bottom, p.y)
    }
    rings.push({ points, left, top, right, bottom })
  }
  return rings
}

/**
 * Is (x, y) inside the ring? Ray casting: follow a line from the point to the right and
 * count how many edges it crosses; an odd count means inside. An edge from a to b
 * crosses that line where
 *   crossing x = a.x + (y − a.y) × (b.x − a.x) / (b.y − a.y)
 */
function insideRing(x: number, y: number, ring: Ring): boolean {
  if (x < ring.left || x > ring.right || y < ring.top || y > ring.bottom) return false
  const points = ring.points
  let inside = false
  let previous = points[points.length - 1]
  for (const point of points) {
    const spansY = point.y > y !== previous.y > y
    if (spansY) {
      const crossingX = point.x + ((y - point.y) * (previous.x - point.x)) / (previous.y - point.y)
      if (x < crossingX) inside = !inside
    }
    previous = point
  }
  return inside
}

// ------------------------------------------------------------------ Grid

let waterSpots: MapPoint[] | null = null

/**
 * Every grid point over water in the BAY view, worked out the first time it's needed.
 * Rows are √3/2 of the spacing apart; odd rows are shifted half a step:
 *   x = left + (column + ½ on odd rows) × SPACING,  y = top + (row + ½) × SPACING × √3/2
 */
function gridOverWater(): MapPoint[] {
  if (waterSpots !== null) return waterSpots
  const solid = [...parseRings(LAND), ...parseRings(PIERS)]
  const rowStep = (SPACING * Math.sqrt(3)) / 2
  const found: MapPoint[] = []
  for (let row = 0; (row + 0.5) * rowStep < WIDE_VIEW.height; row++) {
    const y = WIDE_VIEW.y + (row + 0.5) * rowStep
    let shift = 0.25
    if (row % 2 === 1) shift = 0.75
    for (let column = 0; (column + shift) * SPACING < WIDE_VIEW.width; column++) {
      const x = WIDE_VIEW.x + (column + shift) * SPACING
      let onSolid = false
      for (const ring of solid) {
        if (insideRing(x, y, ring)) {
          onSolid = true
          break
        }
      }
      if (!onSolid) found.push({ x, y })
    }
  }
  waterSpots = found
  return found
}

// ------------------------------------------------------------------ Model weights

/** Mesh points sorted into square buckets BUCKET map units wide, so nearby ones are quick to find. */
const BUCKET = 200

/**
 * Which mesh points count toward a spot, and how much: inverse-distance weighting, so
 * closer points count more:
 *   weight = 1 / (distance² + 25)       (the 25 keeps a point right on the spot from dominating)
 * then divided by their sum so the weights add up to 1.
 */
function meshWeights(x: number, y: number, mesh: MapPoint[], buckets: Map<string, number[]>) {
  const neighbors: number[] = []
  const raw: number[] = []
  const column = Math.floor(x / BUCKET)
  const row = Math.floor(y / BUCKET)
  for (let c = column - 1; c <= column + 1; c++) {
    for (let r = row - 1; r <= row + 1; r++) {
      const list = buckets.get(`${c},${r}`)
      if (list === undefined) continue
      for (const i of list) {
        const dx = mesh[i].x - x
        const dy = mesh[i].y - y
        const distanceSquared = dx * dx + dy * dy
        if (distanceSquared > REACH * REACH) continue
        neighbors.push(i)
        raw.push(1 / (distanceSquared + 25))
      }
    }
  }
  let total = 0
  for (const w of raw) total += w
  const weights = raw.map((w) => w / total)
  return { neighbors, weights }
}

const spotsByMesh = new WeakMap<MapPoint[], WideSpot[]>()

/** The BAY map's arrow spots for this mesh (the model's points in map units), worked out once per mesh. */
export function wideSpots(mesh: MapPoint[]): WideSpot[] {
  const cached = spotsByMesh.get(mesh)
  if (cached !== undefined) return cached
  const buckets = new Map<string, number[]>()
  mesh.forEach((point, index) => {
    const key = `${Math.floor(point.x / BUCKET)},${Math.floor(point.y / BUCKET)}`
    const list = buckets.get(key)
    if (list === undefined) buckets.set(key, [index])
    else list.push(index)
  })
  const spots: WideSpot[] = []
  for (const { x, y } of gridOverWater()) {
    const { neighbors, weights } = meshWeights(x, y, mesh, buckets)
    if (neighbors.length > 0) spots.push({ x, y, neighbors, weights })
  }
  spotsByMesh.set(mesh, spots)
  return spots
}
