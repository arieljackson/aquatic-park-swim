// Measures an element's width and updates when it resizes, so charts can draw at
// their real pixel size (text stays the same size on phone and desktop).

import { useLayoutEffect, useRef, useState } from 'react'

export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  // useLayoutEffect runs after the element is on the page but before it's painted,
  // so the first frame already has the right width.
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    // Measure right away: don't rely on the observer's first callback, which some
    // browsers deliver late.
    setWidth(element.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}
