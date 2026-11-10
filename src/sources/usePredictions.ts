// Loads NOAA predictions for the San Francisco day containing the selected time.
//
// For a given day we fetch three days: the day before, the day itself and the day
// after. That way the full day's curve is available (for the chart in M3), and the
// previous/next high, low and slack are found even near midnight.
//
// Results are cached by day, so stepping hours within a day makes no requests, and
// going back to a day you've already seen is instant.
//
// NOAA's Golden Gate data is corrected for Aquatic Park here (see
// domain/corrections.ts). Both versions are returned so the debug view can show
// them side by side.

import { useEffect, useState } from 'react'
import { correctForAquaticPark } from '../domain/corrections'
import type { PredictionData } from '../domain/types'
import { fetchPredictions } from '../noaa/client'
import { addPacificDays, pacificDateString, startOfPacificDay } from '../time/pacific'

export type DayData = {
  goldenGate: PredictionData // as NOAA predicts it for the Golden Gate
  aquaticPark: PredictionData // corrected: what the app shows
}

const cache = new Map<string, Promise<DayData>>()

function loadDay(day: Date): Promise<DayData> {
  const key = pacificDateString(day)
  const cached = cache.get(key)
  if (cached) return cached

  const dayStart = startOfPacificDay(day)
  const range = { start: addPacificDays(dayStart, -1), end: addPacificDays(dayStart, 2) }
  const request = fetchPredictions(range).then((goldenGate) => ({
    goldenGate,
    aquaticPark: correctForAquaticPark(goldenGate),
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
