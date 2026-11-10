// Top of the page: the name, a Now button, and ‹ day › around the selected day and time.
// Phone: name and Now on the first row, the day below. Laptop: all three in one row.
//
// Tapping the day and time opens the device's own date picker. Same trick as the time
// slider: a real <input type="date"> sits invisibly on top of the text, so the phone's
// native calendar or wheel appears without any library.

import type { MouseEvent } from 'react'
import { formatDay, formatTime } from '../time/format'
import { pacificDateString } from '../time/pacific'
import type { SelectedTime } from '../time/useSelectedTime'
import './header.css'

export function Header({ selected }: { selected: SelectedTime }) {
  return (
    <header className="header">
      <h1 className="header__title">Aquatic Park</h1>
      <div className="header__day">
        <button type="button" className="header__step" aria-label="Previous day" onClick={() => selected.stepDays(-1)}>
          ‹
        </button>
        <p className="header__when">
          <span className="header__date">{formatDay(selected.time)}</span>
          <span className="header__time mono">{formatTime(selected.time)} PT</span>
          <CalendarIcon />
          <input
            type="date"
            className="header__picker"
            aria-label="Pick a date"
            value={pacificDateString(selected.time)} // "2026-11-10"
            onChange={(event) => selected.setDate(event.target.value)} // keeps the time of day
            onClick={openPicker}
          />
        </p>
        <button type="button" className="header__step" aria-label="Next day" onClick={() => selected.stepDays(1)}>
          ›
        </button>
      </div>
      <button type="button" className="header__now mono" onClick={selected.goLive} disabled={selected.isLive}>
        NOW
      </button>
    </header>
  )
}

/**
 * On a phone, tapping a date input opens the picker by itself. On a laptop, clicking it
 * would only put a cursor in the hidden text, so we ask the browser to open the calendar.
 * Older browsers don't have showPicker(); there the click does what it always did.
 */
function openPicker(event: MouseEvent<HTMLInputElement>) {
  const input = event.currentTarget
  if (typeof input.showPicker !== 'function') return
  try {
    input.showPicker()
  } catch {
    // Some browsers refuse in certain situations (e.g. inside a frame); nothing to do.
  }
}

/** A small calendar outline, hinting that the day can be tapped. */
function CalendarIcon() {
  return (
    <svg className="header__calendar" width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
      <rect x="0.75" y="2.25" width="11.5" height="10" rx="1.5" />
      <line x1="0.75" y1="5.25" x2="12.25" y2="5.25" />
      <line x1="4" y1="0.75" x2="4" y2="3.5" />
      <line x1="9" y1="0.75" x2="9" y2="3.5" />
    </svg>
  )
}
