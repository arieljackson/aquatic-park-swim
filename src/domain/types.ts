// Our own domain types. Nothing here knows about NOAA's response format.
// All times are absolute instants (Date); format them for display in
// America/Los_Angeles at the edge (see src/time/format.ts).

export type TimeRange = { start: Date; end: Date }

export type StationInfo = { id: string; name: string }

export type TideSample = { time: Date; heightFt: number } // feet above MLLW
export type TideEvent = { time: Date; heightFt: number; kind: 'high' | 'low' }

/** Signed velocity along the main axis: positive = flood (in), negative = ebb (out). */
export type CurrentSample = { time: Date; velocityKt: number }
export type CurrentEvent = { time: Date; kind: 'slack' | 'maxFlood' | 'maxEbb'; speedKt: number }

export type TideData = {
  station: StationInfo
  samples: TideSample[] // sorted by time
  events: TideEvent[] // sorted by time
}

export type CurrentData = {
  station: StationInfo
  floodDirDeg: number // compass direction the water flows toward on a flood
  ebbDirDeg: number // compass direction the water flows toward on an ebb
  samples: CurrentSample[] // sorted by time
  events: CurrentEvent[] // sorted by time
}

export type PredictionData = {
  range: TimeRange
  tide: TideData
  current: CurrentData
}

export type CurrentPhase = 'flood' | 'ebb' | 'slack'

/** The five words the app uses for the current (thresholds in conditions.ts). */
export type CurrentState = 'strongFlood' | 'weakFlood' | 'slack' | 'weakEbb' | 'strongEbb'

/**
 * A slack, labeled by what came before it:
 * - high slack: after a flood (the water has come in; the tide is near high)
 * - low slack:  after an ebb  (the water has gone out; the tide is near low)
 */
export type SlackEvent = { time: Date; kind: 'high' | 'low' }

/** Everything the UI needs to render the conditions at one moment. */
export type Conditions = {
  at: Date
  tide: {
    heightFt: number
    trend: 'rising' | 'falling'
    prev: TideEvent | null
    next: TideEvent | null
  }
  current: {
    velocityKt: number // signed: + flood, − ebb
    speedKt: number // always >= 0
    phase: CurrentPhase
    state: CurrentState
    directionDeg: number | null // null at slack
    /** The peak of the flood or ebb we're in, between the slacks around `at` (may already be past). */
    cycleMax: CurrentEvent | null
    /** The first slack after `at`; while the current is slack, the slack we're in (may be just past). */
    nextSlack: SlackEvent | null
    /** The first slack of the other kind after nextSlack (next high slack → this is a low slack). */
    nextSlackOfOtherKind: SlackEvent | null
    nextMax: CurrentEvent | null
  }
}
