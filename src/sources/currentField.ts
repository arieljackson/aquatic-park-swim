// The bay model's surface current around the cove, from our own /api/currents (see
// api/currents.ts): NOAA's SFBOFS model, hourly, on its mesh. It covers about the last
// month, up to about 2 days ahead.
//
// Loaded for the selected San Francisco day and cached by day, like the water
// temperature. Today's is reloaded once an hour while the page is open (see
// refreshKey.ts): each new model run turns forecast hours into nowcast hours.

import { useEffect, useState } from 'react'
import type { CurrentField } from '../domain/currentField'
import { useClock } from '../time/useClock'
import { dayOfKey, dayRefreshKey } from './refreshKey'

/** The JSON from /api/currents (times as text, points as [longitude, latitude]). */
type CurrentsResponse = {
  points: Array<[number, number]>
  hours: Array<{ time: string; kind: 'nowcast' | 'forecast'; east: number[]; north: number[] }>
}

async function fetchCurrentField(day: string): Promise<CurrentField> {
  const response = await fetch(`/api/currents?day=${day}`)
  // 400 = a day outside what NOAA can have (over ~40 days ago or 3+ days ahead): no data.
  if (response.status === 400) return { points: [], hours: [] }
  if (!response.ok) throw new Error(`Currents: ${response.status}`)
  const body = (await response.json()) as CurrentsResponse
  return {
    points: body.points.map(([lon, lat]) => ({ lat, lon })),
    hours: body.hours.map((hour) => ({ time: new Date(hour.time), kind: hour.kind, east: hour.east, north: hour.north })),
  }
}

const cache = new Map<string, Promise<CurrentField>>()

function loadDay(key: string): Promise<CurrentField> {
  const cached = cache.get(key)
  if (cached) return cached
  const request = fetchCurrentField(dayOfKey(key))
  request.catch(() => cache.delete(key)) // don't keep failures
  cache.set(key, request)
  return request
}

type Result = {
  field: CurrentField | null // null while loading, or if it failed
  error: string | null
}

export function useCurrentField(time: Date): Result {
  const now = useClock()
  const key = dayRefreshKey(time, now)
  const day = dayOfKey(key)
  const [loaded, setLoaded] = useState<{ day: string; field: CurrentField | null; error: string | null } | null>(null)

  useEffect(() => {
    let ignore = false
    loadDay(key).then(
      (field) => {
        if (!ignore) setLoaded({ day, field, error: null })
      },
      (e: unknown) => {
        if (ignore) return
        const error = e instanceof Error ? e.message : String(e)
        // A failed hourly reload keeps what's already shown for this day.
        setLoaded((previous) => {
          if (previous !== null && previous.day === day && previous.field !== null) return previous
          return { day, field: null, error }
        })
      },
    )
    return () => {
      ignore = true
    }
    // Reload when the key changes: a new day, or a new hour for today.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (loaded === null || loaded.day !== day) return { field: null, error: null }
  return { field: loaded.field, error: loaded.error }
}
