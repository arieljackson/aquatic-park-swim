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

import { useEffect, useState } from 'react'
import { pacificDateString } from '../time/pacific'

const DATASET_URL = 'https://data.sf.gov/resource/v3fv-x3ux.json'
const STATION = 'BAY#211_SL'

export const ENTEROCOCCUS_LIMIT = 104
export const FECAL_COLIFORM_LIMIT = 400
export const TOTAL_COLIFORM_LIMIT = 10_000
export const TOTAL_COLIFORM_LIMIT_WHEN_MOSTLY_FECAL = 1_000

/** A result like "55", or "<10" when there was too little to measure. */
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
  const sample: WaterQualitySample = { date: newestDate, enterococcus: null, fecalColiform: null, totalColiform: null }
  for (const row of rows) {
    if (row.sample_date.slice(0, 10) !== newestDate) continue
    if (row.analyte === 'ENTERO') sample.enterococcus = parseCount(row.data)
    if (row.analyte === 'COLI_FECAL') sample.fecalColiform = parseCount(row.data)
    if (row.analyte === 'COLI_TOTAL') sample.totalColiform = parseCount(row.data)
  }
  return sample
}

/** "55" → 55; "<10" → 10, marked as below what the lab can detect. */
function parseCount(text: string): BacteriaCount | null {
  const belowDetection = text.startsWith('<')
  let digits = text
  if (belowDetection) digits = text.slice(1)
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

// ------------------------------------------------------------------ Loading

const cache = new Map<string, Promise<WaterQualitySample | null>>()

function loadDay(day: string): Promise<WaterQualitySample | null> {
  const cached = cache.get(day)
  if (cached) return cached
  const request = fetchLatestSample(day)
  request.catch(() => cache.delete(day)) // don't keep failures
  cache.set(day, request)
  return request
}

type Result = {
  sample: WaterQualitySample | null // null while loading, on error, or if there's no sample
  loading: boolean
  error: string | null
}

/** The latest sample on or before the selected day. */
export function useWaterQuality(time: Date): Result {
  const day = pacificDateString(time)
  const [loaded, setLoaded] = useState<{ day: string; sample: WaterQualitySample | null; error: string | null } | null>(
    null,
  )

  useEffect(() => {
    let ignore = false
    loadDay(day).then(
      (sample) => {
        if (!ignore) setLoaded({ day, sample, error: null })
      },
      (e: unknown) => {
        if (!ignore) setLoaded({ day, sample: null, error: e instanceof Error ? e.message : String(e) })
      },
    )
    return () => {
      ignore = true
    }
  }, [day])

  if (loaded === null || loaded.day !== day) return { sample: null, loading: true, error: null }
  return { sample: loaded.sample, loading: false, error: loaded.error }
}
