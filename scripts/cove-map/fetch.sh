#!/usr/bin/env bash
# Downloads the OpenStreetMap features around Aquatic Park into osm.json.
# Only needed to refresh the map data; then run build.py.
# Map data © OpenStreetMap contributors (ODbL).
set -euo pipefail
cd "$(dirname "$0")"

BBOX='37.8015,-122.4330,37.8135,-122.4120' # south,west,north,east
QUERY="[out:json][timeout:60];
(
  way[\"natural\"=\"coastline\"]($BBOX);
  way[\"man_made\"~\"pier|breakwater\"]($BBOX);
  way[\"natural\"=\"beach\"]($BBOX);
  way[\"building\"]($BBOX);
  way[\"leisure\"~\"park|garden\"]($BBOX);
  way[\"landuse\"~\"grass|recreation_ground\"]($BBOX);
  way[\"highway\"~\"^(primary|secondary|tertiary|residential|unclassified|pedestrian)$\"]($BBOX);
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
