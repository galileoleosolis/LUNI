#!/usr/bin/env python3
"""Put NASA's Diviner south polar temperatures on LUNI's layer grid.

Input:  tools/dem/diviner/dlre_prp_south.tab  (605 MB; LRO Diviner Polar Resource Product V2.0, NASA PDS Geosciences
        Node, https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/ ;
        Paige et al., LRO-L-DLRE-5-PRP-V2.0, 2018). One line per triangle of a polar mesh: its center (longitude,
        latitude), the annual average surface temperature and the annual maximum surface temperature, in kelvin,
        from thermal models fitted to Diviner's measurements.
Output: data/layers/sp_tavg.u8.gz and sp_tmax.u8.gz on the grid of data/layers/index.json (run build_layers.py first):
        value * 2 = kelvin, 255 = no data. Each grid square takes the mean of the triangles whose centers fall in it.
Nothing is modeled here: the numbers are NASA's, only re-gridded.
"""
import gzip, json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..")
R, DEG = 1737400.0, np.pi / 180
src = os.path.join(HERE, "dem", "diviner", "dlre_prp_south.tab")
ix_path = os.path.join(ROOT, "data", "layers", "index.json")
ix = json.load(open(ix_path)); sp = ix["sp"]; n, scale = sp["n"], sp["scale_m"]

REC = 210
with open(src, "rb") as f:
    head = f.read(REC).decode()
names = [h.strip() for h in head.split(",")]
ends = [i for i, ch in enumerate(head) if ch == ","] + [REC - 1]
starts = [0] + [e + 1 for e in ends[:-1]]
col = {nm: (a, b) for nm, a, b in zip(names, starts, ends)}
print("columns:", names)

tsum = np.zeros((n, n)); msum = np.zeros((n, n)); cnt = np.zeros((n, n), dtype=np.int32)
c = (n - 1) / 2
with open(src, "rb") as f:
    f.seek(REC)
    while True:
        buf = f.read(REC * 200000)
        if not buf: break
        a = np.frombuffer(buf, dtype=np.uint8).reshape(-1, REC)
        get = lambda nm: np.ascontiguousarray(a[:, col[nm][0]:col[nm][1]]).view(f"S{col[nm][1] - col[nm][0]}").ravel().astype(np.float64)
        lon, lat, tavg, tmax = get("tri_clon"), get("tri_clat"), get("temp_avg"), get("temp_max")
        ok = (tavg > 0) & (tmax > 0) & (lat <= sp["min_lat"] + 0.05)
        r = 2 * R * np.tan((90 + lat[ok]) * DEG / 2)
        cc = np.rint(c + r * np.sin(lon[ok] * DEG) / scale).astype(int); rr = np.rint(c - r * np.cos(lon[ok] * DEG) / scale).astype(int)
        inb = (cc >= 0) & (cc < n) & (rr >= 0) & (rr < n)
        np.add.at(tsum, (rr[inb], cc[inb]), tavg[ok][inb]); np.add.at(msum, (rr[inb], cc[inb]), tmax[ok][inb]); np.add.at(cnt, (rr[inb], cc[inb]), 1)
print("triangles used:", int(cnt.sum()), "| grid squares with data:", int((cnt > 0).sum()))

inside = np.frombuffer(gzip.decompress(open(os.path.join(ROOT, "data", "layers", sp["files"]["sun"]), "rb").read()), dtype=np.uint8).reshape(n, n) != 255
def finish(total):
    v = np.where(cnt > 0, total / np.maximum(cnt, 1), np.nan)
    for _ in range(3):                                   # squares no triangle center fell in: the mean of their filled neighbors
        if not np.isnan(v[inside]).any(): break
        p = np.pad(v, 1, constant_values=np.nan)
        nb = np.stack([p[1 + dr:1 + dr + n, 1 + dc:1 + dc + n] for dr in (-1, 0, 1) for dc in (-1, 0, 1)])
        v = np.where(np.isnan(v), np.nanmean(nb, axis=0), v)
    out = np.where(inside & ~np.isnan(v), np.clip(np.rint(np.nan_to_num(v) / 2), 0, 254), 255).astype(np.uint8)
    return out, v
import warnings; warnings.simplefilter("ignore")
tavg_u8, tavg = finish(tsum); tmax_u8, tmax = finish(msum)
for name, a in [("sp_tavg", tavg_u8), ("sp_tmax", tmax_u8)]:
    with open(os.path.join(ROOT, "data", "layers", name + ".u8.gz"), "wb") as f:
        f.write(gzip.compress(a.tobytes(), 9, mtime=0))
sp["files"]["tavg"] = "sp_tavg.u8.gz"; sp["files"]["tmax"] = "sp_tmax.u8.gz"
sp["temperature"] = {"source": "LRO Diviner Polar Resource Product V2.0 (Paige et al., LRO-L-DLRE-5-PRP-V2.0, NASA PDS, 2018)", "unit": "value * 2 = kelvin",
                     "avg_k": [round(float(np.nanmin(tavg[inside])), 1), round(float(np.nanmax(tavg[inside])), 1)],
                     "max_k": [round(float(np.nanmin(tmax[inside])), 1), round(float(np.nanmax(tmax[inside])), 1)],
                     "no_data_squares": int((tavg_u8[inside] == 255).sum())}
json.dump(ix, open(ix_path, "w"), indent=1)
print("wrote", sp["temperature"])
