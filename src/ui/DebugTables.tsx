// Debug view (?debug): the tide's highs and lows at the Golden Gate, as NOAA predicts
// them, next to the Pier 41 times and heights the app shows, for checking against
// NOAA's website.

import type { DayData } from '../sources/usePredictions'
import type { TideEvent } from '../domain/types'
import { formatDateTime } from '../time/format'

const HOUR = 60 * 60 * 1000

/** Highs and lows within 24 hours of the selected time. */
export function DebugTables({ data, time }: { data: DayData; time: Date }) {
  const nearby = (event: TideEvent) => Math.abs(event.time.getTime() - time.getTime()) < 24 * HOUR
  const goldenGate = data.noaa.tide.events
  // pier41Tide keeps events in the same order, so event i in one list is event i in the other.
  const pier41 = data.shown.tide.events
  return (
    <details className="debug">
      <summary>Debug: tide, Golden Gate vs. Pier 41 (±24 h)</summary>
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Golden Gate</th>
            <th></th>
            <th>Pier 41</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {goldenGate.map((event, i) => {
            if (!nearby(event)) return null
            return (
              <tr key={event.time.getTime()}>
                <td>{event.kind === 'high' ? 'High' : 'Low'}</td>
                <td>{formatDateTime(event.time)}</td>
                <td>{event.heightFt.toFixed(2)} ft</td>
                <td>{formatDateTime(pier41[i].time)}</td>
                <td>{pier41[i].heightFt.toFixed(2)} ft</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </details>
  )
}
