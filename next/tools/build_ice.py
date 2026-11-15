#!/usr/bin/env python3
"""Put NASA's Diviner "ice depth" on LUNI's polar layer grid.

Input:  tools/dem/diviner/dlre_prp_{south,north}.tab  (LRO Diviner Polar Resource Product V2.0, NASA PDS Geosciences
        Node; Paige et al., LRO-L-DLRE-5-PRP-V2.0, 2018). Column ice_depth, as the product's own label describes it:
        "the calculated depth at which water ice would be sublimated at a rate of 1 kg m-2 per billion years (m)".
        0 = water ice is stable at the surface; -999 = deeper than 2.8738 m (not reported).
        The file also holds a code the label does not describe: -1. Measured here, in both files: every triangle
        with -1 has a yearly maximum temperature of 101 K or less (24 to 101 K), the 0 values peak at 101 to 131 K,
        and real depths start above that. So -1 marks the coldest ground, where ice can stay on the surface itself;
        LUNI stores it as depth 0 and says so on screen.
Output: data/layers/{sp,np}_ice.u8.gz on the grid of data/layers/index.json:
        value * 0.0125 = depth in meters (0 .. 2.875), 254 = deeper than 2.87 m (NASA's exclude value), 255 = no data.
        A grid square holds many triangles: if at least half of them have a depth, the square takes their mean depth;
        otherwise it is marked 254.
Nothing is modeled here: the numbers are NASA's, only re-gridded.   python3 tools/build_ice.py [south|north]
"""
import gzip, json, os, sys, warnings
import numpy as np
warnings.simplefilter("ignore")

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..")
R, DEG = 1737400.0, np.pi / 180
POLE = sys.argv[1] if len(sys.argv) > 1 else "south"
PRE, SY = ("sp", 1.0) if POLE == "south" else ("np", -1.0)
src = os.path.join(HERE, "dem", "diviner", f"dlre_prp_{POLE}.tab")
ix_path = os.path.join(ROOT, "data", "layers", "index.json")
ix = json.load(open(ix_path)); sp = ix[PRE]; n, scale = sp["n"], sp["scale_m"]

REC = 210
with open(src, "rb") as f: head = f.read(REC).decode()
names = [h.strip() for h in head.split(",")]
ends = [i for i, ch in enumerate(head) if ch == ","] + [REC - 1]
starts = [0] + [e + 1 for e in ends[:-1]]
col = {nm: (a, b) for nm, a, b in zip(names, starts, ends)}

dsum = np.zeros((n, n)); dcnt = np.zeros((n, n), dtype=np.int32); cnt = np.zeros((n, n), dtype=np.int32)
c = (n - 1) / 2; seen = 0; with_depth = 0; surface = 0
with open(src, "rb") as f:
    f.seek(REC)
    while True:
        buf = f.read(REC * 200000)
        if not buf: break
        a = np.frombuffer(buf, dtype=np.uint8).reshape(-1, REC)
        get = lambda nm: np.ascontiguousarray(a[:, col[nm][0]:col[nm][1]]).view(f"S{col[nm][1] - col[nm][0]}").ravel().astype(np.float64)
        lon, lat, ice = get("tri_clon"), get("tri_clat"), get("ice_depth")
        ok = np.abs(lat) >= abs(sp["min_lat"]) - 0.05
        lon, lat, ice = lon[ok], lat[ok], ice[ok]
        r = 2 * R * np.tan((90 - np.abs(lat)) * DEG / 2)
        cc = np.rint(c + r * np.sin(lon * DEG) / scale).astype(int); rr = np.rint(c - SY * r * np.cos(lon * DEG) / scale).astype(int)
        inb = (cc >= 0) & (cc < n) & (rr >= 0) & (rr < n)
        cc, rr, ice = cc[inb], rr[inb], ice[inb]
        has = ice >= -1                                   # -1 (coldest ground) and 0 both mean: at the surface
        np.add.at(cnt, (rr, cc), 1); np.add.at(dcnt, (rr[has], cc[has]), 1); np.add.at(dsum, (rr[has], cc[has]), np.maximum(ice[has], 0))
        seen += len(ice); with_depth += int(has.sum()); surface += int(((ice == 0) | (ice == -1)).sum())
print(f"triangles in the cap: {seen:,} | with an ice depth: {with_depth:,} ({with_depth / seen * 100:.1f}%) | stable at the surface: {surface:,} ({surface / seen * 100:.1f}%)")

inside = np.frombuffer(gzip.decompress(open(os.path.join(ROOT, "data", "layers", sp["files"]["sun"]), "rb").read()), dtype=np.uint8).reshape(n, n) != 255
frac = np.where(cnt > 0, dcnt / np.maximum(cnt, 1), np.nan)            # share of a square's triangles with a depth
depth = np.where(dcnt > 0, dsum / np.maximum(dcnt, 1), np.nan)
for _ in range(3):                                                      # squares no triangle center fell in: their neighbors' mean
    if not np.isnan(frac[inside]).any(): break
    def fill(v):
        p = np.pad(v, 1, constant_values=np.nan)
        nb = np.stack([p[1 + dr:1 + dr + n, 1 + dc:1 + dc + n] for dr in (-1, 0, 1) for dc in (-1, 0, 1)])
        return np.where(np.isnan(v), np.nanmean(nb, axis=0), v)
    empty = np.isnan(frac); depth = np.where(empty, fill(depth), depth); frac = fill(frac)
has = (frac >= 0.5) & ~np.isnan(depth)
out = np.where(~inside | np.isnan(frac), 255, np.where(has, np.clip(np.rint(np.nan_to_num(depth) / 0.0125), 0, 230), 254)).astype(np.uint8)
with open(os.path.join(ROOT, "data", "layers", PRE + "_ice.u8.gz"), "wb") as f: f.write(gzip.compress(out.tobytes(), 9, mtime=0))
ins = out[inside]
sp["files"]["ice"] = PRE + "_ice.u8.gz"
sp["ice"] = {"source": "LRO Diviner Polar Resource Product V2.0 (Paige et al., LRO-L-DLRE-5-PRP-V2.0, NASA PDS, 2018), column ice_depth",
             "unit": "value * 0.0125 = meters; 254 = deeper than 2.87 m (not reported by NASA); 255 = no data",
             "note": "NASA's code -1 (ground whose yearly maximum is 101 K or less; not described in the product label) is stored as 0, at the surface",
             "share_with_depth_pct": round(float((ins <= 230).mean() * 100), 2), "share_at_surface_pct": round(float((ins == 0).mean() * 100), 2),
             "no_data_squares": int((ins == 255).sum())}
json.dump(ix, open(ix_path, "w"), indent=1)
print("wrote", sp["ice"], "| file bytes", os.path.getsize(os.path.join(ROOT, "data", "layers", PRE + "_ice.u8.gz")))
