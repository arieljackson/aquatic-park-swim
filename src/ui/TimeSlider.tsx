// The time slider under the chart, on the same time axis: hour ticks with labels,
// slack marked ◆ with its time, and the selected time in a bubble over the thumb.
//
// What you see is drawn in SVG. On top of it sits a real <input type="range">, made
// invisible, so dragging, tapping and the keyboard all work like a normal slider.
// Its thumb is 2 × AXIS_INSET wide, and the input starts AXIS_INSET before the
// axis's left end, so the thumb's center lands exactly where the SVG draws it.

import type { CurrentEvent } from '../domain/types'
import { slackKind } from '../domain/conditions'
import { formatTime } from '../time/format'
import { AXIS_INSET, LAST_PICKABLE_MINUTES } from './dayAxis'
import type { DayAxis } from './dayAxis'
import './slider.css'

const MINUTE = 60 * 1000
const STEP_MINUTES = 5

const HEIGHT = 72
const TRACK_Y = 42

type Props = {
  axis: DayAxis
  width: number
  time: Date
  currentEvents: CurrentEvent[]
  onSelect: (time: Date) => void
}

export function TimeSlider({ axis, width, time, currentEvents, onSelect }: Props) {
  const startMs = axis.dayStart.getTime()
  const dayMinutes = Math.round((axis.dayEnd.getTime() - startMs) / MINUTE)
  // Minutes since midnight:  minutes = (time − dayStart) / 1 minute
  const valueMinutes = Math.round((time.getTime() - startMs) / MINUTE)

  const thumbX = axis.toX(time)
  const timeText = formatTime(time)
  const bubbleWidth = 60
  // Keep the bubble on screen near the ends of the day.
  const bubbleX = Math.min(Math.max(thumbX - bubbleWidth / 2, axis.left - AXIS_INSET), width - bubbleWidth)

  const slacks = currentEvents
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.kind === 'slack' && event.time >= axis.dayStart && event.time <= axis.dayEnd)
    .map(({ event, index }) => ({ x: axis.toX(event.time), time: formatTime(event.time), kind: slackKind(currentEvents, index) }))

  return (
    <div className="slider">
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden="true">
        {/* Track: filled up to the selected time */}
        <rect x={axis.left} y={TRACK_Y - 2} width={axis.right - axis.left} height={4} rx={2} className="slider__track" />
        <rect x={axis.left} y={TRACK_Y - 2} width={Math.max(thumbX - axis.left, 0)} height={4} rx={2} className="slider__fill" />

        {/* Hour ticks; longer and labeled every 6 hours */}
        {axis.hourTicks.map((tick, hourIndex) => {
          const x = axis.toX(tick.time)
          const tickLength = tick.label === null ? 3 : 7
          // Keyed by position: on the spring DST day, 2 AM doesn't exist and lands on 3 AM.
          return <line key={hourIndex} x1={x} y1={TRACK_Y + 5} x2={x} y2={TRACK_Y + 5 + tickLength} className="slider__tick" />
        })}
        {axis.hourTicks.filter((tick) => tick.label !== null).map((tick, i, labeled) => {
          let anchor: 'start' | 'middle' | 'end' = 'middle'
          if (i === 0) anchor = 'start'
          if (i === labeled.length - 1) anchor = 'end'
          return (
            <text key={tick.time.getTime()} x={axis.toX(tick.time)} y={TRACK_Y + 26} textAnchor={anchor} className="slider__hour">
              {tick.label}
            </text>
          )
        })}

        {/* Slack: a diamond on the track with its time above */}
        {slacks.map((slack) => (
          <g key={slack.x}>
            <path
              d={`M${slack.x},${TRACK_Y - 5} L${slack.x + 3.5},${TRACK_Y} L${slack.x},${TRACK_Y + 5} L${slack.x - 3.5},${TRACK_Y} Z`}
              className="slider__slack"
            />
            <text x={slack.x} y={TRACK_Y - 10} textAnchor="middle" className="slider__slack-time">
              {slack.time}
            </text>
          </g>
        ))}

        {/* The selected time */}
        <rect x={bubbleX} y={0} width={bubbleWidth} height={17} rx={4} className="slider__bubble" />
        <text x={bubbleX + bubbleWidth / 2} y={12} textAnchor="middle" className="slider__bubble-text">
          {timeText}
        </text>
        <circle cx={thumbX} cy={TRACK_Y} r={8} className="slider__thumb" />
      </svg>

      <input
        type="range"
        className="slider__input"
        style={{ top: TRACK_Y - 22, left: axis.left - AXIS_INSET, width: width - (axis.left - AXIS_INSET) }}
        min={0}
        max={dayMinutes - LAST_PICKABLE_MINUTES} // 11:55 PM: never rolls into the next day
        step={STEP_MINUTES}
        value={valueMinutes}
        aria-label="Time of day, Pacific Time"
        aria-valuetext={timeText}
        onChange={(event) => onSelect(new Date(startMs + Number(event.target.value) * MINUTE))}
      />
    </div>
  )
}
