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

/** NOAA reports errors with HTTP 200 and this body. */
export type RawErrorResponse = { error: { message: string } }
