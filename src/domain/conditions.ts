// Pure functions: given prediction data and a moment, what are the conditions?

import type { Conditions, CurrentEvent, CurrentPhase, CurrentState, PredictionData, SlackEvent } from './types'

/**
 * Below this speed (knots) we call the current "slack".
 * Open question: with Aquatic Park speeds (half the Golden Gate's), this gives slack
 * windows of 30–60 minutes. To revisit with real swims.
 */
export const SLACK_THRESHOLD_KT = 0.2

/**
 * At or above this speed (knots) a flood or ebb is "strong"; below it, "weak".
 * Open question: 1 kt is a starting point, still to be checked against real swims.
 */
export const STRONG_THRESHOLD_KT = 1.0

/** The five-word state for a signed velocity (+ flood, − ebb). */
export function currentState(velocityKt: number): CurrentState {
  const speedKt = Math.abs(velocityKt)
  if (speedKt < SLACK_THRESHOLD_KT) return 'slack'
  const isStrong = speedKt >= STRONG_THRESHOLD_KT
  if (velocityKt > 0) {
    if (isStrong) return 'strongFlood'
    return 'weakFlood'
  }
  if (isStrong) return 'strongEbb'
  return 'weakEbb'
}

function phaseOf(state: CurrentState): CurrentPhase {
  if (state === 'strongFlood' || state === 'weakFlood') return 'flood'
  if (state === 'strongEbb' || state === 'weakEbb') return 'ebb'
  return 'slack'
}

/**
 * High or low slack for the slack event at `slackIndex`.
 *
 * Look back for the nearest max: after a max flood it's high slack, after a max
 * ebb it's low slack. If there is no max before it in the data (the very first
 * event), look forward instead: a slack followed by a max flood ends an ebb, so
 * it's low slack, and the other way round.
 */
export function slackKind(events: CurrentEvent[], slackIndex: number): 'high' | 'low' | null {
  for (let i = slackIndex - 1; i >= 0; i--) {
    if (events[i].kind === 'maxFlood') return 'high'
    if (events[i].kind === 'maxEbb') return 'low'
  }
  for (let i = slackIndex + 1; i < events.length; i++) {
    if (events[i].kind === 'maxFlood') return 'low'
    if (events[i].kind === 'maxEbb') return 'high'
  }
  return null
}

/** Every slack after time `t`, labeled high or low, in order. */
function slacksAfter(events: CurrentEvent[], t: number): SlackEvent[] {
  const slacks: SlackEvent[] = []
  events.forEach((event, index) => {
    if (event.kind !== 'slack' || event.time.getTime() <= t) return
    const kind = slackKind(events, index)
    if (kind !== null) slacks.push({ time: event.time, kind })
  })
  return slacks
}

/**
 * The max flood or max ebb of the cycle containing `t`: the first max after the
 * last slack at or before `t` (or after the start of the data, if there is none).
 */
function cycleMaxAt(events: CurrentEvent[], t: number): CurrentEvent | null {
  const slackIndexBefore = events.findLastIndex((event) => event.kind === 'slack' && event.time.getTime() <= t)
  const after = events.slice(slackIndexBefore + 1)
  return after.find((event) => event.kind !== 'slack') ?? null
}

type Timed = { time: Date }

/**
 * Index of the last item whose time is at or before `t`, or -1 if every item is after `t`.
 * Items must be sorted by time.
 *
 * Performance: findLastIndex checks items one by one from the end (a linear scan).
 * Our lists are small (~720 samples for 3 days at 6-minute intervals), so this takes
 * microseconds. If we ever need many lookups over much larger lists, swap this for a
 * binary search, which works because the items are sorted. Callers won't need to change.
 */
function lastAtOrBefore<T extends Timed>(items: T[], t: number): number {
  return items.findLastIndex((item) => item.time.getTime() <= t)
}

/**
 * Value at time `t`, estimated by drawing a straight line between the samples
 * just before and just after `t` (linear interpolation):
 *
 *   fraction = (t - timeBefore) / (timeAfter - timeBefore)      // 0 at "before", 1 at "after"
 *   value    = valueBefore + fraction * (valueAfter - valueBefore)
 *
 * Returns null if `t` is outside the samples.
 */
export function interpolate<T extends Timed>(samples: T[], t: number, valueOf: (sample: T) => number): number | null {
  const beforeIndex = lastAtOrBefore(samples, t)
  if (beforeIndex === -1) return null

  const before = samples[beforeIndex]
  const timeBefore = before.time.getTime()
  if (timeBefore === t) return valueOf(before)

  const after = samples[beforeIndex + 1]
  if (after === undefined) return null
  const timeAfter = after.time.getTime()

  const fraction = (t - timeBefore) / (timeAfter - timeBefore)
  return valueOf(before) + fraction * (valueOf(after) - valueOf(before))
}

/** The events immediately before and after `t` (either may be null). */
function prevAndNext<T extends Timed>(events: T[], t: number): { prev: T | null; next: T | null } {
  const prevIndex = lastAtOrBefore(events, t)
  const prev = prevIndex === -1 ? null : events[prevIndex]
  const next = events[prevIndex + 1] ?? null
  return { prev, next }
}

/** Conditions at time `at`, or null if `at` is outside the fetched data. */
export function conditionsAt(at: Date, data: PredictionData): Conditions | null {
  const t = at.getTime()

  const heightFt = interpolate(data.tide.samples, t, (sample) => sample.heightFt)
  const velocityKt = interpolate(data.current.samples, t, (sample) => sample.velocityKt)
  if (heightFt === null || velocityKt === null) return null

  // Tide trend: heading toward a high means rising, toward a low means falling.
  // If there's no next event in the data, use the previous one instead
  // (just after a low means rising).
  const tideEvents = prevAndNext(data.tide.events, t)
  let trend: 'rising' | 'falling'
  if (tideEvents.next !== null) {
    trend = tideEvents.next.kind === 'high' ? 'rising' : 'falling'
  } else {
    trend = tideEvents.prev?.kind === 'low' ? 'rising' : 'falling'
  }

  // Current: NOAA's velocity is signed (positive = flood, negative = ebb).
  // Speed is the size of the velocity regardless of sign.
  const speedKt = Math.abs(velocityKt)
  const state = currentState(velocityKt)
  const phase = phaseOf(state)
  let directionDeg: number | null = null
  if (phase === 'flood') directionDeg = data.current.floodDirDeg
  if (phase === 'ebb') directionDeg = data.current.ebbDirDeg

  const events = data.current.events

  // "Next slack" normally means the first slack after t. But while the current is slack
  // (under the threshold), we're inside a slack, and its exact NOAA time may have just
  // passed. Then the slack to show is the one we're in, not the one ~6 hours away.
  // The one we're in is whichever slack time is closer to t: the last one before it or
  // the first one after it.
  let searchSlacksAfter = t
  if (state === 'slack') {
    const lastSlackIndex = events.findLastIndex((event) => event.kind === 'slack' && event.time.getTime() <= t)
    const firstSlackAfter = events.find((event) => event.kind === 'slack' && event.time.getTime() > t)
    if (lastSlackIndex !== -1) {
      const lastSlackMs = events[lastSlackIndex].time.getTime()
      const sinceLast = t - lastSlackMs
      let untilNext = Infinity
      if (firstSlackAfter !== undefined) untilNext = firstSlackAfter.time.getTime() - t
      if (sinceLast < untilNext) {
        // Search from just before that slack, so it's the first one found.
        searchSlacksAfter = lastSlackMs - 1
      }
    }
  }
  const upcomingSlacks = slacksAfter(events, searchSlacksAfter)
  const nextSlack = upcomingSlacks[0] ?? null
  let nextSlackOfOtherKind: SlackEvent | null = null
  if (nextSlack !== null) {
    nextSlackOfOtherKind = upcomingSlacks.find((slack) => slack.kind !== nextSlack.kind) ?? null
  }
  const nextMax = events.find((event) => event.time.getTime() > t && event.kind !== 'slack') ?? null

  return {
    at,
    tide: { heightFt, trend, prev: tideEvents.prev, next: tideEvents.next },
    current: {
      velocityKt,
      speedKt,
      phase,
      state,
      directionDeg,
      cycleMax: cycleMaxAt(events, t),
      nextSlack,
      nextSlackOfOtherKind,
      nextMax,
    },
  }
}
