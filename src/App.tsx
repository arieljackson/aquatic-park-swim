// The page: header, map, the numbers (current, speed, slack, tide; then air, water,
// wind, water quality), the day's charts with the time slider, caption. Everything follows one selected time.
//
// One layout for every screen, mobile first: on a phone everything stacks; at 1024px
// and wider, app.css arranges the same pieces in two columns (see .layout).
//
// The time slider is the one piece that sits in a different spot: on a phone it comes
// right after the map and stays pinned to the top of the screen while you scroll, so
// you can watch the map and numbers change as you drag. On a laptop it sits above the
// charts, where everything is already in view.

import { usePredictions } from './sources/usePredictions'
import { conditionsAt } from './domain/conditions'
import type { Conditions, CurrentEvent, PredictionData } from './domain/types'
import { formatDay } from './time/format'
import { useSelectedTime } from './time/useSelectedTime'
import { useWeather } from './sources/useWeather'
import type { SelectedTime } from './time/useSelectedTime'
import {
  CURRENT_CHART_HEIGHT,
  ChartPlaceholder,
  CurrentChart,
  TIDE_CHART_HEIGHT,
  TideChart,
} from './ui/charts/DayChart'
import { WIND_CHART_HEIGHT, WindChart, WindKey } from './ui/charts/WindChart'
import { useElementWidth } from './ui/charts/useElementWidth'
import { dayAxis } from './ui/dayAxis'
import { DebugTables } from './ui/DebugTables'
import { Header } from './ui/Header'
import { CurrentMap } from './ui/map/CurrentMap'
import { Panels } from './ui/Panels'
import { TimeSlider } from './ui/TimeSlider'
import { useIsWide } from './ui/useIsWide'
import { WeatherTiles } from './ui/WeatherTiles'
import './app.css'

/** The debug table (tide, Golden Gate vs. Pier 41) shows only with ?debug in the URL. */
const showDebug = new URLSearchParams(window.location.search).has('debug')

function App() {
  const selected = useSelectedTime()
  const { data, error } = usePredictions(selected.time)
  const shown = data === null ? null : data.shown
  const conditions = shown === null ? null : conditionsAt(selected.time, shown)
  const isWide = useIsWide()

  return (
    <main>
      <Header selected={selected} />
      {error !== null && <p className="message">Couldn’t load NOAA data: {error}</p>}

      <div className="layout">
        {/* Everything is drawn from the start and fills in as its data arrives: the map
            without arrows, the tiles with "--", the charts as empty boxes. */}
        <div className="layout__map">
          <CurrentMap
            phase={conditions === null ? null : conditions.current.phase}
            speedKt={conditions === null ? 0 : conditions.current.speedKt}
          />
        </div>
        {!isWide && (
          <div className="layout__slider">
            <TimeTile currentEvents={shown === null ? [] : shown.current.events} selected={selected} />
          </div>
        )}
        <div className="layout__panels">
          <Panels conditions={conditions} />
        </div>
        {/* Right after the top tiles on a phone, so all the numbers come before the charts.
            (On a laptop it sits under the map: the grid places it by name.) */}
        <div className="layout__temps">
          <WeatherTiles time={selected.time} />
        </div>
        <div className="layout__day">
          <DaySection
            data={shown}
            conditions={conditions}
            time={selected.time}
            onSelect={selected.setTime}
            includeSlider={isWide}
            selected={selected}
          />
        </div>
        <div className="layout__caption caption">
          <p>
            Data: tide and current predictions from{' '}
            <a href="https://tidesandcurrents.noaa.gov/">NOAA</a> (stations 9414290 and SFB1204). Tide: Golden Gate with
            NOAA offset to North Point, Pier 41. Current: Alcatraz SW. Water temperature: estimated by NOAA’s{' '}
            <a href="https://tidesandcurrents.noaa.gov/ofs/sfbofs/sfbofs.html">San Francisco Bay model (SFBOFS)</a> at
            North Point, Pier 41; not a measurement. Air temperature and wind: measured at NOAA’s Golden
            Gate station (9414290) for past times, forecast by the{' '}
            <a href="https://www.weather.gov/mtr/">National Weather Service</a> for later ones.
            Water quality: SFPUC’s weekly bacteria samples at Aquatic Park (station 211), from{' '}
            <a href="https://data.sf.gov/d/v3fv-x3ux">DataSF</a>, compared with California’s
            single-sample beach limits; results are published about a week after sampling and
            don’t include advisories. Map ©{' '}
            <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors.
          </p>
          <p>
            This website is still a work in progress. Real conditions vary, and you should always use your own
            judgment while swimming.
          </p>
        </div>
      </div>
      {showDebug && data !== null && <DebugTables data={data} time={selected.time} />}
    </main>
  )
}

type DaySectionProps = {
  data: PredictionData | null // null while loading: tide and current charts show empty boxes
  conditions: Conditions | null
  time: Date
  onSelect: (time: Date) => void
  /** Laptop: the slider sits here, above the charts. Phone: App puts it under the map instead. */
  includeSlider: boolean
  selected: SelectedTime
}

/**
 * The day's tiles: the time slider (laptop only), then the tide, current and wind charts. They
 * share one width and one day axis, so their times line up.
 */
function DaySection({ data, conditions, time, onSelect, includeSlider, selected }: DaySectionProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const axis = dayAxis(time, width)
  // Loaded and cached once (see useWeather), so the weather tiles share this data.
  const weather = useWeather(time)
  const weatherLoading = weather.measured === null && weather.forecast === null
  return (
    <section className="day">
      {/* On a laptop the slider's label, right below, already shows the day. */}
      {!includeSlider && <h2 className="label">{formatDay(time)} · Pacific Time</h2>}
      {includeSlider && <TimeTile currentEvents={data === null ? [] : data.current.events} selected={selected} />}
      <div className="tile">
        <h3 className="label">Tide</h3>
        {/* Measured here; the charts below have the same width. */}
        <div ref={ref}>
          {data === null && <ChartPlaceholder height={TIDE_CHART_HEIGHT} />}
          {data !== null && width > 0 && (
            <TideChart data={data} conditions={conditions} axis={axis} width={width} onSelect={onSelect} />
          )}
        </div>
      </div>
      <div className="tile">
        <h3 className="label">Current</h3>
        {data === null && <ChartPlaceholder height={CURRENT_CHART_HEIGHT} />}
        {data !== null && width > 0 && (
          <CurrentChart data={data} conditions={conditions} axis={axis} width={width} onSelect={onSelect} />
        )}
      </div>
      <div className="tile">
        <h3 className="label">Wind</h3>
        {weatherLoading && <ChartPlaceholder height={WIND_CHART_HEIGHT} />}
        {!weatherLoading && width > 0 && (
          <WindChart weather={weather} axis={axis} width={width} time={time} onSelect={onSelect} />
        )}
        <WindKey />
      </div>
    </section>
  )
}

type TimeTileProps = {
  currentEvents: CurrentEvent[] // empty while loading: the slider works, slack ◆ appear later
  selected: SelectedTime
}

/**
 * The time slider in its tile. It measures its own width, so it works in either spot.
 * Its tile is as wide as the chart tiles, so the slider and the charts share the same day axis.
 */
function TimeTile({ currentEvents, selected }: TimeTileProps) {
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
            currentEvents={currentEvents}
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
