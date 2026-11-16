// The COVE map: the cove on a dark, detailed basemap (OpenStreetMap layers from
// coveShapes.ts), with arrows for the current at the selected time. The map is rotated 17°
// so the Golden Gate's flood/ebb axis is horizontal: floods run right (into the bay),
// ebbs left (out the Golden Gate).
//
// The arrows come from the same source as the current tiles (see App.tsx):
// - NOAA's SFBOFS model, when it covers the day (the model's values blended between its
//   hours): one arrow per model point (coveModelArrows.ts). In open water they're solid
//   and colored by speed band (speedBands.ts); in the cove and the harbor they're the
//   eddies, very faded, gray and dotted. Solid arrows in the cove, colored by speed, show
//   the cove's flood or ebb: the tiles' number and direction (the average of the open
//   water in view, domain/coveCurrent.ts); a ◆ at slack.
// - Otherwise NOAA's Alcatraz SW prediction, at fixed spots from scripts/cove-map/arrows.py
//   (arrowLayout.ts): solid straight arrows in open water and (thinner) in the cove,
//   right on a flood and left on an ebb, length ∝ speed (1 kt key); dotted curving eddy
//   arrows in the cove, like the back-eddy arrows in the Dolphin Club guide, growing
//   with speed but not on the 1 kt scale (see MIN_CURVE_FRACTION).
// While the current is still loading (phase null), the cove is drawn without arrows.

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { CurrentField, CurrentSnapshot } from '../../domain/currentField'
import { currentFieldAt } from '../../domain/currentField'
import { averageVector, viewWeights } from '../../domain/coveCurrent'
import type { CurrentPhase } from '../../domain/types'
import { useElementWidth } from '../charts/useElementWidth'
import { SOURCE_PAGES } from '../sourcePages'
import type { CurrentSource } from '../sourcePages'
import { COVE_CURVES, COVE_STRAIGHT_ARROWS, OPEN_WATER_ARROWS } from './arrowLayout'
import { COVE_ARROW_LENGTH, coveModelArrows } from './coveModelArrows'
import type { CoveArrow } from './coveModelArrows'
import { toMapVector } from './projection'
import { arrowParts, arrowPath, bandColor } from './speedBands'
import { SpeedStrip } from './SpeedStrip'
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
import './map.css'

// The part of the map data we show (map units). The full data is 1600 wide.
const VIEW_X = 300
const VIEW_WIDTH = 1000

// Keep these in step with scripts/cove-map/arrows.py.
/** Open-water arrow length in map units for 1 knot. Length is proportional to speed. */
const UNITS_PER_KNOT = 60
/** The layout was checked for arrows up to this speed; faster currents draw at this length. */
const MAX_DRAWN_KT = 1.6
/**
 * Eddy curves grow with speed too, but not on the 1 kt scale. Only the part nearest the
 * arrowhead is drawn: MAX_CURVE_FRACTION of the curve at MAX_DRAWN_KT and up, shrinking
 * to MIN_CURVE_FRACTION at no current. Never more than the whole curve arrows.py checked.
 */
const MIN_CURVE_FRACTION = 0.3
const MAX_CURVE_FRACTION = 0.75

// SFBOFS arrows, in map units (about meters).
/** The head of a model arrow: its strokes go this far back from the tip. */
const MODEL_HEAD = 24
const MODEL_LINE_WIDTH = 6
/**
 * The cove's flood/ebb arrows grow with the cove's speed (the tiles' number):
 *   length = 60 + 60 × min(speed, MAX_DRAWN_KT) / MAX_DRAWN_KT
 */
const FLOW_ARROW_BASE = 60
/**
 * Where the cove's flood/ebb arrows go (map units): the cove's four arrow spots from
 * arrowLayout.ts, plus one just inside the opening, near the middle.
 */
const FLOW_ARROW_SPOTS = [...COVE_STRAIGHT_ARROWS, { x: 835, y: 320 }]

/** `phase` is null while the current is still loading: the map is drawn without arrows. */
type Props = {
  /** The tiles' current (SFBOFS around the cove, or Alcatraz SW; see currentSource). */
  phase: CurrentPhase | null
  speedKt: number
  /** The SFBOFS model's field around the selected time; null while loading or without data. */
  field: CurrentField | null
  time: Date
  currentSource: CurrentSource
  controls: ReactNode // the COVE / BAY buttons, drawn over the map
}

export function CurrentMap({ phase, speedKt, field, time, currentSource, controls }: Props) {
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
  const flowDirection = useMemo(() => {
    if (field === null || snapshot === null) return null
    const vector = averageVector(snapshot, viewWeights(field.points))
    if (vector === null) return null
    const speed = Math.hypot(vector.east, vector.north)
    if (speed === 0) return null
    return toMapVector(vector.east / speed, vector.north / speed)
  }, [field, snapshot])

  if (field !== null && snapshot !== null && modelArrows !== null) {
    return (
      <div className="map" ref={ref}>
        <svg className="map__svg" viewBox={`${VIEW_X} 0 ${VIEW_WIDTH} ${MAP_HEIGHT}`} role="img" aria-label={mapDescription(phase, speedKt)}>
          <Basemap />
          <ModelArrows arrows={modelArrows} />
          <CoveFlowArrows phase={phase} speedKt={speedKt} direction={flowDirection} />
          <ClubsLabel width={width} />
        </svg>
        <p className="map__credit">© OpenStreetMap contributors</p>
        {controls}
        <NorthArrow />
        <ModelKey snapshot={snapshot} />
      </div>
    )
  }

  // How many map units one screen pixel covers, so text and the key stay a fixed
  // pixel size whatever the map's width:  units = pixels × (VIEW_WIDTH / width)
  const unitsPerPixel = width > 0 ? VIEW_WIDTH / width : 1
  const keyLengthPx = UNITS_PER_KNOT / unitsPerPixel

  // Flood flows right (+1), ebb flows left (−1).
  const direction = phase === 'ebb' ? -1 : 1
  const showArrows = phase === 'flood' || phase === 'ebb'
  const showSlack = phase === 'slack'
  const drawnKt = Math.min(speedKt, MAX_DRAWN_KT)

  return (
    <div className="map" ref={ref}>
      <svg
        className="map__svg"
        viewBox={`${VIEW_X} 0 ${VIEW_WIDTH} ${MAP_HEIGHT}`}
        role="img"
        aria-label={mapDescription(phase, speedKt)}
      >
        <Basemap />

        {showArrows && (
          <g>
            {OPEN_WATER_ARROWS.map((arrow) => (
              <StraightArrow
                key={`${arrow.x},${arrow.y}`}
                x={arrow.x}
                y={arrow.y}
                directionX={direction}
                length={UNITS_PER_KNOT * drawnKt}
                isCove={false}
              />
            ))}
            {/* Same scale as open water, drawn thinner. */}
            {COVE_STRAIGHT_ARROWS.map((arrow) => (
              <StraightArrow
                key={`${arrow.x},${arrow.y}`}
                x={arrow.x}
                y={arrow.y}
                directionX={direction}
                length={UNITS_PER_KNOT * drawnKt}
                isCove={true}
              />
            ))}
            {COVE_CURVES.map((curve) => (
              <CoveCurve
                key={`${curve.start.x},${curve.start.y}`}
                curve={curve}
                isEbb={phase === 'ebb'}
                fraction={curveFraction(drawnKt)}
              />
            ))}
          </g>
        )}

        {/* Slack: a ◆ where each straight arrow would be (the same ◆ as on the slider
            and the Current tile). Those spots are already checked to be over water. */}
        {showSlack && (
          <g>
            {OPEN_WATER_ARROWS.map((arrow) => (
              <SlackDiamond key={`${arrow.x},${arrow.y}`} x={arrow.x} y={arrow.y} halfSize={7} />
            ))}
            {COVE_STRAIGHT_ARROWS.map((arrow) => (
              <SlackDiamond key={`${arrow.x},${arrow.y}`} x={arrow.x} y={arrow.y} halfSize={5} />
            ))}
          </g>
        )}

        <ClubsLabel width={width} />
      </svg>

      {/* OpenStreetMap's license asks for this credit wherever the map is shown. */}
      <p className="map__credit">© OpenStreetMap contributors</p>
      {controls}
      <NorthArrow />
      {/* The key, ending with a link to the prediction the arrows come from. */}
      <div className="map__key mono">
        {phase === null && <span className="is-loading">LOADING CURRENT…</span>}
        {showArrows && (
          <>
            <span className="map__key-row">
              <KeyArrow lengthPx={keyLengthPx} light={false} />1 kt
            </span>
            <span className="map__key-row">
              {/* Eddy arrows aren't on the 1 kt scale, so this sample isn't to scale. */}
              <KeyArrow lengthPx={keyLengthPx} light={true} />
              cove eddies
            </span>
          </>
        )}
        {showSlack && <span>SLACK · little or no current</span>}
        <a className="map__key-source" href={SOURCE_PAGES.alcatrazCurrent}>
          NOAA Alcatraz SW →
        </a>
      </div>
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

/** The SFBOFS model's arrows: solid and colored in open water, faded gray dotted eddies in sheltered water. */
function ModelArrows({ arrows }: { arrows: CoveArrow[] }) {
  const open = arrows.filter((arrow) => !arrow.sheltered)
  const eddies = arrows.filter((arrow) => arrow.sheltered)
  return (
    <g strokeWidth={MODEL_LINE_WIDTH}>
      <g className="map__model-arrows">
        {open.map((arrow) => (
          <path
            key={`${arrow.x},${arrow.y}`}
            d={arrowPath(arrow.x, arrow.y, arrow.ux, arrow.uy, COVE_ARROW_LENGTH, MODEL_HEAD)}
            stroke={bandColor(arrow.speedKt)}
          />
        ))}
      </g>
      <g className="map__model-arrows map__eddies">
        {eddies.map((arrow) => (
          <DottedArrow key={`${arrow.x},${arrow.y}`} parts={arrowParts(arrow.x, arrow.y, arrow.ux, arrow.uy, COVE_ARROW_LENGTH, MODEL_HEAD)} />
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
  phase: CurrentPhase | null
  speedKt: number
  direction: { x: number; y: number } | null // the cove's current direction (map units)
}

/**
 * The cove's flood or ebb, drawn in the cove: solid arrows at fixed spots
 * (FLOW_ARROW_SPOTS), pointing the cove's current direction and colored by the tiles'
 * speed; a ◆ at each spot at slack.
 *   length = FLOW_ARROW_BASE × (1 + min(speed, MAX_DRAWN_KT) / MAX_DRAWN_KT)
 */
function CoveFlowArrows({ phase, speedKt, direction }: CoveFlowArrowsProps) {
  if (phase === null) return null
  if (phase === 'slack') {
    return (
      <g>
        {FLOW_ARROW_SPOTS.map((spot) => (
          <SlackDiamond key={`${spot.x},${spot.y}`} x={spot.x} y={spot.y} halfSize={7} />
        ))}
      </g>
    )
  }
  if (direction === null) return null
  const drawnKt = Math.min(speedKt, MAX_DRAWN_KT)
  const length = FLOW_ARROW_BASE * (1 + drawnKt / MAX_DRAWN_KT)
  return (
    <g className="map__model-arrows" stroke={bandColor(speedKt)} strokeWidth={MODEL_LINE_WIDTH}>
      {FLOW_ARROW_SPOTS.map((spot) => (
        <path key={`${spot.x},${spot.y}`} d={arrowPath(spot.x, spot.y, direction.x, direction.y, length, MODEL_HEAD)} />
      ))}
    </g>
  )
}

/**
 * The key for the SFBOFS arrows: the speed bands' color strip, a link to NOAA's SFBOFS
 * current maps that says when the hour is a forecast, and a note on how the cove's
 * current is estimated.
 */
function ModelKey({ snapshot }: { snapshot: CurrentSnapshot }) {
  let source = 'SFBOFS'
  if (snapshot.kind === 'forecast') source = 'SFBOFS forecast'
  return (
    <div className="map__key mono">
      <span>Current speed (kt)</span>
      <SpeedStrip />
      <a className="map__key-source" href={SOURCE_PAGES.sfbofsCurrents}>
        {source} →
      </a>
      {/* Ariel's wording. */}
      <p className="map__key-note">
        * SFBOFS does not provide fine-grained current data for Aquatic Cove. Current is estimated from the opening.
      </p>
    </div>
  )
}

/**
 * How much of each eddy curve to draw at this speed, from MIN_CURVE_FRACTION up to
 * MAX_CURVE_FRACTION:
 *   fraction = MIN + (MAX − MIN) × (speed ÷ MAX_DRAWN_KT)
 */
function curveFraction(drawnKt: number): number {
  const speedShare = drawnKt / MAX_DRAWN_KT // 0 at no current, 1 at the top speed
  return MIN_CURVE_FRACTION + (MAX_CURVE_FRACTION - MIN_CURVE_FRACTION) * speedShare
}

function mapDescription(phase: CurrentPhase | null, speedKt: number): string {
  if (phase === null) return 'Map of Aquatic Park cove. Loading the current.'
  if (phase === 'slack') return 'Map of Aquatic Park cove. Slack: little or no current.'
  const toward = phase === 'flood' ? 'east, into the bay' : 'west, toward the Golden Gate'
  return `Map of Aquatic Park cove. ${speedKt.toFixed(1)} knot ${phase} flowing ${toward}.`
}

type StraightArrowProps = {
  x: number // center, map units
  y: number
  directionX: number // +1 = right (flood), −1 = left (ebb)
  length: number // tail to tip, map units
  isCove: boolean // cove arrows are drawn thinner, with a smaller head
}

/** A straight horizontal arrow centered on (x, y), with a small filled head. */
function StraightArrow({ x, y, directionX, length, isCove }: StraightArrowProps) {
  let lineWidth = 4
  let headLength = 12
  let headHalfWidth = 7
  if (isCove) {
    lineWidth = 2.5
    headLength = 10
    headHalfWidth = 5
  }
  const tailX = x - directionX * (length / 2)
  const tipX = x + directionX * (length / 2)
  const baseX = tipX - directionX * headLength // where the head starts
  return (
    <g className="map__arrow">
      <path d={`M${tailX},${y} L${baseX},${y}`} strokeWidth={lineWidth} />
      <path d={`M${tipX},${y} L${baseX},${y - headHalfWidth} L${baseX},${y + headHalfWidth} Z`} className="map__arrow-head" />
    </g>
  )
}

type SlackDiamondProps = {
  x: number // center, map units
  y: number
  halfSize: number // center to each corner, map units
}

/** A small filled ◆ centered on (x, y), marking slack water. */
function SlackDiamond({ x, y, halfSize }: SlackDiamondProps) {
  // Corners: top, right, bottom, left.
  const top = `${x},${y - halfSize}`
  const right = `${x + halfSize},${y}`
  const bottom = `${x},${y + halfSize}`
  const left = `${x - halfSize},${y}`
  return (
    <g className="map__arrow">
      <path d={`M${top} L${right} L${bottom} L${left} Z`} className="map__diamond" />
    </g>
  )
}

type Point = { x: number; y: number }

type Curve = { start: Point; control: Point; end: Point }

/** A point on a quadratic curve:  point = (1−t)² · start + 2(1−t)t · control + t² · end */
function curvePoint(curve: Curve, t: number): Point {
  const a = (1 - t) * (1 - t)
  const b = 2 * (1 - t) * t
  const c = t * t
  return {
    x: a * curve.start.x + b * curve.control.x + c * curve.end.x,
    y: a * curve.start.y + b * curve.control.y + c * curve.end.y,
  }
}

/**
 * The piece of a quadratic curve between t0 and t1 (0 = start, 1 = end), as its own
 * quadratic curve (same formula as trim() in arrows.py). Its control point is
 *   control' = (1−t0)(1−t1) · start + ((1−t0)·t1 + t0·(1−t1)) · control + t0·t1 · end
 */
function trimCurve(curve: Curve, t0: number, t1: number): Curve {
  const a = (1 - t0) * (1 - t1)
  const b = (1 - t0) * t1 + t0 * (1 - t1)
  const c = t0 * t1
  return {
    start: curvePoint(curve, t0),
    control: {
      x: a * curve.start.x + b * curve.control.x + c * curve.end.x,
      y: a * curve.start.y + b * curve.control.y + c * curve.end.y,
    },
    end: curvePoint(curve, t1),
  }
}

/**
 * A long curving dotted arrow in the cove. The curve is stored in its flood direction
 * (start → end); on an ebb the head goes on the start instead, so it points backwards.
 * Only `fraction` of it is drawn: the part nearest the head.
 */
function CoveCurve({ curve, isEbb, fraction }: { curve: Curve; isEbb: boolean; fraction: number }) {
  // Flood: the head is at the end, so keep t from (1 − fraction) to 1.
  // Ebb: the head is at the start, so keep t from 0 to fraction.
  let shown: Curve
  if (isEbb) {
    shown = trimCurve(curve, 0, fraction)
  } else {
    shown = trimCurve(curve, 1 - fraction, 1)
  }
  const { start, control, end } = shown
  // The head sits on the end the water is flowing toward. A quadratic curve arrives at
  // an end heading from the control point to that end.
  const tip = isEbb ? start : end
  const dx = tip.x - control.x
  const dy = tip.y - control.y
  const length = Math.sqrt(dx * dx + dy * dy)
  const ux = dx / length
  const uy = dy / length
  const headLength = 10
  const baseX = tip.x - ux * headLength
  const baseY = tip.y - uy * headLength
  const sideX = -uy * headLength * 0.7
  const sideY = ux * headLength * 0.7
  return (
    <g className="map__arrow map__arrow--cove">
      <path d={`M${start.x},${start.y} Q${control.x},${control.y} ${end.x},${end.y}`} className="map__dots" />
      <path d={`M${baseX + sideX},${baseY + sideY} L${tip.x},${tip.y} L${baseX - sideX},${baseY - sideY}`} strokeWidth={3} />
    </g>
  )
}

/** The key's sample arrows, drawn in screen pixels to match the map's scale. */
function KeyArrow({ lengthPx, light }: { lengthPx: number; light: boolean }) {
  const width = Math.max(lengthPx, 14)
  if (light) {
    return (
      <svg width={width} height={10} viewBox={`0 0 ${width} 10`} aria-hidden="true">
        <g className="map__arrow map__arrow--cove">
          <path d={`M1.5,5 L${width - 2},5`} className="map__dots map__dots--key" />
          <path d={`M${width - 5},2 L${width - 1},5 L${width - 5},8`} fill="none" strokeWidth={1.5} />
        </g>
      </svg>
    )
  }
  return (
    <svg width={width} height={10} viewBox={`0 0 ${width} 10`} aria-hidden="true">
      <g className="map__arrow">
        <path d={`M1,5 L${width - 6},5`} fill="none" strokeWidth={1.5} />
        <path d={`M${width},5 L${width - 6},2 L${width - 6},8 Z`} className="map__arrow-head" />
      </g>
    </svg>
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
