# LUNO — project notes for Claude

LUNO (Lunar Utility for Navigational Operations) is a team entry for the NASA Space Apps Challenge 2026,
challenge "Lunar Landing Site Navigator". Hackathon window: Sat 14 Nov 9:00 to Sun 15 Nov 2026 23:59 local time.
Team of two siblings; the user directs and tests, Claude writes the code. AI use must be disclosed in the submission.
Judging (1–5 each): Impact, Creativity, Validity, Relevance (NASA data as a core component), Presentation.

## What it is
A static web app (no build step, no backend). Pick a lunar landing site and landing time; it shows the Sun and Earth
against the terrain skyline, GO / NO-GO for power and Earth link, countdowns, a 30-day timeline, a 12-month
landing-window calendar judged against "mission needs", and an area scan that maps nearby points.

Run: `python -m http.server 8080` in this folder, open http://localhost:8080 (must be served, not opened as a file).

## Layout
- `index.html`, `css/style.css` — one screen styled as a console inside a rugged field unit. Wide windows: the unit is
  laid out at a design size and scaled to fit (`fitStage()` in `js/app.js`, CSS vars `--dw --dh --s` on `#stage`).
  Under 900 px wide: `html.flow` stacked layout. Pointer maths must divide by the scale (`zoomOf`).
- `js/ephem.js` — Sun/Earth geometry from `data/ephem.bin` (SPICE DE440, Moon ME frame, every 2 h, 2023–2035).
- `js/model.js` — `sampleSite`, `getScenario`, `terrainFor` (preset skylines from `data/horizons.json`, custom ones cached).
- `js/terrain.js` — in-browser skylines from reduced LOLA maps in `data/dem/` (custom points and the scan).
- `js/mission.js` — mission needs: `analyze`, `windowsFrom`, `dailyStats`. Pure functions.
- `js/scan-core.js`, `js/scan.js`, `js/scan-worker.js`, `js/ui-scan.js` — area scan in module Web Workers.
- `js/ui-calendar.js` — landing-window strip. `js/globe.js` — three.js Moon (vendored in `vendor/`).
- `js/bin.js` — binary loader; `LUNO_B64` switches to base64 `.b64.txt` files for hosts that only serve text.
- `data/sites.json` — preset sites (single source of truth). `approx: true` rows still need an official source.
- `tools/` — Python builders (need `spiceypy numpy`): `build_ephemeris.py`, `lola.py`, `build_horizons.py`,
  `build_web_dem.py`, `find_best_lit.py`, `fetch_horizons_fixtures.py`; `fetch_kernels.sh` and `fetch_dem.sh`
  download the NASA inputs (about 45 MB and 620 MB; not in git).
- `tests/` — run with Node 22: `check_ephemeris` (0.0007° vs JPL Horizons), `check_terrain`, `check_mission`,
  `check_scan`, `real_missions`.

## Rules of the road
- Only real, sourced data in the app. Unsourced notes were removed on purpose; do not re-add figures without a source.
- Label reduced-detail results honestly (custom points and scans use 240 m – 3.8 km maps; presets use 40 m + 240 m).
- Known limits: Sun counts as up when its disc centre clears the skyline; eclipses are not modelled.
- Test UI changes at several window sizes (1000×480, 1366×650, 1440×900, 1920×950, 390×844); an earlier version
  overlapped badly at in-between sizes.
- Keep plain-language explanations for the user; they are not a programmer.

## Open work, roughly in priority order
1. **TURN ON GITHUB PAGES — NOT DONE YET, DO NOT FORGET.** The code is pushed to
   https://github.com/galileoleosolis/LUNI (branch `main`), but Pages is still off, so there is no public link
   for the judges. To finish: repo Settings → Pages → "Deploy from a branch" → `main`, `/ (root)` → Save
   (or `gh api -X POST repos/galileoleosolis/LUNI/pages -f 'source[branch]=main' -f 'source[path]=/'` once the
   user says to). Then check `https://galileoleosolis.github.io/LUNI/` loads, add an empty `.nojekyll` file if
   anything is missing, and put the link in the README and the project submission. The user asked to do this later.
2. Presentation: story, demo video, project page text. Nothing exists yet.
3. OpenSpace link (user has OpenSpace installed): send Lua over its local WebSocket server to follow LUNO's site and
   time. Must be tested on the user's PC; works only when LUNO is served locally, not from a sandboxed preview.
4. Windows .exe wrapper (Electron) if still wanted.
5. Test mode is built (`js/testmode.js`, on with `#test` or `window.LUNO_TEST`): intro, six tasks, local usage log,
   review, copyable report. First run (the user's sibling, 14 Nov): 2/6, ease 2/5. The native date box reset itself
   while he typed the year and blocked the whole test; he never found the site list and read "05Z" as a year.
   Fixed since: click-only UTC pickers, one date format with year, numbered step headers, numbered tags on the Moon,
   clearer task wording. Needs a re-test with someone who has NOT seen the app.
6. Quick wins: eclipse alerts, share link, real-mission replays, explainer mode, partial-Sun power.
7. Verify coordinates in `data/sites.json` against their source links; get NASA's coordinates for the nine
   Artemis III candidate regions (current polar presets are LUNO-selected best-lit points near rough centres).
