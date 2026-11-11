// Air temperature and wind for the selected time, from two sources:
//   - measured: NOAA's Golden Gate station (9414290), for the past and now
//   - forecast: the National Weather Service's hourly forecast, for the next ~7 days
// For any time, we use the measurement if there is one, otherwise the forecast.
//
// Measurements are loaded for the selected day ±1 day and cached, like the tide and
// current predictions. Today's are reloaded once an hour (Pacific), even if the page
// just sits open, since new readings keep arriving. The forecast is loaded once per visit.

import { useEffect, useState } from 'react'
import { interpolate } from '../domain/conditions'
import { fetchMeasuredWeather } from '../noaa/client'
import { addPacificDays, pacificDateString, startOfPacificDay, toPacific } from '../time/pacific'
import { fetchForecastWeather } from './nws'
import type { AirTempSample, Weather, WindSample } from '../domain/types'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

/** After the last measurement, keep showing it for this long before switching to the forecast. */
const MEASUREMENT_STAYS_VALID_MS = HOUR

export type WeatherSource = 'measured' | 'forecast'

// ------------------------------------------------------------------ Loading

const measuredCache = new Map<string, Promise<Weather>>()

/** How often the hook checks whether a new hour has started. */
const CLOCK_TICK_MS = 5 * MINUTE

/**
 * The cache key for a day's measurements: "2026-11-10" for a past or future day, and
 * "2026-11-10 14h" for today, so today's key changes every Pacific hour.
 */
function measuredKey(time: Date, now: Date): string {
  const day = pacificDateString(time)
  if (day !== pacificDateString(now)) return day
  return `${day} ${toPacific(now).hour}h`
}

function loadMeasured(time: Date, key: string): Promise<Weather> {
  const cached = measuredCache.get(key)
  if (cached) return cached
  const dayStart = startOfPacificDay(time)
  const range = { start: addPacificDays(dayStart, -1), end: addPacificDays(dayStart, 2) }
  const request = fetchMeasuredWeather(range)
  request.catch(() => measuredCache.delete(key)) // don't keep failures
  measuredCache.set(key, request)
  return request
}

let forecastRequest: Promise<Weather> | null = null

function loadForecast(): Promise<Weather> {
  if (forecastRequest === null) {
    forecastRequest = fetchForecastWeather()
    forecastRequest.catch(() => {
      forecastRequest = null // try again next time
    })
  }
  return forecastRequest
}

export type WeatherData = {
  measured: Weather | null // null while loading or if it failed
  forecast: Weather | null
}

export function useWeather(time: Date): WeatherData {
  const day = pacificDateString(time)
  const [measured, setMeasured] = useState<{ day: string; weather: Weather | null } | null>(null)
  const [forecast, setForecast] = useState<Weather | null>(null)

  // The clock, updated every few minutes, so today's key moves on to the next hour even
  // when nothing else on the page changes.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS)
    return () => clearInterval(timer)
  }, [])
  const key = measuredKey(time, now)

  useEffect(() => {
    let ignore = false
    loadMeasured(time, key).then(
      (weather) => {
        if (!ignore) setMeasured({ day, weather })
      },
      () => {
        if (!ignore) setMeasured({ day, weather: null })
      },
    )
    return () => {
      ignore = true
    }
    // Reload when the key changes: a new day, or a new hour for today. Not on every
    // minute or hour step within a past or future day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    let ignore = false
    loadForecast().then(
      (weather) => {
        if (!ignore) setForecast(weather)
      },
      () => {
        if (!ignore) setForecast(null)
      },
    )
    return () => {
      ignore = true
    }
  }, [])

  let measuredForDay: Weather | null = null
  if (measured !== null && measured.day === day) measuredForDay = measured.weather
  return { measured: measuredForDay, forecast }
}

// ------------------------------------------------------------------ Picking a value

/** The air temperature at `time`, and where it came from; null if neither source covers it. */
export function airTempAt(data: WeatherData, time: Date): { tempF: number; source: WeatherSource } | null {
  if (data.measured !== null) {
    const tempF = measuredValueAt(data.measured.airTemp, time, (sample) => sample.tempF)
    if (tempF !== null) return { tempF, source: 'measured' }
  }
  if (data.forecast !== null) {
    const hour = forecastHourAt(data.forecast.airTemp, time)
    if (hour !== null) return { tempF: hour.tempF, source: 'forecast' }
  }
  return null
}

/** The wind at `time`, and where it came from; null if neither source covers it. */
export function windAt(data: WeatherData, time: Date): { wind: WindSample; source: WeatherSource } | null {
  if (data.measured !== null) {
    const nearest = nearestMeasured(data.measured.wind, time)
    if (nearest !== null) return { wind: nearest, source: 'measured' }
  }
  if (data.forecast !== null) {
    const hour = forecastHourAt(data.forecast.wind, time)
    if (hour !== null) return { wind: hour, source: 'forecast' }
  }
  return null
}

/**
 * A measured value at `time`: between the two hourly readings around it, or the last
 * reading if `time` is less than an hour after it. Null if there's no reading close by.
 */
function measuredValueAt<T extends { time: Date }>(samples: T[], time: Date, valueOf: (sample: T) => number): number | null {
  const between = interpolate(samples, time.getTime(), valueOf)
  if (between !== null) return between
  const last = samples.at(-1)
  if (last === undefined) return null
  const sinceLast = time.getTime() - last.time.getTime()
  if (sinceLast >= 0 && sinceLast < MEASUREMENT_STAYS_VALID_MS) return valueOf(last)
  return null
}

/**
 * The measured wind reading closest to `time`, if it's within an hour. Wind isn't
 * averaged between readings: averaging directions (e.g. 350° and 10°) goes wrong.
 */
function nearestMeasured(samples: WindSample[], time: Date): WindSample | null {
  let best: WindSample | null = null
  let bestGap = Infinity
  for (const sample of samples) {
    const gap = Math.abs(sample.time.getTime() - time.getTime())
    if (gap < bestGap) {
      best = sample
      bestGap = gap
    }
  }
  if (best === null || bestGap > MEASUREMENT_STAYS_VALID_MS) return null
  return best
}

/** The forecast hour containing `time` (each forecast value covers one hour from its start). */
function forecastHourAt<T extends AirTempSample | WindSample>(hours: T[], time: Date): T | null {
  for (const hour of hours) {
    const start = hour.time.getTime()
    if (time.getTime() >= start && time.getTime() < start + HOUR) return hour
  }
  return null
}
