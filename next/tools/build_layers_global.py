#!/usr/bin/env python3
"""Whole-Moon map layers at coarse detail: sunlight and Earth in view.

The same rules as tools/build_layers.py (the polar layers), on a grid of quarter-degree squares (about 7.6 km at the
equator) over the whole Moon, with skylines from the LOLA global map ldem_16 (1.9 km pixels) in 24 directions, checked
against the positions in data/ephem.bin every 12 hours over 2023 to 2035, 2 m above the ground.
Away from the poles the terrain matters little (a place is sunlit about half the time, and Earth is either always or
never in view); the fine polar layers take over poleward of 80 degrees.

Usage:  python3 tools/build_layers_global.py
Output: data/layers/gl_sun.u8.gz, gl_earth.u8.gz  (720 rows from +90 to -90, 1440 columns from -180 to +180;
        0..200 = 0..100 % of the time) and the "gl" entry of data/layers/index.json
"""
import gzip, json, os, time
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..")
R, DEG = 1737400.0, np.pi / 180
PPD_SRC, PPD = 16, 4
MAST_M, NDIR, REACH_M, STEP_H = 2.0, 24, 150e3, 12
t_start = time.time()

dem = np.asarray(np.memmap(os.path.join(HERE, "dem", "ldem_16.img"), dtype="<i2", mode="r", shape=(180 * PPD_SRC, 360 * PPD_SRC)), dtype=np.float32) * 0.5
levels = [dem]
for _ in range(3):
    a = levels[-1]; levels.append(a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2).max(axis=(1, 3)))

nlat, nlon = 180 * PPD, 360 * PPD
lat2d, lon2d = np.meshgrid(90 - (np.arange(nlat) + 0.5) / PPD, -180 + (np.arange(nlon) + 0.5) / PPD, indexing="ij")
lat, lon = lat2d.ravel() * DEG, lon2d.ravel() * DEG
N = lat.size
sl, cl = np.sin(lat), np.cos(lat)


def sample(level, la, lo):
    a = levels[level]; ppd = PPD_SRC / 2 ** level
    row = np.clip(np.floor((90 - la / DEG) * ppd).astype(np.int32), 0, a.shape[0] - 1)
    col = np.floor(((lo / DEG) % 360) * ppd).astype(np.int32) % a.shape[1]
    return a[row, col]


h0 = sample(0, lat, lon).astype(np.float64) + MAST_M
px = R * DEG / PPD_SRC
dist = []
d = px
while d < REACH_M:
    dist.append(d); d += max(px, 0.06 * d)
dist = np.array(dist)
lev = np.clip(np.floor(np.log2(np.maximum(np.diff(dist, append=dist[-1] * 1.06) / px, 1))).astype(int), 0, len(levels) - 1)


def skyline_dir(k):
    az = k * 2 * np.pi / NDIR; ca, sa = np.cos(az), np.sin(az)
    best = np.full(N, -90.0, dtype=np.float32); a = R + h0
    for dd, lv in zip(dist, lev):
        g = dd / R; cg, sg = np.cos(g), np.sin(g)
        s2 = np.clip(sl * cg + cl * sg * ca, -1, 1)
        la2 = np.arcsin(s2); lo2 = lon + np.arctan2(sa * sg * cl, cg - sl * s2)
        b = R + sample(lv, la2, lo2).astype(np.float64)
        np.maximum(best, (np.arctan2(b * cg - a, b * sg) / DEG).astype(np.float32), out=best)
    return best


def sky_at(az):
    f = (az % (2 * np.pi)) * (NDIR / (2 * np.pi))
    i0 = np.floor(f).astype(np.int64); k = (f - i0).astype(np.float32); i0 %= NDIR
    idx = np.arange(N)
    return SKY[i0, idx] * (1 - k) + SKY[(i0 + 1) % NDIR, idx] * k


def count_chunk(args):
    lo_, hi_ = args
    sun_n = np.zeros(N, dtype=np.int32); earth_n = np.zeros(N, dtype=np.int32)
    for i in range(lo_, hi_):
        s = EPH[i, 0:3].astype(np.float32); e = EPH[i, 3:6].astype(np.float64) * 1000.0
        el = np.arcsin(np.clip(UP @ s, -1, 1)) / DEG
        sun_n += el > sky_at(np.arctan2(EAST @ s, NORTH @ s))
        v = e[None, :] - POS; v /= np.linalg.norm(v, axis=1, keepdims=True); v = v.astype(np.float32)
        el = np.arcsin(np.clip(np.einsum("ij,ij->i", UP, v), -1, 1)) / DEG
        earth_n += el > sky_at(np.arctan2(np.einsum("ij,ij->i", EAST, v), np.einsum("ij,ij->i", NORTH, v)))
    return sun_n, earth_n


if __name__ == "__main__":
    work = os.path.join(HERE, "dem", "layers_global"); os.makedirs(work, exist_ok=True)
    sky_file = os.path.join(work, "sky.npy")
    if os.path.exists(sky_file): SKY = np.load(sky_file)
    else:
        with Pool(4) as pool: SKY = np.stack(pool.map(skyline_dir, range(NDIR)))
        np.save(sky_file, SKY)
    print(f"{N} points, {len(dist)} distances, skylines in {time.time() - t_start:.0f} s: mean {SKY.mean():.2f} deg", flush=True)
    sn, cn = np.sin(lon), np.cos(lon)
    UP = np.stack([cl * cn, cl * sn, sl], axis=1)
    NORTH = np.stack([-sl * cn, -sl * sn, cl], axis=1).astype(np.float32)
    EAST = np.stack([-sn, cn, np.zeros(N)], axis=1).astype(np.float32)
    POS = UP * (R + h0)[:, None]; UP = UP.astype(np.float32)
    meta = json.load(open(os.path.join(ROOT, "data", "ephem.json")))
    EPH = np.fromfile(os.path.join(ROOT, "data", "ephem.bin"), dtype="<f4").reshape(-1, 6)[::STEP_H // meta["step_hours"]]
    T = EPH.shape[0]
    bounds = np.linspace(0, T, 4 * 8 + 1).astype(int); chunks = list(zip(bounds[:-1], bounds[1:]))
    part = lambda c: os.path.join(work, f"count_{STEP_H}h_{c[0]}_{c[1]}.npz")
    todo = [c for c in chunks if not os.path.exists(part(c))]
    with Pool(4) as pool:
        for c, (a, b) in zip(todo, pool.imap(count_chunk, todo)):
            np.savez(part(c), sun=a, earth=b); print(f"  moments {c[0]}..{c[1]} at {time.time() - t_start:.0f} s", flush=True)
    sun_n = sum(np.load(part(c))["sun"] for c in chunks); earth_n = sum(np.load(part(c))["earth"] for c in chunks)
    out_dir = os.path.join(ROOT, "data", "layers")
    for name, cnt in [("gl_sun", sun_n), ("gl_earth", earth_n)]:
        with open(os.path.join(out_dir, name + ".u8.gz"), "wb") as f:
            f.write(gzip.compress(np.rint(cnt / T * 200).astype(np.uint8).reshape(nlat, nlon).tobytes(), 9, mtime=0))
    ix_path = os.path.join(out_dir, "index.json"); ix = json.load(open(ix_path))
    ix["gl"] = {**ix.get("gl", {}), "kind": "cylindrical", "rows": nlat, "cols": nlon, "ppd": PPD, "lon0": -180, "mast_m": MAST_M, "directions": NDIR,
                "reach_km": REACH_M / 1000, "step_hours": STEP_H, "moments": int(T), "years": "2023 to 2035", "source_map": "ldem_16 (1.9 km)",
                "files": {**ix.get("gl", {}).get("files", {}), "sun": "gl_sun.u8.gz", "earth": "gl_earth.u8.gz"}}
    json.dump(ix, open(ix_path, "w"), indent=1)
    lit = (sun_n / T * 100).reshape(nlat, nlon)
    print("wrote gl_sun, gl_earth; sunlight at the equator row mean", round(float(lit[nlat // 2].mean()), 1), "| total", round(time.time() - t_start), "s")
