#!/usr/bin/env python3
"""Build LUNI's south-polar map layers: sunlight, Earth in view, permanent shadow.

For every point of a grid over the south polar region (south of 80S) it works out the terrain skyline from the LOLA
240 m elevation map, then checks the Sun and the Earth against that skyline every few hours over all the years in
LUNI's ephemeris (data/ephem.bin: NASA SPICE DE440, 2023 to 2035). Same rules as the rest of LUNI:
  sunlit      = the center of the Sun's disc is above the skyline (at least half the disc in view), 2 m above the ground
  Earth       = the center of the Earth is above the skyline
  shadow      = not even the top edge of the Sun's disc clears the skyline at any checked moment ("permanent shadow"
                over these years; the Moon's 18.6-year cycle is not fully covered, so it is labeled as such)
Skylines here are coarser than a preset site's (72 directions, the 240 m map), so a layer is a map to explore with,
not a replacement for the site's own numbers.

Usage:  tools/fetch_dem.sh && python3 tools/build_layers.py [grid_m]
Output: data/layers/sp_sun.u8.gz, sp_earth.u8.gz, sp_shadow.u8.gz, data/layers/index.json
        sun / earth: 0..200 = 0..100 % of the time in half-percent steps; 255 = outside the region
        shadow: 1 = permanent shadow over the years checked, 0 = not, 255 = outside the region
"""
import gzip, json, os, sys, time
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
R = 1737400.0
DEG = np.pi / 180
SRC_N, SRC_M = 7760, 240.0                      # ldem_60s_240m: 7760 x 7760 pixels of 240 m, pole between the 4 center pixels
MIN_LAT = -80.0
GRID_M = float(sys.argv[1]) if len(sys.argv) > 1 else 480.0
MAST_M = 2.0
NDIR = 72                                       # skyline directions (every 5 degrees)
REACH_M = 200e3                                 # how far the skyline search looks
STEP_H = 6                                      # hours between checked moments
SUN_RADIUS_DEG = 0.2666

t_start = time.time()
dem = np.memmap(os.path.join(HERE, "dem", "ldem_60s_240m.img"), dtype="<i2", mode="r", shape=(SRC_N, SRC_N))
r80 = 2 * R * np.tan((90 + MIN_LAT) * DEG / 2)
half = int(np.ceil((r80 + REACH_M) / SRC_M)) + 8
c0 = SRC_N // 2                                 # crop [c0-half, c0+half): the pole sits at crop coordinate (half - 0.5)
base = np.asarray(dem[c0 - half:c0 + half, c0 - half:c0 + half], dtype=np.float32) * 0.5      # meters
print(f"crop {base.shape}, heights {base.min():.0f} .. {base.max():.0f} m")

# Highest-point pyramid: a far-away step samples a coarser level, so a ridge between two samples is not missed.
levels = [base]
while levels[-1].shape[0] >= 64 and len(levels) < 6:
    a = levels[-1]; n = a.shape[0] // 2 * 2
    levels.append(a[:n, :n].reshape(n // 2, 2, n // 2, 2).max(axis=(1, 3)))

# Output grid, north-up like the LOLA map: x toward longitude 90E, y toward longitude 0, pole in the middle.
n = int(np.ceil(r80 / GRID_M)) * 2
c = (n - 1) / 2
jj, ii = np.meshgrid(np.arange(n), np.arange(n))
gx, gy = (jj - c) * GRID_M, (c - ii) * GRID_M
rr = np.hypot(gx, gy)
inside = rr <= r80
x, y = gx[inside].astype(np.float64), gy[inside].astype(np.float64)
N = x.size
lat = 2 * np.arctan(np.hypot(x, y) / (2 * R)) - np.pi / 2
lon = np.arctan2(x, y)
scale = 2 / (1 + np.sin(-lat))                  # map meters per ground meter at each point (1 at the pole)
print(f"grid {n} x {n} at {GRID_M:.0f} m, {N} points inside {MIN_LAT} deg")


def sample(level, mx, my):
    """Nearest value of pyramid level `level` at map position (mx, my) meters from the pole."""
    a = levels[level]; res = SRC_M * 2 ** level; pole = (half - 0.5) / 2 ** level - (0.5 - 0.5 / 2 ** level)
    col = np.rint(pole + mx / res).astype(np.int32); row = np.rint(pole - my / res).astype(np.int32)
    np.clip(col, 0, a.shape[1] - 1, out=col); np.clip(row, 0, a.shape[0] - 1, out=row)
    return a[row, col]


# Bilinear height of the point itself on the 240 m map.
def height_here():
    pole = half - 0.5
    cf, rf = pole + x / SRC_M, pole - y / SRC_M
    c0_, r0_ = np.floor(cf).astype(np.int32), np.floor(rf).astype(np.int32)
    fc, fr = cf - c0_, rf - r0_
    return (base[r0_, c0_] * (1 - fr) * (1 - fc) + base[r0_, c0_ + 1] * (1 - fr) * fc
            + base[r0_ + 1, c0_] * fr * (1 - fc) + base[r0_ + 1, c0_ + 1] * fr * fc)


h0 = height_here().astype(np.float64) + MAST_M

# Distances along each ray: every 240 m near the point, then growing by 2.5 % a step.
dist = []
d = SRC_M
while d < REACH_M:
    dist.append(d); d += max(SRC_M, 0.025 * d)
dist = np.array(dist)
steps = np.diff(dist, append=dist[-1] * 1.025)
lev = np.clip(np.floor(np.log2(np.maximum(steps / SRC_M, 1))).astype(int), 0, len(levels) - 1)
print(f"{len(dist)} distances per ray, {NDIR} directions")


def skyline_dir(k):
    """Skyline elevation (deg) of every point in map direction k (clockwise from the map's up = longitude 0)."""
    th = k * 2 * np.pi / NDIR
    sx, sy = np.sin(th) * scale, np.cos(th) * scale
    best = np.full(N, -90.0, dtype=np.float32)
    a = R + h0
    for dd, lv in zip(dist, lev):
        H = sample(lv, x + sx * dd, y + sy * dd).astype(np.float64)
        g = dd / R; b = R + H
        el = np.arctan2(b * np.cos(g) - a, b * np.sin(g)) / DEG
        np.maximum(best, el.astype(np.float32), out=best)
    return best


def sky_at(sky, bearing):
    """Skyline height in the direction `bearing` (radians clockwise from map up), linear between the stored directions."""
    f = (bearing % (2 * np.pi)) * (NDIR / (2 * np.pi))
    i0 = np.floor(f).astype(np.int64); k = (f - i0).astype(np.float32); i0 %= NDIR
    idx = np.arange(N)
    return sky[i0, idx] * (1 - k) + sky[(i0 + 1) % NDIR, idx] * k


def count_chunk(args):
    """For a slice of the ephemeris: how often each point has the Sun, the Earth, and any part of the Sun."""
    lo, hi = args
    sun_n = np.zeros(N, dtype=np.int32); earth_n = np.zeros(N, dtype=np.int32); any_sun = np.zeros(N, dtype=bool)
    for i in range(lo, hi):
        s = EPH[i, 0:3].astype(np.float32); e = EPH[i, 3:6].astype(np.float64) * 1000.0
        # Sun: far enough away that every point sees it in the same direction
        el = np.arcsin(np.clip(UP @ s, -1, 1)) / DEG
        sk = sky_at(SKY, np.arctan2(TX @ s, TY @ s))
        sun_n += el > sk; any_sun |= (el + SUN_RADIUS_DEG) > sk
        # Earth: close enough that the point's own position matters
        v = e[None, :] - POS; v /= np.linalg.norm(v, axis=1, keepdims=True); v = v.astype(np.float32)
        el = np.arcsin(np.clip(np.einsum("ij,ij->i", UP, v), -1, 1)) / DEG
        sk = sky_at(SKY, np.arctan2(np.einsum("ij,ij->i", TX, v), np.einsum("ij,ij->i", TY, v)))
        earth_n += el > sk
    return sun_n, earth_n, any_sun


if __name__ == "__main__":
    # Both long steps keep their finished parts in tools/dem/, so a run that is cut short picks up where it stopped.
    work = os.path.join(HERE, "dem", f"layers_{int(GRID_M)}m")
    os.makedirs(work, exist_ok=True)
    sky_file = os.path.join(work, "sky.npy")
    if os.path.exists(sky_file):
        SKY = np.load(sky_file)
    else:
        with Pool(4) as pool:
            SKY = np.stack(pool.map(skyline_dir, range(NDIR)))      # [direction, point]
        np.save(sky_file, SKY)
    print(f"skylines done in {time.time() - t_start:.0f} s: {SKY.min():.2f} .. {SKY.max():.2f} deg, mean {SKY.mean():.2f}")

    # Local axes of every point in the Moon's own frame (x toward longitude 0, z north), and the two ground
    # directions that the map's "right" and "up" correspond to (the map keeps angles, so these are simply rotated).
    sl, cl, sn, cn = np.sin(lat), np.cos(lat), np.sin(lon), np.cos(lon)
    UP = np.stack([cl * cn, cl * sn, sl], axis=1)
    NORTH = np.stack([-sl * cn, -sl * sn, cl], axis=1)
    EAST = np.stack([-sn, cn, np.zeros(N)], axis=1)
    TX = (sn[:, None] * NORTH + cn[:, None] * EAST).astype(np.float32)
    TY = (cn[:, None] * NORTH - sn[:, None] * EAST).astype(np.float32)
    POS = UP * (R + h0)[:, None]
    UP = UP.astype(np.float32)

    meta = json.load(open(os.path.join(ROOT, "data", "ephem.json")))
    eph = np.fromfile(os.path.join(ROOT, "data", "ephem.bin"), dtype="<f4").reshape(-1, 6)
    EPH = eph[::STEP_H // meta["step_hours"]]
    T = EPH.shape[0]
    bounds = np.linspace(0, T, 4 * 12 + 1).astype(int)
    chunks = list(zip(bounds[:-1], bounds[1:]))
    part_file = lambda c: os.path.join(work, f"count_{STEP_H}h_{c[0]}_{c[1]}.npz")
    todo = [c for c in chunks if not os.path.exists(part_file(c))]
    with Pool(4) as pool:                                            # forked after the arrays exist, so they are shared
        for c, (a, b, d) in zip(todo, pool.imap(count_chunk, todo)):
            np.savez(part_file(c), sun=a, earth=b, any=d); print(f"  moments {c[0]}..{c[1]} done at {time.time() - t_start:.0f} s", flush=True)
    parts = [(z["sun"], z["earth"], z["any"]) for z in (np.load(part_file(c)) for c in chunks)]
    sun_n = sum(p[0] for p in parts); earth_n = sum(p[1] for p in parts); any_sun = np.any([p[2] for p in parts], axis=0)
    print(f"{T} moments checked in {time.time() - t_start:.0f} s")

    def grid(values, fill=255):
        out = np.full((n, n), fill, dtype=np.uint8); out[inside] = values; return out
    sun = grid(np.rint(sun_n / T * 200)); earth = grid(np.rint(earth_n / T * 200)); shadow = grid((~any_sun).astype(np.uint8))
    out_dir = os.path.join(ROOT, "data", "layers"); os.makedirs(out_dir, exist_ok=True)
    sizes = {}
    for name, a in [("sp_sun", sun), ("sp_earth", earth), ("sp_shadow", shadow)]:
        p = os.path.join(out_dir, name + ".u8.gz")
        with open(p, "wb") as f:
            f.write(gzip.compress(a.tobytes(), 9, mtime=0))
        sizes[name] = os.path.getsize(p)
    lit = sun_n / T * 100
    index = {
        "_about": "South polar map layers computed by tools/build_layers.py from LRO LOLA elevation (ldem_60s_240m, NASA PDS) "
                  "and NASA NAIF SPICE DE440 positions (data/ephem.bin). North-up south polar stereographic grid, pole in the middle, "
                  "x toward longitude 90E, y toward longitude 0. Values: sun / earth 0..200 = 0..100 % of the time, shadow 1 = no part "
                  "of the Sun seen at any checked moment; 255 = outside the region.",
        "sp": {"kind": "polar_south", "n": n, "scale_m": GRID_M, "min_lat": MIN_LAT, "mast_m": MAST_M, "directions": NDIR,
               "reach_km": REACH_M / 1000, "step_hours": STEP_H, "moments": int(T),
               "from_utc": meta["start_utc"], "years": "2023 to 2035",
               "files": {"sun": "sp_sun.u8.gz", "earth": "sp_earth.u8.gz", "shadow": "sp_shadow.u8.gz"},
               "stats": {"sun_mean_pct": round(float(lit.mean()), 1), "sun_max_pct": round(float(lit.max()), 1),
                         "shadow_share_pct": round(float((~any_sun).mean() * 100), 2),
                         "earth_mean_pct": round(float((earth_n / T * 100).mean()), 1)}},
    }
    json.dump(index, open(os.path.join(out_dir, "index.json"), "w"), indent=1)
    print("wrote", sizes, index["sp"]["stats"], f"total {time.time() - t_start:.0f} s")
