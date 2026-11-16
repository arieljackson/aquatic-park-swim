// The bay model's surface current around the cove: one value per mesh point per hour
// (from /api/currents, NOAA's SFBOFS model), and the current at any moment in between.

export type CurrentFieldHour = {
  time: Date
  kind: 'nowcast' | 'forecast' // the model's estimate of the past, or its forecast
  east: number[] // knots toward east at each point (negative = toward west)
  north: number[] // knots toward north at each point
}

export type CurrentField = {
  points: Array<{ lat: number; lon: number }> // the mesh points (centers of the model's triangles)
  hours: CurrentFieldHour[] // in time order
}

/** The current at every point at one moment. */
export type CurrentSnapshot = {
  east: number[]
  north: number[]
  kind: 'nowcast' | 'forecast' // forecast if either hour it's blended from is
}

/** Hours further apart than this (a gap in the model's files) aren't blended across. */
const MAX_GAP_MS = 3 * 60 * 60 * 1000

/**
 * The current at `time`, blended between the hours before and after it, or null if the
 * field doesn't cover `time`. Each part (east, north) is blended on its own:
 *   value = before + (after − before) × share,   share = (time − before's time) / (after's time − before's time)
 */
export function currentFieldAt(field: CurrentField, time: Date): CurrentSnapshot | null {
  const t = time.getTime()
  for (let i = 0; i < field.hours.length - 1; i++) {
    const before = field.hours[i]
    const after = field.hours[i + 1]
    const startMs = before.time.getTime()
    const endMs = after.time.getTime()
    if (t < startMs || t > endMs) continue
    if (endMs - startMs > MAX_GAP_MS) return null
    const share = (t - startMs) / (endMs - startMs)
    const east: number[] = []
    const north: number[] = []
    for (let p = 0; p < field.points.length; p++) {
      east.push(before.east[p] + (after.east[p] - before.east[p]) * share)
      north.push(before.north[p] + (after.north[p] - before.north[p]) * share)
    }
    let kind: CurrentSnapshot['kind'] = 'nowcast'
    if (before.kind === 'forecast' || after.kind === 'forecast') kind = 'forecast'
    return { east, north, kind }
  }
  return null
}
