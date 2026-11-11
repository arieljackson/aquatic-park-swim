// The tide at North Point, Pier 41 (9414305), 0.8 km from the cove, from NOAA's
// Golden Gate predictions (9414290), using NOAA's own offsets for Pier 41:
//   high tide: 13 min later, 0.2 ft higher
//   low tide:  11 min later, same height
// NOAA computes Pier 41's highs and lows exactly this way, but publishes no curve for it,
// so between a high and a low the curve blends the two offsets (see blend()).

import type { TideData, TideEvent } from './types'

const MINUTE = 60 * 1000

type TideOffset = { minutes: number; heightFt: number }

/** NOAA's offsets from the Golden Gate to North Point, Pier 41. */
export const PIER_41_OFFSETS: Record<TideEvent['kind'], TideOffset> = {
  high: { minutes: 13, heightFt: 0.2 },
  low: { minutes: 11, heightFt: 0.0 },
}

/**
 * The offset at time t, between the Golden Gate events before and after it:
 *
 *   fraction = (t − before.time) ÷ (after.time − before.time)    0 at `before`, 1 at `after`
 *   offset   = before's offset + fraction × (after's offset − before's offset)
 *
 * Before the first event or after the last, the nearest event's offset is used.
 */
function blend(time: Date, events: TideEvent[]): TideOffset {
  const t = time.getTime()
  const afterIndex = events.findIndex((event) => event.time.getTime() > t)
  if (afterIndex === -1) return PIER_41_OFFSETS[events[events.length - 1].kind]
  if (afterIndex === 0) return PIER_41_OFFSETS[events[0].kind]

  const before = events[afterIndex - 1]
  const after = events[afterIndex]
  const beforeOffset = PIER_41_OFFSETS[before.kind]
  const afterOffset = PIER_41_OFFSETS[after.kind]
  const fraction = (t - before.time.getTime()) / (after.time.getTime() - before.time.getTime())
  return {
    minutes: beforeOffset.minutes + fraction * (afterOffset.minutes - beforeOffset.minutes),
    heightFt: beforeOffset.heightFt + fraction * (afterOffset.heightFt - beforeOffset.heightFt),
  }
}

/**
 * Golden Gate tide → Pier 41 tide:
 *
 *   Pier 41 time   = Golden Gate time + offset minutes
 *   Pier 41 height = Golden Gate height + offset feet
 *
 * The fetched range is a full day wider than the selected day on each side
 * (see usePredictions), so shifting by a few minutes never loses an event
 * near midnight.
 */
export function pier41Tide(goldenGate: TideData): TideData {
  if (goldenGate.events.length === 0) return goldenGate
  return {
    station: { id: '9414305', name: 'North Point, Pier 41' },
    samples: goldenGate.samples.map((sample) => {
      const offset = blend(sample.time, goldenGate.events)
      return {
        time: new Date(sample.time.getTime() + offset.minutes * MINUTE),
        heightFt: sample.heightFt + offset.heightFt,
      }
    }),
    events: goldenGate.events.map((event) => {
      const offset = PIER_41_OFFSETS[event.kind]
      return {
        ...event,
        time: new Date(event.time.getTime() + offset.minutes * MINUTE),
        heightFt: event.heightFt + offset.heightFt,
      }
    }),
  }
}
