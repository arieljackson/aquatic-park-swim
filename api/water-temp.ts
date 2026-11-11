// GET /api/water-temp: water temperature near Aquatic Park, as JSON.
//
// This is the app's only server code. It runs as a Vercel Function (Vercel runs any
// file in api/ on request). It exists because the data's server doesn't allow browser
// requests (no CORS headers), so the app can't ask it directly.
//
// Where the numbers come from: NOAA's San Francisco Bay Operational Forecast System
// (SFBOFS), a computer model of the bay. It is not a thermometer: no sensor measures
// water temperature at the cove. The model runs 4 times a day (03, 09, 15, 21 UTC).
// Each run writes:
//   - a "nowcast": the 6 hours before the run time (the model's best estimate of the past)
//   - a "forecast": the 48 hours after it
// We use its point at North Point, Pier 41 (NOAA 9414305), about 0.85 km from the cove,
// and its top water layer (the surface, where people swim).
//
// So for any day, past hours come from the nowcasts of the runs that cover them, and
// hours after the newest run come from that run's forecast. NOAA keeps about
// a month of runs online; older hours, and hours more than 48 hours past the newest
// run, simply aren't in the answer.
//
// NOAA serves the model files over OPeNDAP, which can return a slice of a file as text
// instead of the whole file (tens of MB). We ask for just one point, one layer, hourly.
//
// Request:
//   /api/water-temp?day=2026-11-08   a San Francisco day, midnight to midnight, plus an
//                                    hour on each side (for interpolating near midnight);
//                                    from 40 days ago to 3 days ahead
//   /api/water-temp                  what the newest run covers, 6 hours back to 48 ahead
// Taking a day, rather than any start and end time, gives one URL per day: every visitor
// asking for the same day gets the same cached answer, and the function can't be used to
// send NOAA arbitrary requests.
// Response:
//   {
//     "source": "NOAA SFBOFS model, North Point, Pier 41 (9414305), surface",
//     "run": "2026-11-10T15:00:00.000Z",          (the newest run)
//     "samples": [{ "time": "2026-11-10T09:00:00.000Z", "tempF": 62.4, "kind": "nowcast" }, ...]
//   }
// Errors: status 400 (bad day) or 502 (NOAA failed), with { "error": "..." }.

const OPENDAP_BASE = 'https://opendap.co-ops.nos.noaa.gov/thredds/dodsC/NOAA/SFBOFS/MODELS'

/** The model's name for its point at North Point, Pier 41. */
const STATION_NAME = 'x941-4305'

/** The model's layers go from the surface (0) down to the bottom (19). */
const SURFACE_LAYER = 0

/** The model writes a value every 6 minutes; every 10th value is one per hour. */
const HOURLY_STRIDE = 10

const MODEL_RUN_HOURS_UTC = [3, 9, 15, 21]

/** The model's times are seconds since this moment (UTC). */
const MODEL_EPOCH_MS = Date.UTC(2013, 0, 1)

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Each run's nowcast covers this many hours before it; its forecast this many after. */
const NOWCAST_HOURS = 6
const FORECAST_HOURS = 48

/** Days that may be asked for, relative to today: NOAA keeps about a month of runs online, and forecasts 2 days ahead. */
const OLDEST_DAY = -40
const NEWEST_DAY = 3

/**
 * How long Vercel's servers may reuse a response before asking NOAA again.
 * - Anything reaching past the newest run changes when the next run comes out (every
 *   6 hours): reuse for an hour, and for up to 6 more hours while fetching a new one.
 * - A stretch entirely before the newest run won't change: reuse for a week.
 */
const CACHE_RECENT = 'public, s-maxage=3600, stale-while-revalidate=21600'
const CACHE_PAST = 'public, s-maxage=604800'

type Sample = { time: string; tempF: number; kind: 'nowcast' | 'forecast' }

export async function GET(request: Request): Promise<Response> {
  try {
    const latest = await findLatestRun()
    if (latest === null) {
      return jsonResponse(502, { error: 'No recent SFBOFS model run found' })
    }
    const latestMs = latest.time.getTime()

    // The stretch of time to cover. Default: what the newest run covers.
    let fromMs = latestMs - NOWCAST_HOURS * HOUR_MS
    let toMs = latestMs + FORECAST_HOURS * HOUR_MS
    const day = new URL(request.url).searchParams.get('day')
    if (day !== null) {
      if (!isAllowedDay(day)) {
        return jsonResponse(400, { error: `day must be a date like 2026-11-08, from ${-OLDEST_DAY} days ago to ${NEWEST_DAY} days ahead` })
      }
      // The day, plus an hour on each side.
      fromMs = pacificMidnight(day) - HOUR_MS
      toMs = pacificMidnight(addDays(day, 1)) + HOUR_MS
    }

    const stationIndex = await findStationIndex(latest.forecastUrl)

    // Hours up to the newest run: the nowcasts of the runs covering them. An old run
    // that's no longer online just leaves a gap, rather than failing the whole answer.
    const reads: Array<Promise<Sample[]>> = []
    let someReadFailed = false
    for (const runTime of runsCovering(fromMs, Math.min(toMs, latestMs))) {
      const nowcastUrl = modelRunUrls(runTime).nowcastUrl
      const read = readTemperatures(nowcastUrl, stationIndex, 'nowcast').catch(() => {
        someReadFailed = true
        return []
      })
      reads.push(read)
    }
    // Hours after the newest run: its forecast.
    if (toMs > latestMs) {
      reads.push(readTemperatures(latest.forecastUrl, stationIndex, 'forecast'))
    }
    const lists = await Promise.all(reads)

    // Keep the hours inside the stretch, one value per hour. Neighboring files share an
    // hour (a nowcast ends at its run time, where the next file starts); the lists are in
    // time order with nowcasts first, so the first value seen for an hour is kept.
    const byTime = new Map<string, Sample>()
    for (const list of lists) {
      for (const sample of list) {
        const ms = Date.parse(sample.time)
        if (ms < fromMs || ms > toMs) continue
        if (!byTime.has(sample.time)) byTime.set(sample.time, sample)
      }
    }
    const samples = [...byTime.values()].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))

    // A finished day is cached for long, unless a read failed: then its gap may be a
    // passing NOAA error, so it gets the short cache and is asked for again soon.
    let cacheHeader = CACHE_RECENT
    if (toMs <= latestMs && !someReadFailed) cacheHeader = CACHE_PAST
    return jsonResponse(
      200,
      { source: 'NOAA SFBOFS model, North Point, Pier 41 (9414305), surface', run: latest.time.toISOString(), samples },
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

/** "2026-11-08", and within OLDEST_DAY..NEWEST_DAY days of today. */
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

/** "2026-11-08" + 1 → "2026-11-09" (calendar arithmetic on the date alone). */
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
 * The instant of midnight in San Francisco at the start of `day`. That's 07:00 UTC in
 * summer (PDT, UTC−7) or 08:00 UTC in winter (PST, UTC−8): try both, and keep the one
 * a San Francisco clock reads as hour 0. (Clocks change at 2 AM, so midnight always exists.)
 */
function pacificMidnight(day: string): number {
  for (const utcHour of ['07', '08']) {
    const ms = Date.parse(`${day}T${utcHour}:00:00Z`)
    if (Number(pacificHourFormat.format(ms)) === 0) return ms
  }
  throw new Error(`Could not find midnight in San Francisco on ${day}`)
}

/**
 * The run times whose nowcasts cover some of [fromMs, untilMs]: every run after `fromMs`,
 * up to the first one at or after `untilMs`. A run at time R covers (R − 6 h, R].
 *
 * Runs are at 03, 09, 15 and 21 UTC: 3 hours past a multiple of 6 hours. The first run
 * after `fromMs`:
 *   R = 3 h + (whole number of 6 h steps from 3 h up to fromMs, plus one) × 6 h
 */
function runsCovering(fromMs: number, untilMs: number): Date[] {
  const step = NOWCAST_HOURS * HOUR_MS
  const offset = 3 * HOUR_MS
  let runMs = offset + (Math.floor((fromMs - offset) / step) + 1) * step
  const runs: Date[] = []
  while (runMs - step < untilMs) {
    runs.push(new Date(runMs))
    runMs += step
  }
  return runs
}

// ------------------------------------------------------------------ Finding the files

type ModelRun = { time: Date; nowcastUrl: string; forecastUrl: string }

/**
 * The newest model run whose files are online. A run's files appear an hour or two
 * after its run time, so we try the run times of the last two days, newest first,
 * and take the first one NOAA has.
 */
async function findLatestRun(): Promise<ModelRun | null> {
  const now = Date.now()
  const today = new Date(now)
  const candidates: Date[] = []
  for (let daysBack = 0; daysBack <= 1; daysBack++) {
    for (const hour of [...MODEL_RUN_HOURS_UTC].reverse()) {
      const runTime = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysBack, hour),
      )
      if (runTime.getTime() <= now) candidates.push(runTime)
    }
  }

  for (const runTime of candidates) {
    const run = modelRunUrls(runTime)
    // ".dds" is a tiny description of the file: a cheap way to ask "does it exist?"
    const response = await fetch(`${run.forecastUrl}.dds`)
    if (response.ok) return run
  }
  return null
}

/** e.g. .../2026/11/10/sfbofs.t15z.20261110.stations.forecast.nc */
function modelRunUrls(runTime: Date): ModelRun {
  const year = String(runTime.getUTCFullYear())
  const month = String(runTime.getUTCMonth() + 1).padStart(2, '0')
  const day = String(runTime.getUTCDate()).padStart(2, '0')
  const hour = String(runTime.getUTCHours()).padStart(2, '0')
  const prefix = `${OPENDAP_BASE}/${year}/${month}/${day}/sfbofs.t${hour}z.${year}${month}${day}.stations`
  return { time: runTime, nowcastUrl: `${prefix}.nowcast.nc`, forecastUrl: `${prefix}.forecast.nc` }
}

// ------------------------------------------------------------------ Reading the data

/** Fetches part of a model file as text. `query` is OPeNDAP's, e.g. "time[0:10:480]". */
async function fetchAscii(fileUrl: string, query: string): Promise<string> {
  // The [ ] in the query must be written as %5B %5D in a URL.
  const encodedQuery = query.replaceAll('[', '%5B').replaceAll(']', '%5D')
  const response = await fetch(`${fileUrl}.ascii?${encodedQuery}`)
  if (!response.ok) throw new Error(`NOAA returned ${response.status} for ${query}`)
  return response.text()
}

/** Where Pier 41 is in the model's list of points (it's been 16, but we look it up). */
async function findStationIndex(fileUrl: string): Promise<number> {
  const text = await fetchAscii(fileUrl, 'name_station')
  // The names come back in quotes: "x941-4305", "xC211", ...
  const names = [...text.matchAll(/"([^"]*)"/g)].map((match) => match[1].trim())
  const index = names.indexOf(STATION_NAME)
  if (index === -1) throw new Error(`Station ${STATION_NAME} not found in the model`)
  return index
}

/** How many time steps a file has, read from its description (e.g. "time = 481"). */
async function countTimeSteps(fileUrl: string): Promise<number> {
  const response = await fetch(`${fileUrl}.dds`)
  if (!response.ok) throw new Error(`NOAA returned ${response.status} for ${fileUrl}.dds`)
  const description = await response.text()
  const match = /time\[time = (\d+)\]/.exec(description)
  if (match === null) throw new Error('Could not read the number of time steps')
  return Number(match[1])
}

/** Hourly surface temperatures at one point, converted to °F. */
async function readTemperatures(fileUrl: string, stationIndex: number, kind: Sample['kind']): Promise<Sample[]> {
  const lastStep = (await countTimeSteps(fileUrl)) - 1
  const steps = `[0:${HOURLY_STRIDE}:${lastStep}]`
  const text = await fetchAscii(fileUrl, `time${steps},temp${steps}[${SURFACE_LAYER}][${stationIndex}]`)

  // The text has a header, then one block per variable:
  //
  //   ---------------------------------------------
  //   time[9]
  //   4.373244E8, 4.37346E8, ...
  //
  //   temp[9][1][1]
  //   [0][0], 16.892145
  //   [1][0], 17.06999
  const timeLines = linesOfBlock(text, 'time[')
  const tempLines = linesOfBlock(text, 'temp[')
  const seconds = timeLines[0].split(',').map(Number)
  // Each temperature line is "[index][0], value": the value is after the last comma.
  const celsius = tempLines.map((line) => Number(line.split(',').at(-1)))
  if (seconds.length !== celsius.length) throw new Error('Times and temperatures do not match up')

  const samples: Sample[] = []
  for (let i = 0; i < seconds.length; i++) {
    // Model time → real time:  time = 2013-01-01 UTC + seconds
    const time = new Date(MODEL_EPOCH_MS + seconds[i] * 1000)
    samples.push({ time: time.toISOString(), tempF: celsiusToFahrenheit(celsius[i]), kind })
  }
  return samples
}

/**
 * The lines of one block of OPeNDAP text: the lines after the one starting with
 * `firstLineStart` (e.g. "temp["), up to the next blank line.
 */
function linesOfBlock(text: string, firstLineStart: string): string[] {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.startsWith(firstLineStart))
  if (start === -1) throw new Error(`Unexpected response from NOAA: no ${firstLineStart} block`)
  const block: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') break
    block.push(lines[i])
  }
  return block
}

/** °F = °C × 9/5 + 32, rounded to 0.1 °F. */
function celsiusToFahrenheit(celsius: number): number {
  const fahrenheit = (celsius * 9) / 5 + 32
  return Math.round(fahrenheit * 10) / 10
}
