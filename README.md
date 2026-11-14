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
- **UI:** 3D Moon site picker, site list + custom coordinates, landing time + launch-slip keys, GO / NO-GO readouts with
  sunset / Earthset countdowns, horizon panorama, 30-day visibility timeline, side-by-side comparison, keyboard shortcuts.
- **Data:** still a **placeholder** analytic model + synthetic terrain (`js/model.js`). Real SPICE geometry and LOLA horizons are next.

## Data and credits
- Moon imagery: LRO WAC global mosaic (NASA/GSFC/Arizona State University), tiles from NASA Moon Trek → `assets/moon_wac_4k.jpg`
- Landing-site coordinates: see `src` links in `js/sites.js` (rows marked `approx` still need an official source)
- Planned: NASA NAIF SPICE (Sun/Earth geometry, cross-checked with JPL Horizons); LRO LOLA polar DEMs (terrain horizons)
- Libraries: three.js (MIT, `vendor/`); fonts IBM Plex Mono and Barlow Condensed (SIL OFL, `assets/fonts/`)

## AI disclosure
Code written with the help of Claude (Anthropic), directed and tested by the team.
