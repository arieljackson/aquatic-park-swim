// The BAY map: the bay from the Golden Gate Bridge to Pier 41, past Alcatraz, with
// NOAA's SFBOFS model surface current at the selected time, blended between its
// hourly values. One fixed view, no zooming; the COVE view is CurrentMap.tsx.
//
// The map is rotated 17° like the cove map, so the Golden Gate's flood/ebb axis is
// horizontal. Arrows (wideArrows.ts for where) are all the same size; their color is the
// speed, in NOAA's seven speed bands (speedBands.ts). The three NOAA stations the tiles
// use are marked by name.

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { CurrentField, CurrentSnapshot } from '../../domain/currentField'
import { currentFieldAt } from '../../domain/currentField'
import { useElementWidth } from '../charts/useElementWidth'
import { SOURCE_PAGES } from '../sourcePages'
import { project, toMapVector } from './projection'
import { MIN_ARROW_SPEED_KT, arrowPath, bandColor } from './speedBands'
import { SpeedStrip } from './SpeedStrip'
import { wideSpots } from './wideArrows'
import type { WideSpot } from './wideArrows'
import { BEACH, BREAKWATERS, BRIDGE, BRIDGE_TOWERS, LAND, MAP_ROTATION_DEG, PARKS, PIERS, WIDE_VIEW } from './wideShapes'
import './map.css'

// Arrows, in map units (about meters): a line with an open V head, centered on its spot.
const ARROW_LENGTH = 210
const ARROW_WIDTH = 18
/** The head's strokes go this far back from the tip, and 0.6 × this far to each side. */
const HEAD_SIZE = 75

/** `labelLeft`: the name goes to the left of the ring (Pier 41 is near the map's right edge). */
type Station = { name: string; at: { x: number; y: number }; labelLeft: boolean }

/** NOAA's positions for the stations the tiles use. */
const STATIONS: Station[] = [
  { name: 'SW Alcatraz', at: project(37.81425, -122.432), labelLeft: false },
  { name: 'Pier 41', at: project(37.81, -122.413), labelLeft: true },
  { name: 'Golden Gate', at: project(37.806305, -122.46589), labelLeft: false },
]

/** Place names, in small capitals. */
const PLACES = [
  { text: 'ALCATRAZ', at: project(37.8278, -122.4225) },
  { text: 'CRISSY FIELD', at: project(37.8025, -122.4605) },
  { text: 'MARINA', at: project(37.8035, -122.4405) },
  { text: 'FORT MASON', at: project(37.8048, -122.431) },
  // Just south of the cove, a little below Fort Mason's label so the two don't crowd.
  { text: 'AQUATIC PARK', at: project(37.8047, -122.4212) },
  { text: 'MARIN HEADLANDS', at: project(37.8345, -122.4865) },
]

type Props = {
  field: CurrentField | null // the SFBOFS model's current; null while loading or if it failed
  time: Date
  controls: ReactNode // the COVE / BAY buttons, drawn over the map
}

export function WideMap({ field, time, controls }: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  // How many map units one screen pixel covers, so labels keep a fixed pixel size:
  //   units = view width / pixels
  const unitsPerPixel = width > 0 ? WIDE_VIEW.width / width : 10

  const mesh = useMemo(() => {
    if (field === null) return []
    return field.points.map((point) => project(point.lat, point.lon))
  }, [field])

  const timeMs = time.getTime()
  const snapshot = useMemo(() => {
    if (field === null) return null
    return currentFieldAt(field, new Date(timeMs))
  }, [field, timeMs])

  // The arrows only change with the data and the time.
  const arrows = useMemo(() => {
    if (snapshot === null) return null
    return <Arrows spots={wideSpots(mesh)} snapshot={snapshot} />
  }, [mesh, snapshot])

  return (
    <div className="map" ref={ref}>
      <svg
        className="map__svg"
        viewBox={`${WIDE_VIEW.x} ${WIDE_VIEW.y} ${WIDE_VIEW.width} ${WIDE_VIEW.height}`}
        role="img"
        aria-label="Map of the bay from the Golden Gate Bridge to Pier 41 and Alcatraz, with arrows colored by the speed of the current from NOAA’s SFBOFS model"
      >
        <rect x={WIDE_VIEW.x} y={WIDE_VIEW.y} width={WIDE_VIEW.width} height={WIDE_VIEW.height} className="map__water" />
        <path d={LAND} className="map__land" />
        <path d={PARKS} className="map__park" />
        <path d={BEACH} className="map__beach" />
        <path d={PIERS} className="map__pier" />
        <path d={BREAKWATERS} className="map__breakwater" />
        {/* The bridge deck is about 27 m wide; at least 2.5 px so it shows. */}
        <path d={BRIDGE} className="map__bridge" strokeWidth={Math.max(27, 2.5 * unitsPerPixel)} />
        {BRIDGE_TOWERS.map((tower) => {
          const size = Math.max(40, 5 * unitsPerPixel)
          return (
            <rect key={tower.x} x={tower.x - size / 2} y={tower.y - size / 2} width={size} height={size} className="map__tower" />
          )
        })}

        {arrows}

        {width > 0 && (
          <g>
            {PLACES.map((place) => (
              <text
                key={place.text}
                x={place.at.x}
                y={place.at.y}
                textAnchor="middle"
                className="map__label map__label--place"
                fontSize={10 * unitsPerPixel}
                strokeWidth={3 * unitsPerPixel}
                letterSpacing={1.2 * unitsPerPixel}
              >
                {place.text}
              </text>
            ))}
            {STATIONS.map((station) => (
              <g key={station.name}>
                <circle
                  cx={station.at.x}
                  cy={station.at.y}
                  r={5 * unitsPerPixel}
                  className="map__station"
                  strokeWidth={2 * unitsPerPixel}
                />
                <text
                  x={station.labelLeft ? station.at.x - 8 * unitsPerPixel : station.at.x + 8 * unitsPerPixel}
                  y={station.at.y - 8 * unitsPerPixel}
                  textAnchor={station.labelLeft ? 'end' : 'start'}
                  className="map__label"
                  fontSize={11 * unitsPerPixel}
                  strokeWidth={3 * unitsPerPixel}
                >
                  {station.name}
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>

      {controls}
      <NorthArrow />
      <SpeedKey field={field} snapshot={snapshot} />
      {/* OpenStreetMap's license asks for this credit wherever the map is shown. */}
      <p className="map__credit">© OpenStreetMap contributors</p>
    </div>
  )
}

/** One arrow per spot, colored by speed. */
function Arrows({ spots, snapshot }: { spots: WideSpot[]; snapshot: CurrentSnapshot }) {
  return (
    <g className="map__wide-arrows" strokeWidth={ARROW_WIDTH}>
      {spots.map((spot) => {
        // Weighted average of the nearby mesh points:  value = Σ weight × value
        let east = 0
        let north = 0
        for (let i = 0; i < spot.neighbors.length; i++) {
          east += spot.weights[i] * snapshot.east[spot.neighbors[i]]
          north += spot.weights[i] * snapshot.north[spot.neighbors[i]]
        }
        const speed = Math.hypot(east, north)
        if (speed < MIN_ARROW_SPEED_KT) return null
        const direction = toMapVector(east / speed, north / speed)
        return (
          <path
            key={`${spot.x},${spot.y}`}
            d={arrowPath(spot.x, spot.y, direction.x, direction.y, ARROW_LENGTH, HEAD_SIZE)}
            stroke={bandColor(speed)}
          />
        )
      })}
    </g>
  )
}

/**
 * The key over the map, bottom left, like the cove map's: the speed bands' color strip,
 * then a link to the model's own maps that also says whether the hour shown is a
 * forecast (or loading, or missing).
 */
function SpeedKey({ field, snapshot }: { field: CurrentField | null; snapshot: CurrentSnapshot | null }) {
  let source = 'SFBOFS'
  if (field === null) source = 'Loading SFBOFS…'
  else if (snapshot === null) source = 'No SFBOFS data for this time'
  else if (snapshot.kind === 'forecast') source = 'SFBOFS forecast'
  return (
    <div className="map__key mono">
      <span>Current speed (kt)</span>
      <SpeedStrip />
      <a className={field === null ? 'map__key-source is-loading' : 'map__key-source'} href={SOURCE_PAGES.sfbofsCurrents}>
        {source} →
      </a>
    </div>
  )
}

/** North is MAP_ROTATION_DEG to the right of up, because the map is turned clockwise. */
function NorthArrow() {
  return (
    <div className="map__north">
      <svg width={20} height={20} viewBox="0 0 20 20" role="img" aria-label={`North, ${MAP_ROTATION_DEG}° right of up`}>
        <g transform={`rotate(${MAP_ROTATION_DEG} 10 10)`}>
          <path d="M10 2 L14 15 L10 12 L6 15 Z" fill="currentColor" />
        </g>
      </svg>
    </div>
  )
}
