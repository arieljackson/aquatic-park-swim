"""
Builds the cove map from OpenStreetMap data.

  python3 scripts/cove-map/build.py

Reads scripts/cove-map/osm.json (downloaded with fetch.sh) and writes
src/ui/map/coveShapes.ts: SVG path strings for each map layer and the clubs'
positions. Only needs re-running if the data or the crop change. The current arrows
are placed separately, by arrows.py.

Map data © OpenStreetMap contributors, available under the Open Database License.
"""

import json
import math
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE.parent.parent / "src" / "ui" / "map" / "coveShapes.ts"

# ---------------------------------------------------------------------------
# View and projection
# ---------------------------------------------------------------------------

# Centered on the cove, from Fort Mason to Fisherman's Wharf. The app shows the
# middle part (see CurrentMap.tsx).
CENTER_LAT, CENTER_LON = 37.8093, -122.4241
WIDTH, HEIGHT = 1600, 720  # SVG units
SCALE = 115066.7  # SVG units per degree of latitude (about 1 unit per meter)

# Rotation, from the main channel's flood/ebb axis at NOAA's Golden Gate station
# (SFB1203): mean flood direction 69°, mean ebb direction 257°. The shared axis is the
# average of the flood direction and the ebb direction turned around:
#   axis = (69 + (257 - 180)) / 2 = 73°   (compass degrees, clockwise from north)
# Turning the map clockwise by 90 - 73 = 17° makes that axis horizontal, so flood
# arrows point right and ebb arrows point left. North is then 17° clockwise from up.
# The app's current station, Alcatraz SW (SFB1204: flood 86°, ebb 271°), has an axis
# of (86 + 91) / 2 = 88.5°, about 15° off horizontal on this map; the arrows are drawn
# left/right regardless.
ROTATION_DEG = 17

LON_FACTOR = math.cos(math.radians(CENTER_LAT))
ANGLE = math.radians(ROTATION_DEG)


def project(lat, lon):
    """Latitude/longitude → SVG x/y.

    1. Flat projection around the center. At this small scale the earth is flat enough:
         x = (lon - CENTER_LON) * cos(CENTER_LAT) * SCALE
         y = (CENTER_LAT - lat) * SCALE          (SVG y grows downward)
       cos(latitude) corrects for longitude lines being closer together away from the equator.
    2. Rotate clockwise by ROTATION_DEG around the center (standard rotation, with y down):
         x' = x * cos(angle) - y * sin(angle)
         y' = x * sin(angle) + y * cos(angle)
    3. Move the center to the middle of the view.
    """
    x = (lon - CENTER_LON) * LON_FACTOR * SCALE
    y = (CENTER_LAT - lat) * SCALE
    rotated_x = x * math.cos(ANGLE) - y * math.sin(ANGLE)
    rotated_y = x * math.sin(ANGLE) + y * math.cos(ANGLE)
    return (rotated_x + WIDTH / 2, rotated_y + HEIGHT / 2)


# ---------------------------------------------------------------------------
# Features
# ---------------------------------------------------------------------------

COASTLINE = [32648495, 82246922, 911701793]  # stitched in this order: east → west
BEACH = 224941181
BREAKWATERS = [587550500, 23605140]  # the east breakwater and its short end piece
CLUBS = {"dolphinClub": 288391828, "southEnd": 288391837}

ROAD_CLASSES = ["primary", "secondary", "tertiary", "residential", "unclassified", "pedestrian"]


def main():
    data = json.loads((HERE / "osm.json").read_text())
    ways = [e for e in data["elements"] if e["type"] == "way"]
    by_id = {e["id"]: e for e in ways}

    def points(way):
        return [project(g["lat"], g["lon"]) for g in way["geometry"]]

    def is_closed(way):
        g = way["geometry"]
        return len(g) > 3 and g[0] == g[-1]

    def in_view(pts, margin=50):
        """True if any part of the shape's bounding box overlaps the view."""
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        return max(xs) > -margin and min(xs) < WIDTH + margin and max(ys) > -margin and min(ys) < HEIGHT + margin

    def tags(way):
        return way.get("tags", {})

    # Land: the coastline runs east → west with land on its south side. Close it off
    # far below and beside the view; the SVG crops what's outside.
    coast = []
    for way_id in COASTLINE:
        pts = points(by_id[way_id])
        coast += pts if not coast else pts[1:]
    far = 1500
    land = coast + [
        (coast[-1][0] - far, coast[-1][1]),
        (coast[-1][0] - far, HEIGHT + far),
        (coast[0][0] + far, HEIGHT + far),
        (coast[0][0] + far, coast[0][1]),
    ]

    beach = points(by_id[BEACH])[:-1]

    piers = []  # filled shapes (closed outlines)
    docks = []  # thin lines (open ways): floating docks and fingers
    for way in ways:
        if tags(way).get("man_made") != "pier":
            continue
        pts = points(way)
        if not in_view(pts):
            continue
        if is_closed(way):
            piers.append(pts[:-1])
        else:
            docks.append(pts)

    breakwaters = [points(by_id[w]) for w in BREAKWATERS]

    parks = []
    buildings = []
    roads = {cls: [] for cls in ROAD_CLASSES}
    for way in ways:
        t = tags(way)
        pts = points(way)
        if not in_view(pts):
            continue
        is_park = t.get("leisure") in ("park", "garden") or t.get("landuse") in ("grass", "recreation_ground")
        if is_park and is_closed(way):
            parks.append(pts[:-1])
        elif "building" in t and is_closed(way):
            buildings.append(pts[:-1])
        elif t.get("highway") in roads:
            roads[t["highway"]].append(pts)

    clubs = {}
    for name, way_id in CLUBS.items():
        pts = points(by_id[way_id])
        # Center = average of the outline's points (good enough for a small building).
        clubs[name] = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))

    def path(pts, closed):
        d = "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        return d + ("Z" if closed else "")

    def joined(shapes, closed):
        """Many shapes as one path string, so each layer is a single SVG element."""
        return " ".join(path(s, closed) for s in shapes)

    def xy(p):
        return f"{{ x: {p[0]:.1f}, y: {p[1]:.1f} }}"

    lines = [
        "// Generated by scripts/cove-map/build.py — do not edit by hand.",
        "// Map data © OpenStreetMap contributors. This file is derived from OpenStreetMap",
        "// and is available under the Open Database License (ODbL):",
        "// https://opendatacommons.org/licenses/odbl/",
        "",
        f"export const MAP_WIDTH = {WIDTH}",
        f"export const MAP_HEIGHT = {HEIGHT}",
        f"export const MAP_ROTATION_DEG = {ROTATION_DEG} // map turned clockwise; north is this far clockwise from up",
        "",
        "// Layers, bottom to top. Each is one SVG path string.",
        f"export const LAND = '{path(land, True)}'",
        f"export const PARKS = '{joined(parks, True)}'",
        f"export const BUILDINGS = '{joined(buildings, True)}'",
        "export const ROADS = {",
        *[f"  {cls}: '{joined(roads[cls], False)}'," for cls in ROAD_CLASSES],
        "}",
        f"export const BEACH = '{path(beach, True)}'",
        f"export const PIERS = '{joined(piers, True)}'",
        f"export const DOCKS = '{joined(docks, False)}'",
        f"export const BREAKWATERS = '{joined(breakwaters, False)}'",
        "",
        "// The clubs (centers of their buildings)",
        "export const CLUBS = {",
        *[f"  {name}: {xy(p)}," for name, p in clubs.items()],
        "}",
        "",
    ]
    OUT.write_text("\n".join(lines))
    size_kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.name}: {len(parks)} parks, {len(buildings)} buildings, {len(piers)} piers, "
          f"{len(docks)} docks, {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
