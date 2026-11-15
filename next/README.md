# LUNI — Lunar Utility for Navigational Intelligence

NASA Space Apps Challenge 2026 · *Lunar Landing Site Navigator*

Pick a lunar landing site and date, and LUNI shows the Sun and Earth against the local terrain horizon:
how long you'll have solar power, when direct-to-Earth communication is possible, and how a launch slip changes that.

**Try it: https://galileoleosolis.github.io/LUNI/** (the newest work in progress is at `/LUNI/next/`)

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
- **3D surface view:** stand at the site and look around. The ground is built from LOLA elevation data (40 m detail
  near the polar presets, coarser out to 260 km, with the Moon's curvature), lit from the Sun's real direction with cast
  shadows, and LUNI's calculated skyline is drawn over it as a check. Detail settings from LOW to ULTRA.
- **Eclipses and partial Sun:** eclipses (Earth in front of the Sun) are detected and flagged on the verdict, the
  timeline and the Sun readout; the Sun readout shows the share of the disc in view when it is partly hidden.
- **Opening scene and proof:** LUNI opens on a real landing (IM-2 Athena, 6 March 2025). The PROOF panel shows the
  JPL Horizons check, replays three real landings (IM-2, Blue Ghost Mission 1, Chandrayaan-3) next to sourced accounts
  of what happened, and lists what LUNI does not model. Mission facts and their sources are in `js/stories.js`.
- **Share link:** COPY LINK puts the site, landing time and mission needs in the address, so a link opens the same question.
- **Slope need:** an optional limit on ground slope (from LOLA), respected by the verdict, the calendar and the area scan.
- **This site next to Earth:** longest sunlight and dark spells, the Sun's highest point, how long a sunset takes, and
  how little Earth moves in the sky, from a year of hourly positions.
- **Mission history:** six real landings since 2023 side by side, each replayed with LUNI's data next to a sourced
  account of what happened, and loadable into the main screen at its real date, hour and mission needs.
- **Moon map with layers:** the 3D Moon made big, with elevation, slope, sunlight, Earth link and temperature for the
  whole Moon and permanent shadow at both poles (`data/layers`: 480 m squares poleward of 80° from `tools/build_layers.py`,
  quarter-degree squares elsewhere from `tools/build_layers_global.py`, LOLA skylines against SPICE positions over 2023–2035). Each layer names its data source and is colored green for good, red for bad. A data
  profile card gives every layer's value at any point; the same layers and card are in the area scan.
- **Temperature:** NASA's LRO Diviner Polar Resource Product V2.0 (annual average and maximum surface temperature),
  re-gridded by `tools/build_temperature.py`, as a layer and in the data profile.
- **Your mix:** blend sunlight, Earth link, flat ground and warmer ground with your own weights into one score per place,
  see it on the Moon map, and send it to the scan, which then picks its best point by your mix.
- **Sun and Earth positions:** NASA NAIF SPICE (DE440, Moon ME frame), stored every 2 hours for 2023–2035 in `data/ephem.bin`.
- **Terrain:** skylines for the preset sites are pre-computed from LRO LOLA elevation maps (`data/horizons.json`),
  with the observer 2 m above the surface. Custom points and the area scan compute skylines in the browser from reduced
  LOLA maps (`data/dem`, 240 m to 3.8 km per pixel), so they are less detailed than the presets.

## Checks
- `node tests/check_ephemeris.mjs` compares LUNI with 1,110 JPL Horizons values (6 sites, 4 date ranges): worst error 0.0007°.
- `node tests/check_terrain.mjs` compares the in-browser terrain method with the full-resolution skylines (mean difference 0.04–1.0°).
- `node tests/check_mission.mjs` tests the mission-needs rules (synthetic cases, plus 9,680 real landing hours re-checked the long way).
- `node tests/check_scan.mjs` tests the area scan (grid geometry, agreement with a direct evaluation, finds the Shackleton ridge). At south-polar sites the scan computes its skylines on the graphics chip when the browser has one, which allows a point on every 250 m map pixel (up to 121 x 121). Each run checks the chip against the processor at the site and falls back to the processor if they disagree. Checked so far on an emulated chip only: skylines within 0.001 degrees, no GO / NO-GO difference in 1,085 points.
- `node tests/check_layers.mjs` compares the south polar map layers with LUNI's own numbers at the polar preset sites.
- `node tests/check_eclipses.mjs` lists every eclipse in 2023–2035 as seen from the Moon and checks the partial-Sun math.
- `node tests/check_assistant.mjs` tests ASK LUNI (typed or spoken commands): about 60 sentences must turn into the right actions, and the answers must use only the numbers LUNI computed. A real microphone has not been tested yet. ASK LUNI can also hand open questions to a language model running on the same computer (Ollama, LM Studio and similar); that link has only been tested against a scripted stand-in, not a real model.
- `node tests/real_missions.mjs` prints LUNI's sunrise/sunset for the Chandrayaan-3, IM-1 and IM-2 landing sites.
- At 89.45°S 222.69°E (a well-known high-illumination ridge near Shackleton) LUNI gets about 81% sunlight over 2026 at 2 m
  and 93% at 10 m, in line with published LOLA illumination studies.

## Known limits
- The Sun counts as available when at least half of its disc is usable: the part above the skyline, less any part
  hidden behind the Earth during an eclipse. The skyline is treated as level across the width of the Sun's disc.
- Solar power is not modeled beyond that (no panel angle, no dust, no temperature).
- Sites outside the south polar maps use the coarser global LOLA map (about 1.9 km per pixel).

## Rebuilding the data
```
pip install spiceypy numpy
tools/fetch_kernels.sh && python3 tools/build_ephemeris.py      # Sun/Earth table
tools/fetch_dem.sh && python3 tools/build_horizons.py           # terrain skylines (downloads about 620 MB)
python3 tools/build_web_dem.py                                  # reduced maps for custom points
python3 tools/build_patches.py                                  # detailed patches for the 3D surface view
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

## Publishing

GitHub Pages serves the `release` branch, not `main`:

- `/LUNI/` is the released version.
- `/LUNI/next/` is the newest work in progress (it says TEST BUILD at the top).

`tools/release.sh next` copies the current commit into `next/` only. `tools/release.sh promote` also makes it the released version; `tools/release.sh promote <commit>` rolls the released version back to an older commit.
