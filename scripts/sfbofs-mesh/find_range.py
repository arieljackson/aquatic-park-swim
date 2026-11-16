"""
Finds which of the SFBOFS bay model's mesh elements lie around Aquatic Park.

  python3 scripts/sfbofs-mesh/find_range.py

The model (NOAA's San Francisco Bay Operational Forecast System) computes the
current on a mesh of about 100,000 triangles ("elements"); each has a center
(lonc, latc) and a current (u east, v north) per layer. api/currents.ts reads the
surface current of the elements inside BOX each hour. To keep each read to one
small request, it asks for one contiguous slice of element numbers, the smallest
one holding every element in BOX, and drops the ones outside BOX afterwards.

This script downloads the element centers (about 2 MB of text, once), and prints
that slice and how many elements fall in BOX. Copy the printed constants into
api/currents.ts. Only needs re-running if BOX changes or NOAA changes the mesh.

Uses only the Python standard library.
"""

import json
import urllib.request
from datetime import datetime, timedelta, timezone

OPENDAP_BASE = "https://opendap.co-ops.nos.noaa.gov/thredds/dodsC/NOAA/SFBOFS/MODELS"

# The area the map can show: from the Golden Gate Bridge to past Pier 39, and north
# past Alcatraz. Must match BOX in api/currents.ts.
BOX = {"west": -122.490, "east": -122.398, "south": 37.795, "north": 37.846}


def recent_fields_file():
    """URL of the first hourly fields file of a run from yesterday (surely online)."""
    day = datetime.now(timezone.utc) - timedelta(days=1)
    ymd = day.strftime("%Y%m%d")
    return f"{OPENDAP_BASE}/{day:%Y/%m/%d}/sfbofs.t03z.{ymd}.fields.n001.nc"


def read_block(text, name):
    """The numbers of one variable in OPeNDAP's text answer.

    The answer has a header, then for each variable a line like "lonc[102264]"
    followed by its values, comma separated over several lines, up to a blank line.
    """
    start = text.index("\n" + name + "[")
    first_value_line = text.index("\n", start + 1) + 1
    end = text.find("\n\n", first_value_line)
    if end == -1:
        end = len(text)
    values = text[first_value_line:end].replace("\n", ",").split(",")
    return [float(value) for value in values if value.strip()]


def main():
    url = recent_fields_file() + ".ascii?lonc,latc"
    print(f"Downloading element centers from\n  {url}")
    with urllib.request.urlopen(url, timeout=120) as response:
        text = response.read().decode()

    lons = read_block(text, "lonc")
    lats = read_block(text, "latc")
    if len(lons) != len(lats):
        raise SystemExit("lonc and latc have different lengths")

    inside = []
    for index in range(len(lons)):
        # The model writes longitudes from 0 to 360 (east of Greenwich);
        # the usual −180..180 form is lon − 360.
        lon = lons[index] - 360 if lons[index] > 180 else lons[index]
        lat = lats[index]
        if BOX["west"] <= lon <= BOX["east"] and BOX["south"] <= lat <= BOX["north"]:
            inside.append(index)

    if not inside:
        raise SystemExit("No elements inside BOX")
    first, last = inside[0], inside[-1]
    print(f"{len(lons)} elements in the mesh, {len(inside)} inside BOX")
    print(f"slice {first}..{last}: {last - first + 1} elements read per hour")
    print()
    print("For api/currents.ts:")
    print(f"const BOX = {json.dumps(BOX)}")
    print(f"const FIRST_ELEMENT = {first}")
    print(f"const LAST_ELEMENT = {last}")


if __name__ == "__main__":
    main()
