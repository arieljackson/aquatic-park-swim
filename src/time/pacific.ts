// Converting between absolute times (Date) and San Francisco wall-clock times.
//
// A Date is an instant ("this exact moment"). A wall time is what a clock in
// San Francisco shows at that instant ("Nov 6, 2:30 PM"). The difference between
// the two changes twice a year (PST = UTC−8, PDT = UTC−7), so we always convert
// with the browser's time zone database instead of hard-coding an offset.

import { TIME_ZONE } from './zone'

export type WallTime = {
  year: number
  month: number // 1–12 (not 0–11 like JavaScript's Date)
  day: number
  hour: number // 0–23
  minute: number
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23', // 0–23 instead of AM/PM
})

/** What a San Francisco clock shows at `date`. */
export function toPacific(date: Date): WallTime {
  const parts = partsFormatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find((p) => p.type === type)
    if (!part) throw new Error(`Missing ${type} in formatted date`)
    return Number(part.value)
  }
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

/** Pacific's offset from UTC at `instant`, in milliseconds (e.g. −8 hours during PST). */
function pacificOffsetMs(instant: number): number {
  // Read the Pacific wall time at this instant, then treat that reading as if it were UTC.
  // The gap between the two is the offset:
  //   offset = (Pacific wall time read as UTC) − instant
  const wall = toPacific(new Date(instant))
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)
  // The wall time has no seconds, so drop the instant's seconds too before comparing.
  const MINUTE = 60_000
  const instantToTheMinute = Math.floor(instant / MINUTE) * MINUTE
  return wallAsUtc - instantToTheMinute
}

/**
 * The instant when a San Francisco clock shows `wall`.
 *
 * Date.UTC also accepts out-of-range values and rolls them over
 * (day 32 → the 1st of next month), so callers can add days freely.
 */
export function fromPacific(wall: WallTime): Date {
  // Start by pretending the wall time is UTC, then correct by Pacific's offset:
  //   instant = (wall time read as UTC) − offset
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)
  const firstGuessOffset = pacificOffsetMs(wallAsUtc)
  let instant = wallAsUtc - firstGuessOffset

  // The first guess used the offset at the wrong instant. Near a DST change those can
  // differ, so check the offset at our answer and correct once if needed.
  const actualOffset = pacificOffsetMs(instant)
  if (actualOffset !== firstGuessOffset) {
    instant = wallAsUtc - actualOffset
  }
  return new Date(instant)
}

/** Midnight in San Francisco on the day containing `date`. */
export function startOfPacificDay(date: Date): Date {
  const wall = toPacific(date)
  return fromPacific({ ...wall, hour: 0, minute: 0 })
}

/**
 * The same San Francisco clock time, `days` days later (or earlier if negative).
 * Not the same as adding 24 hours: across a DST change, a day is 23 or 25 hours.
 */
export function addPacificDays(date: Date, days: number): Date {
  const wall = toPacific(date)
  return fromPacific({ ...wall, day: wall.day + days })
}

const twoDigits = (n: number) => String(n).padStart(2, '0') // 5 → "05"

/** "2026-11-06" — the San Francisco date of `date`. Also the format <input type="date"> uses. */
export function pacificDateString(date: Date): string {
  const wall = toPacific(date)
  return `${wall.year}-${twoDigits(wall.month)}-${twoDigits(wall.day)}`
}

/** "2026-11-06T14:30" — San Francisco wall time, used in the URL (?t=…). */
export function formatUrlTime(date: Date): string {
  const wall = toPacific(date)
  return `${pacificDateString(date)}T${twoDigits(wall.hour)}:${twoDigits(wall.minute)}`
}

/** Parses "2026-11-06T14:30" (San Francisco wall time). Returns null if it isn't in that format. */
export function parseUrlTime(s: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s)
  if (!match) return null
  return fromPacific({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  })
}

/** Parses "2026-11-06" (from <input type="date">) into its parts. Returns null if invalid. */
export function parseDateString(s: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}
