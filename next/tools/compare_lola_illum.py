#!/usr/bin/env python3
"""LUNI's polar layers next to NASA's own polar illumination maps.

NASA's maps: the LOLA team's 2016 release in the LOLA archive's extras (NASA PDS Geosciences Node,
lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/img; method: Mazarico et al. 2011), 240 m per pixel:
  lpsr_65{s,n}_240m_201608            permanently shadowed regions (1 or 0)
  avgvisib_65{s,n}_240m_201608        average visibility of the solar disc (0 to 1)
  avgvisib_65{s,n}_240m_201608_earth  average visibility of the Earth (0 to 1)
LUNI's layers: data/layers/{sp,np}_{shadow,sun,earth} (480 m squares poleward of 80 degrees, tools/build_layers.py).
Both use the same polar stereographic layout, so each LUNI square is the mean of a 2 x 2 block of NASA pixels.

The two are not the same measurement, and the numbers below should be read with that in mind:
  NASA: at the surface, the share of the Sun's (or Earth's) disc in view, averaged over a long period.
  LUNI: 2 m above the surface, the share of 2023 to 2035 in which the Sun's (or Earth's) center clears the skyline.

Usage:  python3 tools/compare_lola_illum.py      (maps in tools/dem/lola_illum/)
Output: prints the comparison and stores it in data/layers/index.json under "nasa_check" (shown on the PROOF panel).
"""
import gzip, json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, ".."); SRC = os.path.join(HERE, "dem", "lola_illum")
ix_path = os.path.join(ROOT, "data", "layers", "index.json"); ix = json.load(open(ix_path))
N = 6420
def nasa(name, scale, offset=0.0):
    a = np.fromfile(os.path.join(SRC, name + ".img"), dtype="<i2")
    assert a.size == N * N, (name, a.size)
    return a.reshape(N, N).astype(np.float32) * scale + offset
def ours(pre, key):
    P = ix[pre]; n = P["n"]
    return np.frombuffer(gzip.decompress(open(os.path.join(ROOT, "data", "layers", P["files"][key]), "rb").read()), dtype=np.uint8).reshape(n, n)
def block(a, n, k):                                   # the n x n LUNI squares, each the mean of k x k NASA pixels
    s = N // 2 - n * k // 2
    return a[s:s + n * k, s:s + n * k].reshape(n, k, n, k).mean(axis=(1, 3))

out = {"source": "NASA LRO LOLA polar illumination maps, 2016 release (LPSR, AVGVISIB, AVGVISIB_EARTH at 240 m; Mazarico et al. 2011), NASA PDS Geosciences Node, LOLA archive extras",
       "note": "NASA: at the surface, share of the disc in view, long-term average. LUNI: 2 m above the surface, share of 2023 to 2035 with the disc's center above the skyline."}
for pre, p in (("sp", "s"), ("np", "n")):
    P = ix[pre]; n = P["n"]; k = int(round(P["scale_m"] / 240)); assert k == 2
    sun_l = ours(pre, "sun"); inside = sun_l != 255
    sun_l = sun_l / 2.0; earth_l = ours(pre, "earth") / 2.0; psr_l = ours(pre, "shadow") == 1
    sun_n = block(nasa(f"avgvisib_65{p}_240m_201608", 0.00004), n, k) * 100
    earth_n = block(nasa(f"avgvisib_65{p}_240m_201608_earth", 0.00004), n, k) * 100
    psr_frac = block(nasa(f"lpsr_65{p}_240m_201608", 0.000025, 0.5), n, k); psr_n = psr_frac >= 0.5
    # the two grids must line up as they are: any flip must fit worse
    fits = {name: float(np.corrcoef(sun_l[inside], f(sun_n)[inside])[0, 1]) for name, f in (("as is", lambda a: a), ("flipped up-down", np.flipud), ("flipped left-right", np.fliplr), ("turned half round", lambda a: a[::-1, ::-1]))}
    assert max(fits, key=fits.get) == "as is", fits
    m = inside
    both = (psr_l & psr_n & m).sum(); only_l = (psr_l & ~psr_n & m).sum(); only_n = (~psr_l & psr_n & m).sum(); area = 0.48 ** 2
    r = {"squares": int(m.sum()),
         "sun": {"r": round(float(np.corrcoef(sun_l[m], sun_n[m])[0, 1]), 3), "mean_luni": round(float(sun_l[m].mean()), 1), "mean_nasa": round(float(sun_n[m].mean()), 1),
                 "mean_abs_diff": round(float(np.abs(sun_l[m] - sun_n[m]).mean()), 1), "within_10_points_pct": round(float((np.abs(sun_l[m] - sun_n[m]) <= 10).mean() * 100), 1)},
         "earth": {"r": round(float(np.corrcoef(earth_l[m], earth_n[m])[0, 1]), 3), "mean_luni": round(float(earth_l[m].mean()), 1), "mean_nasa": round(float(earth_n[m].mean()), 1),
                   "mean_abs_diff": round(float(np.abs(earth_l[m] - earth_n[m]).mean()), 1), "within_10_points_pct": round(float((np.abs(earth_l[m] - earth_n[m]) <= 10).mean() * 100), 1)},
         "shadow": {"same_answer_pct": round(float(((psr_l == psr_n) & m).sum() / m.sum() * 100), 2),
                    "nasa_km2": round(float((psr_n & m).sum() * area)), "luni_km2": round(float((psr_l & m).sum() * area)),
                    "of_nasa_shadow_luni_agrees_pct": round(float(both / max(1, both + only_n) * 100), 1), "of_luni_shadow_nasa_agrees_pct": round(float(both / max(1, both + only_l) * 100), 1)},
         "orientation_fit": {a: round(b, 3) for a, b in fits.items()}}
    out[pre] = r
    print(pre, json.dumps(r))
ix["nasa_check"] = out
json.dump(ix, open(ix_path, "w"), indent=1)
print("stored in data/layers/index.json")
