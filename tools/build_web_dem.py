#!/usr/bin/env python3
"""Make the small elevation maps the web app downloads to compute terrain for custom points.

From the LOLA maps in tools/dem/ it writes to data/dem/:
  sp_cap   south polar stereographic, 80S to pole, 240 m/pixel  (crop of ldem_60s_240m)
  sp_wide  south polar stereographic, 60S to pole, 960 m/pixel  (4x4 block mean of ldem_60s_240m)
  global   cylindrical, 8 pixels/degree, about 3.8 km           (2x2 block mean of ldem_16)
Format: int16 heights in units of `quant_m` metres, each row delta-encoded left to right, then gzip.
"""
import gzip, json, os
import numpy as np
import lola

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "dem")
os.makedirs(OUT, exist_ok=True)

def block_mean(a, f):
    r, c = a.shape[0] // f, a.shape[1] // f
    return a[:r * f, :c * f].astype(np.float32).reshape(r, f, c, f).mean(axis=(1, 3))

def write(name, metres, meta, quant):
    q = np.round(metres / quant).astype(np.int16)
    d = q.copy(); d[:, 1:] = q[:, 1:] - q[:, :-1]
    path = os.path.join(OUT, name + ".i16.gz")
    with gzip.GzipFile(path, "wb", compresslevel=9, mtime=0) as f:
        f.write(d.astype("<i2").tobytes())
    meta.update(file=name + ".i16.gz", rows=int(q.shape[0]), cols=int(q.shape[1]), quant_m=quant)
    print(f"{name:8s} {q.shape}  {os.path.getsize(path) / 1e6:.2f} MB")
    return meta

far = lola.dem("far").a
c, half = far.shape[0] // 2, 1270
index = {
    "_about": "Reduced LRO LOLA elevation maps for in-browser terrain horizons. Heights: metres above a 1737.4 km sphere = value * quant_m. Rows are delta-encoded then gzipped.",
    "sp_cap": write("sp_cap", far[c - half:c + half, c - half:c + half] * 0.5,
                    dict(kind="polar_south", scale_m=240.0, min_lat=-80.0, source="ldem_60s_240m (crop)"), 2.0),
    "sp_wide": write("sp_wide", block_mean(far, 4) * 0.5,
                     dict(kind="polar_south", scale_m=960.0, min_lat=-60.0, source="ldem_60s_240m (4x4 mean)"), 4.0),
    "global": write("global", block_mean(lola.dem("global").a, 2) * 0.5,
                    dict(kind="cylindrical", ppd=8, source="ldem_16 (2x2 mean)"), 8.0),
}
json.dump(index, open(os.path.join(OUT, "index.json"), "w"), indent=1)
