#!/usr/bin/env python3
"""Whole-Moon surface temperature from NASA's Diviner measurements, as two small grids.

Input:  tools/dem/diviner/gcp/global_cumul_avg_cyl_*_002.tab  (18 files, 2.8 GB; LRO Diviner Global Cumulative
        Products, LRO-L-DLRE-5-GCP-V1.0, NASA PDS Geosciences Node,
        https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gcp/ ;
        Williams et al. 2017, Icarus 283, 300-325). Each line is one half-degree square at one quarter-hour of local
        time: the bolometric brightness temperature measured there (kelvin), from all nadir observations 2009 to 2015.
Output: data/layers/gl_tavg.u8.gz  the mean over the lunar day (all 96 local-time bins, gaps filled along the day;
                                   squares measured for under a third of the day take the mean of their neighbors)
        data/layers/gl_tmax.u8.gz  the highest bin
        360 rows from +90 to -90, 720 columns from -180 to +180; value * 2 = kelvin, 255 = no data.
Nothing is modeled here: the numbers are NASA's measurements, only averaged over the day.
"""
import glob, gzip, json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..")
files = sorted(glob.glob(os.path.join(HERE, "dem", "diviner", "gcp", "global_cumul_avg_cyl_*_002.tab")))
assert len(files) == 18, f"expected 18 files, found {len(files)}"
REC, NLT = 113, 96
T = np.full((360, 720, NLT), np.nan, dtype=np.float32)
for path in files:
    with open(path, "rb") as f:
        head = f.read(REC).decode()
        names = [h.strip() for h in head.split(",")]
        ends = [i for i, ch in enumerate(head) if ch == ","] + [REC - 1]; starts = [0] + [e + 1 for e in ends[:-1]]
        col = {nm: (a, b) for nm, a, b in zip(names, starts, ends)}
        a = np.frombuffer(f.read(), dtype=np.uint8).reshape(-1, REC)
    get = lambda nm: np.ascontiguousarray(a[:, col[nm][0]:col[nm][1]]).view(f"S{col[nm][1] - col[nm][0]}").ravel().astype(np.float64)
    lon, lat, lt, tb = get("clon"), get("clat"), get("ltim"), get("tbol")
    r = np.floor((90 - lat) * 2).astype(int); c = np.floor((lon + 180) * 2).astype(int) % 720; k = np.floor(lt * 4).astype(int) % NLT
    ok = tb > 0
    T[r[ok], c[ok], k[ok]] = tb[ok]
    print(os.path.basename(path), "rows", len(tb), "with data", int(ok.sum()), flush=True)

have = np.isfinite(T)
cover = have.mean(axis=2)
# Fill missing local-time bins from their neighbors along the day (wrapping), so the daily mean is not tilted toward
# the hours that happened to be observed.
F = T.copy()
for _ in range(NLT // 2):
    miss = ~np.isfinite(F)
    if not miss.any(): break
    nb = np.nanmean(np.stack([np.roll(F, 1, axis=2), np.roll(F, -1, axis=2)]), axis=0)
    F[miss] = nb[miss]
import warnings; warnings.simplefilter("ignore")
tavg = np.nanmean(F, axis=2); tmax = np.nanmax(T, axis=2)
# Squares with too few measured hours (under a third of the day) are not trusted on their own: they take the mean of
# the trusted squares around them, and the count of such squares is kept in the index.
good = cover >= 1 / 3
def patch(v):
    v = np.where(good, v, np.nan)
    for _ in range(6):
        if np.isfinite(v).all(): break
        p = np.pad(v, ((1, 1), (0, 0)), constant_values=np.nan)
        nb = np.stack([np.roll(p, dc, axis=1)[1 + dr:361 + dr] for dr in (-1, 0, 1) for dc in (-1, 0, 1)])
        v = np.where(np.isfinite(v), v, np.nanmean(nb, axis=0))
    return v
tavg, tmax = patch(tavg), patch(tmax)
enc = lambda v: np.where(np.isfinite(v), np.clip(np.rint(np.nan_to_num(v) / 2), 0, 254), 255).astype(np.uint8)
out_dir = os.path.join(ROOT, "data", "layers")
for name, v in [("gl_tavg", tavg), ("gl_tmax", tmax)]:
    with open(os.path.join(out_dir, name + ".u8.gz"), "wb") as f:
        f.write(gzip.compress(enc(v).tobytes(), 9, mtime=0))
ix_path = os.path.join(out_dir, "index.json"); ix = json.load(open(ix_path))
gl = ix.setdefault("gl", {}); gl.setdefault("files", {}).update({"tavg": "gl_tavg.u8.gz", "tmax": "gl_tmax.u8.gz"})
gl["temperature"] = {"source": "LRO Diviner Global Cumulative Products V1.0 (Williams et al. 2017; LRO-L-DLRE-5-GCP-V1.0, NASA PDS)", "rows": 360, "cols": 720, "ppd": 2, "lon0": -180,
                     "unit": "value * 2 = kelvin", "equator_avg_k": round(float(np.nanmean(tavg[179:181])), 1), "equator_max_k": round(float(np.nanmean(tmax[179:181])), 1),
                     "avg_k": [round(float(np.nanmin(tavg)), 1), round(float(np.nanmax(tavg)), 1)], "squares_filled_from_neighbors": int((~good).sum()), "squares_total": 360 * 720}
json.dump(ix, open(ix_path, "w"), indent=1)
print("wrote", gl["temperature"])
