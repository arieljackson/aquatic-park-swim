// True when the screen is laptop-wide (1024px or more): the same breakpoint as the
// two-column layout in app.css. Updates when the window is resized or a phone rotates.
//
// Most layout changes are pure CSS. This hook is for the few places where the page
// puts a component in a different spot in the page (not just a different style),
// such as the time slider: right under the map on phones, beside the charts on laptops.

import { useSyncExternalStore } from 'react'

const WIDE_QUERY = '(min-width: 1024px)'

/** Tells React to re-check whenever the media query starts or stops matching. */
function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function isWideNow(): boolean {
  return window.matchMedia(WIDE_QUERY).matches
}

export function useIsWide(): boolean {
  return useSyncExternalStore(subscribe, isWideNow)
}
