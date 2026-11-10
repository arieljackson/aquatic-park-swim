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
// NOAA serves the model files over OPeNDAP, which can return a slice of a file as text
// instead of the whole file (tens of MB). We ask for just one point, one layer, hourly.
//
// Response:
//   {
//     "source": "NOAA SFBOFS model, North Point, Pier 41 (9414305), surface",
//     "run": "2026-11-10T15:00:00.000Z",
//     "samples": [{ "time": "2026-11-10T09:00:00.000Z", "tempF": 62.4, "kind": "nowcast" }, ...]
//   }
// Errors: status 502 with { "error": "..." }.

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

/**
 * How long Vercel's servers may reuse a response before asking NOAA again: an hour,
 * and for up to 6 hours after that they may serve the old one while fetching a new one.
 * The model only changes every 6 hours, so this keeps requests to NOAA to a handful a day.
 */
const CACHE_HEADER = 'public, s-maxage=3600, stale-while-revalidate=21600'

type Sample = { time: string; tempF: number; kind: 'nowcast' | 'forecast' }

export async function GET(): Promise<Response> {
  try {
    const run = await findLatestRun()
    if (run === null) {
      return jsonResponse(502, { error: 'No recent SFBOFS model run found' })
    }
    const stationIndex = await findStationIndex(run.forecastUrl)
    const nowcast = await readTemperatures(run.nowcastUrl, stationIndex, 'nowcast')
    const forecast = await readTemperatures(run.forecastUrl, stationIndex, 'forecast')
    // Both files include the run time itself (the nowcast's last value, the forecast's
    // first). Keep the nowcast's, and only forecast values after it.
    const runTimeIso = run.time.toISOString()
    const forecastAfterRun = forecast.filter((sample) => sample.time > runTimeIso)
    return jsonResponse(200, {
      source: 'NOAA SFBOFS model, North Point, Pier 41 (9414305), surface',
      run: runTimeIso,
      samples: [...nowcast, ...forecastAfterRun],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse(502, { error: message })
  }
}

function jsonResponse(status: number, body: unknown): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  // Cache only good answers, so an error doesn't stick around for an hour.
  if (status === 200) headers['Cache-Control'] = CACHE_HEADER
  return new Response(JSON.stringify(body), { status, headers })
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
