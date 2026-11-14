#!/usr/bin/env python3
"""Build LUNO's Sun/Earth ephemeris table from NASA NAIF SPICE kernels.

For every 2 hours from START to STOP (UTC) it stores, in the Moon-fixed MOON_ME frame
(the mean Earth / polar axis frame that LRO and LOLA maps use):
  - the apparent unit vector from the Moon's center to the Sun
  - the apparent position of the Earth relative to the Moon's center, in km
The web app interpolates this table and converts to azimuth/elevation for any site.

Usage:  tools/fetch_kernels.sh && python3 tools/build_ephemeris.py
Output: data/ephem.bin (little-endian float32, 6 values per step), data/ephem.json
"""
import json, os
import numpy as np
import spiceypy as sp

HERE = os.path.dirname(os.path.abspath(__file__))
K = os.path.join(HERE, "kernels")
OUT = os.path.join(HERE, "..", "data")
START, STOP, STEP_H = "2023-01-01T00:00:00", "2036-01-01T00:00:00", 2
KERNELS = ["naif0012.tls", "pck00011.tpc", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf", "de440s.bsp"]

for k in KERNELS:
    sp.furnsh(os.path.join(K, k))

et0, et1 = sp.utc2et(START), sp.utc2et(STOP)
n = int(round((et1 - et0) / (STEP_H * 3600))) + 1
ets = et0 + np.arange(n) * STEP_H * 3600.0

out = np.empty((n, 6), dtype="<f4")
for i, et in enumerate(ets):
    sun, _ = sp.spkpos("SUN", et, "MOON_ME", "LT+S", "MOON")
    earth, _ = sp.spkpos("EARTH", et, "MOON_ME", "LT+S", "MOON")
    out[i, 0:3] = np.asarray(sun) / np.linalg.norm(sun)
    out[i, 3:6] = earth

os.makedirs(OUT, exist_ok=True)
out.tofile(os.path.join(OUT, "ephem.bin"))
meta = {
    "start_utc": START + "Z", "step_hours": STEP_H, "count": n,
    "frame": "MOON_ME (MOON_ME_DE440_ME421)", "aberration": "LT+S", "observer": "Moon center",
    "layout": "float32 LE x6 per step: sunUnit(x,y,z), earthKm(x,y,z)",
    "moon_radius_km": 1737.4,
    "kernels": KERNELS, "source": "NASA NAIF SPICE generic kernels, https://naif.jpl.nasa.gov/naif/data_generic.html",
}
json.dump(meta, open(os.path.join(OUT, "ephem.json"), "w"), indent=1)
print(n, "steps,", os.path.getsize(os.path.join(OUT, "ephem.bin")) / 1e6, "MB")
