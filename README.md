# LUNO — Lunar Utility for Navigational Operations

NASA Space Apps Challenge 2026 · *Lunar Landing Site Navigator*

Pick a lunar landing site and date, and LUNO shows the Sun and Earth against the real terrain horizon:
how long you'll have solar power, when direct-to-Earth communication is possible, and how a launch slip changes that.

## Run locally
```
python -m http.server 8080
```
Then open http://localhost:8080

## Status
- UI: site/date picker, launch-slip buttons, verdict, Sun/Earth cards, horizon panorama, 30-day timeline, comparison
- Data: **placeholder** analytic model + synthetic terrain (`js/model.js`). Real SPICE geometry and LOLA horizons next.

## Data sources (planned)
- NASA NAIF SPICE (via spiceypy) — Sun/Earth geometry; cross-checked with JPL Horizons
- LRO LOLA polar DEMs (PDS Geosciences Node) — terrain horizons

## AI disclosure
Code written with the help of Claude (Anthropic), directed and tested by the team.
