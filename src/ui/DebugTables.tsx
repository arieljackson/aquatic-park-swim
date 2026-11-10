// Debug view: Golden Gate (as NOAA predicts it) next to Aquatic Park (corrected),
// for checking against NOAA's website.

import type { DayData } from '../sources/usePredictions'
import { slackKind } from '../domain/conditions'
import type { CurrentEvent, PredictionData } from '../domain/types'
import { formatDateTime } from '../time/format'

const HOUR = 60 * 60 * 1000

const CURRENT_EVENT_LABEL = { maxFlood: 'Max flood', maxEbb: 'Max ebb' } as const

function currentEventLabel(events: CurrentEvent[], index: number): string {
  const event = events[index]
  if (event.kind === 'slack') {
    const kind = slackKind(events, index)
    if (kind === null) return 'Slack'
    return kind === 'high' ? 'High slack' : 'Low slack'
  }
  return CURRENT_EVENT_LABEL[event.kind]
}

/**
 * Golden Gate (as NOAA predicts it) next to Aquatic Park (corrected), for checking
 * against NOAA's website. Events within 24 hours of the selected time.
 */
export function DebugTables({ data, time }: { data: DayData; time: Date }) {
  const nearby = (eventTime: Date) => Math.abs(eventTime.getTime() - time.getTime()) < 24 * HOUR
  return (
    <details className="debug">
      <summary>Debug: Golden Gate vs. Aquatic Park (±24 h)</summary>
      <h2>Current events</h2>
      <EventTable
        rows={pairRows(data.goldenGate, data.aquaticPark, 'current').filter((row) => nearby(row.goldenGate.time))}
      />
      <h2>Tide events</h2>
      <EventTable
        rows={pairRows(data.goldenGate, data.aquaticPark, 'tide').filter((row) => nearby(row.goldenGate.time))}
      />
    </details>
  )
}

type Row = {
  label: string
  goldenGate: { time: Date; value: string }
  aquaticPark: { time: Date; value: string }
}

/** Corrections keep events in the same order, so event i in one list is event i in the other. */
function pairRows(goldenGate: PredictionData, aquaticPark: PredictionData, which: 'tide' | 'current'): Row[] {
  if (which === 'tide') {
    return goldenGate.tide.events.map((event, i) => ({
      label: event.kind === 'high' ? 'High' : 'Low',
      goldenGate: { time: event.time, value: `${event.heightFt.toFixed(2)} ft` },
      aquaticPark: {
        time: aquaticPark.tide.events[i].time,
        value: `${aquaticPark.tide.events[i].heightFt.toFixed(2)} ft`,
      },
    }))
  }
  const events = goldenGate.current.events
  return events.map((event, i) => {
    const corrected = aquaticPark.current.events[i]
    const speed = (e: CurrentEvent) => (e.kind === 'slack' ? '' : `${e.speedKt.toFixed(2)} kt`)
    return {
      label: currentEventLabel(events, i),
      goldenGate: { time: event.time, value: speed(event) },
      aquaticPark: { time: corrected.time, value: speed(corrected) },
    }
  })
}

function EventTable({ rows }: { rows: Row[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Event</th>
          <th>Golden Gate</th>
          <th></th>
          <th>Aquatic Park</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.goldenGate.time.getTime()}>
            <td>{row.label}</td>
            <td>{formatDateTime(row.goldenGate.time)}</td>
            <td>{row.goldenGate.value}</td>
            <td>{formatDateTime(row.aquaticPark.time)}</td>
            <td>{row.aquaticPark.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

