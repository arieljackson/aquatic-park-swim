# Aquatic Park

This little app shows the current conditions at Aquatic Park/Aquatic Cove in San Francisco. I do a lot of open water swimming at Aquatic Park (shout-out to the South End Rowing Club), not that I'm a particularly talented swimmer.

Before every swim, I check the NOAA tides, but turning the NOAA graphs into actual information takes me a minute. I wanted a way to quickly determine an ebb/flood, adjust for the Aquatic Park cove, and determine what direction the water is actually moving.

This data mostly comes from the Golden Gate NOAA station, along with another station that describes the current. I might need to do some more work to iron out the station details. You can see the exact implementation below.



## What it shows

- **Current:** strong or weak flood, slack, weak or strong ebb, with the speed and
this flood's or ebb's peak. >=1 kt is "strong" (this is my own guess at a "strong" current, might need to be updated)
- **Next slack:** the time of the next high or low slack, a countdown, and the next
  slack of the other kind.
- **Tide:** height, rising or falling, and the next high or low.
- **Map:** arrows for the current outside the breakwater, and an estimate of how
  water moves inside the cove.
- **The day's tide and current charts**, with a time slider to look at any moment.

All times are Pacific Time.

## Where the numbers come from

The app uses NOAA's predictions for the Golden Gate, then shifts them to Aquatic Park using tips I found in an old Dolphin Club tide pdf:

| | Time | Speed / height |
|---|---|---|
| Current | 25 min earlier than the Golden Gate | half the speed |
| Tide | 15 min later than the Golden Gate | unchanged |

- Tide: NOAA station 9414290, San Francisco (Golden Gate)
- Current: NOAA station SFB1203, Golden Gate Bridge (0.46 nm E)

"Strong" means 1 knot or more and "slack" means under 0.2 knots (at Aquatic Park,
after the correction). These are predictions with a rough local correction, not live
measurements. Real conditions can differ.

## Running it

```sh
npm install
npm run dev      # start the dev server
npm run build    # type-check and build to dist/
npm run lint
```

No API key or login/backend is needed: NOAA's API is public and the browser calls it
directly. Add `?debug` to the URL to see Golden Gate and Aquatic Park event times side
by side, and `?t=2026-11-08T09:20` to open at a specific time (Pacific).

The map is built from OpenStreetMap data by `scripts/cove-map/build.py`, and the
current arrows are placed by `scripts/cove-map/arrows.py`. Both write TypeScript files
in `src/ui/map/`; they only need re-running if the map or arrow layout changes.

## Code layout

```
api/        server code (a Vercel Function): water temperature from NOAA's bay model
src/
  noaa/     the only code that knows NOAA's API and response format
  domain/   types, the Aquatic Park correction, and conditions at a given time
  time/     the selected time and Pacific Time helpers
  data/     loading and caching a day of predictions
  ui/       React components: header, map, tiles, charts, time slider
```

## Credits

- **Tide and current predictions:** [NOAA CO-OPS](https://tidesandcurrents.noaa.gov/)
  (stations 9414290 and SFB1203).
- **Water temperature:** NOAA's [San Francisco Bay Operational Forecast System
  (SFBOFS)](https://tidesandcurrents.noaa.gov/ofs/sfbofs/sfbofs.html), a computer model
  of the bay: its surface temperature at North Point, Pier 41 (9414305), read from
  [NOAA's OPeNDAP server](https://opendap.co-ops.nos.noaa.gov/thredds/catalog/NOAA/SFBOFS/MODELS/catalog.html).
  A model estimate, not a measurement.
- **Map data:** © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- **"Tides, Currents and Row Planning"**, Dolphin Club (Dolphin Swimming & Boating Club,
  San Francisco): the correction rule above, and the style of its current maps.
  [Archived PDF](https://web.archive.org/web/20250508021732/https://dolphinclub.org/wp-content/uploads/2015/03/DolphinClub_TidesAndCurrents_Guide.pdf)

## License

The code is under the [MIT License](LICENSE).

The map shapes in `src/ui/map/coveShapes.ts` are derived from OpenStreetMap data and
are available under the [Open Database License](https://opendatacommons.org/licenses/odbl/)
(ODbL). NOAA's predictions are a work of the U.S. government.
