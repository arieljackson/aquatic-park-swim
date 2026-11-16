// The map keys' color strip: the speed bands side by side, with each boundary's speed
// centered under it (band i ends at x = (i + 1) × STRIP_BAND_PX).

import { SPEED_BANDS } from './speedBands'

/** Width of one band in the strip, in pixels. */
const STRIP_BAND_PX = 20

export function SpeedStrip() {
  const width = SPEED_BANDS.length * STRIP_BAND_PX
  return (
    <svg width={width} height={22} aria-hidden="true" className="map__key-strip">
      {SPEED_BANDS.map((band, i) => (
        <rect key={band.color} x={i * STRIP_BAND_PX} y={0} width={STRIP_BAND_PX} height={7} fill={band.color} />
      ))}
      {SPEED_BANDS.slice(0, -1).map((band, i) => (
        <text key={band.below} x={(i + 1) * STRIP_BAND_PX} y={19} textAnchor="middle" className="map__key-tick">
          {band.below}
        </text>
      ))}
    </svg>
  )
}
