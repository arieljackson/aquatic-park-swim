// GET /api/currents: surface currents around Aquatic Park, on the bay model's mesh, as JSON.
//
// A Vercel Function, like api/water-temp.ts, and for the same reason: NOAA's model server
// doesn't allow browser requests (no CORS headers).
//
// Where the numbers come from: NOAA's San Francisco Bay Operational Forecast System
// (SFBOFS), a computer model of the bay. It computes the current on a mesh of about
// 100,000 triangles ("elements", about 50–300 m apart near the cove, finer near shore).
// We use the top layer (the surface) of the ~2,200 elements inside BOX, from the Golden
// Gate Bridge to Pier 39.
//
// The model runs 4 times a day (03, 09, 15, 21 UTC). Each run writes one "fields" file
// per hour:
//   - nowcast  n001..n006: the 5 hours before the run, and the run hour itself
//              (n006 = the run time, n001 = 5 hours before)
//   - forecast f001..f048: the 48 hours after it (fNNN = run time + NNN hours)
// For each hour of the day: hours up to the newest run come from the nowcast of the run
// covering them; later hours from the newest run's forecast. NOAA keeps about a month of
// runs online; older hours, or hours past the newest forecast, are left out.
//
// Request:
//   /api/currents?day=2026-11-12   a San Francisco day, midnight to midnight, plus an hour
//                                  on each side; from 40 days ago to 3 days ahead
// Response:
//   {
//     "source": "NOAA SFBOFS model, surface layer",
//     "run": "2026-11-12T15:00:00.000Z",           (the newest run)
//     "points": [[-122.42103, 37.81288], ...],      (element centers, longitude/latitude)
//     "hours": [{ "time": "2026-11-12T07:00:00.000Z", "kind": "nowcast",
//                 "east": [0.5, ...], "north": [-0.1, ...] }, ...]
//   }
// east[i] and north[i] are the current at points[i], in knots, positive toward east/north.
// Errors: status 400 (bad day) or 502 (NOAA failed), with { "error": "..." }.

const OPENDAP_BASE = 'https://opendap.co-ops.nos.noaa.gov/thredds/dodsC/NOAA/SFBOFS/MODELS'

// The area the map can show, and the smallest slice of element numbers holding every
// element inside it. Found by scripts/sfbofs-mesh/find_range.py.
const BOX = { west: -122.49, east: -122.398, south: 37.795, north: 37.846 }
const FIRST_ELEMENT = 23480
const LAST_ELEMENT = 27812

/** The model's layers go from the surface (0) down to the bottom (19). */
const SURFACE_LAYER = 0

const MODEL_RUN_HOURS_UTC = [3, 9, 15, 21]

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const NOWCAST_HOURS = 6
const FORECAST_HOURS = 48

/** Days that may be asked for, relative to today (as in api/water-temp.ts). */
const OLDEST_DAY = -40
const NEWEST_DAY = 3

/** Files read from NOAA at the same time. */
const PARALLEL_READS = 8

/** 1 m/s = 3600 / 1852 knots (a nautical mile is 1852 m). */
const KNOTS_PER_METER_PER_SECOND = 3600 / 1852

/** As in api/water-temp.ts: an hour for answers reaching past the newest run, a week for the past. */
const CACHE_RECENT = 'public, s-maxage=3600, stale-while-revalidate=21600'
const CACHE_PAST = 'public, s-maxage=604800'

type Hour = { time: string; kind: 'nowcast' | 'forecast'; east: number[]; north: number[] }

export async function GET(request: Request): Promise<Response> {
  try {
    const day = new URL(request.url).searchParams.get('day')
    if (day === null || !isAllowedDay(day)) {
      return jsonResponse(400, {
        error: `day must be a date like 2026-11-12, from ${-OLDEST_DAY} days ago to ${NEWEST_DAY} days ahead`,
      })
    }

    const latestMs = await findLatestRun()
    if (latestMs === null) {
      return jsonResponse(502, { error: 'No recent SFBOFS model run found' })
    }

    // The day, plus an hour on each side. Pacific midnight is always a whole UTC hour.
    const fromMs = pacificMidnight(day) - HOUR_MS
    const toMs = pacificMidnight(addDays(day, 1)) + HOUR_MS
    const wanted: Array<{ timeMs: number; file: ModelFile }> = []
    for (let timeMs = fromMs; timeMs <= toMs; timeMs += HOUR_MS) {
      const file = fileForHour(timeMs, latestMs)
      if (file !== null) wanted.push({ timeMs, file })
    }

    const points = await readPoints(fieldsFileUrl(latestMs, 'f', 1))

    // An hour whose file can't be read (e.g. an old run no longer online) is left out,
    // rather than failing the whole day.
    let someReadFailed = false
    const results = await inBatches(wanted, PARALLEL_READS, async ({ timeMs, file }) => {
      try {
        const current = await readSurfaceCurrent(file.url, points.keep)
        const hour: Hour = { time: new Date(timeMs).toISOString(), kind: file.kind, ...current }
        return hour
      } catch {
        someReadFailed = true
        return null
      }
    })
    const hours = results.filter((hour) => hour !== null)

    // A finished day is cached for long, unless a read failed (maybe a passing NOAA error).
    let cacheHeader = CACHE_RECENT
    if (toMs <= latestMs && !someReadFailed) cacheHeader = CACHE_PAST
    return jsonResponse(
      200,
      { source: 'NOAA SFBOFS model, surface layer', run: new Date(latestMs).toISOString(), points: points.lonLat, hours },
      cacheHeader,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse(502, { error: message })
  }
}

function jsonResponse(status: number, body: unknown, cacheHeader?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  // Cache only good answers, so an error doesn't stick around.
  if (status === 200 && cacheHeader !== undefined) headers['Cache-Control'] = cacheHeader
  return new Response(JSON.stringify(body), { status, headers })
}

// ------------------------------------------------------------------ Days

/** "2026-11-12", and within OLDEST_DAY..NEWEST_DAY days of today. */
function isAllowedDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const dayMs = Date.parse(`${day}T00:00:00Z`)
  if (!Number.isFinite(dayMs)) return false
  // Whole days from today (UTC dates; a day either way doesn't matter for this check):
  //   daysFromToday = (that date − today's date) / 1 day
  const todayMs = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
  const daysFromToday = Math.round((dayMs - todayMs) / DAY_MS)
  return daysFromToday >= OLDEST_DAY && daysFromToday <= NEWEST_DAY
}

/** "2026-11-12" + 1 → "2026-11-13" (calendar arithmetic on the date alone). */
function addDays(day: string, days: number): string {
  const ms = Date.parse(`${day}T00:00:00Z`) + days * DAY_MS
  return new Date(ms).toISOString().slice(0, 10)
}

const pacificHourFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hour: 'numeric',
  hourCycle: 'h23',
})

/**
 * The instant of midnight in San Francisco at the start of `day`: 07:00 UTC in summer
 * (PDT, UTC−7) or 08:00 UTC in winter (PST, UTC−8). Try both, and keep the one a San
 * Francisco clock reads as hour 0.
 */
function pacificMidnight(day: string): number {
  for (const utcHour of ['07', '08']) {
    const ms = Date.parse(`${day}T${utcHour}:00:00Z`)
    if (Number(pacificHourFormat.format(ms)) === 0) return ms
  }
  throw new Error(`Could not find midnight in San Francisco on ${day}`)
}

// ------------------------------------------------------------------ Finding the files

type ModelFile = { url: string; kind: Hour['kind'] }

/** e.g. .../2026/11/12/sfbofs.t15z.20261112.fields.n006.nc */
function fieldsFileUrl(runMs: number, letter: 'n' | 'f', number: number): string {
  const run = new Date(runMs)
  const year = String(run.getUTCFullYear())
  const month = String(run.getUTCMonth() + 1).padStart(2, '0')
  const day = String(run.getUTCDate()).padStart(2, '0')
  const hour = String(run.getUTCHours()).padStart(2, '0')
  const fileNumber = String(number).padStart(3, '0')
  return `${OPENDAP_BASE}/${year}/${month}/${day}/sfbofs.t${hour}z.${year}${month}${day}.fields.${letter}${fileNumber}.nc`
}

/**
 * The file holding the hour `timeMs`, or null if no run covers it yet.
 *
 * Up to the newest run: the nowcast of the first run at or after the hour. Runs are at
 * 3 hours past a multiple of 6 hours:
 *   run = 3 h + ceil((hour − 3 h) / 6 h) × 6 h
 *   file number = 6 − (run − hour) / 1 h        (the run hour is n006)
 * After the newest run: its forecast, file number = (hour − newest run) / 1 h.
 */
function fileForHour(timeMs: number, latestMs: number): ModelFile | null {
  if (timeMs <= latestMs) {
    const step = NOWCAST_HOURS * HOUR_MS
    const offset = 3 * HOUR_MS
    const runMs = offset + Math.ceil((timeMs - offset) / step) * step
    const number = NOWCAST_HOURS - (runMs - timeMs) / HOUR_MS
    return { url: fieldsFileUrl(runMs, 'n', number), kind: 'nowcast' }
  }
  const number = (timeMs - latestMs) / HOUR_MS
  if (number > FORECAST_HOURS) return null
  return { url: fieldsFileUrl(latestMs, 'f', number), kind: 'forecast' }
}

/**
 * The newest run whose files are all online. A run's files appear over an hour or two
 * after its run time, so we try the run times of the last two days, newest first, and
 * take the first one whose last forecast file (f048) exists.
 */
async function findLatestRun(): Promise<number | null> {
  const now = new Date()
  const candidates: number[] = []
  for (let daysBack = 0; daysBack <= 1; daysBack++) {
    for (const hour of [...MODEL_RUN_HOURS_UTC].reverse()) {
      const runMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack, hour)
      if (runMs <= now.getTime()) candidates.push(runMs)
    }
  }
  for (const runMs of candidates) {
    // ".dds" is a tiny description of the file: a cheap way to ask "does it exist?"
    const response = await fetch(`${fieldsFileUrl(runMs, 'f', FORECAST_HOURS)}.dds`)
    if (response.ok) return runMs
  }
  return null
}

// ------------------------------------------------------------------ Reading the data

/** Fetches part of a model file as text. `query` is OPeNDAP's, e.g. "u[0][0][10:20]". */
async function fetchAscii(fileUrl: string, query: string): Promise<string> {
  // The [ ] in the query must be written as %5B %5D in a URL.
  const encodedQuery = query.replaceAll('[', '%5B').replaceAll(']', '%5D')
  const response = await fetch(`${fileUrl}.ascii?${encodedQuery}`)
  if (!response.ok) throw new Error(`NOAA returned ${response.status} for ${query}`)
  return response.text()
}

/**
 * The numbers of one variable in OPeNDAP's text answer. After a header, each variable
 * is a line naming it, then its values up to a blank line:
 *
 *   u[1][1][4059]
 *   [0][0], 0.7645588, 0.6511072, ...
 *
 * The "[0][0]" in front of each row gives its position, not a value, so it's dropped.
 */
function numbersOfBlock(text: string, name: string): number[] {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`${name}[`))
  if (start === -1) throw new Error(`Unexpected response from NOAA: no ${name} block`)
  const numbers: number[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') break
    const values = lines[i].replace(/^(\[\d+\])+,/, '')
    for (const value of values.split(',')) {
      if (value.trim() !== '') numbers.push(Number(value))
    }
  }
  return numbers
}

/** The slice of element numbers read from each file, in OPeNDAP's form: "[24626:28684]". */
const ELEMENT_SLICE = `[${FIRST_ELEMENT}:${LAST_ELEMENT}]`

type Points = {
  keep: number[] // positions within the slice of the elements inside BOX
  lonLat: Array<[number, number]> // their centers, rounded to 5 decimals (about 1 m)
}

/** The mesh doesn't change, so its points are read once per server instance. */
let pointsCache: Promise<Points> | null = null

function readPoints(fileUrl: string): Promise<Points> {
  if (pointsCache === null) {
    pointsCache = loadPoints(fileUrl)
    pointsCache.catch(() => {
      pointsCache = null // try again next time
    })
  }
  return pointsCache
}

async function loadPoints(fileUrl: string): Promise<Points> {
  const text = await fetchAscii(fileUrl, `lonc${ELEMENT_SLICE},latc${ELEMENT_SLICE}`)
  const lons = numbersOfBlock(text, 'lonc')
  const lats = numbersOfBlock(text, 'latc')
  const keep: number[] = []
  const lonLat: Array<[number, number]> = []
  for (let i = 0; i < lons.length; i++) {
    // The model writes longitudes from 0 to 360 east; the usual −180..180 form is lon − 360.
    let lon = lons[i]
    if (lon > 180) lon = lon - 360
    const lat = lats[i]
    if (lon < BOX.west || lon > BOX.east || lat < BOX.south || lat > BOX.north) continue
    keep.push(i)
    lonLat.push([roundTo(lon, 5), roundTo(lat, 5)])
  }
  if (keep.length === 0) throw new Error('No mesh elements inside the map area')
  return { keep, lonLat }
}

/** One hour's surface current at the kept elements, in knots (east and north parts). */
async function readSurfaceCurrent(fileUrl: string, keep: number[]): Promise<{ east: number[]; north: number[] }> {
  const layer = `[0][${SURFACE_LAYER}]`
  const text = await fetchAscii(fileUrl, `u${layer}${ELEMENT_SLICE},v${layer}${ELEMENT_SLICE}`)
  const u = numbersOfBlock(text, 'u')
  const v = numbersOfBlock(text, 'v')
  const sliceLength = LAST_ELEMENT - FIRST_ELEMENT + 1
  if (u.length !== sliceLength || v.length !== sliceLength) throw new Error('Unexpected number of values from NOAA')
  // knots = m/s × 3600 / 1852, rounded to 0.1 kt (plenty for drawing arrows, and it
  // keeps a day's answer small)
  const east = keep.map((i) => roundTo(u[i] * KNOTS_PER_METER_PER_SECOND, 1))
  const north = keep.map((i) => roundTo(v[i] * KNOTS_PER_METER_PER_SECOND, 1))
  return { east, north }
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Runs `work` on every item, at most `size` at a time; results in the items' order. */
async function inBatches<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let start = 0; start < items.length; start += size) {
    const batch = items.slice(start, start + size)
    const batchResults = await Promise.all(batch.map(work))
    results.push(...batchResults)
  }
  return results
}
