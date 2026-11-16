// The current at Aquatic Park cove's mouth, from NOAA's SFBOFS model, in the same shape
// as NOAA's current predictions (CurrentData), so the tiles, the slider and the current
// chart can show it in place of the Alcatraz SW prediction.
//
// The mouth's current is the average of the model's points just outside the cove's
// opening (within MOUTH_REACH_M of COVE_MOUTH, and not inside the cove): the water a
// swimmer meets at the entrance. Points inside the cove aren't used: the model doesn't
// include the piers, so its values there are only a rough guide (the map draws them as
// faded eddies). See docs/decisions.md for how this compared with the stations.

import type { CurrentField, CurrentSnapshot } from './currentField'
import type { CurrentData, CurrentEvent, CurrentSample } from './types'

type LatLon = [number, number] // [latitude, longitude]

/** The cove's water, traced by hand (the map draws model arrows here as eddies). */
export const COVE_WATER: LatLon[] = [
  [37.80814, -122.42664], [37.80918, -122.42687], [37.80986, -122.4265], [37.81046, -122.4257],
  [37.81069, -122.42475], [37.81033, -122.42398], [37.81, -122.42345], [37.81021, -122.42278],
  [37.8088, -122.42109], [37.80815, -122.42135], [37.80668, -122.42424], [37.80689, -122.42616],
]

/** The harbor east of the cove, behind the Hyde Street Pier, traced by hand (also eddies on the map). */
export const HARBOR_WATER: LatLon[] = [
  [37.81, -122.42345], [37.81097, -122.4233], [37.81195, -122.42062], [37.81215, -122.41945],
  [37.80758, -122.41768], [37.80682, -122.42084], [37.8088, -122.42109], [37.81021, -122.42278],
]

/** The middle of the cove's opening, between the Municipal Pier's tip and the breakwater. */
export const COVE_MOUTH: LatLon = [37.81046, -122.4238]
/** Model points further than this from COVE_MOUTH (meters) don't count toward the mouth's current. */
const MOUTH_REACH_M = 120

/**
 * The flood direction, as a compass bearing (degrees clockwise from north): the Golden
 * Gate's flood/ebb axis, the same one the maps are turned to show left/right.
 */
const FLOOD_BEARING_DEG = 73

const METERS_PER_DEGREE_LAT = 111_000
const HOUR_MS = 60 * 60 * 1000

/**
 * Is the point inside the polygon? Ray casting: follow a line from the point toward
 * +longitude and count the edges it crosses; an odd count means inside. An edge from a
 * to b crosses it where
 *   crossing lon = a.lon + (lat − a.lat) × (b.lon − a.lon) / (b.lat − a.lat)
 */
export function insideArea(lat: number, lon: number, area: LatLon[]): boolean {
  let inside = false
  let previous = area[area.length - 1]
  for (const point of area) {
    const spansLat = point[0] > lat !== previous[0] > lat
    if (spansLat) {
      const crossingLon = point[1] + ((lat - point[0]) * (previous[1] - point[1])) / (previous[0] - point[0])
      if (lon < crossingLon) inside = !inside
    }
    previous = point
  }
  return inside
}

/**
 * Distance in meters between two nearby points, treating the earth as flat here:
 *   north = Δlat × 111,000 m,  east = Δlon × 111,000 m × cos(latitude)
 *   distance = √(north² + east²)
 */
function distanceM(a: LatLon, b: LatLon): number {
  const north = (a[0] - b[0]) * METERS_PER_DEGREE_LAT
  const east = (a[1] - b[1]) * METERS_PER_DEGREE_LAT * Math.cos((a[0] * Math.PI) / 180)
  return Math.sqrt(north * north + east * east)
}

type Weight = { index: number; weight: number }

/**
 * Which of the model's points make up the mouth's current, and how much each counts:
 * points within MOUTH_REACH_M of COVE_MOUTH and not inside the cove, closer ones counting
 * more (inverse-distance weighting):
 *   weight = 1 / (distance² + 25)       (the 25 keeps a point right at the mouth from dominating)
 * then divided by their sum so the weights add up to 1.
 */
export function mouthWeights(points: CurrentField['points']): Weight[] {
  const raw: Weight[] = []
  points.forEach((point, index) => {
    if (insideArea(point.lat, point.lon, COVE_WATER)) return
    const distance = distanceM([point.lat, point.lon], COVE_MOUTH)
    if (distance > MOUTH_REACH_M) return
    raw.push({ index, weight: 1 / (distance * distance + 25) })
  })
  let total = 0
  for (const w of raw) total += w.weight
  return raw.map((w) => ({ index: w.index, weight: w.weight / total }))
}

/**
 * The mouth's current from one moment's values, east and north in knots:
 *   value = Σ weight × value   (each part on its own)
 * Null if no model point is near the mouth.
 */
export function mouthVector(values: CurrentSnapshot, weights: Weight[]): { east: number; north: number } | null {
  if (weights.length === 0) return null
  let east = 0
  let north = 0
  for (const w of weights) {
    east += w.weight * values.east[w.index]
    north += w.weight * values.north[w.index]
  }
  return { east, north }
}

/**
 * Signed speed along the flood/ebb axis (+ flood, − ebb), like NOAA's predictions: the
 * part of the current in the flood direction,
 *   velocity = east × sin(bearing) + north × cos(bearing)
 */
export function alongAxis(east: number, north: number): number {
  const bearing = (FLOOD_BEARING_DEG * Math.PI) / 180
  return east * Math.sin(bearing) + north * Math.cos(bearing)
}

/**
 * The mouth's current for every hour of the field, with its slacks and peaks, as
 * CurrentData. Null if the field has no hours or no model point near the mouth.
 *
 * The model gives one value per hour, so between hours we draw straight lines (as
 * conditionsAt does for any samples). Slacks are where that line crosses zero:
 *   slack time = time before + (time after − time before) × v₀ / (v₀ − v₁)
 * Each peak is the top of a parabola through the largest hourly value and its two
 * neighbors, which lands between hours (see peakBetween).
 */
export function coveCurrentData(field: CurrentField): CurrentData | null {
  const weights = mouthWeights(field.points)
  if (weights.length === 0 || field.hours.length < 2) return null

  const samples: CurrentSample[] = []
  for (const hour of field.hours) {
    const vector = mouthVector(hour, weights)
    if (vector === null) continue
    samples.push({ time: hour.time, velocityKt: alongAxis(vector.east, vector.north) })
  }

  const events: CurrentEvent[] = []
  // A run is the samples between two slacks: all flood or all ebb.
  let runStart = 0
  for (let i = 0; i < samples.length - 1; i++) {
    const v0 = samples[i].velocityKt
    const v1 = samples[i + 1].velocityKt
    const crosses = v0 > 0 !== v1 > 0 && v0 !== v1
    // Hours further apart than one (a gap in the model's files) aren't joined.
    const gap = samples[i + 1].time.getTime() - samples[i].time.getTime() > HOUR_MS * 1.5
    if (gap) {
      runStart = i + 1
      continue
    }
    if (!crosses) continue
    const peak = peakBetween(samples, runStart, i)
    if (peak !== null) events.push(peak)
    const t0 = samples[i].time.getTime()
    const t1 = samples[i + 1].time.getTime()
    const slackMs = t0 + ((t1 - t0) * v0) / (v0 - v1)
    events.push({ time: new Date(slackMs), kind: 'slack', speedKt: 0 })
    runStart = i + 1
  }
  const lastPeak = peakBetween(samples, runStart, samples.length - 1)
  if (lastPeak !== null) events.push(lastPeak)

  return { station: { id: 'SFBOFS', name: 'NOAA SFBOFS, Aquatic Park cove mouth' }, samples, events }
}

/**
 * The max flood or max ebb among samples[from..to] (one run, all the same sign), or null
 * if the run is too short to have a peak inside it (fewer than 3 samples, or the largest
 * value at either end, where the peak may be outside the data).
 *
 * The peak time comes from a parabola through the largest value (v₀ at t₀) and its
 * neighbors (v₋ an hour before, v₊ an hour after); its top is
 *   shift = (v₋ − v₊) / (2 × (v₋ − 2·v₀ + v₊))      (in hours, between −½ and +½)
 *   time  = t₀ + shift hours,   speed = v₀ − (v₋ − v₊) × shift / 4
 */
function peakBetween(samples: CurrentSample[], from: number, to: number): CurrentEvent | null {
  if (to - from < 2) return null
  let best = from
  for (let i = from; i <= to; i++) {
    if (Math.abs(samples[i].velocityKt) > Math.abs(samples[best].velocityKt)) best = i
  }
  if (best === from || best === to) return null
  const before = Math.abs(samples[best - 1].velocityKt)
  const top = Math.abs(samples[best].velocityKt)
  const after = Math.abs(samples[best + 1].velocityKt)
  const curvature = before - 2 * top + after
  let shift = 0
  if (curvature !== 0) shift = (before - after) / (2 * curvature)
  shift = Math.max(-0.5, Math.min(0.5, shift))
  const speedKt = top - ((before - after) * shift) / 4
  const time = new Date(samples[best].time.getTime() + shift * HOUR_MS)
  let kind: CurrentEvent['kind'] = 'maxEbb'
  if (samples[best].velocityKt > 0) kind = 'maxFlood'
  return { time, kind, speedKt }
}

/** Does the data cover every moment from `start` to `end`? */
export function coversRange(data: CurrentData, start: Date, end: Date): boolean {
  if (data.samples.length === 0) return false
  const first = data.samples[0].time.getTime()
  const last = data.samples[data.samples.length - 1].time.getTime()
  return first <= start.getTime() && last >= end.getTime()
}
