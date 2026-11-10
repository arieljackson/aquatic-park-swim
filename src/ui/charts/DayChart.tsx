// The tide chart and the current chart for the selected day (the wind chart is in
// WindChart.tsx and uses the shared pieces at the bottom of this file). Each is its own tile,
// but they share one time axis (dayAxis.ts) with the slider, so times line up.
//
// Each chart has:
// - a y axis on the left (feet for tide; knots, with FLOOD above and EBB below, for current)
// - an x axis underneath with the hours
// - labels on the day's events, and an orange marker at the selected time
// Tapping or dragging on either chart picks a time.

import type { PointerEvent, ReactNode } from 'react'
import type { Conditions, PredictionData } from '../../domain/types'
import { formatTime } from '../../time/format'
import type { DayAxis } from '../dayAxis'
import { linearScale, ticksBetween } from './scale'
import './chart.css'

/** Kept clear above the curve so event labels fit. */
export const TOP_SPACE = 20
/** Kept clear below the curve so event labels fit. */
const BOTTOM_SPACE = 18
/** Under the plot, for the hour labels. */
export const X_AXIS_HEIGHT = 22
/** The current's dashed lines: the "strong" threshold. */
const STRONG_KT = 1

/** Rough width of a label in 10px IBM Plex Mono: 6 px per character. */
function textWidth(text: string): number {
  return text.length * 6
}

type Label = { x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end' }

/** A label centered on x, nudged to start/end alignment if it would run off the plot. */
function centeredLabel(x: number, y: number, text: string, axis: DayAxis): Label {
  const half = textWidth(text) / 2
  if (x - half < axis.left) return { x: axis.left + 2, y, text, anchor: 'start' }
  if (x + half > axis.right) return { x: axis.right, y, text, anchor: 'end' }
  return { x, y, text, anchor: 'middle' }
}

type ChartProps = {
  data: PredictionData
  conditions: Conditions | null
  axis: DayAxis
  width: number
  onSelect: (time: Date) => void
}

// ---------------------------------------------------------------- Tide

const TIDE_PLOT_HEIGHT = 120
/** The tide chart's full height, for the box drawn while it loads. */
export const TIDE_CHART_HEIGHT = TOP_SPACE + TIDE_PLOT_HEIGHT + X_AXIS_HEIGHT

export function TideChart({ data, conditions, axis, width, onSelect }: ChartProps) {
  const inDay = (time: Date) => time >= axis.dayStart && time <= axis.dayEnd
  const samples = data.tide.samples.filter((s) => inDay(s.time))
  const heights = samples.map((s) => s.heightFt)

  // Gridlines every 2 ft, covering the day's lowest and highest tide.
  const lowTick = Math.floor(Math.min(...heights) / 2) * 2
  const highTick = Math.ceil(Math.max(...heights) / 2) * 2
  const plotBottom = TOP_SPACE + TIDE_PLOT_HEIGHT
  const y = linearScale(lowTick, highTick, plotBottom - BOTTOM_SPACE, TOP_SPACE).toPixel
  const height = plotBottom + X_AXIS_HEIGHT

  const line = samples.map((s) => `${axis.toX(s.time)},${y(s.heightFt)}`).join(' L')
  const firstX = samples.length > 0 ? axis.toX(samples[0].time) : axis.left
  const lastX = samples.length > 0 ? axis.toX(samples[samples.length - 1].time) : axis.left
  const area = `M${line} L${lastX},${plotBottom} L${firstX},${plotBottom} Z`

  const tideEvents = data.tide.events.filter((e) => inDay(e.time))
  // A dot on the curve at each high and low, so it's clear which point a label belongs to.
  const eventDots = tideEvents.map((e) => ({ x: axis.toX(e.time), y: y(e.heightFt) }))
  const labels: Label[] = tideEvents.map((e) => {
    // Just height and time, e.g. "5.8 ft · 3:12 PM": the label's place says high or low.
    const text = `${e.heightFt.toFixed(1)} ft · ${formatTime(e.time)}`
    // Highs get their label above the curve, lows below.
    const labelY = e.kind === 'high' ? y(e.heightFt) - 8 : y(e.heightFt) + 15
    return centeredLabel(axis.toX(e.time), labelY, text, axis)
  })

  const selected = conditions !== null && inDay(conditions.at) ? conditions : null

  return (
    <ChartFrame axis={axis} width={width} height={height} label="Tide height in feet through the day" onSelect={onSelect}>
      {ticksBetween(lowTick, highTick, 2).map((tick) => (
        <g key={tick}>
          <line x1={axis.left} y1={y(tick)} x2={axis.right} y2={y(tick)} className="chart__grid" />
          <text x={axis.left - 8} y={y(tick) + 3} textAnchor="end" className="chart__axis">
            {tick} ft
          </text>
        </g>
      ))}
      <HourAxis axis={axis} plotTop={TOP_SPACE} plotBottom={plotBottom} />
      <path d={area} className="chart__area" />
      <path d={`M${line}`} className="chart__line" />
      {eventDots.map((dot) => (
        <circle key={dot.x} cx={dot.x} cy={dot.y} r={2.5} className="chart__event" />
      ))}
      {labels.map((label) => (
        <text key={label.text} x={label.x} y={label.y} textAnchor={label.anchor} className="chart__label">
          {label.text}
        </text>
      ))}
      {selected !== null && (
        <NowMarker x={axis.toX(selected.at)} y={y(selected.tide.heightFt)} top={TOP_SPACE} bottom={plotBottom} />
      )}
    </ChartFrame>
  )
}

// ---------------------------------------------------------------- Current

const CURRENT_PLOT_HEIGHT = 140
/** The current chart's full height, for the box drawn while it loads. */
export const CURRENT_CHART_HEIGHT = TOP_SPACE + CURRENT_PLOT_HEIGHT + X_AXIS_HEIGHT

export function CurrentChart({ data, conditions, axis, width, onSelect }: ChartProps) {
  const inDay = (time: Date) => time >= axis.dayStart && time <= axis.dayEnd
  const samples = data.current.samples.filter((s) => inDay(s.time))

  // Symmetric around zero so flood and ebb are drawn at the same scale, and always
  // tall enough to show the ±1 kt lines.
  const biggestSpeed = Math.max(STRONG_KT + 0.3, ...samples.map((s) => Math.abs(s.velocityKt)))
  const plotBottom = TOP_SPACE + CURRENT_PLOT_HEIGHT
  const y = linearScale(-biggestSpeed, biggestSpeed, plotBottom - BOTTOM_SPACE, TOP_SPACE).toPixel
  const zeroY = y(0)
  const height = plotBottom + X_AXIS_HEIGHT

  const line = samples.map((s) => `${axis.toX(s.time)},${y(s.velocityKt)}`).join(' L')
  const firstX = samples.length > 0 ? axis.toX(samples[0].time) : axis.left
  const lastX = samples.length > 0 ? axis.toX(samples[samples.length - 1].time) : axis.left
  const area = `M${line} L${lastX},${zeroY} L${firstX},${zeroY} Z`

  // Slack gets a ◆ but no label: the time slider above shows every slack time.
  // On a narrow chart (a phone) each peak shows only its speed.
  const compact = axis.right - axis.left < 420
  const events = data.current.events
  const slackDots: number[] = []
  const labels: Label[] = []
  events.forEach((e) => {
    if (!inDay(e.time)) return
    const x = axis.toX(e.time)
    if (e.kind === 'slack') {
      slackDots.push(x)
      return
    }
    const isFlood = e.kind === 'maxFlood'
    let text = `${e.speedKt.toFixed(1)} kt · ${formatTime(e.time)}`
    if (compact) text = `${e.speedKt.toFixed(1)} kt`
    const labelY = isFlood ? y(e.speedKt) - 8 : y(-e.speedKt) + 15
    labels.push(centeredLabel(x, labelY, text, axis))
  })

  const selected = conditions !== null && inDay(conditions.at) ? conditions : null

  return (
    <ChartFrame
      axis={axis}
      width={width}
      height={height}
      label="Current speed in knots through the day: flood above the line, ebb below"
      onSelect={onSelect}
    >
      {/* Y axis: FLOOD at the top, EBB at the bottom, numbers on the lines. */}
      <text x={axis.left - 8} y={TOP_SPACE + 4} textAnchor="end" className="chart__axis chart__axis--word">
        FLOOD
      </text>
      <text x={axis.left - 8} y={plotBottom - 4} textAnchor="end" className="chart__axis chart__axis--word">
        EBB
      </text>
      {[STRONG_KT, -STRONG_KT].map((kt) => (
        <g key={kt}>
          <line x1={axis.left} y1={y(kt)} x2={axis.right} y2={y(kt)} className="chart__threshold" />
          <text x={axis.left - 8} y={y(kt) + 3} textAnchor="end" className="chart__axis">
            1 kt
          </text>
        </g>
      ))}
      <text x={axis.left - 8} y={zeroY + 3} textAnchor="end" className="chart__axis">
        0
      </text>
      <HourAxis axis={axis} plotTop={TOP_SPACE} plotBottom={plotBottom} />
      <path d={area} className="chart__area" />
      <path d={`M${line}`} className="chart__line" />
      <line x1={axis.left} y1={zeroY} x2={axis.right} y2={zeroY} className="chart__zero" />
      {/* Slack: the same ◆ as on the time slider, on the zero line. */}
      {slackDots.map((x) => (
        <path
          key={x}
          d={`M${x},${zeroY - 5} L${x + 3.5},${zeroY} L${x},${zeroY + 5} L${x - 3.5},${zeroY} Z`}
          className="chart__slack"
        />
      ))}
      {labels.map((label) => (
        <text key={label.text} x={label.x} y={label.y} textAnchor={label.anchor} className="chart__label">
          {label.text}
        </text>
      ))}
      {selected !== null && (
        <NowMarker x={axis.toX(selected.at)} y={y(selected.current.velocityKt)} top={TOP_SPACE} bottom={plotBottom} />
      )}
    </ChartFrame>
  )
}

// ---------------------------------------------------------------- Shared pieces

type FrameProps = {
  axis: DayAxis
  width: number
  height: number
  label: string
  onSelect: (time: Date) => void
  children: ReactNode
}

/** The chart's SVG, which turns taps and drags into a selected time. */
export function ChartFrame({ axis, width, height, label, onSelect, children }: FrameProps) {
  // Tap, or press and drag. Pointer capture keeps the drag going outside the chart.
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    onSelect(axis.toTime(event.clientX - box.left))
  }
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pick(event)
  }
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event)
  }
  return (
    <svg
      className="chart"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label}. Tap or drag to choose a time.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      {children}
    </svg>
  )
}

/** Vertical gridlines every 6 hours, and the hour labels under the plot. */
export function HourAxis({ axis, plotTop, plotBottom }: { axis: DayAxis; plotTop: number; plotBottom: number }) {
  const labeled = axis.hourTicks.filter((tick) => tick.label !== null)
  return (
    <g>
      {labeled.map((tick, i) => {
        const x = axis.toX(tick.time)
        let anchor: 'start' | 'middle' | 'end' = 'middle'
        if (i === 0) anchor = 'start'
        if (i === labeled.length - 1) anchor = 'end'
        return (
          <g key={i}>
            <line x1={x} y1={plotTop} x2={x} y2={plotBottom} className="chart__grid" />
            <text x={x} y={plotBottom + 15} textAnchor={anchor} className="chart__axis">
              {tick.label}
            </text>
          </g>
        )
      })}
      <line x1={axis.left} y1={plotBottom} x2={axis.right} y2={plotBottom} className="chart__baseline" />
    </g>
  )
}

export function NowMarker({ x, y, top, bottom }: { x: number; y: number; top: number; bottom: number }) {
  return (
    <g className="chart__now">
      <line x1={x} y1={top - 6} x2={x} y2={bottom} />
      <circle cx={x} cy={y} r={4} />
    </g>
  )
}

/** An empty, gently pulsing box the size of a chart, shown while its data loads. */
export function ChartPlaceholder({ height }: { height: number }) {
  return <div className="chart-placeholder is-loading" style={{ height }} aria-label="Loading chart" />
}
