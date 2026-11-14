"""LOLA elevation maps (LRO Lunar Orbiter Laser Altimeter gridded data, PDS) and terrain horizons.

Maps used (downloaded by tools/fetch_dem.sh into tools/dem/):
  ldem_80s_40m   south polar stereographic, 80S to pole, 40 m/pixel   (near field)
  ldem_60s_240m  south polar stereographic, 60S to pole, 240 m/pixel  (far field)
  ldem_16        global cylindrical, 16 pixels/degree (about 1.9 km)  (everywhere else)
Heights are metres above a 1737.4 km sphere, in the Moon ME frame (same frame as the ephemeris).
"""
import os
import numpy as np

R_MOON = 1737400.0
DEM_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dem")
DEG = np.pi / 180


class PolarDEM:
    """South polar stereographic LOLA grid (centre = pole, lon 0 towards the top of the image)."""

    def __init__(self, name, n, scale_m, min_lat):
        self.name, self.n, self.scale, self.min_lat = name, n, scale_m, min_lat
        self.c = (n - 1) / 2.0                       # pole sits between the two centre pixels
        self.a = np.memmap(os.path.join(DEM_DIR, name + ".img"), dtype="<i2", mode="r", shape=(n, n))
        self.res = scale_m

    def covers(self, lat):
        return lat <= self.min_lat + 1e-9

    def rowcol(self, lat, lon):
        r = 2 * R_MOON * np.tan((90 + lat) * DEG / 2)
        x, y = r * np.sin(lon * DEG), r * np.cos(lon * DEG)
        return self.c - y / self.scale, self.c + x / self.scale

    def height(self, lat, lon):
        return _bilinear(self.a, *self.rowcol(lat, lon))


class GlobalDEM:
    """Global simple cylindrical LOLA grid, lon 0..360 east, lat +90 at the top."""

    def __init__(self, name, ppd):
        self.name, self.ppd = name, ppd
        self.a = np.memmap(os.path.join(DEM_DIR, name + ".img"), dtype="<i2", mode="r", shape=(180 * ppd, 360 * ppd))
        self.res = R_MOON * DEG / ppd

    def covers(self, lat):
        return np.ones_like(lat, dtype=bool)

    def rowcol(self, lat, lon):
        return (90 - lat) * self.ppd - 0.5, (lon % 360) * self.ppd - 0.5

    def height(self, lat, lon):
        r, c = self.rowcol(lat, lon)
        return _bilinear(self.a, r, c, wrap_cols=True)


def _bilinear(a, r, c, wrap_cols=False):
    """Bilinear sample of an int16 DN grid, returned in metres. NaN outside the grid."""
    r, c = np.asarray(r, dtype=float), np.asarray(c, dtype=float)
    nr, nc = a.shape
    r0, c0 = np.floor(r).astype(np.int64), np.floor(c).astype(np.int64)
    fr, fc = r - r0, c - c0
    if wrap_cols:
        ok = (r0 >= -1) & (r0 < nr)
        r0a, r1a = np.clip(r0, 0, nr - 1), np.clip(r0 + 1, 0, nr - 1)
        c0a, c1a = c0 % nc, (c0 + 1) % nc
    else:
        ok = (r0 >= 0) & (r0 < nr - 1) & (c0 >= 0) & (c0 < nc - 1)
        r0a, r1a = np.clip(r0, 0, nr - 2), np.clip(r0, 0, nr - 2) + 1
        c0a, c1a = np.clip(c0, 0, nc - 2), np.clip(c0, 0, nc - 2) + 1
    v = (a[r0a, c0a] * (1 - fr) * (1 - fc) + a[r0a, c1a] * (1 - fr) * fc
         + a[r1a, c0a] * fr * (1 - fc) + a[r1a, c1a] * fr * fc) * 0.5
    return np.where(ok, v, np.nan)


_cache = {}
def dem(name):
    if name not in _cache:
        _cache[name] = {
            "near": lambda: PolarDEM("ldem_80s_40m", 15200, 40.0, -80.0),
            "far": lambda: PolarDEM("ldem_60s_240m", 7760, 240.0, -60.0),
            "global": lambda: GlobalDEM("ldem_16", 16),
        }[name]()
    return _cache[name]


def destination(lat, lon, az, dist_m):
    """Point reached from (lat, lon) going dist_m metres along azimuth az (deg clockwise from north) on the sphere."""
    la, lo, a, d = lat * DEG, lon * DEG, az * DEG, dist_m / R_MOON
    la2 = np.arcsin(np.clip(np.sin(la) * np.cos(d) + np.cos(la) * np.sin(d) * np.cos(a), -1, 1))
    lo2 = lo + np.arctan2(np.sin(a) * np.sin(d) * np.cos(la), np.cos(d) - np.sin(la) * np.sin(la2))
    return la2 / DEG, lo2 / DEG


def unit(lat, lon):
    la, lo = np.asarray(lat) * DEG, np.asarray(lon) * DEG
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


def site_height(lat, lon):
    """Best available LOLA height (m) and the name of the map it came from."""
    for key in ("near", "far"):
        d = dem(key)
        if d.covers(lat - 0.05):
            h = float(d.height(lat, lon))
            if np.isfinite(h):
                return h, d.name
    return float(dem("global").height(lat, lon)), dem("global").name


def site_slope(lat, lon, baseline_m=None):
    """Surface slope (deg) at the site from LOLA, by central differences over `baseline_m` (default: 2 map pixels)."""
    _, name = site_height(lat, lon)
    d = next(dem(k) for k in ("near", "far", "global") if dem(k).name == name)
    b = baseline_m or 2 * d.res
    h = lambda az: float(d.height(*destination(lat, lon, az, b / 2)))
    dn, de = (h(0) - h(180)) / b, (h(90) - h(270)) / b
    return float(np.arctan(np.hypot(dn, de)) / DEG), b


def distances(near_res, d_max=250e3, d_min=15.0, growth=0.0015):
    out, d = [], d_min
    while d < d_max:
        out.append(d)
        d += max(near_res / 2, growth * d)
    return np.array(out)


def horizon(lat, lon, mast_m=2.0, az_step=0.5, d_max=250e3):
    """Terrain horizon seen from a site: elevation angle (deg) of the skyline for each azimuth.

    Walks outward along every azimuth, samples the LOLA height, and keeps the steepest upward angle,
    with the Moon's curvature included (all in 3D Cartesian coordinates).
    Returns (azimuths, elevation_deg, info).
    """
    polar = lat < -60.5
    h0, src = site_height(lat, lon)
    near = dem("near") if lat <= -80.0 else None
    far = dem("far") if polar else dem("global")
    az = np.arange(0, 360, az_step)
    dist = distances(near.res if near else far.res, d_max)
    A, D = np.meshgrid(az, dist, indexing="ij")
    la, lo = destination(lat, lon, A, D)

    h = far.height(la, lo)
    if near is not None:                              # fine map close in, where it has data
        use = (D <= 30e3) & (la <= -80.0)
        hn = near.height(la[use], lo[use])
        h[use] = np.where(np.isfinite(hn), hn, h[use])

    up = unit(lat, lon)
    P = (R_MOON + h0 + mast_m) * up
    Q = (R_MOON + h)[..., None] * unit(la, lo)
    V = Q - P
    el = np.arcsin(np.einsum("...k,k->...", V, up) / np.linalg.norm(V, axis=-1)) / DEG
    el = np.where(np.isfinite(el), el, -90.0)
    k = np.argmax(el, axis=1)
    info = {"site_height_m": h0, "height_source": src, "mast_m": mast_m,
            "near_map": near.name if near else None, "far_map": far.name,
            "dist_to_skyline_km": (dist[k] / 1000)}
    return az, el.max(axis=1), info
