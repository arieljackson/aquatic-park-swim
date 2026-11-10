// The only place that talks to NOAA. Everything returned from here is domain types.

import type { PredictionData, StationInfo, TimeRange } from '../domain/types'
import type { Weather } from '../weather/types'
import {
  parseAirTemps,
  parseCurrentDirections,
  parseCurrentEvents,
  parseCurrentSamples,
  parseTideEvents,
  parseTideSamples,
  parseWinds,
} from './parse'
import type { RawAirTempResponse, RawCurrentResponse, RawErrorResponse, RawTideResponse, RawWindResponse } from './raw'

const API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'

export const TIDE_STATION: StationInfo = { id: '9414290', name: 'San Francisco (Golden Gate)' }
export const CURRENT_STATION: StationInfo = { id: 'SFB1203', name: 'Golden Gate Bridge, 0.46 nm E' }

export class NoaaError extends Error {
  name = 'NoaaError'
}

/** Date → "yyyyMMdd HH:mm" in GMT, the format NOAA's begin_date/end_date expect. */
function formatGmt(d: Date): string {
  const twoDigits = (n: number) => String(n).padStart(2, '0') // 5 → "05"
  const year = d.getUTCFullYear()
  const month = twoDigits(d.getUTCMonth() + 1) // getUTCMonth counts from 0 (January = 0)
  const day = twoDigits(d.getUTCDate())
  const hour = twoDigits(d.getUTCHours())
  const minute = twoDigits(d.getUTCMinutes())
  return `${year}${month}${day} ${hour}:${minute}`
}

async function getJson<T>(params: Record<string, string>, range: TimeRange, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams({
    ...params,
    begin_date: formatGmt(range.start),
    end_date: formatGmt(range.end),
    time_zone: 'gmt',
    units: 'english',
    format: 'json',
    application: 'aquatic-park',
  })
  const res = await fetch(`${API}?${query}`, { signal })
  if (!res.ok) throw new NoaaError(`NOAA request failed: HTTP ${res.status}`)
  const body = (await res.json()) as T | RawErrorResponse
  if (body && typeof body === 'object' && 'error' in body) {
    throw new NoaaError(`NOAA: ${body.error.message.trim()}`)
  }
  return body as T
}

const tide = (interval: string) => ({
  product: 'predictions',
  station: TIDE_STATION.id,
  datum: 'MLLW',
  interval,
})

const current = (interval: string) => ({
  product: 'currents_predictions',
  station: CURRENT_STATION.id, // default bin (18, ~30 ft) — the one NOAA's tables use
  interval,
})

/** Fetch tide and current predictions (curves + events) for a time range. */
export async function fetchPredictions(range: TimeRange, signal?: AbortSignal): Promise<PredictionData> {
  const [tideCurve, tideEvents, currentCurve, currentEvents] = await Promise.all([
    getJson<RawTideResponse>(tide('6'), range, signal),
    getJson<RawTideResponse>(tide('hilo'), range, signal),
    getJson<RawCurrentResponse>(current('6'), range, signal),
    getJson<RawCurrentResponse>(current('MAX_SLACK'), range, signal),
  ])

  return {
    range,
    tide: {
      station: TIDE_STATION,
      samples: parseTideSamples(tideCurve),
      events: parseTideEvents(tideEvents),
    },
    current: {
      station: CURRENT_STATION,
      ...parseCurrentDirections(currentCurve),
      samples: parseCurrentSamples(currentCurve),
      events: parseCurrentEvents(currentEvents),
    },
  }
}

/**
 * Measured air temperature and wind at the Golden Gate station (9414290), hourly, for
 * a time range. Only the past has measurements: the range is cut off at now, and a
 * range with no measurements gives empty lists (NOAA answers those with an error).
 */
export async function fetchMeasuredWeather(range: TimeRange, signal?: AbortSignal): Promise<Weather> {
  const now = new Date()
  if (range.start >= now) return { airTemp: [], wind: [] }
  let end = range.end
  if (end > now) end = now
  const pastRange = { start: range.start, end }

  const measured = (product: string) => ({ product, station: TIDE_STATION.id, interval: 'h' })
  const [airTemp, wind] = await Promise.all([
    getJsonOrEmpty<RawAirTempResponse>(measured('air_temperature'), pastRange, { data: [] }, signal),
    getJsonOrEmpty<RawWindResponse>(measured('wind'), pastRange, { data: [] }, signal),
  ])
  return { airTemp: parseAirTemps(airTemp), wind: parseWinds(wind) }
}

/** Like getJson, but NOAA's "No data was found" gives `empty` instead of an error. */
async function getJsonOrEmpty<T>(
  params: Record<string, string>,
  range: TimeRange,
  empty: T,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await getJson<T>(params, range, signal)
  } catch (error) {
    if (error instanceof NoaaError && error.message.includes('No data was found')) return empty
    throw error
  }
}
