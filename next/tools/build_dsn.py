#!/usr/bin/env python3
"""Where the Moon stands over the Earth, for LUNI's "which Deep Space Network site can see the Moon" line.

For every 6 hours from START to STOP (UTC) it stores the point on Earth directly under the Moon and the Moon's
distance, in the Earth-fixed ITRF93 frame (apparent, from Earth's center):
  int16  latitude  * 1000   (degrees, geocentric)
  uint16 longitude * 65536 / 360   (degrees east, 0 .. 360)
  uint16 (distance_km - 340000) / 2
The web app interpolates this (the longitude along its short way round: it moves about 87 degrees in 6 hours) and
works out the Moon's height above the horizon at each station from the station's own position.

Stations: the three 70 m antennas, one per complex, from NASA NAIF's station kernel earthstns_itrf93_260814
(positions in ITRF93, km; their drift of about 2 cm a year is ignored).
Earth's orientation: NAIF earth_1962_260806_2126_combined.bpc (measured to August 2026, predicted after that).

Usage:  tools/fetch_kernels.sh && python3 tools/build_dsn.py
Output: data/dsn.bin, data/dsn.json, tests/fixtures/dsn_check.json (SPICE's own answers, for tests/check_dsn.mjs)
"""
import json, os
import numpy as np
import spiceypy as sp

HERE = os.path.dirname(os.path.abspath(__file__)); K = os.path.join(HERE, "kernels"); ROOT = os.path.join(HERE, "..")
START, STOP, STEP_H = "2023-01-01T00:00:00", "2036-01-01T00:00:00", 6
KERNELS = ["naif0012.tls", "pck00011.tpc", "de440s.bsp", "earth_1962_260806_2126_combined.bpc", "earthstns_itrf93_260814.bsp"]
for k in KERNELS: sp.furnsh(os.path.join(K, k))
STATIONS = [("DSS-14", "GOLDSTONE", "California, USA"), ("DSS-63", "MADRID", "Spain"), ("DSS-43", "CANBERRA", "Australia")]
RE, RP = 6378.1366, 6356.7519                       # Earth's equatorial and polar radius, km (pck00011.tpc BODY399_RADII)

et0, et1 = sp.utc2et(START), sp.utc2et(STOP)
n = int(round((et1 - et0) / (STEP_H * 3600))) + 1
out = np.empty(n, dtype=[("lat", "<i2"), ("lon", "<u2"), ("dist", "<u2")])
for i in range(n):
    p, _ = sp.spkpos("MOON", et0 + i * STEP_H * 3600.0, "ITRF93", "LT+S", "EARTH")
    r = float(np.linalg.norm(p))
    out["lat"][i] = int(round(np.degrees(np.arcsin(p[2] / r)) * 1000))
    out["lon"][i] = int(round((np.degrees(np.arctan2(p[1], p[0])) % 360) * 65536 / 360)) % 65536
    out["dist"][i] = int(round((r - 340000) / 2))
out.tofile(os.path.join(ROOT, "data", "dsn.bin"))

stations = []
for code, name, where in STATIONS:
    xyz, _ = sp.spkpos(code, sp.utc2et("2030-01-01T00:00:00"), "ITRF93", "NONE", "EARTH")
    up = np.array([xyz[0] / RE**2, xyz[1] / RE**2, xyz[2] / RP**2]); up /= np.linalg.norm(up)      # the ellipsoid's normal there
    stations.append({"id": code, "name": name, "where": where, "xyz_km": [round(float(v), 4) for v in xyz], "up": [round(float(v), 7) for v in up],
                     "lat": round(float(np.degrees(np.arcsin(up[2]))), 4), "lon": round(float(np.degrees(np.arctan2(xyz[1], xyz[0]))), 4)})
meta = {"start_utc": START + "Z", "step_hours": STEP_H, "count": n, "frame": "ITRF93 (Earth-fixed)", "aberration": "LT+S", "observer": "Earth center",
        "layout": "per step: int16 lat*1000, uint16 lon*65536/360, uint16 (dist_km-340000)/2", "stations": stations, "kernels": KERNELS,
        "source": "NASA NAIF SPICE generic kernels: station positions earthstns_itrf93_260814, Earth orientation earth_1962_260806_2126_combined (predicted after August 2026)"}
json.dump(meta, open(os.path.join(ROOT, "data", "dsn.json"), "w"), indent=1)

# SPICE's own answer, with the station as the observer, at times that are not on the 6-hour grid
rng = np.random.default_rng(7); checks = []
for et in et0 + rng.random(240) * (et1 - et0 - 86400):
    row = {"utc": sp.et2utc(et, "ISOC", 0) + "Z", "el": {}}
    for s in stations:
        p, _ = sp.spkpos("MOON", et, "ITRF93", "LT+S", s["id"])
        row["el"][s["name"]] = round(float(np.degrees(np.arcsin(np.dot(p, s["up"]) / np.linalg.norm(p)))), 4)
    checks.append(row)
os.makedirs(os.path.join(ROOT, "tests", "fixtures"), exist_ok=True)
json.dump(checks, open(os.path.join(ROOT, "tests", "fixtures", "dsn_check.json"), "w"))
print(n, "steps,", os.path.getsize(os.path.join(ROOT, "data", "dsn.bin")), "bytes |", [(s["name"], s["lat"], s["lon"]) for s in stations])
