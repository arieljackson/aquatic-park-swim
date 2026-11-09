// The page: header, map, the numbers, the day's chart with the
// time slider, air and water temperature, caption. Everything follows one selected time.
//
// One layout for every screen, mobile first: on a phone everything stacks; at 1024px
// and wider, app.css arranges the same pieces in two columns (see .layout).

import { usePredictions } from './data/usePredictions'
import { conditionsAt } from './domain/conditions'
import type { Conditions, PredictionData } from './domain/types'
import { formatDay } from './time/format'
import { useSelectedTime } from './time/useSelectedTime'
import { CurrentChart, TideChart } from './ui/charts/DayChart'
import { useElementWidth } from './ui/charts/useElementWidth'
import { dayAxis } from './ui/dayAxis'
import { DebugTables } from './ui/DebugTables'
import { Header } from './ui/Header'
import { CurrentMap } from './ui/map/CurrentMap'
import { Panels } from './ui/Panels'
import { TimeSlider } from './ui/TimeSlider'
import './app.css'

/** The debug tables (Golden Gate vs. Aquatic Park) show only with ?debug in the URL. */
const showDebug = new URLSearchParams(window.location.search).has('debug')

function App() {
  const selected = useSelectedTime()
  const { data, error } = usePredictions(selected.time)
  const aquaticPark = data === null ? null : data.aquaticPark
  const conditions = aquaticPark === null ? null : conditionsAt(selected.time, aquaticPark)

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
        {conditions !== null && (
          <div className="layout__panels">
            <Panels conditions={conditions} />
          </div>
        )}
        {aquaticPark !== null && (
          <div className="layout__day">
            <DaySection data={aquaticPark} conditions={conditions} time={selected.time} onSelect={selected.setTime} />
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
}

/**
 * The day's tiles: time slider, then the tide and current charts. They share one width and
 * one day axis, so their times line up.
 */
function DaySection({ data, conditions, time, onSelect }: DaySectionProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const axis = dayAxis(time, width)
  const chartProps = { data, conditions, axis, width, onSelect }
  return (
    <section className="day">
      <h2 className="label">{formatDay(time)} · Pacific Time</h2>
      <div className="tile">
        <h3 className="label">Time</h3>
        {/* Measured here; the chart tiles below have the same width. */}
        <div ref={ref}>
          {width > 0 && (
            <TimeSlider axis={axis} width={width} time={time} currentEvents={data.current.events} onSelect={onSelect} />
          )}
        </div>
        <p className="day__hint">Drag the bar or tap a chart to choose a time · ◆ = slack</p>
      </div>
      <div className="tile">
        <h3 className="label">Tide</h3>
        {width > 0 && <TideChart {...chartProps} />}
      </div>
      <div className="tile">
        <h3 className="label">Current</h3>
        {width > 0 && <CurrentChart {...chartProps} />}
      </div>
    </section>
  )
}

export default App
