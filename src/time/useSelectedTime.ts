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
  useEffect(() => {
    const url = new URL(window.location.href)
    if (pinned === null) {
      url.searchParams.delete('t')
    } else {
      url.searchParams.set('t', formatUrlTime(pinned))
    }
    window.history.replaceState(null, '', url)
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
