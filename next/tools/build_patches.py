#!/usr/bin/env python3
"""Cut a detailed elevation patch around each south polar preset site, for the 3D surface view.

South of 80S the patch comes from ldem_80s_40m (40 m/pixel, 512 x 512 = about 20 km across); cells that map lacks
are filled from ldem_60s_240m. Between 60S and 80S it comes from ldem_60s_240m (240 m/pixel, about 123 km across).
Patches stay on the LOLA polar stereographic grid, so the web app reads them like the other reduced maps.
Output: data/patch/<site>.i16.gz + data/patch/index.json (same encoding as tools/build_web_dem.py).
"""
import gzip, json, os
import numpy as np
import lola

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "patch")
os.makedirs(OUT, exist_ok=True)
N, QUANT = 512, 1.0

index = {"_about": "Detailed LRO LOLA elevation patches around preset sites (south polar stereographic grid). "
                   "Heights: meters above a 1737.4 km sphere = value * quant_m. Rows are delta-encoded then gzipped. "
                   "pole_row / pole_col give the pixel position of the south pole relative to the patch."}
for s in json.load(open(os.path.join(ROOT, "data", "sites.json")))["sites"]:
    lat, lon = s["lat"], s["lon"]
    if lat > -60.5:
        continue
    src = lola.dem("near") if lat <= -80.0 else lola.dem("far")
    r, c = src.rowcol(lat, lon)
    r0, c0 = int(round(float(r))) - N // 2, int(round(float(c))) - N // 2
    rows, cols = np.meshgrid(np.arange(r0, r0 + N), np.arange(c0, c0 + N), indexing="ij")
    # pixel -> stereographic meters -> lat/lon, then the best available height
    x, y = (cols - src.c) * src.scale, (src.c - rows) * src.scale
    rho = np.hypot(x, y)
    plat = -90 + 2 * np.degrees(np.arctan(rho / (2 * lola.R_MOON)))
    plon = np.degrees(np.arctan2(x, y))
    h = src.height(plat, plon)
    miss = ~np.isfinite(h)
    if miss.any():
        h[miss] = lola.dem("far").height(plat[miss], plon[miss])
    h = np.where(np.isfinite(h), h, 0.0)
    q = np.round(h / QUANT).astype(np.int16)
    d = q.copy(); d[:, 1:] = q[:, 1:] - q[:, :-1]
    path = os.path.join(OUT, s["id"] + ".i16.gz")
    with gzip.GzipFile(path, "wb", compresslevel=9, mtime=0) as f:
        f.write(d.astype("<i2").tobytes())
    index[s["id"]] = dict(file=s["id"] + ".i16.gz", kind="polar_south", rows=N, cols=N, scale_m=src.scale, quant_m=QUANT,
                          pole_row=float(src.c - r0), pole_col=float(src.c - c0), min_lat=-60.0, source=src.name,
                          filled_from_240m=int(miss.sum()))
    print(f"{s['id']:11s} {src.name}  {N * src.scale / 1000:.0f} km across  {os.path.getsize(path) / 1e6:.2f} MB  filled {int(miss.sum())}")
json.dump(index, open(os.path.join(OUT, "index.json"), "w"), indent=1)
