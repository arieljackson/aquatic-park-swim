// The current-state glyph: an arrow angled up for flood, down for ebb, and a diamond
// for slack (the same ◆ that marks slack on the time slider).

import type { CurrentPhase } from '../domain/types'

const DESCRIPTION: Record<CurrentPhase, string> = {
  flood: 'Arrow angled up: flood',
  ebb: 'Arrow angled down: ebb',
  slack: 'Diamond: slack',
}

export function StateGlyph({ phase, size }: { phase: CurrentPhase; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={DESCRIPTION[phase]}>
      <g fill="none" stroke="currentColor" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round">
        {phase === 'flood' && (
          <>
            <path d="M7 31 L31 9" />
            <path d="M17 9 L31 9 L31 23" />
          </>
        )}
        {phase === 'ebb' && (
          <>
            <path d="M7 9 L31 31" />
            <path d="M31 17 L31 31 L17 31" />
          </>
        )}
        {phase === 'slack' && <path d="M20 7 L31 20 L20 33 L9 20 Z" fill="currentColor" />}
      </g>
    </svg>
  )
}
