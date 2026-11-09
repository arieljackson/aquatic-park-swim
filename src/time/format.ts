// Display formatting. All times are shown in San Francisco local time.

import { addPacificDays, pacificDateString } from './pacific'
import { TIME_ZONE } from './zone'

const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' })
const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

export const formatTime = (d: Date) => timeFmt.format(d)
export const formatDateTime = (d: Date) => dateTimeFmt.format(d)

/**
 * Time until an event, written "h:mm": 1 hour 39 minutes → "1:39", 7 minutes → "0:07".
 * Rounds to the nearest minute.
 */
export function formatCountdown(from: Date, to: Date): string {
  const totalMinutes = Math.round((to.getTime() - from.getTime()) / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes - hours * 60
  return `${hours}:${String(minutes).padStart(2, '0')}`
}

const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'long' })

/** "today", "tomorrow", or the weekday ("Tuesday"), for `date` as seen from `reference`'s day. */
export function formatRelativeDay(date: Date, reference: Date): string {
  const day = pacificDateString(date)
  if (day === pacificDateString(reference)) return 'today'
  if (day === pacificDateString(addPacificDays(reference, 1))) return 'tomorrow'
  return weekdayFmt.format(date)
}

const clockPartsFmt = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' })

/** "10:59 AM" split in two, so the "AM" can be drawn smaller: { clock: "10:59", period: "AM" }. */
export function formatTimeParts(d: Date): { clock: string; period: string } {
  const parts = clockPartsFmt.formatToParts(d)
  const hour = parts.find((p) => p.type === 'hour')?.value ?? ''
  const minute = parts.find((p) => p.type === 'minute')?.value ?? ''
  const period = parts.find((p) => p.type === 'dayPeriod')?.value ?? ''
  return { clock: `${hour}:${minute}`, period }
}

const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric' })

/** "Sun, Nov 8" */
export const formatDay = (d: Date) => dayFmt.format(d)

/** Hour label for axis ticks: 0 → "12 AM", 6 → "6 AM", 12 → "12 PM", 18 → "6 PM". */
export function formatHourLabel(hour: number): string {
  let period = 'AM'
  if (hour >= 12 && hour < 24) period = 'PM'
  // 24-hour → 12-hour: 0 → 12, 13 → 1, 12 → 12, 24 → 12
  let hour12 = hour % 12
  if (hour12 === 0) hour12 = 12
  return `${hour12} ${period}`
}
