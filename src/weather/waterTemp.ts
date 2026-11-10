// Water temperature near the cove, from our own /api/water-temp (see api/water-temp.ts):
// NOAA's bay model (SFBOFS) at North Point, Pier 41, surface, hourly. A model estimate:
// no sensor measures the cove. It covers about the last month, up to about 2 days ahead.
//
// Loaded for the selected San Francisco day and cached by day, like the predictions.

import { useEffect, useState } from 'react'
import { interpolate } from '../domain/conditions'
import { addPacificDays, pacificDateString, startOfPacificDay } from '../time/pacific'

const HOUR_MS = 60 * 60 * 1000

export type WaterTempSample = { time: Date; tempF: number; kind: 'nowcast' | 'forecast' }

/** The JSON from /api/water-temp (times as text). */
type WaterTempResponse = {
  samples: Array<{ time: string; tempF: number; kind: 'nowcast' | 'forecast' }>
}

/**
 * The day containing `day`, plus an hour on each side, so times just after midnight
 * and just before the next one still have a value on each side to interpolate between.
 */
async function fetchWaterTemp(day: Date): Promise<WaterTempSample[]> {
  const from = new Date(startOfPacificDay(day).getTime() - HOUR_MS)
  const to = new Date(addPacificDays(startOfPacificDay(day), 1).getTime() + HOUR_MS)
  const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
  const response = await fetch(`/api/water-temp?${query}`)
  if (!response.ok) throw new Error(`Water temperature: ${response.status}`)
  const body = (await response.json()) as WaterTempResponse
  return body.samples.map((sample) => ({ time: new Date(sample.time), tempF: sample.tempF, kind: sample.kind }))
}

const cache = new Map<string, Promise<WaterTempSample[]>>()

function loadDay(time: Date, key: string): Promise<WaterTempSample[]> {
  const cached = cache.get(key)
  if (cached) return cached
  const request = fetchWaterTemp(time)
  request.catch(() => cache.delete(key)) // don't keep failures
  cache.set(key, request)
  return request
}

type Result = {
  samples: WaterTempSample[] | null // null while loading, or if it failed
  error: string | null
}

export function useWaterTemp(time: Date): Result {
  const key = pacificDateString(time)
  const [loaded, setLoaded] = useState<{ key: string; samples: WaterTempSample[] | null; error: string | null } | null>(
    null,
  )

  useEffect(() => {
    let ignore = false
    loadDay(time, key).then(
      (samples) => {
        if (!ignore) setLoaded({ key, samples, error: null })
      },
      (e: unknown) => {
        if (!ignore) setLoaded({ key, samples: null, error: e instanceof Error ? e.message : String(e) })
      },
    )
    return () => {
      ignore = true
    }
    // Only reload when the day changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (loaded === null || loaded.key !== key) return { samples: null, error: null }
  return { samples: loaded.samples, error: loaded.error }
}

/**
 * The water temperature at `time`, between the two hourly values around it, or null
 * if `time` is outside what the model covers (over ~a month ago, or ~2 days ahead).
 */
export function waterTempAt(samples: WaterTempSample[], time: Date): number | null {
  return interpolate(samples, time.getTime(), (sample) => sample.tempF)
}
