# LUNO — Lunar Utility for Navigational Operations

NASA Space Apps Challenge 2026 · *Lunar Landing Site Navigator*

Pick a lunar landing site and date, and LUNO shows the Sun and Earth against the local terrain horizon:
how long you'll have solar power, when direct-to-Earth communication is possible, and how a launch slip changes that.

## Run locally
```
python -m http.server 8080
```
Then open http://localhost:8080 (it must be served, not opened as a file).

## Status
- **Site view:** 3D Moon site picker, site list + custom coordinates, landing time + launch-slip keys, GO / NO-GO readouts
  with sunset / Earthset countdowns, horizon panorama, 30-day visibility timeline, side-by-side comparison.
- **Mission needs:** mission length, longest dark gap the lander can ride out, Earth link at landing, Earth link share.
- **Landing-window calendar:** every good landing day for the chosen site and needs over the next 12 months, a list of
  the next windows, and a NEXT WINDOW key.
- **Area scan:** checks a grid of points around the site (in Web Workers) against the needs and maps where sunlight and
  Earth link are best; click a cell to move the site there.
- **Sun and Earth positions:** NASA NAIF SPICE (DE440, Moon ME frame), stored every 2 hours for 2023–2035 in `data/ephem.bin`.
- **Terrain:** skylines for the preset sites are pre-computed from LRO LOLA elevation maps (`data/horizons.json`),
  with the observer 2 m above the surface. Custom points and the area scan compute skylines in the browser from reduced
  LOLA maps (`data/dem`, 240 m to 3.8 km per pixel), so they are less detailed than the presets.

## Checks
- `node tests/check_ephemeris.mjs` compares LUNO with 1,110 JPL Horizons values (6 sites, 4 date ranges): worst error 0.0007°.
- `node tests/check_terrain.mjs` compares the in-browser terrain method with the full-resolution skylines (mean difference 0.04–1.0°).
- `node tests/check_mission.mjs` tests the mission-needs rules (synthetic cases, plus 9,680 real landing hours re-checked the long way).
- `node tests/check_scan.mjs` tests the area scan (grid geometry, agreement with a direct evaluation, finds the Shackleton ridge).
- `node tests/real_missions.mjs` prints LUNO's sunrise/sunset for the Chandrayaan-3, IM-1 and IM-2 landing sites.
- At 89.45°S 222.69°E (a well-known high-illumination ridge near Shackleton) LUNO gets about 81% sunlight over 2026 at 2 m
  and 93% at 10 m, in line with published LOLA illumination studies.

## Known limits
- Sun counts as "up" when the center of its disc clears the skyline (no partial-disc power yet).
- Eclipses (Earth blocking the Sun) are not modeled.
- Sites outside the south polar maps use the coarser global LOLA map (about 1.9 km per pixel).

## Rebuilding the data
```
pip install spiceypy numpy
tools/fetch_kernels.sh && python3 tools/build_ephemeris.py      # Sun/Earth table
tools/fetch_dem.sh && python3 tools/build_horizons.py           # terrain skylines (downloads about 620 MB)
python3 tools/build_web_dem.py                                  # reduced maps for custom points
python3 tools/find_best_lit.py -86.0 0.0 5 200                  # best-lit point near a rough region center
python3 tools/fetch_horizons_fixtures.py                        # refresh the JPL Horizons reference values
```

## Data and credits
- Sun/Earth geometry: NASA NAIF SPICE generic kernels (de440s.bsp, moon_pa_de440, pck00011, naif0012); reference values from JPL Horizons
- Terrain: LRO LOLA gridded elevation (ldem_80s_40m, ldem_60s_240m, ldem_16), NASA PDS Geosciences Node
- Moon imagery: LRO WAC global mosaic (NASA/GSFC/Arizona State University), tiles from NASA Moon Trek → `assets/moon_wac_4k.jpg`
- Landing-site coordinates and notes: `data/sites.json` (rows marked `approx` still need an official source)
- Libraries: three.js (MIT, `vendor/`); fonts IBM Plex Mono and Barlow Condensed (SIL OFL, `assets/fonts/`)

## AI disclosure
Code written with the help of Claude (Anthropic), directed and tested by the team.
