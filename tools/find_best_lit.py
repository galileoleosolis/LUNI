#!/usr/bin/env python3
"""Find the best-lit point near a rough region centre, using the full-detail LOLA maps.

For each candidate on a grid around the centre it computes a coarse skyline and the share of a full year
(2027) with the Sun's centre above it and with Earth in view, then re-checks the top candidates at full detail.
Usage: python3 tools/find_best_lit.py <lat> <lon> [radius_km=3] [spacing_m=120]
"""
import sys, os, json
import numpy as np
import lola

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
E = np.fromfile(os.path.join(ROOT, "data", "ephem.bin"), dtype="<f4").reshape(-1, 6)
I0 = int((2027 - 2023) * 365.25 * 12); YEAR = E[I0:I0 + int(365.25 * 12)]

def year_fractions(lat, lon, az, hz, h0, mast=2.0):
    la, lo = np.radians(lat), np.radians(lon)
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    east = np.array([-np.sin(lo), np.cos(lo), 0.0]); north = np.cross(up, east)
    azx, hzx = np.append(az, 360.0), np.append(hz, hz[0])
    S = YEAR[:, :3]
    sun = np.degrees(np.arcsin(S @ up)) > np.interp(np.degrees(np.arctan2(S @ east, S @ north)) % 360, azx, hzx)
    V = YEAR[:, 3:] - (1737.4 + (h0 + mast) / 1000) * up
    earth = np.degrees(np.arcsin(V @ up / np.linalg.norm(V, axis=1))) > np.interp(np.degrees(np.arctan2(V @ east, V @ north)) % 360, azx, hzx)
    return sun.mean() * 100, earth.mean() * 100

def coarse_horizon(lat, lon):
    return lola.horizon(lat, lon, az_step=3.0, growth=0.006)

def search(lat, lon, radius_km=3.0, spacing_m=120.0):
    k = int(radius_km * 1000 // spacing_m); out = []
    for i in range(-k, k + 1):
        for j in range(-k, k + 1):
            e, n = j * spacing_m, i * spacing_m; d = float(np.hypot(e, n))
            if d > radius_km * 1000: continue
            la, lo = (lat, lon) if d == 0 else lola.destination(lat, lon, np.degrees(np.arctan2(e, n)), d)
            la, lo = float(la), float(lo)
            az, hz, info = coarse_horizon(la, lo)
            s, ea = year_fractions(la, lo, az, hz, info["site_height_m"])
            out.append((s, ea, la, lo, info["site_height_m"], e, n))
    out.sort(key=lambda r: -(r[0] + 0.25 * r[1]))      # sunlight first, Earth link as a tie-breaker
    best = []
    for s, ea, la, lo, h, e, n in out[:6]:             # confirm the leaders at full detail
        az, hz, info = lola.horizon(la, lo)
        s2, e2 = year_fractions(la, lo, az, hz, h)
        slope, _ = lola.site_slope(la, lo)
        best.append(dict(lat=round(la, 4), lon=round(lo, 4), sun_pct=round(s2, 1), earth_pct=round(e2, 1), height_m=round(h), slope_deg=round(slope, 1), east_m=e, north_m=n))
    best.sort(key=lambda r: -(r["sun_pct"] + 0.25 * r["earth_pct"]))
    return len(out), best

if __name__ == "__main__":
    lat, lon = float(sys.argv[1]), float(sys.argv[2])
    r = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0
    sp = float(sys.argv[4]) if len(sys.argv) > 4 else 120.0
    n, best = search(lat, lon, r, sp)
    print(json.dumps({"candidates": n, "best": best}, indent=1))
