#!/usr/bin/env bash
# Downloads the OpenStreetMap features for the BAY map (Golden Gate Bridge to Pier 41)
# into osm.json.
# Only needed to refresh the map data; then run build.py.
# Map data © OpenStreetMap contributors (ODbL).
set -euo pipefail
cd "$(dirname "$0")"

# The area (south,west,north,east), a little bigger than the BAY view: shoreline,
# piers, beaches, parks and the bridge.
WIDE='37.7885,-122.4895,37.8455,-122.3975'
QUERY="[out:json][timeout:90];
(
  way[\"natural\"=\"coastline\"]($WIDE);
  way[\"man_made\"~\"pier|breakwater\"]($WIDE);
  way[\"natural\"=\"beach\"]($WIDE);
  way[\"leisure\"~\"park|garden\"]($WIDE);
  way[\"landuse\"~\"grass|recreation_ground\"]($WIDE);
  way[\"man_made\"=\"bridge\"]($WIDE);
  way[\"bridge\"=\"yes\"][\"name\"=\"Golden Gate Bridge\"]($WIDE);
);
out geom tags;"

# The public server is sometimes busy. Retry with growing waits, and only replace
# osm.json once we have a valid response.
for wait in 5 10 20 40; do
  if curl -s --max-time 120 -A "aquatic-park (personal project)" \
      --data-urlencode "data=$QUERY" https://overpass-api.de/api/interpreter -o osm.tmp.json \
    && python3 -c "import json,sys; d=json.load(open('osm.tmp.json')); sys.exit(0 if d.get('elements') else 1)" 2>/dev/null; then
    mv osm.tmp.json osm.json
    echo "saved osm.json"
    exit 0
  fi
  echo "server busy or bad response; retrying in ${wait}s"
  sleep "$wait"
done
rm -f osm.tmp.json
echo "gave up; osm.json unchanged" >&2
exit 1
