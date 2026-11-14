#!/usr/bin/env python3
"""Pre-compute the terrain horizon, height and slope for every preset site from LOLA elevation maps.

Usage:  tools/fetch_dem.sh && python3 tools/build_horizons.py
Output: data/horizons.json  { site_id: { az_step, el_cdeg[...], height_m, slope_deg, ... } }
        el_cdeg = skyline elevation in hundredths of a degree, for azimuth 0, az_step, 2*az_step ... (clockwise from north)
"""
import json, os
import numpy as np
import lola

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
MAST_M, AZ_STEP = 2.0, 0.5
sites = json.load(open(os.path.join(ROOT, "data", "sites.json")))["sites"]
out = {"_about": f"Terrain horizons from LRO LOLA gridded elevation (PDS). Observer {MAST_M} m above the surface. "
                 "Near field: ldem_80s_40m (within 30 km, south of 80S). Far field to 250 km: ldem_60s_240m (south of 60.5S) or ldem_16 (elsewhere)."}
for s in sites:
    az, el, info = lola.horizon(s["lat"], s["lon"], mast_m=MAST_M, az_step=AZ_STEP)
    slope, base = lola.site_slope(s["lat"], s["lon"])
    out[s["id"]] = {
        "lat": s["lat"], "lon": s["lon"], "az_step": AZ_STEP, "mast_m": MAST_M,
        "height_m": round(info["site_height_m"], 1), "height_source": info["height_source"],
        "slope_deg": round(slope, 1), "slope_baseline_m": round(base),
        "near_map": info["near_map"], "far_map": info["far_map"],
        "el_cdeg": [int(round(v * 100)) for v in el],
    }
    print(f"{s['id']:11s} h={info['site_height_m']:8.1f} m  slope={slope:4.1f} deg over {base:.0f} m  "
          f"skyline min/mean/max = {el.min():6.2f} {el.mean():6.2f} {el.max():6.2f} deg  ({info['near_map'] or '-'} + {info['far_map']})")
json.dump(out, open(os.path.join(ROOT, "data", "horizons.json"), "w"), separators=(",", ":"))
print("wrote data/horizons.json", os.path.getsize(os.path.join(ROOT, "data", "horizons.json")) // 1024, "KB")
