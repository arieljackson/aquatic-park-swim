// Raw NOAA JSON → domain types. Assumes responses were requested with time_zone=gmt.

import type { CurrentEvent, CurrentSample, TideEvent, TideSample } from '../domain/types'
import type { AirTempSample, WindSample } from '../domain/types'
import type { RawAirTempResponse, RawCurrentResponse, RawTideResponse, RawWindResponse } from './raw'

/** "2026-11-06 05:03" (GMT) → Date */
export function parseGmt(s: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s)
  if (!match) throw new Error(`Unexpected NOAA time format: "${s}"`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  // Date.UTC counts months from 0 (January = 0), so subtract 1.
  return new Date(Date.UTC(year, month - 1, day, hour, minute))
}

function toNumber(v: string | number, what: string): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) throw new Error(`Unexpected NOAA ${what}: "${v}"`)
  return n
}

export function parseTideSamples(raw: RawTideResponse): TideSample[] {
  return raw.predictions.map((p) => ({
    time: parseGmt(p.t),
    heightFt: toNumber(p.v, 'tide height'),
  }))
}

export function parseTideEvents(raw: RawTideResponse): TideEvent[] {
  return raw.predictions.map((p) => {
    if (p.type !== 'H' && p.type !== 'L') throw new Error(`Unexpected tide event type: "${p.type}"`)
    return {
      time: parseGmt(p.t),
      heightFt: toNumber(p.v, 'tide height'),
      kind: p.type === 'H' ? 'high' : 'low',
    }
  })
}

export function parseCurrentSamples(raw: RawCurrentResponse): CurrentSample[] {
  return raw.current_predictions.cp.map((c) => ({
    time: parseGmt(c.Time),
    velocityKt: toNumber(c.Velocity_Major, 'current velocity'),
  }))
}

const CURRENT_EVENT_KIND = { slack: 'slack', flood: 'maxFlood', ebb: 'maxEbb' } as const

export function parseCurrentEvents(raw: RawCurrentResponse): CurrentEvent[] {
  return raw.current_predictions.cp.map((c) => {
    if (!c.Type || !(c.Type in CURRENT_EVENT_KIND)) {
      throw new Error(`Unexpected current event type: "${c.Type}"`)
    }
    return {
      time: parseGmt(c.Time),
      kind: CURRENT_EVENT_KIND[c.Type],
      speedKt: Math.abs(toNumber(c.Velocity_Major, 'current velocity')),
    }
  })
}

/** Measured air temperature. Missing readings ("") are skipped. */
export function parseAirTemps(raw: RawAirTempResponse): AirTempSample[] {
  const samples: AirTempSample[] = []
  for (const reading of raw.data) {
    if (reading.v === '') continue
    samples.push({ time: parseGmt(reading.t), tempF: toNumber(reading.v, 'air temperature') })
  }
  return samples
}

/** Measured wind. Readings missing a speed or direction are skipped; a missing gust becomes null. */
export function parseWinds(raw: RawWindResponse): WindSample[] {
  const samples: WindSample[] = []
  for (const reading of raw.data) {
    if (reading.s === '' || reading.d === '') continue
    let gustKt: number | null = null
    if (reading.g !== '') gustKt = toNumber(reading.g, 'wind gust')
    samples.push({
      time: parseGmt(reading.t),
      speedKt: toNumber(reading.s, 'wind speed'),
      gustKt,
      fromDeg: toNumber(reading.d, 'wind direction'),
    })
  }
  return samples
}
