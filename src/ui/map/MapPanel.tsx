// The map, in one of two views picked with the COVE / BAY buttons over it:
// - COVE: the cove up close (CurrentMap.tsx), with NOAA's SFBOFS model when it covers
//   the day, otherwise NOAA's Alcatraz SW prediction (the same source as the tiles).
// - BAY: the Golden Gate Bridge to Pier 41, with NOAA's SFBOFS model current (WideMap.tsx).
// No zooming in between. Both get the SFBOFS model's field from App.

import { useState } from 'react'
import type { CurrentField } from '../../domain/currentField'
import type { CurrentPhase } from '../../domain/types'
import type { CurrentSource } from '../sourcePages'
import { CurrentMap } from './CurrentMap'
import { WideMap } from './WideMap'

type View = 'cove' | 'bay'

type Props = {
  time: Date
  /** The SFBOFS model's field around the selected time; null while loading or without data. */
  field: CurrentField | null
  /** Where the tiles' current comes from; the COVE view uses the same. */
  currentSource: CurrentSource
  /** The tiles' current, for the COVE view. Phase is null while loading. */
  phase: CurrentPhase | null
  speedKt: number
}

export function MapPanel({ time, field, currentSource, phase, speedKt }: Props) {
  const [view, setView] = useState<View>('cove')

  function show(next: View) {
    setView(next)
  }

  const controls = (
    <div className="map__views mono" role="group" aria-label="Map view">
      <button type="button" aria-pressed={view === 'cove'} onClick={() => show('cove')}>
        COVE
      </button>
      <button type="button" aria-pressed={view === 'bay'} onClick={() => show('bay')}>
        BAY
      </button>
    </div>
  )

  if (view === 'bay') return <WideMap field={field} time={time} controls={controls} />
  return (
    <CurrentMap phase={phase} speedKt={speedKt} field={field} time={time} currentSource={currentSource} controls={controls} />
  )
}
