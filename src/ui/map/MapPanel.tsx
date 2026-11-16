// The map, in one of two views picked with the COVE / BAY buttons over it:
// - COVE: the cove up close, with the local current (CurrentMap.tsx: arrows from NOAA's
//   Alcatraz SW prediction, and the cove's eddies).
// - BAY: the Golden Gate Bridge to Pier 41, with NOAA's SFBOFS model current (WideMap.tsx).
// No zooming in between. The SFBOFS model's data is only loaded once BAY has been opened.

import { useState } from 'react'
import type { CurrentPhase } from '../../domain/types'
import { useCurrentField } from '../../sources/currentField'
import { CurrentMap } from './CurrentMap'
import { WideMap } from './WideMap'

type View = 'cove' | 'bay'

type Props = {
  time: Date
  /** NOAA's prediction at Alcatraz SW, for the COVE view. Phase is null while loading. */
  phase: CurrentPhase | null
  speedKt: number
}

export function MapPanel({ time, phase, speedKt }: Props) {
  const [view, setView] = useState<View>('cove')
  // Once BAY has been opened, keep its data loaded (switching back and forth is instant).
  const [bayOpened, setBayOpened] = useState(false)
  const currentField = useCurrentField(time, bayOpened)

  function show(next: View) {
    setView(next)
    if (next === 'bay') setBayOpened(true)
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

  if (view === 'bay') return <WideMap field={currentField.field} time={time} controls={controls} />
  return <CurrentMap phase={phase} speedKt={speedKt} controls={controls} />
}
