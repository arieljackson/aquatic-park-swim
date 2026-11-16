// The grid of numbers under the map: current (state), speed, next slack and tide. Each
// tile ends with a link to where its numbers come from: for the current, NOAA's SFBOFS
// model around the cove when it covers the day, otherwise NOAA's Alcatraz SW
// prediction; for the tide, NOAA's Pier 41 station.

import type { Conditions, CurrentPhase } from '../domain/types'
import { formatCountdown, formatRelativeDay, formatTime, formatTimeParts } from '../time/format'
import { SourceLink } from './SourceLink'
import { SOURCE_PAGES } from './sourcePages'
import type { CurrentSource } from './sourcePages'
import { StateGlyph } from './StateGlyph'
import './panels.css'

const PHASE_WORDS: Record<CurrentPhase, string> = {
  flood: 'Flood',
  slack: 'Slack',
  ebb: 'Ebb',
}

// Wording, the same in every tile: sentence case ("Max 1.4 kt", "High 5.8 ft"); a time
// on its own line is just the time ("9:19 AM", "3:12 PM today"); a colon only where a
// name and a time share a line ("Next low: 3:40 PM today").
//
// Every tile always has the same lines, and no line wraps, so tiles keep their shape
// whatever the time or the numbers. Lines are sized for their longest text
// (e.g. "12:47 AM tomorrow").
type PanelsProps = { conditions: Conditions | null; currentSource: CurrentSource }

export function Panels({ conditions, currentSource }: PanelsProps) {
  if (conditions === null) return <LoadingPanels currentSource={currentSource} />
  const { at, current, tide } = conditions
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
        {/* Two lines, the second one empty, so this tile stays the same height as the
            others. */}
        <p className="panel__state-words panel__line">{PHASE_WORDS[current.phase]}</p>
        <p className="panel__state-words panel__line">{'\u00a0'}</p>
        <CurrentSourceLink source={currentSource} />
      </section>

      <section className="panel">
        <h2 className="label">Speed</h2>
        <p className="panel__big panel__line mono">
          {current.speedKt.toFixed(1)}
          <span className="panel__unit"> kt</span>
        </p>
        <p className="panel__detail panel__line">
          {current.cycleMax === null ? '\u00a0' : `Max ${current.cycleMax.speedKt.toFixed(1)} kt`}
        </p>
        <p className="panel__detail panel__line">
          {/* Just the time, no day: this is the narrowest tile on a laptop, and the
              longest "12:47 AM tomorrow" wouldn't fit. */}
          {current.cycleMax === null ? '\u00a0' : formatTime(current.cycleMax.time)}
        </p>
        <CurrentSourceLink source={currentSource} />
      </section>

      <section className="panel panel--wide">
        <h2 className="label">Next slack</h2>
        <NextSlack at={at} conditions={conditions} />
        <CurrentSourceLink source={currentSource} />
      </section>

      <section className="panel panel--wide">
        <h2 className="label">Tide</h2>
        <p className="panel__big panel__line mono">
          {tide.heightFt.toFixed(1)}
          <span className="panel__unit"> ft {tide.trend === 'rising' ? '▲' : '▼'}</span>
        </p>
        {/* Same look as Next slack's second line: the event in bold; here its height too. */}
        <p className="panel__detail panel__line">
          {nextTide === null ? (
            '\u00a0'
          ) : (
            <>
              <span className="panel__event">{nextTide.kind === 'high' ? 'High' : 'Low'}</span>
              {' · '}
              <span className="panel__event">{nextTide.heightFt.toFixed(1)} ft</span>
            </>
          )}
        </p>
        <p className="panel__detail panel__line">
          {nextTide === null ? '\u00a0' : `${formatTime(nextTide.time)} ${formatRelativeDay(nextTide.time, at)}`}
        </p>
        <SourceLink href={SOURCE_PAGES.pier41Tide}>NOAA Pier 41</SourceLink>
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
        {/* In slack now: the slack shown is the one we're in, so no countdown. */}
        <span className="panel__countdown mono">
          {conditions.current.phase === 'slack' ? ' now' : ` in ${formatCountdown(at, nextSlack.time)}`}
        </span>
      </p>
      <p className="panel__detail panel__line">
        <span className="panel__event">{nextSlack.kind === 'high' ? 'High slack' : 'Low slack'}</span>
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

/**
 * The same four tiles with the same lines, while the predictions load: values show as
 * "--" and gently pulse, so the page has its final shape from the start and each tile
 * just fills in.
 */
function LoadingPanels({ currentSource }: { currentSource: CurrentSource }) {
  const empty = '\u00a0'
  return (
    <div className="panels">
      <section className="panel">
        <h2 className="label">Current</h2>
        <div className="panel__glyph" />
        <p className="panel__state-words panel__line is-loading">--</p>
        <p className="panel__state-words panel__line">{empty}</p>
        <CurrentSourceLink source={currentSource} />
      </section>
      <section className="panel">
        <h2 className="label">Speed</h2>
        <p className="panel__big panel__line mono is-loading">--</p>
        <p className="panel__detail panel__line">{empty}</p>
        <p className="panel__detail panel__line">{empty}</p>
        <CurrentSourceLink source={currentSource} />
      </section>
      <section className="panel panel--wide">
        <h2 className="label">Next slack</h2>
        <p className="panel__big panel__line mono is-loading">--:--</p>
        <p className="panel__detail panel__line">{empty}</p>
        <p className="panel__detail panel__line">{empty}</p>
        <CurrentSourceLink source={currentSource} />
      </section>
      <section className="panel panel--wide">
        <h2 className="label">Tide</h2>
        <p className="panel__big panel__line mono is-loading">--</p>
        <p className="panel__detail panel__line">{empty}</p>
        <p className="panel__detail panel__line">{empty}</p>
        <SourceLink href={SOURCE_PAGES.pier41Tide}>NOAA Pier 41</SourceLink>
      </section>
    </div>
  )
}

/** The current tiles' source link: SFBOFS around the cove, or the Alcatraz SW prediction. */
function CurrentSourceLink({ source }: { source: CurrentSource }) {
  if (source === 'sfbofs') return <SourceLink href={SOURCE_PAGES.sfbofsCurrents}>NOAA SFBOFS</SourceLink>
  return <SourceLink href={SOURCE_PAGES.alcatrazCurrent}>NOAA Alcatraz SW</SourceLink>
}
