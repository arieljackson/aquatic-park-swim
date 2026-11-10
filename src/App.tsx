// The page: header, map, the numbers, the day's chart with the
// time slider, air and water temperature, caption. Everything follows one selected time.
//
// One layout for every screen, mobile first: on a phone everything stacks; at 1024px
// and wider, app.css arranges the same pieces in two columns (see .layout).
//
// The time slider is the one piece that sits in a different spot: on a phone it comes
// right after the map and stays pinned to the top of the screen while you scroll, so
// you can watch the map and numbers change as you drag. On a laptop it sits above the
// charts, where everything is already in view.

import { usePredictions } from './data/usePredictions'
import { conditionsAt } from './domain/conditions'
import type { Conditions, PredictionData } from './domain/types'
import { formatDay } from './time/format'
import { useSelectedTime } from './time/useSelectedTime'
import type { SelectedTime } from './time/useSelectedTime'
import { CurrentChart, TideChart } from './ui/charts/DayChart'
import { useElementWidth } from './ui/charts/useElementWidth'
import { dayAxis } from './ui/dayAxis'
import { DebugTables } from './ui/DebugTables'
import { Header } from './ui/Header'
import { CurrentMap } from './ui/map/CurrentMap'
import { Panels } from './ui/Panels'
import { TimeSlider } from './ui/TimeSlider'
import { useIsWide } from './ui/useIsWide'
import './app.css'

/** The debug tables (Golden Gate vs. Aquatic Park) show only with ?debug in the URL. */
const showDebug = new URLSearchParams(window.location.search).has('debug')

function App() {
  const selected = useSelectedTime()
  const { data, error } = usePredictions(selected.time)
  const aquaticPark = data === null ? null : data.aquaticPark
  const conditions = aquaticPark === null ? null : conditionsAt(selected.time, aquaticPark)
  const isWide = useIsWide()

  return (
    <main>
      <Header selected={selected} />
      {error !== null && <p className="message">Couldn’t load NOAA data: {error}</p>}
      {data === null && error === null && <p className="message">Loading NOAA predictions…</p>}

      <div className="layout">
        {conditions !== null && (
          <div className="layout__map">
            <CurrentMap phase={conditions.current.phase} speedKt={conditions.current.speedKt} />
          </div>
        )}
        {!isWide && aquaticPark !== null && (
          <div className="layout__slider">
            <TimeTile data={aquaticPark} selected={selected} />
          </div>
        )}
        {conditions !== null && (
          <div className="layout__panels">
            <Panels conditions={conditions} />
          </div>
        )}
        {aquaticPark !== null && (
          <div className="layout__day">
            <DaySection
              data={aquaticPark}
              conditions={conditions}
              time={selected.time}
              onSelect={selected.setTime}
              includeSlider={isWide}
              selected={selected}
            />
          </div>
        )}
        {/* No air or water temperature source yet: the boxes stay empty for now. */}
        <div className="layout__temps temps">
          <section className="temp">
            <h2 className="label">Air temp</h2>
            <p className="temp__value mono">--°F</p>
          </section>
          <section className="temp">
            <h2 className="label">Water temp</h2>
            <p className="temp__value mono">--°F</p>
          </section>
        </div>
        <div className="layout__caption caption">
          <p>
            Calculations for Aquatic Cove roughly estimated by: current occurs 25 min before Golden Gate at half
            speed, tide occurs 15 min later than Golden Gate.
          </p>
          <p>
            Values are estimated from NOAA predictions, and map data is not exact. Real conditions vary, and you
            should always use your own judgment while swimming.
          </p>
          <p>
            Data: tide and current predictions from{' '}
            <a href="https://tidesandcurrents.noaa.gov/">NOAA</a> (stations 9414290 and SFB1203). Correction rule
            from the Dolphin Club’s{' '}
            <a href="https://web.archive.org/web/20250508021732/https://dolphinclub.org/wp-content/uploads/2015/03/DolphinClub_TidesAndCurrents_Guide.pdf">
              “Tides, Currents and Row Planning”
            </a>
            . Map © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors.
          </p>
        </div>
      </div>
      {showDebug && data !== null && <DebugTables data={data} time={selected.time} />}
    </main>
  )
}

type DaySectionProps = {
  data: PredictionData
  conditions: Conditions | null
  time: Date
  onSelect: (time: Date) => void
  /** Laptop: the slider sits here, above the charts. Phone: App puts it under the map instead. */
  includeSlider: boolean
  selected: SelectedTime
}

/**
 * The day's tiles: the time slider (laptop only), then the tide and current charts. They
 * share one width and one day axis, so their times line up.
 */
function DaySection({ data, conditions, time, onSelect, includeSlider, selected }: DaySectionProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const axis = dayAxis(time, width)
  const chartProps = { data, conditions, axis, width, onSelect }
  return (
    <section className="day">
      <h2 className="label">{formatDay(time)} · Pacific Time</h2>
      {includeSlider && <TimeTile data={data} selected={selected} />}
      <div className="tile">
        <h3 className="label">Tide</h3>
        {/* Measured here; the current chart below has the same width. */}
        <div ref={ref}>{width > 0 && <TideChart {...chartProps} />}</div>
      </div>
      <div className="tile">
        <h3 className="label">Current</h3>
        {width > 0 && <CurrentChart {...chartProps} />}
      </div>
    </section>
  )
}

type TimeTileProps = {
  data: PredictionData
  selected: SelectedTime
}

/**
 * The time slider in its tile. It measures its own width, so it works in either spot.
 * Its tile is as wide as the chart tiles, so the slider and the charts share the same day axis.
 */
function TimeTile({ data, selected }: TimeTileProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const time = selected.time
  const axis = dayAxis(time, width)
  return (
    <div className="tile">
      {/* The only key for ◆ on the page, so it stays even without a hint line. */}
      {/* The selected day, e.g. "Tue, Nov 10", since the slider picks a time on that day. */}
      <h3 className="label">{formatDay(time)} · ◆ = slack</h3>
      <div ref={ref}>
        {width > 0 && (
          <TimeSlider
            axis={axis}
            width={width}
            time={time}
            currentEvents={data.current.events}
            onSelect={selected.setTime}
            isLive={selected.isLive}
            onNow={selected.goLive}
          />
        )}
      </div>
    </div>
  )
}

export default App
