// The cove on a dark, detailed basemap (OpenStreetMap layers from coveShapes.ts), with
// straight arrows for the current at the selected time.
//
// The map is rotated 17° so the flood/ebb axis is horizontal: flood arrows point
// right (into the bay), ebb arrows point left (out the Golden Gate).
//
// Arrow positions come from scripts/cove-map/arrows.py (arrowLayout.ts), which checks
// that every arrow stays over water. Open water: straight arrows, length ∝ speed.
// Cove: a few long, curving, dotted "eddy" arrows (an estimate), like the back-eddy
// arrows in the Dolphin Club guide.

import type { CurrentPhase } from '../../domain/types'
import { useElementWidth } from '../charts/useElementWidth'
import { COVE_CURVES, COVE_STRAIGHT_ARROWS, OPEN_WATER_ARROWS } from './arrowLayout'
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
/** Straight cove arrows are this fraction of the open-water length. */
const COVE_STRAIGHT_FACTOR = 0.6

type Props = { phase: CurrentPhase; speedKt: number }

export function CurrentMap({ phase, speedKt }: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>()

  // How many map units one screen pixel covers, so text and the key stay a fixed
  // pixel size whatever the map's width:  units = pixels × (VIEW_WIDTH / width)
  const unitsPerPixel = width > 0 ? VIEW_WIDTH / width : 1
  const keyLengthPx = UNITS_PER_KNOT / unitsPerPixel

  // Flood flows right (+1), ebb flows left (−1).
  const direction = phase === 'ebb' ? -1 : 1
  const showArrows = phase !== 'slack'
  const drawnKt = Math.min(speedKt, MAX_DRAWN_KT)

  return (
    <div className="map" ref={ref}>
      <svg
        className="map__svg"
        viewBox={`${VIEW_X} 0 ${VIEW_WIDTH} ${MAP_HEIGHT}`}
        role="img"
        aria-label={mapDescription(phase, speedKt)}
      >
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

        {showArrows && (
          <g>
            {OPEN_WATER_ARROWS.map((arrow) => (
              <StraightArrow
                key={`${arrow.x},${arrow.y}`}
                x={arrow.x}
                y={arrow.y}
                directionX={direction}
                length={UNITS_PER_KNOT * drawnKt}
              />
            ))}
            {COVE_STRAIGHT_ARROWS.map((arrow) => (
              <CoveStraightArrow
                key={`${arrow.x},${arrow.y}`}
                x={arrow.x}
                y={arrow.y}
                directionX={direction}
                length={UNITS_PER_KNOT * drawnKt * COVE_STRAIGHT_FACTOR}
              />
            ))}
            {COVE_CURVES.map((curve) => (
              <CoveCurve key={`${curve.start.x},${curve.start.y}`} curve={curve} isEbb={phase === 'ebb'} />
            ))}
          </g>
        )}

        {width > 0 && (
          // Two short lines to the right of the clubs, so it fits even on a phone.
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
        )}
      </svg>

      <p className="map__tag mono">AQUATIC COVE</p>
      {/* OpenStreetMap's license asks for this credit wherever the map is shown. */}
      <p className="map__credit">© OpenStreetMap contributors</p>
      <NorthArrow />
      {showArrows ? (
        <div className="map__key mono">
          <span className="map__key-row">
            <KeyArrow lengthPx={keyLengthPx} light={false} />1 kt
          </span>
          <span className="map__key-row">
            <KeyArrow lengthPx={keyLengthPx * 0.6} light={true} />
            cove (estimate)
          </span>
        </div>
      ) : (
        <p className="map__key mono">SLACK · little or no current</p>
      )}
    </div>
  )
}

function mapDescription(phase: CurrentPhase, speedKt: number): string {
  if (phase === 'slack') return 'Map of Aquatic Park cove. Slack: little or no current.'
  const toward = phase === 'flood' ? 'east, into the bay' : 'west, toward the Golden Gate'
  return `Map of Aquatic Park cove. ${speedKt.toFixed(1)} knot ${phase} flowing ${toward}.`
}

type StraightArrowProps = {
  x: number // center, map units
  y: number
  directionX: number // +1 = right (flood), −1 = left (ebb)
  length: number // tail to tip, map units
}

/** A straight horizontal arrow centered on (x, y), with a small filled head. */
function StraightArrow({ x, y, directionX, length }: StraightArrowProps) {
  const headLength = 12
  const headHalfWidth = 7
  const tailX = x - directionX * (length / 2)
  const tipX = x + directionX * (length / 2)
  const baseX = tipX - directionX * headLength // where the head starts
  return (
    <g className="map__arrow">
      <path d={`M${tailX},${y} L${baseX},${y}`} strokeWidth={4} />
      <path d={`M${tipX},${y} L${baseX},${y - headHalfWidth} L${baseX},${y + headHalfWidth} Z`} className="map__arrow-head" />
    </g>
  )
}

/** A short straight dotted arrow in the cove: the regular east/west current. */
function CoveStraightArrow({ x, y, directionX, length }: StraightArrowProps) {
  const headLength = 8
  const tailX = x - directionX * (length / 2)
  const tipX = x + directionX * (length / 2)
  const baseX = tipX - directionX * headLength
  return (
    <g className="map__arrow map__arrow--cove">
      <path d={`M${tailX},${y} L${tipX - directionX * 3},${y}`} className="map__dots" />
      <path d={`M${baseX},${y - 6} L${tipX},${y} L${baseX},${y + 6}`} strokeWidth={3} />
    </g>
  )
}

type Point = { x: number; y: number }

/**
 * A long curving dotted arrow in the cove. The curve is stored in its flood direction
 * (start → end); on an ebb the head goes on the start instead, so it points backwards.
 */
function CoveCurve({ curve, isEbb }: { curve: { start: Point; control: Point; end: Point }; isEbb: boolean }) {
  const { start, control, end } = curve
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

/** North is MAP_ROTATION_DEG to the left of up, because the map is turned clockwise. */
function NorthArrow() {
  return (
    <div className="map__north">
      <svg width={20} height={20} viewBox="0 0 20 20" role="img" aria-label={`North, ${MAP_ROTATION_DEG}° left of up`}>
        <g transform={`rotate(${-MAP_ROTATION_DEG} 10 10)`}>
          <path d="M10 2 L14 15 L10 12 L6 15 Z" fill="currentColor" />
        </g>
      </svg>
    </div>
  )
}
