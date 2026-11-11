// Loads NOAA predictions for the San Francisco day containing the selected time.
//
// For a given day we fetch three days: the day before, the day itself and the day
// after. That way the full day's curve is available for the charts, and the
// previous/next high, low and slack are found even near midnight.
//
// Results are cached by day, so stepping hours within a day makes no requests, and
// going back to a day you've already seen is instant.
//
// The tide is moved from the Golden Gate to North Point, Pier 41 here (see
// domain/pier41Tide.ts). Both versions are returned so the debug view can show them
// side by side.

import { useEffect, useState } from 'react'
import { pier41Tide } from '../domain/pier41Tide'
import type { PredictionData } from '../domain/types'
import { fetchPredictions } from '../noaa/client'
import { addPacificDays, pacificDateString, startOfPacificDay } from '../time/pacific'

export type DayData = {
  noaa: PredictionData // as fetched: Golden Gate tide, Alcatraz SW current
  shown: PredictionData // what the app shows: Pier 41 tide, the same current
}

const cache = new Map<string, Promise<DayData>>()

function loadDay(day: Date): Promise<DayData> {
  const key = pacificDateString(day)
  const cached = cache.get(key)
  if (cached) return cached

  const dayStart = startOfPacificDay(day)
  const range = { start: addPacificDays(dayStart, -1), end: addPacificDays(dayStart, 2) }
  const request = fetchPredictions(range).then((noaa) => ({
    noaa,
    shown: { ...noaa, tide: pier41Tide(noaa.tide) },
  }))
  // Don't keep failures in the cache, so the next attempt tries again.
  request.catch(() => cache.delete(key))
  cache.set(key, request)
  return request
}

type Result = {
  data: DayData | null // null while loading
  error: string | null
}

export function usePredictions(time: Date): Result {
  const key = pacificDateString(time)
  const [loaded, setLoaded] = useState<{ key: string; data: DayData | null; error: string | null } | null>(null)

  useEffect(() => {
    // If the day changes before this request finishes, ignore its result.
    let ignore = false
    loadDay(time).then(
      (data) => {
        if (!ignore) setLoaded({ key, data, error: null })
      },
      (e: unknown) => {
        if (!ignore) setLoaded({ key, data: null, error: e instanceof Error ? e.message : String(e) })
      },
    )
    return () => {
      ignore = true
    }
    // Only refetch when the day changes, not on every minute or hour step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // What's loaded belongs to a different day: we're still loading this one.
  if (loaded === null || loaded.key !== key) return { data: null, error: null }
  return { data: loaded.data, error: loaded.error }
}
