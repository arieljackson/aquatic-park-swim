// Golden Gate predictions → Aquatic Park, using the Dolphin Club's rule of thumb:
//
//   "Times of current events are 20 to 30 minutes before the Golden Gate and the
//    speeds are halved. That's usually close enough for our purposes."
//   Tide times are about 15 minutes after the Golden Gate; heights are unchanged.
//
// Source: "Tides, Currents and Row Planning", Dolphin Club (see README credits).
//
// The same correction is applied to every sample and every event:
//
//   corrected time  = Golden Gate time + offset
//   corrected speed = Golden Gate speed × factor      (current only)

import type { CurrentData, PredictionData, TideData } from './types'

const MINUTE = 60 * 1000

export const AQUATIC_PARK_CORRECTIONS = {
  /** Tide events happen this many minutes after the Golden Gate. */
  tideOffsetMinutes: 15,
  /** Current events happen this many minutes before the Golden Gate (the middle of "20 to 30"). */
  currentOffsetMinutes: -25,
  /** Current speeds are this fraction of the Golden Gate's. */
  currentSpeedFactor: 0.5,
}

function shiftTime(time: Date, minutes: number): Date {
  return new Date(time.getTime() + minutes * MINUTE)
}

function correctTide(tide: TideData, offsetMinutes: number): TideData {
  return {
    ...tide,
    samples: tide.samples.map((sample) => ({ ...sample, time: shiftTime(sample.time, offsetMinutes) })),
    events: tide.events.map((event) => ({ ...event, time: shiftTime(event.time, offsetMinutes) })),
  }
}

function correctCurrent(current: CurrentData, offsetMinutes: number, speedFactor: number): CurrentData {
  return {
    ...current,
    samples: current.samples.map((sample) => ({
      time: shiftTime(sample.time, offsetMinutes),
      velocityKt: sample.velocityKt * speedFactor,
    })),
    events: current.events.map((event) => ({
      ...event,
      time: shiftTime(event.time, offsetMinutes),
      speedKt: event.speedKt * speedFactor,
    })),
  }
}

/**
 * Golden Gate data → estimated Aquatic Park data.
 *
 * The fetched range is a full day wider than the selected day on each side
 * (see usePredictions), so shifting by a few minutes never loses an event
 * near midnight.
 */
export function correctForAquaticPark(goldenGate: PredictionData): PredictionData {
  const c = AQUATIC_PARK_CORRECTIONS
  return {
    range: goldenGate.range,
    tide: correctTide(goldenGate.tide, c.tideOffsetMinutes),
    current: correctCurrent(goldenGate.current, c.currentOffsetMinutes, c.currentSpeedFactor),
  }
}
