// The grid of numbers under the map: current (state), speed, next slack and tide.

import type { Conditions, CurrentState } from '../domain/types'
import { formatCountdown, formatRelativeDay, formatTime, formatTimeParts } from '../time/format'
import { StateGlyph } from './StateGlyph'
import './panels.css'

const STATE_WORDS: Record<CurrentState, [string, string]> = {
  strongFlood: ['Strong', 'flood'],
  weakFlood: ['Weak', 'flood'],
  slack: ['Slack', ''],
  weakEbb: ['Weak', 'ebb'],
  strongEbb: ['Strong', 'ebb'],
}

// Every tile always has the same lines, and no line wraps, so tiles keep their shape
// whatever the time or the numbers. Lines are sized for their longest text
// (e.g. "12:47 AM tomorrow").
export function Panels({ conditions }: { conditions: Conditions }) {
  const { at, current, tide } = conditions
  const [firstWord, secondWord] = STATE_WORDS[current.state]
  const nextTide = tide.next

  return (
    <div className="panels">
      <section className="panel">
        <h2 className="label">Current</h2>
        {/* The glyph gets its own line, the same height as the big number in the other
            tiles, so the words below have the tile's full width. */}
        <div className="panel__glyph">
          <StateGlyph phase={current.phase} size={30} />
        </div>
        {/* Always two lines; slack leaves the second one empty. */}
        <p className="panel__state-words panel__line">{firstWord}</p>
        <p className="panel__state-words panel__line">{secondWord === '' ? '\u00a0' : secondWord}</p>
      </section>

      <section className="panel">
        <h2 className="label">Speed</h2>
        <p className="panel__big panel__line mono">
          {current.speedKt.toFixed(1)}
          <span className="panel__unit"> kt</span>
        </p>
        <p className="panel__detail panel__line">
          {current.cycleMax === null ? '\u00a0' : `max ${current.cycleMax.speedKt.toFixed(1)} kt`}
        </p>
        <p className="panel__detail panel__line">
          {current.cycleMax === null ? '\u00a0' : `at ${formatTime(current.cycleMax.time)}`}
        </p>
      </section>

      <section className="panel panel--wide">
        <h2 className="label">Next slack</h2>
        <NextSlack at={at} conditions={conditions} />
      </section>

      <section className="panel panel--wide">
        <h2 className="label">Tide</h2>
        <p className="panel__big panel__line mono">
          {tide.heightFt.toFixed(1)}
          <span className="panel__unit"> ft {tide.trend === 'rising' ? '▲' : '▼'}</span>
        </p>
        <p className="panel__detail panel__line">
          {nextTide === null ? '\u00a0' : `${nextTide.kind} ${nextTide.heightFt.toFixed(1)} ft`}
        </p>
        <p className="panel__detail panel__line">
          {nextTide === null ? '\u00a0' : `${formatTime(nextTide.time)} ${formatRelativeDay(nextTide.time, at)}`}
        </p>
      </section>
    </div>
  )
}

function NextSlack({ at, conditions }: { at: Date; conditions: Conditions }) {
  const { nextSlack, nextSlackOfOtherKind } = conditions.current
  if (nextSlack === null) {
    return (
      <>
        <p className="panel__big panel__line mono">--:--</p>
        <p className="panel__detail panel__line">Not in the loaded data</p>
        <p className="panel__detail panel__line">{'\u00a0'}</p>
      </>
    )
  }
  const time = formatTimeParts(nextSlack.time)
  return (
    <>
      <p className="panel__big panel__line">
        <span className="mono">{time.clock}</span>
        <span className="panel__unit mono"> {time.period}</span>
        <span className="panel__countdown mono"> in {formatCountdown(at, nextSlack.time)}</span>
      </p>
      <p className="panel__detail panel__line">
        <span className="panel__slack-kind">{nextSlack.kind === 'high' ? 'High slack' : 'Low slack'}</span>
        {' · '}
        {formatRelativeDay(nextSlack.time, at)}
      </p>
      <p className="panel__detail panel__line">
        {nextSlackOfOtherKind === null
          ? '\u00a0'
          : `Next ${nextSlackOfOtherKind.kind}: ${formatTime(nextSlackOfOtherKind.time)} ${formatRelativeDay(nextSlackOfOtherKind.time, at)}`}
      </p>
    </>
  )
}
