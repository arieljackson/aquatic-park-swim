// Top of the page: the name, a Now button, and ‹ day › around the selected day and time.
// Phone: name and Now on the first row, the day below. Laptop: all three in one row.

import { formatDay, formatTime } from '../time/format'
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
