// The current time, for anything that should follow the clock: live mode, and reloading
// data that keeps changing (today's measurements and model runs).
//
// It updates at the start of every minute, and right away when the page comes back into
// view. Phones pause a page's timers while the screen is off or another app or tab is in
// front, so without the second part a page opened again after an hour would show the old
// time until the next timer fired.

import { useEffect, useState } from 'react'

const MINUTE = 60 * 1000

export function useClock(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    // Wait until the next whole minute, update, and repeat:
    //   wait = 1 minute − (milliseconds already past this minute)
    function scheduleNextMinute() {
      const wait = MINUTE - (Date.now() % MINUTE)
      timer = setTimeout(() => {
        setNow(new Date())
        scheduleNextMinute()
      }, wait)
    }

    // Back in view (also after the browser restores the page from its back/forward
    // cache): update now, and start the minute timer over in case it drifted while paused.
    function catchUp() {
      if (document.visibilityState !== 'visible') return
      clearTimeout(timer)
      setNow(new Date())
      scheduleNextMinute()
    }

    scheduleNextMinute()
    document.addEventListener('visibilitychange', catchUp)
    window.addEventListener('pageshow', catchUp)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', catchUp)
      window.removeEventListener('pageshow', catchUp)
    }
  }, [])

  return now
}
