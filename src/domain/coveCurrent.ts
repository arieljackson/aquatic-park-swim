// The current around Aquatic Park cove, from NOAA's SFBOFS model, in the same shape as
// NOAA's current predictions (CurrentData), so the tiles, the slider and the current
// chart can show it in place of the Alcatraz SW prediction.
//
// It's the average of the model's points in the open water the COVE map shows (inside
// COVE_VIEW, but not in the cove or the harbor): the same arrows a swimmer sees on the
// map, summed up. Points in the cove and the harbor aren't used: the model doesn't
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

/** The area the COVE map shows (its frame's corners; the map is turned 17°). */
export const COVE_VIEW: LatLon[] = [
  [37.81102, -122.43052], [37.81356, -122.42], [37.80758, -122.41768], [37.80504, -122.4282],
]

/**
 * The flood direction, as a compass bearing (degrees clockwise from north): the Golden
 * Gate's flood/ebb axis, the same one the maps are turned to show left/right.
 */
const FLOOD_BEARING_DEG = 73

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

type Weight = { index: number; weight: number }

/**
 * Which of the model's points make up the cove's current: those in COVE_VIEW and not in
 * the cove or the harbor, all counting the same:
 *   weight = 1 / number of points
 */
export function viewWeights(points: CurrentField['points']): Weight[] {
  const chosen: number[] = []
  points.forEach((point, index) => {
    if (!insideArea(point.lat, point.lon, COVE_VIEW)) return
    if (insideArea(point.lat, point.lon, COVE_WATER)) return
    if (insideArea(point.lat, point.lon, HARBOR_WATER)) return
    chosen.push(index)
  })
  return chosen.map((index) => ({ index, weight: 1 / chosen.length }))
}

/**
 * The average current from one moment's values, east and north in knots, averaged as
 * vectors so direction and speed come together:
 *   value = Σ weight × value   (each part on its own)
 * Null if there are no points.
 */
export function averageVector(values: CurrentSnapshot, weights: Weight[]): { east: number; north: number } | null {
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

/** Smooth samples are filled in this often between the model's hours, like NOAA's predictions. */
const SAMPLE_STEP_MS = 6 * 60 * 1000

/**
 * The cove's current over the field's hours, every 6 minutes, with its slacks and peaks,
 * as CurrentData. Null if the field has no hours or no model point in the view.
 *
 * The model gives one value per hour; between hours the samples follow a smooth curve
 * through them (see smoothBetween), as tidal currents rise and fall smoothly. Slacks are
 * where the samples cross zero (a straight line between the two 6-minute samples around
 * it), and each peak is the largest sample of its flood or ebb (see eventsFrom).
 */
export function coveCurrentData(field: CurrentField): CurrentData | null {
  const weights = viewWeights(field.points)
  if (weights.length === 0 || field.hours.length < 2) return null

  const hourly: CurrentSample[] = []
  for (const hour of field.hours) {
    const vector = averageVector(hour, weights)
    if (vector === null) continue
    hourly.push({ time: hour.time, velocityKt: alongAxis(vector.east, vector.north) })
  }

  const samples = smoothSamples(hourly)
  return { station: { id: 'SFBOFS', name: 'NOAA SFBOFS, around Aquatic Park cove' }, samples, events: eventsFrom(samples) }
}

/**
 * Hourly samples → samples every SAMPLE_STEP_MS along a smooth curve through them. Hours
 * further apart than 1½ hours (a gap in the model's files) aren't joined: the curve
 * stops at the gap and starts again after it.
 */
function smoothSamples(hourly: CurrentSample[]): CurrentSample[] {
  const samples: CurrentSample[] = []
  for (let i = 0; i < hourly.length; i++) {
    samples.push(hourly[i])
    if (i + 1 >= hourly.length) break
    const t1 = hourly[i].time.getTime()
    const t2 = hourly[i + 1].time.getTime()
    if (t2 - t1 > HOUR_MS * 1.5) continue
    // The neighbors on either side; at an end (or next to a gap), the end value itself.
    let before = hourly[i]
    if (i > 0 && t1 - hourly[i - 1].time.getTime() <= HOUR_MS * 1.5) before = hourly[i - 1]
    let after = hourly[i + 1]
    if (i + 2 < hourly.length && hourly[i + 2].time.getTime() - t2 <= HOUR_MS * 1.5) after = hourly[i + 2]
    for (let t = t1 + SAMPLE_STEP_MS; t < t2; t += SAMPLE_STEP_MS) {
      const fraction = (t - t1) / (t2 - t1)
      const velocityKt = smoothBetween(before.velocityKt, hourly[i].velocityKt, hourly[i + 1].velocityKt, after.velocityKt, fraction)
      samples.push({ time: new Date(t), velocityKt })
    }
  }
  return samples
}

/**
 * A value between v1 and v2 on a smooth curve through four hourly values in a row
 * (v0, v1, v2, v3), at `f` of the way from v1 to v2 (a Catmull-Rom spline). The curve
 * passes through v1 and v2, and its slope at each is set by the values on either side:
 *   value = ½ × (2·v1 + (−v0 + v2)·f + (2·v0 − 5·v1 + 4·v2 − v3)·f² + (−v0 + 3·v1 − 3·v2 + v3)·f³)
 * Tested on NOAA's 6-minute predictions (keeping only the hours): about 4× closer to them
 * than straight lines between hours.
 */
function smoothBetween(v0: number, v1: number, v2: number, v3: number, f: number): number {
  const a = 2 * v1
  const b = (-v0 + v2) * f
  const c = (2 * v0 - 5 * v1 + 4 * v2 - v3) * f * f
  const d = (-v0 + 3 * v1 - 3 * v2 + v3) * f * f * f
  return 0.5 * (a + b + c + d)
}

/**
 * Slacks and peaks from the samples. A slack is where the velocity changes sign, between
 * two samples v₀ and v₁ (a straight line between them):
 *   slack time = time before + (time after − time before) × v₀ / (v₀ − v₁)
 * Between two slacks the water runs one way (a flood or an ebb); its peak is the largest
 * sample there. A run at the very start or end of the data, whose largest sample is its
 * first or last, gets no peak (the real peak may be outside the data).
 */
function eventsFrom(samples: CurrentSample[]): CurrentEvent[] {
  const events: CurrentEvent[] = []
  let runStart = 0
  for (let i = 0; i < samples.length - 1; i++) {
    const v0 = samples[i].velocityKt
    const v1 = samples[i + 1].velocityKt
    // Samples further apart than one step (a gap in the model's files) aren't joined.
    const gap = samples[i + 1].time.getTime() - samples[i].time.getTime() > HOUR_MS * 1.5
    if (gap) {
      runStart = i + 1
      continue
    }
    const crosses = v0 > 0 !== v1 > 0 && v0 !== v1
    if (!crosses) continue
    const peak = peakIn(samples, runStart, i)
    if (peak !== null) events.push(peak)
    const t0 = samples[i].time.getTime()
    const t1 = samples[i + 1].time.getTime()
    const slackMs = t0 + ((t1 - t0) * v0) / (v0 - v1)
    events.push({ time: new Date(slackMs), kind: 'slack', speedKt: 0 })
    runStart = i + 1
  }
  const lastPeak = peakIn(samples, runStart, samples.length - 1)
  if (lastPeak !== null) events.push(lastPeak)
  return events
}

/** The largest sample in samples[from..to] as a max flood or max ebb; null if it's at either end. */
function peakIn(samples: CurrentSample[], from: number, to: number): CurrentEvent | null {
  let best = from
  for (let i = from; i <= to; i++) {
    if (Math.abs(samples[i].velocityKt) > Math.abs(samples[best].velocityKt)) best = i
  }
  if (best === from || best === to) return null
  let kind: CurrentEvent['kind'] = 'maxEbb'
  if (samples[best].velocityKt > 0) kind = 'maxFlood'
  return { time: samples[best].time, kind, speedKt: Math.abs(samples[best].velocityKt) }
}

/** Does the data cover every moment from `start` to `end`? */
export function coversRange(data: CurrentData, start: Date, end: Date): boolean {
  if (data.samples.length === 0) return false
  const first = data.samples[0].time.getTime()
  const last = data.samples[data.samples.length - 1].time.getTime()
  return first <= start.getTime() && last >= end.getTime()
}
