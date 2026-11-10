// The wind chart: wind speed in mph through the selected day, on the same time axis as the
// tide and current charts and the slider.
//
// - Speed: a solid line where it was measured (NOAA, Golden Gate), dashed where it's
//   the NWS forecast. Measured hours come first; the forecast picks up after them.
// - Gusts: a thin dotted line above the speed, measured hours only (the forecast has none).
// - Direction: compass letters along the top every 3 hours ("SW"), naming where the
//   wind comes FROM, as wind is usually named and as the Wind tile shows it.
// Tapping or dragging picks a time, like the other charts.

import type { DayAxis } from '../dayAxis'
import { windAt } from '../../weather/useWeather'
import type { WeatherData } from '../../weather/useWeather'
import type { WindSample } from '../../weather/types'
import { ChartFrame, HourAxis, NowMarker, TOP_SPACE, X_AXIS_HEIGHT } from './DayChart'
import { compassPoint, knotsToMph } from '../../weather/units'
import { linearScale, ticksBetween } from './scale'

const WIND_PLOT_HEIGHT = 110
/** A direction label every this many hours. */
const DIRECTION_EVERY_HOURS = 3

type Props = {
  weather: WeatherData
  axis: DayAxis
  width: number
  time: Date
  onSelect: (time: Date) => void
}

export function WindChart({ weather, axis, width, time, onSelect }: Props) {
  const inDay = (sample: WindSample) => sample.time >= axis.dayStart && sample.time <= axis.dayEnd

  // Measured hours of this day; then forecast hours after the last measurement.
  let measured: WindSample[] = []
  if (weather.measured !== null) measured = weather.measured.wind.filter(inDay)
  const lastMeasured = measured.at(-1)
  let forecast: WindSample[] = []
  if (weather.forecast !== null) {
    forecast = weather.forecast.wind.filter((sample) => {
      if (!inDay(sample)) return false
      if (lastMeasured === undefined) return true
      return sample.time > lastMeasured.time
    })
  }
  const all = [...measured, ...forecast]

  // Y axis in mph, from 0 up to a round number above the strongest speed or gust:
  // gridlines every 5 mph, or every 10 mph on a windy day, and at least 0–10 mph.
  let strongest = 0
  for (const sample of all) {
    strongest = Math.max(strongest, knotsToMph(sample.speedKt))
    if (sample.gustKt !== null) strongest = Math.max(strongest, knotsToMph(sample.gustKt))
  }
  let step = 5
  if (strongest > 30) step = 10
  const top = Math.max(10, Math.ceil(strongest / step) * step)

  const directionRowY = TOP_SPACE - 4
  const plotTop = TOP_SPACE + 4
  const plotBottom = plotTop + WIND_PLOT_HEIGHT
  const y = linearScale(0, top, plotBottom, plotTop).toPixel
  const height = plotBottom + X_AXIS_HEIGHT

  const pathOf = (samples: WindSample[], valueOf: (sample: WindSample) => number) =>
    samples.map((sample, i) => `${i === 0 ? 'M' : 'L'}${axis.toX(sample.time)},${y(valueOf(sample))}`).join(' ')

  const measuredLine = pathOf(measured, (sample) => knotsToMph(sample.speedKt))
  // Start the dashed forecast line at the last measurement, so the two lines join up.
  let forecastFrom = forecast
  if (lastMeasured !== undefined && forecast.length > 0) forecastFrom = [lastMeasured, ...forecast]
  const forecastLine = pathOf(forecastFrom, (sample) => knotsToMph(sample.speedKt))
  const withGusts = measured.filter((sample) => sample.gustKt !== null)
  const gustLine = pathOf(withGusts, (sample) => knotsToMph(sample.gustKt ?? 0))

  // Direction labels: at 12 AM, 3 AM, 6 AM, … the reading nearest that hour.
  const directions: Array<{ x: number; text: string; anchor: 'start' | 'middle' }> = []
  axis.hourTicks.forEach((tick, hourIndex) => {
    if (hourIndex % DIRECTION_EVERY_HOURS !== 0 || hourIndex === axis.hourTicks.length - 1) return
    const nearest = windAt(weather, tick.time)
    if (nearest === null) return
    // The midnight label starts at the axis instead of centering on it, so it isn't cut off.
    let anchor: 'start' | 'middle' = 'middle'
    if (hourIndex === 0) anchor = 'start'
    directions.push({ x: axis.toX(tick.time), text: compassPoint(nearest.wind.fromDeg), anchor })
  })

  const selected = windAt(weather, time)
  const selectedInDay = time >= axis.dayStart && time <= axis.dayEnd

  return (
    <ChartFrame axis={axis} width={width} height={height} label="Wind speed in mph through the day" onSelect={onSelect}>
      {ticksBetween(0, top, step).map((mph) => (
        <g key={mph}>
          <line x1={axis.left} y1={y(mph)} x2={axis.right} y2={y(mph)} className="chart__grid" />
          <text x={axis.left - 8} y={y(mph) + 3} textAnchor="end" className="chart__axis">
            {mph === 0 ? '0' : `${mph} mph`}
          </text>
        </g>
      ))}
      <HourAxis axis={axis} plotTop={plotTop} plotBottom={plotBottom} />

      {all.length === 0 && (
        <text x={(axis.left + axis.right) / 2} y={(plotTop + plotBottom) / 2} textAnchor="middle" className="chart__axis">
          No wind data for this day
        </text>
      )}
      <path d={gustLine} className="chart__gust" />
      <path d={measuredLine} className="chart__line" />
      <path d={forecastLine} className="chart__line chart__line--forecast" />

      {directions.map((direction) => (
        <text key={direction.x} x={direction.x} y={directionRowY} textAnchor={direction.anchor} className="chart__direction">
          {direction.text}
        </text>
      ))}

      {selected !== null && selectedInDay && (
        <NowMarker x={axis.toX(time)} y={y(knotsToMph(selected.wind.speedKt))} top={plotTop} bottom={plotBottom} />
      )}
    </ChartFrame>
  )
}

/**
 * The key under the chart: a tiny drawing of each kind of line, in the chart's own
 * styles (same CSS classes), so each sample looks exactly like what it labels.
 */
export function WindKey() {
  return (
    <ul className="wind-key">
      <li>
        <KeyLine className="chart__line" />
        Measured
      </li>
      <li>
        <KeyLine className="chart__line chart__line--forecast" />
        Forecast
      </li>
      <li>
        <KeyLine className="chart__gust" />
        Gusts
      </li>
      <li>
        <span className="wind-key__letters">SW</span>
        From the southwest
      </li>
    </ul>
  )
}

/** A short horizontal sample of a chart line. */
function KeyLine({ className }: { className: string }) {
  return (
    <svg width={18} height={10} aria-hidden="true">
      <line x1={1} y1={5} x2={17} y2={5} className={className} />
    </svg>
  )
}
