// Latitude/longitude → map units, the same projection scripts/wide-map/build.py (and
// scripts/cove-map/build.py) use for the basemaps, so the SFBOFS model's points land in the
// right place on them.

import { MAP_CENTER, MAP_HEIGHT, MAP_ROTATION_DEG, MAP_SCALE, MAP_WIDTH } from './wideShapes'

const ANGLE = (MAP_ROTATION_DEG * Math.PI) / 180
const COS = Math.cos(ANGLE)
const SIN = Math.sin(ANGLE)

/** cos(latitude) corrects for longitude lines being closer together away from the equator. */
const LON_FACTOR = Math.cos((MAP_CENTER.lat * Math.PI) / 180)

export type MapPoint = { x: number; y: number }

/**
 * 1. Flat projection around the center (the earth is flat enough at this scale):
 *      x = (lon − center lon) × cos(center lat) × scale
 *      y = (center lat − lat) × scale            (y grows downward)
 * 2. Rotate clockwise by the map's rotation:
 *      x' = x × cos(angle) − y × sin(angle)
 *      y' = x × sin(angle) + y × cos(angle)
 * 3. Move the center to the middle of the 1600 × 720 frame.
 */
export function project(lat: number, lon: number): MapPoint {
  const x = (lon - MAP_CENTER.lon) * LON_FACTOR * MAP_SCALE
  const y = (MAP_CENTER.lat - lat) * MAP_SCALE
  return {
    x: x * COS - y * SIN + MAP_WIDTH / 2,
    y: x * SIN + y * COS + MAP_HEIGHT / 2,
  }
}

/**
 * A current (east and north parts) as a direction on the map: east is +x, north is −y
 * (y grows downward), then the same clockwise rotation as the map.
 */
export function toMapVector(east: number, north: number): MapPoint {
  const x = east
  const y = -north
  return { x: x * COS - y * SIN, y: x * SIN + y * COS }
}
