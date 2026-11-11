# Aquatic Park

**Live:** https://aquaticpark.vercel.app/

This little app shows the conditions at Aquatic Park/Aquatic Cove in San Francisco. I do a lot of (slow) open water swimming at Aquatic Park, and I'm often checking data from various sources before I swim. Or else I'm too lazy to pull up NOAA's website and get surprised by a strong ebb. 

While there's something magical about surrendering yourself to the mystery of ocean conditions, I'd like the option to check everything in one place. 

The NOAA tides are useful, but there are some adjustments to be made for both tide and current closer to North Point (Pier 41) near the cove. I also care about things like the air temp, water temp, and water quality, all of which exist in various public datasets from NOAA and the city of SF.


## What it shows

- **Current:** flood, slack or ebb, with the speed and this flood's or ebb's peak.
- **Next slack:** the time of the next high or low slack, a countdown, and the next
  slack of the other kind.
- **Tide:** height, rising or falling, and the next high or low.
- **Map:** arrows for the current outside the breakwater, and an estimate of how
  water moves inside the cove.
- **Air temp, water temp, wind and water quality:** see "Conditions" below for where
  each comes from.
- **The day's tide, current and wind charts**, with a time slider to look at any moment.
  On a phone the slider stays pinned under the map while you scroll. Tap the date to
  pick another day, or **Now** to go back to the present.

Everything follows the selected time, past or future, as far as each source reaches.
All times are Pacific Time. Wind is in mph; the current is in knots.

## Where the numbers come from

The app uses NOAA's tide predictions for the Golden Gate, shifted to North Point, Pier 41 (next to the cove) with NOAA's own offsets, and NOAA's current predictions for Alcatraz SW, the nearest current station. I started with a rough rule of thumb from an old Dolphin Club guide, then switched to NOAA's numbers.

| | Time | Speed / height |
|---|---|---|
| Current | as NOAA predicts it at Alcatraz SW | as predicted |
| Tide | highs 13 min and lows 11 min later than the Golden Gate | highs 0.2 ft higher, lows unchanged |

- Tide: NOAA station 9414290, San Francisco (Golden Gate), moved to North Point, Pier 41
  (9414305, 0.8 km from the cove) with NOAA's own offsets for Pier 41. NOAA gives Pier 41
  only highs and lows, so between them the app blends the two offsets.
- Current: NOAA station SFB1204, Alcatraz SW ("Alcatraz Island, southwest of" in NOAA's
  list), 2 ft below the surface (bin 18): the nearest current station, about 1.1 km from the cove. Chosen over North
  Point, Pier 35 (SFB1205, 1.4 km east along the waterfront; not the same spot as the Pier 41
  tide station): the two have nearly the same slack times (within ~2 min), but Alcatraz SW
  is closer, reads at swimming depth (2 ft vs. 12 ft), and runs slower (0.60× / 0.97× the
  Golden Gate's flood / ebb, vs. 0.93× / 1.24×), nearer to what the cove feels like.

"Slack" means under 0.2 knots. This is my starting point for what "feels" like slack. Real conditions can differ and I should tune this.

## Conditions

| Tile | Past and now | Later | Reaches |
|---|---|---|---|
| Air temp | Measured at NOAA's Golden Gate station (9414290) | National Weather Service hourly forecast | ~7 days ahead |
| Wind | Measured at 9414290, with gusts | NWS hourly forecast (no gusts) | ~7 days ahead |
| Water temp | NOAA's San Francisco Bay model (SFBOFS) at Pier 41, surface | the same model's forecast | ~1 month back, ~2 days ahead |
| Water quality | SFPUC's weekly bacteria sample at Aquatic Park (station 211) | the latest sample | as far back as the data goes |

- **Water temp is a model estimate:** no thermometer reports water temperature at the
  cove. The model runs four times a day; past hours come from each run's 6-hour
  "nowcast", later hours from the newest run's 48-hour forecast.
- **Water quality** says "Meets standards" or "Fails standards" against California's
  single-sample beach limits (listed under Credits). Results are published about a week
  after sampling and don't include SFPUC's advisories (for example after sewer overflows
  from rain), so the tile links to them. It never says "safe to swim".
- Beyond what a source covers, its tile shows "--".

## Running it

```sh
npm install
npm run dev      # start the dev server
npm run build    # type-check and build to dist/
npm run lint
```

Add `?debug` to the URL to see Golden Gate and Pier 41 tide times side
by side, and `?t=2026-11-08T09:20` to open at a specific time (Pacific).

No API keys are needed. The browser calls NOAA's tides and currents API, the National
Weather Service and DataSF directly. The one exception is water temperature: NOAA's
model server doesn't allow browser requests, so `api/water-temp.ts` runs on Vercel as a
small server function and returns just the numbers needed
(`/api/water-temp?day=2026-11-08`). `npm run dev` can't run it, so the dev server forwards
`/api` requests to the live site (see `vite.config.ts`).

The map is built from OpenStreetMap data by `scripts/cove-map/build.py`, and the
current arrows are placed by `scripts/cove-map/arrows.py`. Both write TypeScript files
in `src/ui/map/`; they only need re-running if the map or arrow layout changes.

## Code layout

```
api/        server code (a Vercel Function): water temperature from NOAA's bay model
src/
  noaa/     the only code that knows NOAA's tides and currents API (predictions,
            measured air temperature and wind)
  domain/   pure types and functions: the Pier 41 tide offsets, conditions at a
            given time, units
  time/     the selected time and Pacific Time helpers
  sources/  loading and caching each source for the selected day (predictions, NWS
            forecast, water temperature via api/, water quality from DataSF), and
            which value to show for a given time
  ui/       React components: header, map, tiles, charts, time slider
scripts/cove-map/   builds the map shapes and arrow positions from OpenStreetMap
```

## Deploying

Vercel builds and deploys the site on every push to `main`. A GitHub Action also runs
`npm run lint` and `npm run build` on each push, since Vercel doesn't lint.

## What's next / open thoughts

- Big thought: tidal currents are really important, and it's hard to 
figure out what to use for current, and how to overlay currents. I landed on Alcatraz SW because it was closest
by distance, but the cove is its own beast. Also, if we want to extend this outside the cove, how do we deal with all the different currents? I'm wondering if there's a bigger more encompassing current model described somewhere that I could either call or implement myself.

I am also thinking about this website: [SF Currents](https://l-36.com/sf_current_overview.php).

- Another big thought: wind is really important too. Wind creates currents as well, and I want it represented better on the map. But again, something like [windfinder](https://www.windfinder.com/#12/37.8267/-122.3853/2026-11-10T21:00Z/report) does an amazing job at this. 

**Other ideas.**

- Widen the map beyond the cove (Crissy Field, China Beach, Alcatraz, etc.) Basically a full bay map with focus on swimming locations.
- Include a way to send suggestions or outreach.
- Finetuning? The five data loaders repeat the same load, cache and ignore-stale-results pattern; one shared hook would remove the repetition.
- The font size and styling could be improved. Font size too small?
- Add NOAA stations and locations to map.
- Can I get access to any hyper local weather data at the clubs themselves? 
- Animal and incident reports

## Credits

- **Tide and current predictions:** [NOAA CO-OPS](https://tidesandcurrents.noaa.gov/)
  (stations 9414290 and SFB1204), with NOAA's offsets for North Point, Pier 41 (9414305).
- **Water temperature:** NOAA's [San Francisco Bay Operational Forecast System
  (SFBOFS)](https://tidesandcurrents.noaa.gov/ofs/sfbofs/sfbofs.html), a computer model
  of the bay: its surface temperature at North Point, Pier 41 (9414305), read from
  [NOAA's OPeNDAP server](https://opendap.co-ops.nos.noaa.gov/thredds/catalog/NOAA/SFBOFS/MODELS/catalog.html).
  A model estimate, not a measurement.
- **Air temperature and wind:** measured at [NOAA CO-OPS](https://tidesandcurrents.noaa.gov/stationhome.html?id=9414290)
  station 9414290 for past times; forecast by the
  [National Weather Service](https://www.weather.gov/documentation/services-web-api)
  (hourly forecast for grid square MTR 85,107) for later ones.
- **Water quality:** San Francisco Public Utilities Commission
  [beach monitoring](https://www.sfpuc.gov/programs/ocean-and-beach-monitoring), weekly
  bacteria samples at Aquatic Park (station 211), via
  [DataSF](https://data.sf.gov/d/v3fv-x3ux) (Public Domain Dedication and License).
  Compared with California's single-sample beach limits
  ([AB 411](https://water.waterboards.ca.gov/water_issues/programs/beaches/beach_water_quality/beaches_program.html)):
  enterococcus 104, fecal coliform 400, total coliform 10,000 (or 1,000 when fecal is
  more than a tenth of total) per 100 mL. Current advisories:
  [SFPUC Beaches and Bay](https://webapps.sfpuc.org/sapps/beachesandbay.html).
- **Map data:** © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- **"Tides, Currents and Row Planning"**, Dolphin Club (Dolphin Swimming & Boating Club,
  San Francisco): the rule of thumb the app started with (current 25 min before the
  Golden Gate at half speed, tide 15 min after), and the style of its current maps.
  [Archived PDF](https://web.archive.org/web/20250508021732/https://dolphinclub.org/wp-content/uploads/2015/03/DolphinClub_TidesAndCurrents_Guide.pdf)
- **Tidal current differences:** NOAA,
  [Tidal Current Tables 2020, Pacific Coast](https://tidesandcurrents.noaa.gov/tidetables/2020/pcct_2020_full_book.pdf)
  (Table 2: differences from the Golden Gate for Alcatraz Island and North Point, Pier 35).
- **Aquatic Park's clubs:** the [Dolphin Club](https://dolphinclub.org/) and the
  [South End Rowing Club](https://serc.com/), the two swimming and rowing clubs on the
  cove (both labeled on the map).

## License

The code is under the [MIT License](LICENSE).

The map shapes in `src/ui/map/coveShapes.ts` are derived from OpenStreetMap data and
are available under the [Open Database License](https://opendatacommons.org/licenses/odbl/)
(ODbL). NOAA's predictions are a work of the U.S. government.
