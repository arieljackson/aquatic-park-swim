"""
Places the current arrows on the map.

  python3 scripts/cove-map/arrows.py

Reads the map shapes from src/ui/map/coveShapes.ts and writes
src/ui/map/arrowLayout.ts. Every arrow is checked along its whole length, at the
biggest speed we expect, so it never touches land, piers, docks, the breakwater or
the boxes that float over the map. Only needs re-running if the shapes, the arrow
sizes or the regions below change.

Two kinds of arrows:
- Open water (outside the cove, not in the harbor): straight, on a staggered grid.
  They point east on a flood, west on an ebb; length follows speed.
- Cove: a few long curving "eddy" arrows (like the back-eddy arrows in the Dolphin
  Club guide), drawn by hand below: one between the opening and the middle of the
  cove, and three sweeping across it in the direction of the current. Each is a
  quadratic curve given in its flood direction; on an ebb it's drawn backwards.
  An estimate, not a NOAA station.

The map is rotated 17° so east/west (flood/ebb) is left/right; "away from shore" is up.
"""

import math
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
SHAPES = ROOT / "src/ui/map/coveShapes.ts"
OUT = ROOT / "src/ui/map/arrowLayout.ts"

# Keep these in step with CurrentMap.tsx.
UNITS_PER_KNOT = 60  # open-water arrow length per knot of current (map units)
MAX_KT = 1.6  # about the biggest Aquatic Park speed in NOAA's predictions: check clearance at this

src = SHAPES.read_text()


def const(name):
    return re.search(r"export const %s = '([^']*)'" % name, src).group(1)


def rings(d):
    """Path string with only M/L/Z → list of point lists."""
    result = []
    for part in re.split(r"(?=M)", d):
        points = [(float(a), float(b)) for a, b in re.findall(r"(-?[\d.]+),(-?[\d.]+)", part)]
        if points:
            result.append(points)
    return result


LAND, PIERS, BEACH = rings(const("LAND")), rings(const("PIERS")), rings(const("BEACH"))
DOCKS, BREAKWATERS = rings(const("DOCKS")), rings(const("BREAKWATERS"))

# Regions traced by hand from the map (map units).
COVE = [(540, 420), (555, 300), (610, 235), (700, 190), (790, 190), (845, 250), (880, 300),
        (945, 295), (1045, 495), (1000, 560), (700, 645), (540, 570)]
HARBOR = [(880, 300), (926, 198), (1192, 161), (1300, 170), (1300, 720), (1000, 720),
          (1045, 495), (945, 295)]

# Boxes floating over the map (tag, key, north arrow, club label), sized for a phone.
OVERLAYS = [(300, 640, 0, 80), (300, 760, 590, 720), (1200, 1300, 0, 100), (1040, 1300, 600, 660)]


def inside(point, polygons):
    """Even-odd rule across all rings: is the point inside?"""
    x, y = point
    result = False
    for ring in polygons:
        for i in range(len(ring)):
            (x1, y1), (x2, y2) = ring[i], ring[i - 1]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                result = not result
    return result


def distance_to_segment(p, a, b):
    (px, py), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    length_squared = dx * dx + dy * dy
    t = 0 if length_squared == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / length_squared))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def near(p, lines, closed, distance):
    for ring in lines:
        count = len(ring) if closed else len(ring) - 1
        for i in range(count):
            if distance_to_segment(p, ring[i], ring[(i + 1) % len(ring)]) < distance:
                return True
    return False


def clear(p, margin=10):
    x, y = p
    if not (305 < x < 1295 and 5 < y < 715):
        return False
    for (x0, x1, y0, y1) in OVERLAYS:
        if x0 < x < x1 and y0 < y < y1:
            return False
    if inside(p, LAND) or inside(p, PIERS) or inside(p, BEACH):
        return False
    if near(p, LAND, True, margin) or near(p, PIERS, True, margin):
        return False
    if near(p, BREAKWATERS, False, 4 + margin) or near(p, DOCKS, False, 1.5 + margin):
        return False
    return True


def arrow_clear(cx, cy, ux, uy, length, half_width):
    """Check 13 points along the arrow, on its center line and both edges."""
    for i in range(13):
        f = i / 12 - 0.5
        px, py = cx + ux * length * f, cy + uy * length * f
        for side in (-half_width, 0, half_width):
            if not clear((px - uy * side, py + ux * side)):
                return False
    return True


# ---- Open water: a staggered grid, kept where a straight arrow fits.
open_water = []
row = 0
for y in range(40, 700, 58):
    offset = 0 if row % 2 == 0 else 70
    for x in range(330 + offset, 1300, 140):
        if inside((x, y), [COVE]) or inside((x, y), [HARBOR]):
            continue
        if arrow_clear(x, y, 1, 0, UNITS_PER_KNOT * MAX_KT, 9):
            open_water.append((x, y))
    row += 1

# ---- Cove: long curving arrows, in their flood direction (start → end, bending
# toward the control point). Placed by hand in map units, then trimmed and checked.
# "keep" is the part of the drawn curve to show, from t0 to t1 (0 = start, 1 = end).
COVE_CURVES_FULL = [
    # Between the middle of the cove and the opening: out through the gap on a flood.
    # Trimmed only at the mid-cove end, so the tip stays at the gap.
    {"start": (765, 420), "control": (835, 385), "end": (846, 272), "keep": (0.2, 1.0)},
    # Sweeping east across the cove, following the shape of the beach, tilted
    # slightly away from shore.
    {"start": (600, 330), "control": (690, 285), "end": (790, 290), "keep": (0.1, 0.9)},
    {"start": (590, 455), "control": (720, 440), "end": (900, 405), "keep": (0.1, 0.9)},
    {"start": (650, 548), "control": (800, 585), "end": (975, 505), "keep": (0.1, 0.9)},
]


def curve_point(curve, t):
    """Quadratic curve:  point = (1−t)² · start + 2(1−t)t · control + t² · end"""
    (x0, y0), (x1, y1), (x2, y2) = curve["start"], curve["control"], curve["end"]
    a, b, c = (1 - t) ** 2, 2 * (1 - t) * t, t * t
    return (a * x0 + b * x1 + c * x2, a * y0 + b * y1 + c * y2)


def trim(curve, t0, t1):
    """
    The piece of a quadratic curve between t0 and t1, as its own quadratic curve.
    Its ends are the curve's points at t0 and t1, and its control point is
      control' = (1−t0)(1−t1) · start + ((1−t0)·t1 + t0·(1−t1)) · control + t0·t1 · end
    """
    (x0, y0), (x1, y1), (x2, y2) = curve["start"], curve["control"], curve["end"]
    a = (1 - t0) * (1 - t1)
    b = (1 - t0) * t1 + t0 * (1 - t1)
    c = t0 * t1
    control = (a * x0 + b * x1 + c * x2, a * y0 + b * y1 + c * y2)
    return {"start": curve_point(curve, t0), "control": control, "end": curve_point(curve, t1)}


COVE_CURVES = [trim(c, c["keep"][0], c["keep"][1]) for c in COVE_CURVES_FULL]
curve_samples = []
for curve in COVE_CURVES:
    for i in range(41):
        point = curve_point(curve, i / 40)
        if not clear(point, margin=8):
            raise SystemExit(f"Cove curve {curve} touches land or a pier near {point}")
        curve_samples.append(point)

# ---- Cove: a few short straight arrows showing the regular east/west current, in
# the open spots between the curves.
# Spots are checked for straight arrows this long: 60 × 1.6 × 0.6 = 57.6 units.
# CurrentMap.tsx draws them at a fixed COVE_ARROW_LENGTH (42), which must stay at or
# under this checked length.
COVE_STRAIGHT_FACTOR = 0.6
straight_length = UNITS_PER_KNOT * MAX_KT * COVE_STRAIGHT_FACTOR
cove_straight = []
for y in range(240, 600, 12):
    for x in range(560, 1040, 12):
        if not inside((x, y), [COVE]):
            continue
        if not arrow_clear(x, y, 1, 0, straight_length, 5):
            continue
        # Stay well away from the curves...
        if min(math.hypot(x - px, y - py) for (px, py) in curve_samples) < 58:
            continue
        # ...and from each other.
        if any(abs(x - ox) < straight_length + 60 and abs(y - oy) < 55 for (ox, oy) in cove_straight):
            continue
        cove_straight.append((x, y))

lines = [
    "// Generated by scripts/cove-map/arrows.py — do not edit by hand.",
    "// Where the current arrows go. Each was checked to stay clear of land, piers,",
    f"// docks, the breakwater and the map's overlays (straight arrows at {MAX_KT} kt).",
    "",
    "/** Open water: straight arrow centers. */",
    "export const OPEN_WATER_ARROWS: Array<{ x: number; y: number }> = [",
]
lines += [f"  {{ x: {x}, y: {y} }}," for (x, y) in open_water]
lines += [
    "]",
    "",
    "/** Cove: short straight arrow centers, showing the regular east/west current. */",
    "export const COVE_STRAIGHT_ARROWS: Array<{ x: number; y: number }> = [",
]
lines += [f"  {{ x: {x}, y: {y} }}," for (x, y) in cove_straight]
lines += [
    "]",
    "",
    "type Point = { x: number; y: number }",
    "",
    "/** Cove: long curving arrows in their flood direction (start → end). Ebb draws them backwards. */",
    "export const COVE_CURVES: Array<{ start: Point; control: Point; end: Point }> = [",
]
for c in COVE_CURVES:
    (sx, sy), (cx, cy), (ex, ey) = c["start"], c["control"], c["end"]
    lines.append(
        f"  {{ start: {{ x: {sx:.0f}, y: {sy:.0f} }}, control: {{ x: {cx:.0f}, y: {cy:.0f} }}, end: {{ x: {ex:.0f}, y: {ey:.0f} }} }},"
    )
lines += ["]", ""]
OUT.write_text("\n".join(lines))
print(f"{len(open_water)} open-water arrows, {len(cove_straight)} straight cove arrows, {len(COVE_CURVES)} cove curves")
