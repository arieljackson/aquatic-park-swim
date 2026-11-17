// The COVE map: the cove on a dark, detailed basemap (OpenStreetMap layers from
// coveShapes.ts), with arrows for the current at the selected time. The map is rotated 17°
// so the Golden Gate's flood/ebb axis is horizontal: floods run right (into the bay),
// ebbs left (out the Golden Gate).
//
// The arrows come from the same source as the current tiles (see App.tsx), drawn the same
// way either way: solid arrows of one length, colored by speed band (speedBands.ts), even
// at slack (slow water is violet).
// - NOAA's SFBOFS model, when it covers the day (the model's values blended between its
//   hours, see currentFieldAt): one arrow per model point (coveModelArrows.ts). In the cove
//   and the harbor they're the eddies: very faded, gray and dotted. Solid
//   arrows at fixed spots in the cove show the cove's flood or ebb: the tiles' direction
//   and speed (the average of the open water in view, domain/coveCurrent.ts).
// - Otherwise NOAA's Alcatraz SW prediction, which has no direction of its own: arrows at
//   fixed spots (arrowLayout.ts, from scripts/cove-map/arrows.py), right while it runs
//   toward flood and left while it runs toward ebb, colored by its speed.
// While the current is loading (phase null), the map is drawn without arrows.

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { CurrentField } from '../../domain/currentField'
import { currentFieldAt } from '../../domain/currentField'
import { averageVector, viewWeights } from '../../domain/coveCurrent'
import type { CurrentPhase } from '../../domain/types'
import { useElementWidth } from '../charts/useElementWidth'
import { SOURCE_PAGES } from '../sourcePages'
import type { CurrentSource } from '../sourcePages'
import { COVE_STRAIGHT_ARROWS, OPEN_WATER_ARROWS } from './arrowLayout'
import { COVE_ARROW_LENGTH, coveModelArrows } from './coveModelArrows'
import type { CoveArrow } from './coveModelArrows'
import {
  BEACH,
  BREAKWATERS,
  BUILDINGS,
  CLUBS,
  DOCKS,
  LAND,
  MAP_HEIGHT,
  MAP_ROTATION_DEG,
  PARKS,
  PIERS,
  ROADS,
} from './coveShapes'
import { toMapVector } from './projection'
import { arrowParts, arrowPath, bandColor } from './speedBands'
import { SpeedStrip } from './SpeedStrip'
import './map.css'

// The part of the map data we show (map units). The full data is 1600 wide.
const VIEW_X = 300
const VIEW_WIDTH = 1000

// Arrows, in map units (about meters).
/** The head of an arrow: its strokes go this far back from the tip. */
const ARROW_HEAD = 24
const ARROW_LINE_WIDTH = 6
/** The cove's flood/ebb arrows are as long as the model's arrows; their color shows the speed. */
const FLOW_ARROW_LENGTH = COVE_ARROW_LENGTH
/**
 * Where the cove's flood/ebb arrows go (map units): the cove's four arrow spots from
 * arrowLayout.ts, plus one just inside the opening, near the middle.
 */
const FLOW_ARROW_SPOTS = [...COVE_STRAIGHT_ARROWS, { x: 835, y: 320 }]

type Props = {
  /** The tiles' current (SFBOFS around the cove, or Alcatraz SW; see currentSource); phase is null while loading. */
  phase: CurrentPhase | null
  velocityKt: number // signed: + flood, − ebb
  /** The SFBOFS model's field around the selected time; null while loading or without data. */
  field: CurrentField | null
  time: Date
  currentSource: CurrentSource
  controls: ReactNode // the COVE / BAY buttons, drawn over the map
}

export function CurrentMap({ phase, velocityKt, field, time, currentSource, controls }: Props) {
  const speedKt = Math.abs(velocityKt)
  const { ref, width } = useElementWidth<HTMLDivElement>()

  // The SFBOFS model at this moment, when it's the source.
  const timeMs = time.getTime()
  const snapshot = useMemo(() => {
    if (field === null || currentSource !== 'sfbofs') return null
    return currentFieldAt(field, new Date(timeMs))
  }, [field, timeMs, currentSource])
  const modelArrows = useMemo(() => {
    if (field === null || snapshot === null) return null
    return coveModelArrows(field.points, snapshot)
  }, [field, snapshot])
  const modelDirection = useMemo(() => {
    if (field === null || snapshot === null) return null
    const vector = averageVector(snapshot, viewWeights(field.points))
    if (vector === null) return null
    const speed = Math.hypot(vector.east, vector.north)
    if (speed === 0) return null
    return toMapVector(vector.east / speed, vector.north / speed)
  }, [field, snapshot])

  let arrows: ReactNode = null
  let key: ReactNode = <MapKey linkText="Loading SFBOFS…" href={SOURCE_PAGES.sfbofsCurrents} loading={true} />
  if (phase !== null && currentSource === 'sfbofs' && snapshot !== null && modelArrows !== null) {
    arrows = (
      <>
        <ModelArrows arrows={modelArrows} />
        <CoveFlowArrows speedKt={speedKt} direction={modelDirection} />
      </>
    )
    let linkText = 'SFBOFS'
    if (snapshot.kind === 'forecast') linkText = 'SFBOFS forecast'
    key = <MapKey linkText={linkText} href={SOURCE_PAGES.sfbofsCurrents} loading={false} />
  } else if (phase !== null && currentSource === 'alcatraz') {
    // Alcatraz SW has no direction of its own: right toward flood (+1), left toward ebb (−1).
    let directionX = 1
    if (velocityKt < 0) directionX = -1
    arrows = (
      <>
        <FixedArrows spots={OPEN_WATER_ARROWS} speedKt={speedKt} directionX={directionX} length={COVE_ARROW_LENGTH} />
        <FixedArrows spots={FLOW_ARROW_SPOTS} speedKt={speedKt} directionX={directionX} length={FLOW_ARROW_LENGTH} />
      </>
    )
    key = <MapKey linkText="NOAA Alcatraz SW" href={SOURCE_PAGES.alcatrazCurrent} loading={false} />
  }

  return (
    <div className="map" ref={ref}>
      <svg className="map__svg" viewBox={`${VIEW_X} 0 ${VIEW_WIDTH} ${MAP_HEIGHT}`} role="img" aria-label={mapDescription(phase, speedKt)}>
        <Basemap />
        {arrows}
        <ClubsLabel width={width} />
      </svg>
      {/* OpenStreetMap's license asks for this credit wherever the map is shown. */}
      <p className="map__credit">© OpenStreetMap contributors</p>
      {controls}
      <NorthArrow />
      {key}
    </div>
  )
}

/** The basemap layers (OpenStreetMap), bottom to top. */
function Basemap() {
  return (
    <>
      <rect x={VIEW_X} y={0} width={VIEW_WIDTH} height={MAP_HEIGHT} className="map__water" />
      <path d={LAND} className="map__land" />
      <path d={PARKS} className="map__park" />
      <path d={BEACH} className="map__beach" />
      <path d={ROADS.pedestrian} className="map__road" strokeWidth={2} />
      <path d={ROADS.residential} className="map__road" strokeWidth={3} />
      <path d={ROADS.unclassified} className="map__road" strokeWidth={3} />
      <path d={ROADS.tertiary} className="map__road" strokeWidth={4} />
      <path d={ROADS.secondary} className="map__road" strokeWidth={6} />
      <path d={ROADS.primary} className="map__road" strokeWidth={7} />
      <path d={BUILDINGS} className="map__building" />
      <path d={PIERS} className="map__pier" />
      <path d={DOCKS} className="map__dock" />
      <path d={BREAKWATERS} className="map__breakwater" />
    </>
  )
}

/**
 * "Dolphin Club / South End" in two short lines to the right of the clubs, so it fits
 * even on a phone; a fixed pixel size:  units = pixels × (VIEW_WIDTH / width)
 */
function ClubsLabel({ width }: { width: number }) {
  if (width <= 0) return null
  const unitsPerPixel = VIEW_WIDTH / width
  return (
    <text
      x={CLUBS.southEnd.x + 14}
      y={CLUBS.southEnd.y + 22}
      className="map__label"
      fontSize={12 * unitsPerPixel}
      strokeWidth={4 * unitsPerPixel}
    >
      <tspan>Dolphin Club</tspan>
      <tspan x={CLUBS.southEnd.x + 14} dy={14 * unitsPerPixel}>
        South End
      </tspan>
    </text>
  )
}

/** The SFBOFS model's arrows: solid and colored in open water, very faded gray dotted eddies in sheltered water. */
function ModelArrows({ arrows }: { arrows: CoveArrow[] }) {
  const open = arrows.filter((arrow) => !arrow.sheltered)
  const eddies = arrows.filter((arrow) => arrow.sheltered)
  return (
    <g strokeWidth={ARROW_LINE_WIDTH}>
      <g className="map__model-arrows">
        {open.map((arrow) => (
          <path
            key={`${arrow.x},${arrow.y}`}
            d={arrowPath(arrow.x, arrow.y, arrow.ux, arrow.uy, COVE_ARROW_LENGTH, ARROW_HEAD)}
            stroke={bandColor(arrow.speedKt)}
          />
        ))}
      </g>
      <g className="map__model-arrows map__eddies">
        {eddies.map((arrow) => (
          <DottedArrow key={`${arrow.x},${arrow.y}`} parts={arrowParts(arrow.x, arrow.y, arrow.ux, arrow.uy, COVE_ARROW_LENGTH, ARROW_HEAD)} />
        ))}
      </g>
    </g>
  )
}

/** A dotted shaft with a solid head (the shaft gets the dots: .map__dotted in map.css). */
function DottedArrow({ parts }: { parts: { shaft: string; head: string } }) {
  return (
    <>
      <path d={parts.shaft} className="map__dotted" />
      <path d={parts.head} />
    </>
  )
}

type CoveFlowArrowsProps = {
  speedKt: number
  direction: { x: number; y: number } | null // the cove's current direction (map units)
}

/**
 * The cove's flood or ebb (SFBOFS), drawn in the cove: solid arrows at FLOW_ARROW_SPOTS,
 * all FLOW_ARROW_LENGTH long, pointing the cove's current direction and colored by the
 * tiles' speed (violet when slow, including at slack).
 */
function CoveFlowArrows({ speedKt, direction }: CoveFlowArrowsProps) {
  const color = bandColor(speedKt)
  if (direction === null) return null
  return (
    <g className="map__model-arrows" stroke={color} strokeWidth={ARROW_LINE_WIDTH}>
      {FLOW_ARROW_SPOTS.map((spot) => (
        <path key={`${spot.x},${spot.y}`} d={arrowPath(spot.x, spot.y, direction.x, direction.y, FLOW_ARROW_LENGTH, ARROW_HEAD)} />
      ))}
    </g>
  )
}

type FixedArrowsProps = {
  spots: Array<{ x: number; y: number }>
  speedKt: number
  directionX: number // +1 = right (flood), −1 = left (ebb)
  length: number
}

/** The Alcatraz SW fallback: arrows at fixed spots along the flood/ebb axis, colored by speed (violet when slow). */
function FixedArrows({ spots, speedKt, directionX, length }: FixedArrowsProps) {
  const color = bandColor(speedKt)
  return (
    <g className="map__model-arrows" stroke={color} strokeWidth={ARROW_LINE_WIDTH}>
      {spots.map((spot) => (
        <path key={`${spot.x},${spot.y}`} d={arrowPath(spot.x, spot.y, directionX, 0, length, ARROW_HEAD)} />
      ))}
    </g>
  )
}

type MapKeyProps = {
  linkText: string // "SFBOFS", "SFBOFS forecast", "NOAA Alcatraz SW", or the loading text
  href: string
  loading: boolean // the link text pulses while the current loads
}

/** The key: the speed bands' color strip and a link to the arrows' source. */
function MapKey({ linkText, href, loading }: MapKeyProps) {
  let linkClass = 'map__key-source'
  if (loading) linkClass = 'map__key-source is-loading'
  return (
    <div className="map__key mono">
      <span>Current speed (kt)</span>
      <SpeedStrip />
      <a className={linkClass} href={href}>
        {linkText} →
      </a>
    </div>
  )
}

function mapDescription(phase: CurrentPhase | null, speedKt: number): string {
  if (phase === null) return 'Map of Aquatic Park cove. Loading the current.'
  if (phase === 'slack') return 'Map of Aquatic Park cove. Slack: little or no current.'
  const toward = phase === 'flood' ? 'east, into the bay' : 'west, toward the Golden Gate'
  return `Map of Aquatic Park cove. ${speedKt.toFixed(1)} knot ${phase} flowing ${toward}.`
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
