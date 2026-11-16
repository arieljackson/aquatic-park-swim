// The current at Aquatic Park cove's mouth from NOAA's SFBOFS model (domain/coveCurrent.ts),
// for the selected day. The day before and the day after are loaded too, so the next
// slack after midnight and the peak of a flood or ebb that started the day before are
// known.

import { useMemo } from 'react'
import type { CurrentField } from '../domain/currentField'
import { mergeFields } from '../domain/currentField'
import { coveCurrentData } from '../domain/coveCurrent'
import type { CurrentData } from '../domain/types'
import { addPacificDays } from '../time/pacific'
import { useCurrentField } from './currentField'

export type CoveCurrent = {
  /** The SFBOFS model's field for the three days, merged; null while the selected day loads or without data. */
  field: CurrentField | null
  /** The cove mouth's current over those days; null while loading or without model data. */
  data: CurrentData | null
}

export function useCoveCurrent(time: Date): CoveCurrent {
  const before = useCurrentField(addPacificDays(time, -1))
  const day = useCurrentField(time)
  const after = useCurrentField(addPacificDays(time, 1))

  const field = useMemo(() => {
    if (day.field === null) return null
    return mergeFields([before.field, day.field, after.field])
  }, [before.field, day.field, after.field])

  const data = useMemo(() => {
    if (field === null) return null
    return coveCurrentData(field)
  }, [field])

  return { field, data }
}
