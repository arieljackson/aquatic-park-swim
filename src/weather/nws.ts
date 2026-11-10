// The National Weather Service's hourly forecast for the cove, about 7 days ahead.
// https://www.weather.gov/documentation/services-web-api
//
// NWS forecasts on a grid of 2.5 km squares. Aquatic Park is in square 85,107 of the
// San Francisco Bay Area office (MTR): that's what api.weather.gov/points/37.807,-122.423
// returns. Free, no key, and it allows browser requests.

import type { Weather, WindSample } from './types'

const HOURLY_FORECAST_URL = 'https://api.weather.gov/gridpoints/MTR/85,107/forecast/hourly'

/** One hour of the forecast, as NWS sends it (only the fields we use). */
type RawPeriod = {
  startTime: string // e.g. "2026-11-10T14:00:00-08:00"
  temperature: number
  temperatureUnit: string // "F"
  windSpeed: string // e.g. "7 mph"
  windDirection: string // e.g. "WNW"
}

type RawForecast = { properties: { periods: RawPeriod[] } }

/** 1 mph = 0.868976 knots */
const KNOTS_PER_MPH = 0.868976

/** Compass points in order, clockwise from north, 22.5° apart. */
const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

export async function fetchForecastWeather(signal?: AbortSignal): Promise<Weather> {
  const response = await fetch(HOURLY_FORECAST_URL, { signal })
  if (!response.ok) throw new Error(`Weather forecast: HTTP ${response.status}`)
  const body = (await response.json()) as RawForecast

  const weather: Weather = { airTemp: [], wind: [] }
  for (const period of body.properties.periods) {
    const time = new Date(period.startTime)
    if (period.temperatureUnit === 'F') {
      weather.airTemp.push({ time, tempF: period.temperature })
    }
    const wind = parseWind(time, period.windSpeed, period.windDirection)
    if (wind !== null) weather.wind.push(wind)
  }
  return weather
}

/** "7 mph" and "WNW" → knots and degrees. Null if either isn't in the expected form. */
function parseWind(time: Date, speedText: string, directionText: string): WindSample | null {
  const match = /^(\d+) mph$/.exec(speedText)
  // Compass point → degrees:  degrees = position in the list × 22.5  (N = 0, E = 90, W = 270)
  const compassIndex = COMPASS_POINTS.indexOf(directionText)
  if (match === null || compassIndex === -1) return null
  // mph → knots:  knots = mph × 0.868976
  const speedKt = Number(match[1]) * KNOTS_PER_MPH
  return { time, speedKt, gustKt: null, fromDeg: compassIndex * 22.5 }
}
