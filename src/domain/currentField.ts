// The SFBOFS model's surface current around the cove: one value per mesh point per hour
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
 * The flood direction, as a compass bearing (degrees clockwise from north): the Golden
 * Gate's flood/ebb axis, the same one the maps are turned to show left/right.
 */
export const FLOOD_BEARING_DEG = 73

/**
 * The current at `time`, blended between the hours before and after it, or null if the
 * field doesn't cover `time`.
 *
 * Each point's current is split into its part along the flood/ebb axis (+ flood) and its
 * part across it (+ to the left of the flood), and its tilt: how far it points off the
 * axis, measured from the way it's going along the axis (between −90° and 90°):
 *   along = east × sin(bearing) + north × cos(bearing)
 *   across = −east × cos(bearing) + north × sin(bearing)
 *   tilt = atan2(across × sign(along), |along|)
 * Between the hours, blending along and across, each in a straight line
 * (value = before + (after − before) × share), gives the speed and which way along the
 * axis it runs; the tilt is blended the same way, so the direction stays between the
 * hours' own tilts:
 *   speed = √(along² + across²),   sign = the sign of the blended along
 *   along = sign × speed × cos(tilt),   across = sign × speed × sin(tilt)
 * Blending east and north directly would make arrows point across the axis while the
 * water turns (the along parts cancel half way), a direction neither hour gave.
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
    const bearing = (FLOOD_BEARING_DEG * Math.PI) / 180
    const axisEast = Math.sin(bearing)
    const axisNorth = Math.cos(bearing)
    const east: number[] = []
    const north: number[] = []
    for (let p = 0; p < field.points.length; p++) {
      const alongBefore = before.east[p] * axisEast + before.north[p] * axisNorth
      const acrossBefore = -before.east[p] * axisNorth + before.north[p] * axisEast
      const alongAfter = after.east[p] * axisEast + after.north[p] * axisNorth
      const acrossAfter = -after.east[p] * axisNorth + after.north[p] * axisEast
      const along = alongBefore + (alongAfter - alongBefore) * share
      const across = acrossBefore + (acrossAfter - acrossBefore) * share
      const speed = Math.sqrt(along * along + across * across)
      const tilt = tiltOf(alongBefore, acrossBefore) + (tiltOf(alongAfter, acrossAfter) - tiltOf(alongBefore, acrossBefore)) * share
      let sign = 1
      if (along < 0) sign = -1
      const newAlong = sign * speed * Math.cos(tilt)
      const newAcross = sign * speed * Math.sin(tilt)
      // Back to east/north:  east = along × sin(bearing) − across × cos(bearing),  north = along × cos(bearing) + across × sin(bearing)
      east.push(newAlong * axisEast - newAcross * axisNorth)
      north.push(newAlong * axisNorth + newAcross * axisEast)
    }
    let kind: CurrentSnapshot['kind'] = 'nowcast'
    if (before.kind === 'forecast' || after.kind === 'forecast') kind = 'forecast'
    return { east, north, kind }
  }
  return null
}

/** How far a current points off the flood/ebb axis, from the way it's going along it (radians, −π/2..π/2); see currentFieldAt. */
function tiltOf(along: number, across: number): number {
  let sign = 1
  if (along < 0) sign = -1
  return Math.atan2(across * sign, Math.abs(along))
}

/**
 * Several days' fields as one: the points (the same mesh for every day) and every hour,
 * in time order, each hour once (neighboring days overlap by an hour). Days that are
 * still loading or have no data (null, or no hours) are skipped; null if none has data.
 */
export function mergeFields(fields: Array<CurrentField | null>): CurrentField | null {
  let points: CurrentField['points'] | null = null
  const byTime = new Map<number, CurrentFieldHour>()
  for (const field of fields) {
    if (field === null || field.hours.length === 0) continue
    if (points === null) points = field.points
    for (const hour of field.hours) {
      const t = hour.time.getTime()
      if (!byTime.has(t)) byTime.set(t, hour)
    }
  }
  if (points === null) return null
  const hours = [...byTime.values()].sort((a, b) => a.time.getTime() - b.time.getTime())
  return { points, hours }
}
