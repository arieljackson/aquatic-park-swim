// Weather near the cove: air temperature and wind, measured or forecast.

export type AirTempSample = { time: Date; tempF: number }

export type WindSample = {
  time: Date
  speedKt: number
  /** Gusts aren't in every source (the NWS hourly forecast has none). */
  gustKt: number | null
  /** Where the wind comes FROM, in degrees: 0 = north, 90 = east, 270 = west. */
  fromDeg: number
}

/** Hourly weather, measured or forecast. */
export type Weather = {
  airTemp: AirTempSample[]
  wind: WindSample[]
}
