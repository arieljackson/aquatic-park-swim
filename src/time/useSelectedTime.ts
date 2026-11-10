// The time the user is looking at.
//
// Two modes:
// - live:   follows the current time, updating every minute (the default)
// - pinned: a specific time the user stepped or picked; it stays put
//
// The pinned time is mirrored in the URL (?t=2026-11-06T14:30, San Francisco time)
// so a link opens at the same moment. No ?t= means live.

import { useEffect, useState } from 'react'
import { addPacificDays, formatUrlTime, fromPacific, parseDateString, parseUrlTime, toPacific } from './pacific'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const URL_UPDATE_DELAY_MS = 300

function readPinnedFromUrl(): Date | null {
  const t = new URLSearchParams(window.location.search).get('t')
  return t === null ? null : parseUrlTime(t)
}

export type SelectedTime = {
  time: Date
  isLive: boolean
  setTime: (time: Date) => void // pin to an exact time (e.g. from the slider or a chart)
  stepHours: (hours: number) => void
  stepDays: (days: number) => void
  setDate: (dateString: string) => void // "2026-11-06", keeps the time of day
  goLive: () => void
}

export function useSelectedTime(): SelectedTime {
  const [pinned, setPinned] = useState<Date | null>(readPinnedFromUrl)
  const [now, setNow] = useState(() => new Date())

  // While live, refresh "now" every minute.
  useEffect(() => {
    if (pinned !== null) return
    const timer = setInterval(() => setNow(new Date()), MINUTE)
    return () => clearInterval(timer)
  }, [pinned])

  // Keep the URL in sync. replaceState updates the address bar without adding
  // a browser history entry for every step.
  //
  // Browsers limit how often a page may call replaceState: Chrome throttles it, and
  // Safari throws an error after 100 calls in 30 seconds. Dragging the slider changes
  // the time many times a second, so we wait until the time has stayed put for
  // URL_UPDATE_DELAY_MS, and only then write the URL. Each new time cancels the
  // previous timer, so a fast drag ends in a single write.
  useEffect(() => {
    const timer = setTimeout(() => {
      const url = new URL(window.location.href)
      if (pinned === null) {
        url.searchParams.delete('t')
      } else {
        url.searchParams.set('t', formatUrlTime(pinned))
      }
      try {
        window.history.replaceState(null, '', url)
      } catch {
        // If the browser refuses anyway, the URL is just out of date; the page keeps working.
      }
    }, URL_UPDATE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [pinned])

  const time = pinned ?? now

  return {
    time,
    isLive: pinned === null,
    setTime: (newTime) => setPinned(newTime),
    stepHours: (hours) => setPinned(new Date(time.getTime() + hours * HOUR)),
    stepDays: (days) => setPinned(addPacificDays(time, days)),
    setDate: (dateString) => {
      const date = parseDateString(dateString)
      if (date === null) return
      const wall = toPacific(time)
      setPinned(fromPacific({ ...date, hour: wall.hour, minute: wall.minute }))
    },
    goLive: () => {
      setNow(new Date())
      setPinned(null)
    },
  }
}
