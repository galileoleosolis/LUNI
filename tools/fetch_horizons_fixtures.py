#!/usr/bin/env python3
"""Fetch reference Sun/Earth azimuth+elevation from JPL Horizons for a few lunar surface sites.
Writes tests/horizons_fixtures.json, which tests/check_ephemeris.mjs compares against LUNO's own numbers."""
import json, os, re, subprocess, urllib.parse

SITES = [  # name, lat, east lon
    ("near-pole 89.5S", -89.5, 0.0), ("Shackleton rim", -89.45, -138.0), ("IM-2 Athena", -84.7906, 29.1957),
    ("Chandrayaan-3", -69.373, 32.319), ("Apollo 11", 0.6741, 23.4731), ("Chang'e 6", -41.6385, -153.9852),
]
# The last span uses odd hours on purpose, so it lands between the 2-hour table steps and tests interpolation.
SPANS = [("2023-08-20", "2023-09-10", "12 h"), ("2026-11-11", "2026-12-11", "12 h"), ("2031-03-01", "2031-03-29", "24 h"),
         ("2027-06-01 01:00", "2027-06-29 01:00", "13 h")]
MON = {m: i + 1 for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}

def query(body, lat, lon, start, stop, step):
    p = {"format": "text", "COMMAND": f"'{body}'", "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
         "SITE_COORD": f"'{lon % 360},{lat},0'", "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'",
         "STEP_SIZE": f"'{step}'", "QUANTITIES": "'4'", "MAKE_EPHEM": "'YES'", "APPARENT": "'AIRLESS'"}
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(p)
    txt = subprocess.run(["curl", "-sS", "-m", "60", url], capture_output=True, text=True, check=True).stdout
    rows = []
    for line in txt.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines():
        m = re.match(r"\s*(\d{4})-(\w{3})-(\d\d) (\d\d):(\d\d)\s+\S*\s+([-\d.]+)\s+([-\d.]+)", line)
        y, mo, d, h, mi = int(m[1]), MON[m[2]], int(m[3]), int(m[4]), int(m[5])
        rows.append((f"{y:04d}-{mo:02d}-{d:02d}T{h:02d}:{mi:02d}:00Z", float(m[6]), float(m[7])))
    return rows

out = []
for name, lat, lon in SITES:
    for start, stop, step in SPANS:
        sun, earth = query(10, lat, lon, start, stop, step), query(399, lat, lon, start, stop, step)
        for (t, saz, sel), (_, eaz, eel) in zip(sun, earth):
            out.append({"site": name, "lat": lat, "lon": lon, "t": t, "sunAz": saz, "sunEl": sel, "earthAz": eaz, "earthEl": eel})
    print(name, len(out))
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests", "horizons_fixtures.json")
json.dump(out, open(path, "w"))
print("wrote", len(out), "rows")
