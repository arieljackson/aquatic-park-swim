// The tiles under the charts: air temperature, water temperature, wind and water
// quality, for the selected time. Like the tiles at the top, each always has the same lines, so it never
// changes shape: a label, the value, and a short line saying what kind of number it is
// (measured, forecast, model estimate). The caption names the sources and places.
//
// Sized for a 375px-wide phone, where each tile has about 133px for text: the longest
// value is "25 mph WSW" (unit and direction drawn small), the longest small line "Gusts 25 · measured".
// Water quality says "Meets standards" (green) or "Fails standards" (red): the same
// length, so the tile looks the same either way.

import { formatDay } from '../time/format'
import { fromPacific, pacificDateString, parseDateString } from '../time/pacific'
import { compassPoint, knotsToMph } from '../domain/units'
import { airTempAt, useWeather, windAt } from '../sources/useWeather'
import { checkLimits, useWaterQuality } from '../sources/waterQuality'
import { useWaterTemp, waterTempAt } from '../sources/waterTemp'

export function WeatherTiles({ time }: { time: Date }) {
  const water = useWaterTemp(time)
  const weather = useWeather(time)
  const quality = useWaterQuality(time)

  // Air: measured at the Golden Gate for the past and now, NWS forecast after that.
  let airText = '--°F'
  let airDetail = 'Not available'
  const air = airTempAt(weather, time)
  if (air !== null) {
    airText = `${Math.round(air.tempF)}°F`
    if (air.source === 'measured') airDetail = 'Measured'
    else airDetail = 'Forecast'
  } else if (weather.measured === null && weather.forecast === null) {
    airDetail = 'Loading…'
  }

  // Wind: same sources as air, shown in mph. Named by where it comes from ("SW" = from the southwest).
  let windSpeed = '--'
  let windDirection = ''
  let windDetail = 'Not available'
  const windNow = windAt(weather, time)
  if (windNow !== null) {
    const { wind } = windNow
    windSpeed = String(Math.round(knotsToMph(wind.speedKt)))
    windDirection = compassPoint(wind.fromDeg)
    if (windNow.source === 'measured') {
      if (wind.gustKt !== null) windDetail = `Gusts ${Math.round(knotsToMph(wind.gustKt))} · measured`
      else windDetail = 'Measured'
    } else {
      windDetail = 'Forecast' // the hourly forecast has no gusts
    }
  } else if (weather.measured === null && weather.forecast === null) {
    windDetail = 'Loading…'
  }

  // Water: NOAA's bay model, about a month back to about 2 days ahead.
  let waterText = '--°F'
  let waterDetail = 'Loading…'
  if (water.error !== null) {
    waterDetail = 'Not available'
  } else if (water.samples !== null) {
    const tempF = waterTempAt(water.samples, time)
    if (tempF !== null) {
      waterText = `${tempF.toFixed(1)}°F`
      waterDetail = 'Model estimate'
    } else {
      waterDetail = 'No model data' // too long ago, or too far ahead
    }
  }

  // Water quality: the latest weekly SFPUC sample on or before the selected day.
  let qualityText = '--'
  let qualityClass = ''
  let qualityDetail = 'Not available'
  if (quality.loading) {
    qualityDetail = 'Loading…'
  } else if (quality.sample !== null) {
    const sampleDay = quality.sample.date
    if (daysBetween(sampleDay, pacificDateString(time)) > MAX_SAMPLE_AGE_DAYS) {
      qualityDetail = 'No recent sample'
    } else {
      const check = checkLimits(quality.sample)
      const sampled = formatDateString(sampleDay)
      if (check.over) {
        qualityText = 'Fails standards'
        qualityClass = 'temp__value--fails'
        qualityDetail = `${check.name} ${check.count.text} · ${sampled}`
      } else {
        qualityText = 'Meets standards'
        qualityClass = 'temp__value--meets'
        qualityDetail = `Sampled ${sampled}`
      }
    }
  }

  return (
    <div className="temps">
      <section className="temp">
        <h2 className="label">Air temp</h2>
        <p className="temp__value mono">{airText}</p>
        <p className="temp__detail">{airDetail}</p>
      </section>
      <section className="temp">
        <h2 className="label">Water temp</h2>
        <p className="temp__value mono">{waterText}</p>
        <p className="temp__detail">{waterDetail}</p>
      </section>
      <section className="temp">
        <h2 className="label">Wind</h2>
        <p className="temp__value mono">
          {windSpeed}
          <span className="temp__unit"> mph {windDirection}</span>
        </p>
        <p className="temp__detail">{windDetail}</p>
      </section>
      <section className="temp">
        <h2 className="label">Water quality</h2>
        <p className={`temp__value temp__value--words ${qualityClass}`}>{qualityText}</p>
        <p className="temp__detail">{qualityDetail}</p>
        {/* The lab results don't include advisories (e.g. after sewer overflows): link to them. */}
        <a className="temp__link" href="https://webapps.sfpuc.org/sapps/beachesandbay.html">
          SFPUC advisories →
        </a>
      </section>
    </div>
  )
}

/** Samples are weekly; one older than this is too old to describe the selected day. */
const MAX_SAMPLE_AGE_DAYS = 14

/**
 * Whole days from one date to another, e.g. "2026-11-02" → "2026-11-10" = 8.
 *   days = (later date − earlier date) / 1 day, both read as midnight UTC
 * (Calendar dates, not instants: reading both the same way makes DST irrelevant.)
 */
function daysBetween(from: string, to: string): number {
  const DAY_MS = 24 * 60 * 60 * 1000
  const fromMs = Date.parse(`${from}T00:00:00Z`)
  const toMs = Date.parse(`${to}T00:00:00Z`)
  return Math.round((toMs - fromMs) / DAY_MS)
}

/** "2026-11-02" → "Mon, Nov 2" */
function formatDateString(date: string): string {
  const parts = parseDateString(date)
  if (parts === null) return date
  // Noon, so the date is the same however it's converted.
  return formatDay(fromPacific({ ...parts, hour: 12, minute: 0 }))
}
