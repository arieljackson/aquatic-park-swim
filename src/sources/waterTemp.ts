// Water temperature near the cove, from our own /api/water-temp (see api/water-temp.ts):
// NOAA's bay model (SFBOFS) at North Point, Pier 41, surface, hourly. A model estimate:
// no sensor measures the cove. It covers about the last month, up to about 2 days ahead.
//
// Loaded for the selected San Francisco day and cached by day, like the predictions.

import { useEffect, useState } from 'react'
import { interpolate } from '../domain/conditions'
import { pacificDateString } from '../time/pacific'

export type WaterTempSample = { time: Date; tempF: number; kind: 'nowcast' | 'forecast' }

/** The JSON from /api/water-temp (times as text). */
type WaterTempResponse = {
  samples: Array<{ time: string; tempF: number; kind: 'nowcast' | 'forecast' }>
}

/**
 * A San Francisco day ("2026-11-08"). The function adds an hour on each side, so times
 * just after midnight and just before the next one can be interpolated too.
 */
async function fetchWaterTemp(day: string): Promise<WaterTempSample[]> {
  const response = await fetch(`/api/water-temp?day=${day}`)
  // 400 = a day outside what NOAA can have (over ~40 days ago or 3+ days ahead): no data.
  if (response.status === 400) return []
  if (!response.ok) throw new Error(`Water temperature: ${response.status}`)
  const body = (await response.json()) as WaterTempResponse
  return body.samples.map((sample) => ({ time: new Date(sample.time), tempF: sample.tempF, kind: sample.kind }))
}

const cache = new Map<string, Promise<WaterTempSample[]>>()

function loadDay(key: string): Promise<WaterTempSample[]> {
  const cached = cache.get(key)
  if (cached) return cached
  const request = fetchWaterTemp(key)
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
    loadDay(key).then(
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
