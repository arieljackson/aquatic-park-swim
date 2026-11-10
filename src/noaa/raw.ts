// The JSON NOAA's datagetter API returns, exactly as sent.
// https://api.tidesandcurrents.noaa.gov/api/prod/
// Times are "YYYY-MM-DD HH:mm" in whatever time_zone was requested (we ask for gmt).

/** `product=predictions` (tides). `type` is present only with `interval=hilo`. */
export type RawTideResponse = {
  predictions: Array<{
    t: string
    v: string // height as a string, e.g. "4.706"
    type?: 'H' | 'L'
  }>
}

/** `product=currents_predictions`. `Type` is present only with `interval=MAX_SLACK`. */
export type RawCurrentResponse = {
  current_predictions: {
    units: string
    cp: Array<{
      Time: string
      Velocity_Major: number // knots; + flood, − ebb
      meanFloodDir: number
      meanEbbDir: number
      Bin: string
      Depth: string
      Type?: 'slack' | 'flood' | 'ebb'
    }>
  }
}

/** `product=air_temperature`: measured at the station. `v` is "" when a reading is missing. */
export type RawAirTempResponse = {
  data: Array<{ t: string; v: string }>
}

/**
 * `product=wind`: measured at the station. Speed `s` and gust `g` in knots (units=english),
 * direction `d` in degrees the wind comes from. Any of them can be "" when missing.
 */
export type RawWindResponse = {
  data: Array<{ t: string; s: string; d: string; dr: string; g: string }>
}

/** NOAA reports errors with HTTP 200 and this body. */
export type RawErrorResponse = { error: { message: string } }
