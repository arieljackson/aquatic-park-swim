// The selected day as a horizontal axis, shared by the chart and the time slider so
// their times line up exactly.
//
// A day is usually 24 hours, but 23 or 25 on DST days, so the axis is built from the
// actual start and end instants, and hour ticks from wall-clock hours.

import { formatHourLabel } from '../time/format'
import { addPacificDays, fromPacific, startOfPacificDay, toPacific } from '../time/pacific'

/** Room on the left for the charts' y-axis labels, in pixels. */
export const AXIS_LEFT = 44

/**
 * Empty space at the right end of the axis, in pixels. The slider's thumb is 2 × this
 * wide, so its center can reach the very end of the day.
 */
export const AXIS_INSET = 10

/**
 * The latest time you can pick is this many minutes before the next midnight (11:55 PM),
 * so picking never rolls over into the next day.
 */
export const LAST_PICKABLE_MINUTES = 5

export type DayAxis = {
  dayStart: Date
  dayEnd: Date
  /** x of midnight at the start and end of the day, in pixels */
  left: number
  right: number
  /** time → x in pixels */
  toX: (time: Date) => number
  /** x in pixels → time, clamped to the day: from midnight to LAST_PICKABLE_MINUTES before the next midnight */
  toTime: (x: number) => Date
  /** Every hour of the day, with a label on 12 AM, 6 AM, 12 PM, 6 PM and the closing 12 AM. */
  hourTicks: Array<{ time: Date; label: string | null }>
}

export function dayAxis(selected: Date, width: number): DayAxis {
  const dayStart = startOfPacificDay(selected)
  const dayEnd = addPacificDays(dayStart, 1)
  const startMs = dayStart.getTime()
  const lengthMs = dayEnd.getTime() - startMs
  const left = AXIS_LEFT
  const right = width - AXIS_INSET

  //   fraction = (time − dayStart) / dayLength      // 0 at midnight, 1 at the next midnight
  //   x        = left + fraction × (right − left)
  const toX = (time: Date) => {
    const fraction = (time.getTime() - startMs) / lengthMs
    return left + fraction * (right - left)
  }
  const latestMs = lengthMs - LAST_PICKABLE_MINUTES * 60 * 1000
  const toTime = (x: number) => {
    const fraction = (x - left) / (right - left)
    let offsetMs = fraction * lengthMs
    offsetMs = Math.min(Math.max(offsetMs, 0), latestMs)
    return new Date(startMs + offsetMs)
  }

  const startWall = toPacific(dayStart)
  const hourTicks: DayAxis['hourTicks'] = []
  for (let hour = 0; hour <= 24; hour++) {
    let time: Date
    if (hour === 24) {
      time = dayEnd
    } else {
      time = fromPacific({ ...startWall, hour, minute: 0 })
    }
    let label: string | null = null
    if (hour % 6 === 0) label = formatHourLabel(hour)
    hourTicks.push({ time, label })
  }

  return { dayStart, dayEnd, left, right, toX, toTime, hourTicks }
}
