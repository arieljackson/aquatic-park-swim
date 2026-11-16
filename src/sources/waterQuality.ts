// Water quality at Aquatic Park: the San Francisco Public Utilities Commission's weekly
// bacteria samples, from SF's open data portal (dataset v3fv-x3ux). Free, no key, and
// it allows browser requests. Aquatic Park is sampling station BAY#211_SL.
//
// Each sample is tested for three kinds of bacteria. We compare them with California's
// single-sample limits for beaches (AB 411), all per 100 mL:
//   enterococcus     104
//   fecal coliform   400
//   total coliform   10,000, or 1,000 when fecal coliform is more than a tenth of it
// A sample over any of these is "over the limit". Results are published about a week
// after sampling, and they don't include SFPUC's advisories (e.g. after sewer overflows).
//
// The other San Francisco stations (bay shore BAY#… and ocean beaches OCEAN#…) are loaded
// too. Aquatic Park isn't always sampled when the others are: after rain, sites that fail
// are re-sampled within days while Aquatic Park may still show last week's result. So the
// tile also looks at each other station's newest sample from the last week (see
// otherSitesCheck).

import { useEffect, useState } from 'react'
import { pacificDateString } from '../time/pacific'

const DATASET_URL = 'https://data.sf.gov/resource/v3fv-x3ux.json'
const STATION = 'BAY#211_SL'

export const ENTEROCOCCUS_LIMIT = 104
export const FECAL_COLIFORM_LIMIT = 400
export const TOTAL_COLIFORM_LIMIT = 10_000
export const TOTAL_COLIFORM_LIMIT_WHEN_MOSTLY_FECAL = 1_000

/**
 * A result like "55"; "<10" when there was too little to measure; ">24196" when there was
 * more than the test can count (so at least that many).
 */
export type BacteriaCount = { value: number; belowDetection: boolean; text: string }

export type WaterQualitySample = {
  /** The day it was sampled, e.g. "2026-11-02" (a San Francisco date). */
  date: string
  enterococcus: BacteriaCount | null
  fecalColiform: BacteriaCount | null
  totalColiform: BacteriaCount | null
}

export type LimitCheck =
  | { over: false }
  | { over: true; name: string; count: BacteriaCount } // the first count found over its limit

/** One row of the dataset (only the fields we use). */
type RawRow = {
  source: string // the station, e.g. "BAY#211_SL"
  sample_date: string // "2026-11-02T00:00:00.000"
  analyte: string // "ENTERO", "COLI_FECAL", "COLI_TOTAL" (also "COLI_E", not used)
  data: string // "55" or "<10"
}

/** The latest sample on or before `day` ("2026-11-10"), or null if there's none. */
async function fetchLatestSample(day: string): Promise<WaterQualitySample | null> {
  const query = new URLSearchParams({
    $where: `source = '${STATION}' AND sample_date <= '${day}T23:59:59'`,
    $order: 'sample_date DESC',
    $limit: '12', // a few samples' worth of rows; we keep the newest date's
  })
  const response = await fetch(`${DATASET_URL}?${query}`)
  if (!response.ok) throw new Error(`Water quality: HTTP ${response.status}`)
  const rows = (await response.json()) as RawRow[]
  if (rows.length === 0) return null

  const newestDate = rows[0].sample_date.slice(0, 10) // "2026-11-02T00:00:00.000" → "2026-11-02"
  return sampleFromRows(newestDate, rows)
}

/** The sample taken on `date` from these rows (one row per kind of bacteria). */
function sampleFromRows(date: string, rows: RawRow[]): WaterQualitySample {
  const sample: WaterQualitySample = { date, enterococcus: null, fecalColiform: null, totalColiform: null }
  for (const row of rows) {
    if (row.sample_date.slice(0, 10) !== date) continue
    if (row.analyte === 'ENTERO') sample.enterococcus = parseCount(row.data)
    if (row.analyte === 'COLI_FECAL') sample.fecalColiform = parseCount(row.data)
    if (row.analyte === 'COLI_TOTAL') sample.totalColiform = parseCount(row.data)
  }
  return sample
}

/** How many days before the selected day the other stations' samples still count. */
export const OTHER_SITES_WINDOW_DAYS = 7

/** One other station's newest sample. */
export type SiteSample = { station: string; sample: WaterQualitySample }

/**
 * Each other station's newest sample from the OTHER_SITES_WINDOW_DAYS days up to `day`
 * (stations with none are left out). Days are compared as text, which works for
 * "YYYY-MM-DD".
 */
async function fetchOtherSites(day: string): Promise<SiteSample[]> {
  const from = shiftDay(day, -OTHER_SITES_WINDOW_DAYS)
  const query = new URLSearchParams({
    $select: 'source, sample_date, analyte, data',
    $where: `source != '${STATION}' AND sample_date >= '${from}' AND sample_date <= '${day}T23:59:59'`,
    $order: 'sample_date DESC',
    $limit: '2000', // about 20 stations × 4 rows a sample × a few samples
  })
  const response = await fetch(`${DATASET_URL}?${query}`)
  if (!response.ok) throw new Error(`Water quality: HTTP ${response.status}`)
  const rows = (await response.json()) as RawRow[]

  // Rows come newest first, so the first date seen for a station is its newest sample.
  const newestByStation = new Map<string, string>()
  for (const row of rows) {
    if (!newestByStation.has(row.source)) newestByStation.set(row.source, row.sample_date.slice(0, 10))
  }
  const samples: SiteSample[] = []
  for (const [station, date] of newestByStation) {
    const stationRows = rows.filter((row) => row.source === station)
    samples.push({ station, sample: sampleFromRows(date, stationRows) })
  }
  return samples
}

/** "2026-11-10" moved by a whole number of days, e.g. −7 → "2026-11-03". */
function shiftDay(day: string, days: number): string {
  // Noon UTC, so adding whole days never crosses into another date.
  const DAY_MS = 24 * 60 * 60 * 1000
  const noon = Date.parse(`${day}T12:00:00Z`) + days * DAY_MS
  return new Date(noon).toISOString().slice(0, 10)
}

/** "55" → 55; "<10" → 10, marked as below what the lab can detect; ">24196" → 24196. */
function parseCount(text: string): BacteriaCount | null {
  const belowDetection = text.startsWith('<')
  let digits = text
  if (belowDetection || text.startsWith('>')) digits = text.slice(1)
  const value = Number(digits)
  if (digits === '' || !Number.isFinite(value)) return null
  return { value, belowDetection, text }
}

/** Is the sample over any of California's single-sample limits? */
export function checkLimits(sample: WaterQualitySample): LimitCheck {
  const { enterococcus, fecalColiform, totalColiform } = sample
  // A count below detection ("<10") is under any limit, so only real counts can be over.
  if (enterococcus !== null && !enterococcus.belowDetection && enterococcus.value > ENTEROCOCCUS_LIMIT) {
    return { over: true, name: 'Entero', count: enterococcus }
  }
  if (fecalColiform !== null && !fecalColiform.belowDetection && fecalColiform.value > FECAL_COLIFORM_LIMIT) {
    return { over: true, name: 'Fecal', count: fecalColiform }
  }
  if (totalColiform !== null && !totalColiform.belowDetection) {
    if (totalColiform.value > TOTAL_COLIFORM_LIMIT) {
      return { over: true, name: 'Total', count: totalColiform }
    }
    // The lower limit applies when fecal is more than a tenth of total:
    //   fecal / total > 0.1
    if (fecalColiform !== null && totalColiform.value > TOTAL_COLIFORM_LIMIT_WHEN_MOSTLY_FECAL) {
      const fecalShare = fecalColiform.value / totalColiform.value
      if (fecalShare > 0.1) return { over: true, name: 'Total', count: totalColiform }
    }
  }
  return { over: false }
}

/**
 * The other stations' newest samples (from fetchOtherSites: one per station, from the
 * last OTHER_SITES_WINDOW_DAYS days): which of them are over a limit.
 */
export function otherSitesCheck(others: SiteSample[]): { failing: SiteSample[] } {
  const failing: SiteSample[] = []
  for (const site of others) {
    if (checkLimits(site.sample).over) failing.push(site)
  }
  return { failing }
}

// ------------------------------------------------------------------ Loading

type DayData = { sample: WaterQualitySample | null; others: SiteSample[] }

const cache = new Map<string, Promise<DayData>>()

async function fetchDay(day: string): Promise<DayData> {
  const [sample, others] = await Promise.all([fetchLatestSample(day), fetchOtherSites(day)])
  return { sample, others }
}

function loadDay(day: string): Promise<DayData> {
  const cached = cache.get(day)
  if (cached) return cached
  const request = fetchDay(day)
  request.catch(() => cache.delete(day)) // don't keep failures
  cache.set(day, request)
  return request
}

type Result = {
  sample: WaterQualitySample | null // Aquatic Park; null while loading, on error, or if there's no sample
  others: SiteSample[] // the other stations' newest samples in the window; empty while loading
  loading: boolean
  error: string | null
}

/** Aquatic Park's latest sample on or before the selected day, and the other stations' recent ones. */
export function useWaterQuality(time: Date): Result {
  const day = pacificDateString(time)
  const [loaded, setLoaded] = useState<{ day: string; data: DayData | null; error: string | null } | null>(null)

  useEffect(() => {
    let ignore = false
    loadDay(day).then(
      (data) => {
        if (!ignore) setLoaded({ day, data, error: null })
      },
      (e: unknown) => {
        if (!ignore) setLoaded({ day, data: null, error: e instanceof Error ? e.message : String(e) })
      },
    )
    return () => {
      ignore = true
    }
  }, [day])

  if (loaded === null || loaded.day !== day) return { sample: null, others: [], loading: true, error: null }
  if (loaded.data === null) return { sample: null, others: [], loading: false, error: loaded.error }
  return { sample: loaded.data.sample, others: loaded.data.others, loading: false, error: null }
}
