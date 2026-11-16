"""
Builds the BAY map (Golden Gate Bridge to Pier 41, past Alcatraz) from OpenStreetMap data.

  python3 scripts/wide-map/build.py

Reads scripts/wide-map/osm.json (downloaded with fetch.sh) and writes
src/ui/map/wideShapes.ts: SVG path strings for each map layer, the view, and the
projection (so the app can place the SFBOFS model's points on the same map). Same
projection as the cove map (scripts/cove-map/build.py), so both share map units. Only
needs re-running if the data or the view change.

Map data © OpenStreetMap contributors, available under the Open Database License.
"""

import json
import math
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE.parent.parent / "src" / "ui" / "map" / "wideShapes.ts"

# ---------------------------------------------------------------------------
# View and projection
# ---------------------------------------------------------------------------

# Map units are about meters, the same as the cove map's (same center, scale and
# rotation). EXTENT is the BAY view: from just west of the Golden Gate Bridge to just
# past Pier 41, and north past Alcatraz. It has the map frame's shape, so it fills the
# same frame as the cove map:  height = 0.72 × width = 0.72 × 6100 ≈ 4392
# Shapes are kept if they touch it.
CENTER_LAT, CENTER_LON = 37.8093, -122.4241
WIDTH, HEIGHT = 1600, 720  # SVG units
EXTENT = (-4000, -3100, 2100, 1292)  # x0, y0, x1, y1

# The area fetch.sh downloads (WIDE there), which covers EXTENT. Shorelines are closed
# off around the outside of it (see close_shore).
AREA = {"south": 37.7885, "west": -122.4895, "north": 37.8455, "east": -122.3975}
FAR_DEG = 0.05  # how far outside AREA the closing edges run
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


# The Golden Gate Bridge's towers (from OpenStreetMap), drawn as small squares on the deck.
BRIDGE_TOWERS = [(37.81145, -122.47755), (37.82575, -122.47915)]

# Smaller parks (square map units, about m²) are left out: too small to see, and there are
# hundreds of them in the Presidio.
MIN_PARK_AREA = 5000



def polygon_area(pts):
    """Area of a closed outline, by the shoelace formula:
         area = |Σ (x_i · y_(i+1) − x_(i+1) · y_i)| / 2
    """
    total = 0
    for i in range(len(pts) - 1):
        total += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
    return abs(total) / 2


def join_pieces(pieces):
    """Coastline pieces (lists of {lat, lon}) → whole shorelines, as lists of (lat, lon).

    Each shoreline starts with a piece no other piece leads into, then keeps adding the
    piece that starts where the line so far ends.
    """
    def same(a, b):
        return a["lat"] == b["lat"] and a["lon"] == b["lon"]

    firsts = [p for p in pieces if not any(same(q[-1], p[0]) for q in pieces)]
    used = 0
    shores = []
    for first in firsts:
        line = list(first)
        used += 1
        while True:
            following = [p for p in pieces if same(p[0], line[-1])]
            if not following:
                break
            line += following[0][1:]
            used += 1
        shores.append([(g["lat"], g["lon"]) for g in line])
    if used != len(pieces):
        raise SystemExit("Some coastline pieces don't join up into shorelines")
    return shores


def close_shore(shore):
    """An open shoreline (lat, lon) → a closed outline of the land beside it.

    OpenStreetMap keeps land on the left of a coastline. Both ends lie outside AREA. From
    the end, step straight out to a box FAR_DEG around AREA, then follow that box
    counterclockwise (north up: land stays on the left) to where the start steps out, and
    back in to the start.

    Positions around the box are numbered 0 to 4, counterclockwise from the southwest
    corner: south side 0–1 (west → east), east side 1–2 (south → north), north side 2–3
    (east → west), west side 3–4 (north → south).
    """
    south, north = AREA["south"] - FAR_DEG, AREA["north"] + FAR_DEG
    west, east = AREA["west"] - FAR_DEG, AREA["east"] + FAR_DEG
    corners = {1: (south, east), 2: (north, east), 3: (north, west), 4: (south, west)}

    def out_to_box(lat, lon):
        """The box point straight out from (lat, lon), on the side it's furthest past, and its position."""
        past = {
            "south": AREA["south"] - lat,
            "east": lon - AREA["east"],
            "north": lat - AREA["north"],
            "west": AREA["west"] - lon,
        }
        side = max(past, key=past.get)
        if past[side] < 0:
            raise SystemExit(f"A shoreline ends inside the area, at {lat}, {lon}")
        # position = side's start + share of the way along it
        if side == "south":
            return (south, lon), 0 + (lon - west) / (east - west)
        if side == "east":
            return (lat, east), 1 + (lat - south) / (north - south)
        if side == "north":
            return (north, lon), 2 + (east - lon) / (east - west)
        return (lat, west), 3 + (north - lat) / (north - south)

    end_point, end_position = out_to_box(*shore[-1])
    start_point, start_position = out_to_box(*shore[0])
    if start_position < end_position:
        start_position += 4  # go on around, past the southwest corner
    outline = list(shore) + [end_point]
    for corner in range(math.floor(end_position) + 1, math.ceil(start_position)):
        outline.append(corners[(corner - 1) % 4 + 1])
    outline.append(start_point)
    return outline


def main():
    data = json.loads((HERE / "osm.json").read_text())
    ways = [e for e in data["elements"] if e["type"] == "way"]

    def points(way):
        return [project(g["lat"], g["lon"]) for g in way["geometry"]]

    def is_closed(way):
        g = way["geometry"]
        return len(g) > 3 and g[0] == g[-1]

    def in_view(pts, margin=50):
        """True if any part of the shape's bounding box overlaps EXTENT."""
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        x0, y0, x1, y1 = EXTENT
        return max(xs) > x0 - margin and min(xs) < x1 + margin and max(ys) > y0 - margin and min(ys) < y1 + margin

    def tags(way):
        return way.get("tags", {})

    # Land. OpenStreetMap's coastline pieces join end to start, with land on their left.
    # Closed rings are islands (Alcatraz, rocks by the bridge); the rest join into open
    # shorelines (San Francisco's, and Marin's across the Golden Gate) that run out past
    # the area on both ends. Each is closed off around the outside of the area.
    coast_ways = [w for w in ways if tags(w).get("natural") == "coastline"]
    islands = [points(w)[:-1] for w in coast_ways if is_closed(w)]
    pieces = [w["geometry"] for w in coast_ways if not is_closed(w)]
    land = [[project(lat, lon) for lat, lon in close_shore(shore)] for shore in join_pieces(pieces)] + islands

    # The Golden Gate Bridge: its road deck, drawn as thick lines.
    bridge = [points(w) for w in ways if tags(w).get("name") == "Golden Gate Bridge" and tags(w).get("highway")]
    towers = [project(lat, lon) for lat, lon in BRIDGE_TOWERS]

    beaches = []
    for way in ways:
        pts = points(way)
        if tags(way).get("natural") == "beach" and is_closed(way) and in_view(pts):
            beaches.append(pts[:-1])

    piers = []  # filled shapes (closed outlines)
    breakwaters = []  # thick lines (open breakwaters); open piers (floating docks) are too
    # small to see at this scale and are left out
    for way in ways:
        kind = tags(way).get("man_made")
        if kind not in ("pier", "breakwater"):
            continue
        pts = points(way)
        if not in_view(pts):
            continue
        if is_closed(way):
            piers.append(pts[:-1])
        elif kind == "breakwater":
            breakwaters.append(pts)

    parks = []
    for way in ways:
        t = tags(way)
        pts = points(way)
        if not in_view(pts):
            continue
        is_park = t.get("leisure") in ("park", "garden") or t.get("landuse") in ("grass", "recreation_ground")
        if is_park and is_closed(way) and polygon_area(pts) >= MIN_PARK_AREA:
            parks.append(pts[:-1])

    def path(pts, closed):
        d = "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        return d + ("Z" if closed else "")

    def joined(shapes, closed):
        """Many shapes as one path string, so each layer is a single SVG element."""
        return " ".join(path(s, closed) for s in shapes)

    def xy(p):
        return f"{{ x: {p[0]:.1f}, y: {p[1]:.1f} }}"

    lines = [
        "// Generated by scripts/wide-map/build.py — do not edit by hand.",
        "// Map data © OpenStreetMap contributors. This file is derived from OpenStreetMap",
        "// and is available under the Open Database License (ODbL):",
        "// https://opendatacommons.org/licenses/odbl/",
        "",
        f"export const MAP_WIDTH = {WIDTH}",
        f"export const MAP_HEIGHT = {HEIGHT}",
        f"export const MAP_ROTATION_DEG = {ROTATION_DEG} // map turned clockwise; north is this far clockwise from up",
        "",
        "// The projection (see build.py): x, y from latitude/longitude around this center,",
        "// in map units per degree of latitude.",
        f"export const MAP_CENTER = {{ lat: {CENTER_LAT}, lon: {CENTER_LON} }}",
        f"export const MAP_SCALE = {SCALE}",
        "",
        "// Layers, bottom to top. Each is one SVG path string.",
        f"export const LAND = '{joined(land, True)}'",
        f"export const PARKS = '{joined(parks, True)}'",
        f"export const BEACH = '{joined(beaches, True)}'",
        f"export const PIERS = '{joined(piers, True)}'",
        f"export const BREAKWATERS = '{joined(breakwaters, False)}'",
        f"export const BRIDGE = '{joined(bridge, False)}'",
        "export const BRIDGE_TOWERS = [" + ", ".join(xy(p) for p in towers) + "]",
        "",
        f"/** The BAY map's view (x, y, width, height); everything above covers it. */",
        f"export const WIDE_VIEW = {{ x: {EXTENT[0]}, y: {EXTENT[1]}, width: {EXTENT[2] - EXTENT[0]}, height: {EXTENT[3] - EXTENT[1]} }}",
        "",
    ]
    OUT.write_text("\n".join(lines))
    size_kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.name}: {len(land)} land shapes, {len(parks)} parks, {len(piers)} piers, "
          f"{size_kb:.0f} KB")


if __name__ == "__main__":
    main()
