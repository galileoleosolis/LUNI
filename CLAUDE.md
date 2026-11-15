# LUNI — project notes for Claude

**Name:** the product is **LUNI, Lunar Utility for Navigational Intelligence** (renamed by the user on 14 Nov 2026 from
LUNO, "Lunar Utility for Navigational Operations"; the idea came from the sibling). Everything a person can read says
LUNI. Internal names were left alone on purpose and still say LUNO: `window.LUNO_B64`, `LUNO_TEST`, `LUNO_NO_GPU`,
the `luno:state` / `luno:command` events, the `luno-*` storage keys, the artifact file `luno.html`, and the pictures
in `docs/figures/`. Do not "fix" those in passing; a rename there has to be done everywhere at once.

LUNI (Lunar Utility for Navigational Intelligence) is a team entry for the NASA Space Apps Challenge 2026,
challenge "Lunar Landing Site Navigator". Hackathon window: Sat 14 Nov 9:00 to Sun 15 Nov 2026 23:59 local time.
Team of two siblings; the user directs and tests, Claude writes the code. AI use must be disclosed in the submission.
Judging (1–5 each): Impact, Creativity, Validity, Relevance (NASA data as a core component), Presentation.

The challenge's own wording is in `docs/challenge.md`, the judging sheet's five criteria are above: read them before
scoring or pitching, do not work from memory (the user asked for this).

## What it is
A static web app (no build step, no backend). Pick a lunar landing site and landing time; it shows the Sun and Earth
against the terrain skyline, GO / NO-GO for power and Earth link, countdowns, a 30-day timeline, a 12-month
landing-window calendar judged against "mission needs", and an area scan that maps nearby points.

Run: `python -m http.server 8080` in this folder, open http://localhost:8080 (must be served, not opened as a file).

## Layout
- `index.html`, `css/style.css` — one screen styled as a console inside a rugged field unit. Wide windows: the unit is
  laid out at a design size and scaled to fit (`fitStage()` in `js/app.js`, CSS vars `--dw --dh --s` on `#stage`).
  Under 900 px wide: `html.flow` stacked layout. Pointer math must divide by the scale (`zoomOf`).
- `js/ephem.js` — Sun/Earth geometry from `data/ephem.bin` (SPICE DE440, Moon ME frame, every 2 h, 2023–2035).
- `js/model.js` — `sampleSite`, `getScenario`, `terrainFor` (preset skylines from `data/horizons.json`, custom ones cached).
- `js/terrain.js` — in-browser skylines from reduced LOLA maps in `data/dem/` (custom points and the scan).
- `js/mission.js` — mission needs: `analyze`, `windowsFrom`, `dailyStats`. Pure functions.
- `js/scan-core.js`, `js/scan.js`, `js/scan-worker.js`, `js/ui-scan.js` — area scan in module Web Workers.
- `js/scan-gpu.js` — the scan's skylines on the graphics chip (WebGL2 fragment shader, R16I height textures), used for
  south-polar maps only; it allows the fine scan grids (up to 121 x 121). Every run first compares the site's own
  skyline with the processor version (`GPU_TOLERANCE_DEG` in `js/scan.js`) and drops back to the worker scan if it
  fails, if WebGL2 float targets are missing, or if `window.LUNO_NO_GPU` is set. Float32 rules that must be kept:
  map position as an offset from the point's own pixel, angles from height differences and 1 - cos, and
  azimuth sines from a texture (a chip's own sin/cos cost 0.003 deg). Measured here on an emulated chip only
  (SwiftShader): skylines within 0.001 deg of the processor, no verdict differing in 1,085 points. Real GPU speed
  is not measured yet in numbers; the user reports it is fast on a Core Ultra 9 275HX integrated chip and on the
  sibling's discrete GPU. The scan panel has a BIG MAP toggle (the panel moves into `.cols`), scan sizes up to
  60 km (241 x 241 points), a distance bar, and a legend saying what bright, dark and one square mean.
  Finer than the 240 m map pixel is only real where 40 m data exists (`data/patch/`, the 7 polar presets): not built.
- `js/surface.js`, `js/ui-surface.js` — 3D first-person surface view (three.js): nested terrain sheets from `data/patch/`
  (40 m, built by `tools/build_patches.py`) and the reduced maps, Sun light with shadow map, LUNI skyline overlay at 2 m.
  On the preview page the patches are served as base64 text copies (see the artifact build step).
- `js/assistant.js`, `js/ui-assistant.js` — ASK LUNI: typed or spoken commands. The whole product is named LUNI now, so "ASK LUNI" is talking to the unit itself. `parse` turns a sentence into tool calls
  (`TOOLS`, `runTool`), answers are built only from LUNI's own numbers. Rules, not a language model, so it works with no
  Earth link; the tool list is the hand-over point if a language model is added. The app side is `assistantApi` in
  `js/app.js`. Speech uses the browser (Web Speech API). Never call `SpeechRecognition.available()` at page load: it
  crashes headless test browsers; it runs only when someone first presses TALK.
- `js/assistant-llm.js` — optional link to a language model running on the user's own computer (any server that
  speaks the OpenAI-style "chat completions with tools" protocol: Ollama, LM Studio, Lemonade, llama.cpp). Off until
  the user connects it in the ASK LUNI panel. Exact commands stay with the rules; open questions (`isOpenQuestion`)
  and anything the rules miss go to the model, which may only call LUNI's tools. Tested against a scripted stand-in
  server only; never with a real model. Hidden on the preview page (it cannot reach other addresses).
- `js/openspace.js` — optional link to OpenSpace on the same computer (WebSocket, port 4682, the protocol of
  openspace-api-js 1.0.2: an `apiHandshake`, then `luascript` messages). OpenSpace follows LUNI's site
  (`flyToGeo("Moon", lat, lon, height)`, navigation or globebrowsing library, whichever exists) and mission clock
  (`time.setTime`). Send-only. Tested here against a stand-in server; the user confirmed it works with real OpenSpace. Hidden
  on the preview page.
- 3D surface view, second version (14 Nov, after the user called the first one ugly; shown to the user as a picture
  first, `docs/figures/surface-view-before-after.png`): cratered relief texture, rocks and an illustrative lander
  with long shadows drawn as strips on the ground (the shadow map is too coarse for small things), a Sun flare, a
  procedural Earth with a glow, name tags that follow the Sun and Earth, the lander's dish aimed at Earth and its
  panels at the Sun. Everything smaller than the 40 m data is illustrative and the view says so on screen.
  The user approved it from the picture ("put it on") and it is on the preview page and in `next/`.
- Built late on 14 Nov ("do them all", after the rubric talk). The user said "go" for the pre-release only: it is on
  the preview page (Version 33) and in `next/` (main 2156736). **Not released**: the public site is still r2.
  - `js/stories.js` — real landings with sourced facts (IM-2, Blue Ghost 1, Chandrayaan-3). LUNI **opens on IM-2
    Athena, 6 Mar 2025 17:00 UTC** (`OPENING`), with a one-line story strip (`#story`, `renderStory` in `js/app.js`)
    shown only while the site and landing hour match a story. Facts were checked by web search on 14 Nov; do not add a
    mission fact without a source. IM-1 was left out (its real end, with the lander tipped, proves nothing either way).
  - `js/ui-proof.js` — PROOF panel (`#proof`, button in the step 4 heading): Horizons check, the three landings
    replayed (LUNI's side is computed live; e.g. Blue Ghost: 347 h of daylight vs Firefly's 346, eclipse 05:01 to 09:51
    UTC with the Sun fully hidden from 06:18, against reported 05:30 / 06:18 / 09:52), terrain notes, limits, AI disclosure.
  - `js/share.js` — COPY LINK: `#site=im2&t=2025-03-06T17&days=10&dark=12&earth=0&slope=0&link=1` (or `at=lat,lon`).
    Read at start and on `hashchange`. On the preview page the link points at the public Pages address.
  - `js/guide.js` — first-visit guide, three cards, remembered under `luno-guide-v1`; never for automated browsers
    (force with `window.LUNO_GUIDE`), and in a test build only after JUST EXPLORE.
  - Mission need `maxSlopeDeg` (GROUND SLOPE AT MOST: ANY / 5 / 10 / 15, default ANY). `analyze(samples, req, step,
    ground)` takes the terrain as a 4th argument; the verdict, calendar, scan and ASK LUNI all respect it. No default
    limit, because no sourced limit was chosen.
  - `versus()` in `js/app.js` — THIS SITE NEXT TO EARTH (MORE panel, and "how is this different from Earth" in ASK LUNI).
  - Skyline picture (`renderHorizon`): gray ground lit or in shadow, Sun with flare, Earth with its real phase, paths
    for the next 3 days. Bodies are drawn larger than life, so each is placed against the skyline by how much of its
    real disc the ground hides. It is only about 90 px tall on a laptop window and grows on tall screens (364 px at
    2000 x 1250): record the demo in a tall window.
  - Blue Ghost Mission 1 (`bg1`, Mare Crisium) is a preset; `data/horizons.json` was rebuilt, other sites unchanged.
  - OpenSpace HORIZON view (`OS_HORIZON` in `js/openspace.js`): written from the documented API, **never tried with
    real OpenSpace**; falls back to the plain fly-to if it fails. FAR / NEAR / LOW are untouched.
  - The Sun / Earth NASA CHECK links moved onto the POWER and EARTH LINK labels to save a line.
- `js/ui-calendar.js` — landing-window strip. `js/globe.js` — three.js Moon (vendored in `vendor/`).
- `js/bin.js` — binary loader; `LUNO_B64` switches to base64 `.b64.txt` files for hosts that only serve text.
- `data/sites.json` — preset sites (single source of truth). `approx: true` rows still need an official source.
- `tools/` — Python builders (need `spiceypy numpy`): `build_ephemeris.py`, `lola.py`, `build_horizons.py`,
  `build_web_dem.py`, `find_best_lit.py`, `fetch_horizons_fixtures.py`; `fetch_kernels.sh` and `fetch_dem.sh`
  download the NASA inputs (about 45 MB and 620 MB; not in git).
- `tests/` — run with Node 22: `check_ephemeris` (0.0007° vs JPL Horizons), `check_terrain`, `check_mission`,
  `check_scan`, `check_eclipses`, `check_assistant`, `real_missions`.

## Rules of the road
- Only real, sourced data in the app. Unsourced notes were removed on purpose; do not re-add figures without a source.
- Label reduced-detail results honestly (custom points and scans use 240 m – 3.8 km maps; presets use 40 m + 240 m).
- Sun rule: `sunUp` = at least half the disc usable (`sunFrac`: part above the skyline, less eclipse cover). Eclipses are
  detected in `js/ephem.js` (`eclipsesBetween`) and flagged in the verdict, timeline and Sun readout.
- Test UI changes at several window sizes (1000×480, 1366×650, 1440×900, 1920×950, 390×844); an earlier version
  overlapped badly at in-between sizes.
- Keep plain-language explanations for the user; they are not a programmer.
- Layout since 14 Nov (the user: "the right panel is mostly wasted space", "the blues are faded and nothing jumps",
  "too much small text"): TWO columns. Left: site list, Moon, landing time, mission needs. Middle: the answer row
  (GO / NO-GO block with the Sun and Earth readouts stacked on its right), skyline, 30-day slider, landing-day strip.
  The old right column (`#more-panel`: next landing times, compare cards, site numbers, custom lat/lon, OpenSpace,
  credits) is a panel opened by COMPARE · MORE or by pressing PIN; Esc closes it. Palette: `--hi` is the vivid blue
  for names of things and active frames. Nothing a person has to read is under 12.5 px in the design.
- Look: blue palette is the default (`:root` in `css/style.css`; `?palette=amber|ice|mono` previews others). The user
  asked for bigger text and a clear order of importance: the GO / NO-GO verdict block first, Sun/Earth second.
- American spelling everywhere (center, color, meters, modeled): in the app, the code, the docs and in chat. The user insists.
- No jargon on screen: say "landing" not "T0", dates as `14 JAN 2027 01:00 UTC`, never a bare "Z".
- Headings speak in three voices (the user asked for this): the name of the thing (`.h-t`, bright), what it is
  (plain, dim), and what you can do with it (`.h-do`, bold white with a pointer). Any text that points at a feature
  uses `.h-do`; do not leave an instruction in the dim voice.
- The crowded case to check after any layout change in the middle column: a NO-GO with three "ways to get a GO"
  buttons (Nobile Rim 1, 14 NOV 2026 20:00). Nothing in the middle column may overflow at 1100 x 700 and up.
- Since 15 Nov (the user: "the ui is a bit cluttered still"): the POWER and EARTH LINK blocks have big icons
  (`#sun-ico`, `#earth-ico`, green when available, red with a slash when not) and less text; the NASA CHECK links
  sit in that block's heading. The lower chart shows ONE thing at a time, switched by two large buttons, MISSION PLAN / MISSION WINDOWS
  (the user renamed GOOD DAYS to MISSION WINDOWS and asked for bigger buttons; `showPlan` in `js/app.js`; MISSION
  PLAN, the 30-day slider, is the default). The freed room goes to the skyline
  picture (165 px at 1440 x 900, was 90).

## Next batch (asked for on 14 Nov): work ONE TASK AT A TIME
The user: "one task at a time, and then let me confirm before moving onto the next task". Build one, show it on the
pre-release (preview page and `next/`), stop, and wait for the user's confirmation before starting the next.
(1) custom coordinates out in the open: **skipped by the user**. (2) HISTORY tab: built, **accepted** ("fine for
now"). (3) + (4) + (5): the user asked for these three together on 15 Nov; **built, on the pre-release, waiting for
the user's confirmation** (see "Layers as built"). (6) + (7): asked for together on 15 Nov ("do those two, verify small sections, get this done fast"); **built, on the
pre-release, waiting for the user's confirmation.**
- (6) YOUR MIX: `MIX_PARTS`, `mixScore`, `getMix` / `setMix` in `js/layers.js` (weights 0 to 5, kept under `luno-mix`):
  a weighted average of the parts' 0-to-1 scores (sunlight, Earth link, flat ground, warmer ground; defaults 3, 2, 1, 0).
  On the MOON MAP it is a layer with sliders and USE THIS MIX IN THE SCAN (`scan.useMix()`); in the scan it is a SHOW
  choice and a "best point is picked by" switch (`bestNow` in `js/ui-scan.js`: highest mix among points that meet the
  needs). The weights are the user's choice and the screen says so.
- (7) TEMPERATURE: NASA's own numbers, only re-gridded. `tools/build_temperature.py` reads the Diviner Polar Resource
  Product V2.0 table (`dlre_prp_south.tab`, 605 MB, into `tools/dem/diviner/`, not in git) and writes
  `data/layers/sp_tavg` and `sp_tmax` (value * 2 = kelvin). Average is the layer; the hottest is a row in the profile.
  It has no good / bad score (no sourced limit); "warmer ground" in the mix uses 40 K to 250 K as a stated scale.
For (7): the Diviner archive is reachable from this session at
`https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/` (polar products are in `data_derived_prp/`);
nothing has been downloaded or read yet.
Layer accuracy, measured by `tests/check_layers.mjs` on 15 Nov: Earth link within 4 points of the sites' own numbers;
sunlight within 1 point at IM-1 and IM-2 but 16 to 25 points low on the three best-lit ridge presets (said on screen).
The user never answered what "data profiles" means or whether polar-only coverage is fine; both were built as assumed
(a card of every layer's value at a point; sunlight / Earth / shadow south of 80S only).
**Pre-release state (15 Nov, about 05:20 UTC = Sun 12:20 AM New York): `next/` and the preview page (Version 45) carry
everything below. The public site is still r3 (9f099f4) and needs a new "release it".**
A friend from a NASA SEES internship (15 Nov): "a lot going on", "hard to navigate", "cut down on some of the
features or make a more streamlined ui", did not know what to do in the scan, the tutorial "not really" helped. A
second screenshot: "WHAT REALLY HAPPENED / WHAT LUNI WORKS OUT" and the ASK LUNI directions are "not professionally
written"; icons wanted on the ASK LUNI buttons ("accessibility menu" = the ASK LUNI panel). Done on the pre-release:
- **SIMPLE VIEW is the default** (`html.simple`, `setTools` in `js/app.js`, kept under `luno-view`): five keys (PLAY,
  ASK LUNI, NEXT WINDOW, SCAN FOR BETTER SPOT, ALL TOOLS) and the mission length only; `#needs-more` unfolds the
  other four needs, and they open by themselves when one is not at its default. ALL TOOLS shows every key and need.
  The older test sets (`#test-a` to `#test-d`) and `window.LUNO_ALL_TOOLS` start in ALL TOOLS.
- Scan panel: one sentence on what it is, BEST SPOT FOUND and a large MOVE MY SITE TO THE BEST SPOT button first,
  the green / red GO map by default (`st.metric = "needs"`), the SHOW choices folded under MORE MAP CHOICES.
- **The guided tutorial** (`js/guide.js`, the user asked for it: "really guided", "understood by a middle school
  student", "black out the ones they don't need", a "do you understand" button, quick). 13 cards; everything but one
  part is dimmed (four `.tour-dim` boxes around a hole, so the real control can be used through it); each card has
  WHAT IT IS / WHY IT MATTERS / HOW TO USE IT, NOT SURE? EXPLAIN IT ANOTHER WAY (`alt`), four TRY IT steps and two
  quick checks. Remembered under `luno-tour-v2`; `? TUTORIAL` (`#tour-btn`) in the top strip restarts it;
  `tourPrepare` in `js/app.js` puts the main screen back before each card. Body-level and fixed, so no zoom math.
- Answer area (the user, 15 Nov, from a sketch they approved: "yes right is good"): the GO / NO-GO block is one wide
  strip, the POWER and EARTH LINK readouts sit side by side under it, and the skyline gets the freed room (at
  1440 x 900: 150 px on a GO, 173 px on a NO-GO; was 133 / 126). CSS only, under `html:not(.flow)`; phones unchanged.
  The verdict lines were shortened to fit one row ("SUNLIGHT LASTS 3D 03H LONGER THAN NEEDED", "NEXT LANDING WINDOW: ...").
- Best Site Finder panel (the user, 15 Nov): a large BEST SITE FINDER header with no "around <site>" text, a blue
  BACK TO THE MAIN SCREEN button, scan sizes as a vertical stack left of the map (`.scan-sizes`), and the
  MOVE MY SITE TO THE BEST SPOT button under the map at the map's width (`#scan-go-best` in `.scan-map`; its text
  says SCANNING / YOU ARE AT THE BEST SPOT / NO SPOT HERE MEETS THE NEEDS when it cannot be pressed).
- The user (Sun, about 2 AM New York): "work until it runs out" (the weekly Fable allowance was at 90%). Built, in this
  order, each saved by itself:
  1. Sun / Earth in view at a negative height shows a note (`#sun-low`, `#earth-low`): the skyline there dips below level.
  2. Custom coordinates in the open: `.coord-row` under the site list (`#lat-input`, `#lon-input`, `#coord-go`); the
     boxes are gone from COMPARE SITES · MORE. Extras item 3 is done.
  3. All sites side by side (`renderRank` in `js/app.js`): a green / red dot on every row of the site list (GO or
     NO-GO at the landing time on screen) and a ranked table at the top of COMPARE SITES · MORE (good landing days
     in the months the calendar shows, GO / NO-GO now; click to go there). About 110 ms for 14 sites when a need changes.
  4. OPERATIONS plan (extras item 1): a third chart button between MISSION PLAN and MISSION WINDOWS (`#tab-ops`,
     `#ops`, `renderOps` / `opsStretches` / `OPS` in `js/app.js`; `showPlan("plan" | "ops" | "days")`). The mission
     length as stretches in order: POWER + LINK, POWER, NO LINK, BATTERY, LINK, BATTERY, NO LINK, ECLIPSE, with the
     shares, the longest time without Sun against the user's limit, and a line for the stretch the mission clock is
     in. Clicking a stretch moves the clock there. It reads LUNI's own hourly answers; it is not a flight schedule.
     The chart headings were shortened to fit three buttons.
- Extras item 5, built Sun 15 Nov about 10 AM New York ("let's go for it"), **on the pre-release only** (public is r4):
  the MOON MAP data card for the landing site takes its SUNLIGHT and EARTH LINK (and YOUR MIX) from the site's own
  skyline (`siteYears` in `js/model.js`: every 6 hours over the years covered, about 5 ms a site; `getSiteYears` passed
  to `createMoonMap`, `layerRow` in `js/layers.js`), with a note naming what the coarser layer reads. Presets only;
  the point under the pointer and custom points keep the layer values. `tests/check_site_years.mjs` prints both:
  Nobile 78 / 53, Malapert 74 / 53, Shackleton 79 / 63, the others within about a point, Haworth 0 and never sunlit.
- **More NASA data** (the user, Sun 15 Nov about 10:30 AM New York: "Can't we do them all" to five ideas, A to E). Each is
  saved by itself on the pre-release. Done so far:
  - B. WATER ICE layer (`ice` in `LAYERS`, both polar caps; MOON MAP button, data card row ICE CAN LAST, Best Site
    Finder choice, "show the water ice layer" in ASK LUNI). `tools/build_ice.py south|north` re-grids the `ice_depth`
    column of the Diviner Polar Resource Product files already downloaded: the depth at which water ice would be lost
    at 1 kg per square meter per billion years; 0 = stable at the surface; -999 = deeper than 2.87 m (stored 254,
    drawn with no color, value 99 in the code). **The file also holds an undocumented code, -1**: measured, every
    such triangle has a yearly maximum of 101 K or less (0 values: 101 to 131 K), so it is stored as depth 0 and the
    source text on screen says the label does not describe it. `data/layers/{sp,np}_ice.u8.gz` (value * 0.0125 = m).
    `tests/check_layers.mjs` checks Haworth's floor (0), the Shackleton ridge (none) and Apollo 11 (no value).
  - C. DEEP SPACE NETWORK line under EARTH LINK (`#earth-dsn`, only while Earth is in view): which of Goldstone,
    Madrid and Canberra have the Moon above their horizon at the mission clock, and how high. `js/dsn.js`
    (`loadDsn`, `dsnAt`), `data/dsn.bin` + `data/dsn.json` from `tools/build_dsn.py` (NAIF station kernel
    earthstns_itrf93_260814 and Earth orientation earth_1962_260806_2126_combined, ITRF93, every 6 hours).
    `tests/check_dsn.mjs`: within 0.016 degrees of SPICE at 720 values. Geometry only; the tooltip says it does not
    know station schedules. The preview page needs `data/dsn.bin.b64.txt`.
  - A. LUNI's polar layers against NASA's own maps (`tools/compare_lola_illum.py`; maps in `tools/dem/lola_illum/`,
    490 MB, not in git: the LOLA team's 2016 polar illumination release in the LOLA archive's extras: LPSR, AVGVISIB,
    AVGVISIB_EARTH at 240 m). Results are stored in `data/layers/index.json` under `nasa_check` and shown as section 3
    of the PROOF panel (`layerCheck` in `js/ui-proof.js`). Sunlight: r 0.992 south / 0.990 north, mean gap 1.9 / 1.8
    points. Never sunlit: same answer in 99.1% / 98.9% of squares (south 18,857 km2 vs NASA 19,081). Earth: r 0.981 /
    0.985, mean gap 5.2 / 5.4 points, LUNI lower (center of the disc at 2 m vs any part of it at the surface).
  - D (real photos under the Best Site Finder map): **not built.** Found: NASA Moon Trek serves map tiles from this
    session, e.g. `https://trek.nasa.gov/tiles/Moon/SP/LRO_NAC_AvgMosaic_SPole855_1mp/1.0.0//default/default028mm/{z}/{row}/{col}.png`
    (LROC NAC average mosaic, south pole to 85.5 S; top-left -1095930, 1095930 m; z = 6 is 133.8 m per pixel, tiles
    28 to 35 both ways) and `LRO_LOLA_Shade_SPole875_5mp_v04`. The finder map is north-up at the site, so a polar
    photo has to be turned and scaled per site, and a sharp backdrop needs live tiles (blocked on the preview page)
    or a very large image: bigger than it looked. A cheaper variant is a REAL PHOTO layer on the MOON MAP's south cap.
  - E (official Artemis III region outlines): **not built.** NASA published the nine regions as a picture; the outlines
    as data are in a USGS release ("Down-selected Artemis III Candidate Landing Site navigational grids",
    DOI 10.5066/P1MEQ6UK, ScienceBase item 671a6fa8d34efed5620f89f8, shapefiles from LROC QuickMap), and
    sciencebase.gov / usgs.gov are refused by this environment's network rules. It needs the user to allow those hosts.
- **Batch of fixes (the user, Sun 15 Nov about 1 PM New York), on the pre-release only.** The user also agreed to
  work in batches: every fix in one message, only the checks that touch the change, the full set before a release.
  - NASA data must be "a lot more prominent"; the small green pills were "very unnoticeable and look AI". They are
    gone. `js/sources.js` is now `initSources` + `showData(key | "layer:<id>" | rows, extra)`: a full-width blue band,
    NASA DATA USED, slides over the screen's top line (`header.bar`, whose text is also shown elsewhere) for 6.5 s
    every time something is calculated or shown: `recompute` on the main screen, a scan start, a Moon map layer,
    mission history. Console-styled on purpose (square, the unit's own blue). `#src-sky` is plain text and only
    speaks when the terrain is reduced, loading or flat.
  - Best Site Finder: no BIG MAP button; SCAN SIZE and MAP SHOWS sit in one row over the map (`#scan-ctl`; MAP SHOWS
    is a grouped drop-down, `#scan-metric` is now a `<select>`); the reading panel is 43% wide (was 250 px). It opens
    only from the bottom key now: the buttons on the small Moon (`#side-scan`) and in the NO-GO strip are gone.
  - Verdict strip: one fact a row (`.hw`: SUNLIGHT / EARTH LINK on a GO; WHY / NEXT WINDOW on a NO-GO); the title line
    is hidden. On a NO-GO the word pulses, the fix buttons in the strip pulse, and the keys that can fix it pulse
    (`.fixit` on NEXT LANDING WINDOW when a window exists, and on BEST SITE FINDER).
  - Mission needs: one EARTH LINK row (`data-req="earthLink"`: NONE / AT LANDING / 25% / 50% / 75%) drives the two
    needs `earthAtLanding` and `earthMinPct` (`setReqs`, `earthLinkValue`); the fold says 3 MORE MISSION NEEDS.
  - Sections on the main screen: every section heading in the middle column is a band like the step bands, with
    air above it; the left column's steps sit farther apart. Skyline at 1440 x 900: 145 px on a GO, 170 on a NO-GO.
  - The Sun in the skyline picture is larger (8 to 11 px radius, was 7) and still smaller than Earth, which is how
    it is from the Moon (Earth looks about 3.6 times wider). The user asked "only if it makes sense".
  - PROOF: four headline tiles (0.0007 deg, Blue Ghost daylight hours computed live, sunlight r, never-sunlit match),
    then the five sections as `<details class="proof-sec">`, closed until clicked; THE STORY opens its section.
  - ASK LUNI: `move_to_extreme { what, which }` ("move to the highest elevation", "go to the coldest spot", "flattest
    ground", "most sunlight over all years", "shallowest ice"): `scan.extreme` in `js/ui-scan.js` opens the finder,
    switches MAP SHOWS to that choice, waits for the scan if needed (`st.pendingExtreme`) and moves there.
- **Best Site Finder: the points slid after a move** (the user, Sun 15 Nov about noon New York: "the points move from
  their original points after the shift"). Cause: the map was redrawn north-up at the new center, and near a pole
  north turns from place to place (a 15 km scan at Nobile Rim 1 moved 11 km east: points up to 1,664 m, over six
  squares, from where the shifted picture had them). Fix, **on the pre-release only**: `scanGrid(site, radiusKm, n, up)`
  and `keepUp(from, to, up)` in `js/scan-core.js`; a move made inside the panel keeps the map's direction (`st.nextUp`
  in `js/ui-scan.js`), any other change of site goes back to north-up. `eastKm` / `northKm` stay true east and north.
  A north arrow sits at the bottom right of the map and the scale line says when north is not up. Measured after
  the fix: 0.3 m at worst, 1 of 9,196 squares changes its answer. `tests/check_scan.mjs` checks it at three places.
  `globalThis.lunoScanDebug()` returns the panel's state for checks.
- **Source bubbles** (the user, Sun 15 Nov about 11 AM New York, from a screenshot: the green "NASA DATA · SPICE DE440
  + LOLA TERRAIN" line "can go away", the top-row buttons "need to be bigger", and the NASA data should "appear in
  like a bubble whenever something is calculated or displayed saying where the data came from"). **On the pre-release
  only; the public site is r5.**
  - `#data-badge` is still in the page but `hidden` (test set D reads its text); what it said about the terrain in
    use is on the skyline's bubble (`#src-sky`: NASA LRO LOLA, or NASA LRO LOLA · REDUCED MAP in orange).
  - Tabs and ? TUTORIAL are 16 px with more padding; the top row is 35 px tall (was about 23), so the skyline is
    about 10 px shorter (139 / 162 px at 1440 x 900).
  - `js/sources.js` (`initSources`, `pulseSources`): any element with class `src` is a green pill naming the NASA data
    behind the result beside it (`data-src` key into `SOURCES`, or its own `data-long` sentence). Pointing at it or
    tapping it opens a "WHERE THIS COMES FROM" bubble (one fixed element on `body`); every pill pulses when
    `recompute` runs. Pills: the verdict strip, the Sun / Earth readouts heading, the skyline heading, the small
    Moon, the Best Site Finder header, MISSION HISTORY, and the MOON MAP (`#mm-src`, text and sentence follow the layer).
- The user (Sun 15 Nov, about 10 AM New York) asked for the UI "all consolidated ... extremely intuitive". A sketch was
  shown first (one row of tabs for every screen, bottom keys as the only action buttons, the duplicate buttons in
  the left column and headings removed, extras under one MORE key). **Rejected: "Actually just leave it these are
  worse".** Nothing was changed. Do not remove the duplicate shortcut buttons or re-arrange the navigation unprompted.
- Later the same night (the user): the Best Site Finder's map choices are a second button stack, right of the map
  (`.scan-shows`, MAP SHOWS; names in `STACK` in `js/ui-scan.js`, e.g. SUN · MISSION and SUN · ALL YEARS), with a line
  between it and the scrolling side panel; both stacks use one font size. "Best spot is picked by" stays in the
  side panel (`#scan-rank`). The keys carry no small caption any more (only the four launch-slip keys do): PLAY
  ORBITAL DATA (the user's wording), NEXT LANDING WINDOW, ASK LUNI (in the middle in both views), BEST SITE FINDER,
  NEXT SITE, PIN TO COMPARE, ALL TOOLS / SIMPLE VIEW.
- Bottom keys (the user: the gray ones "look deactivated" next to ASK LUNI): PLAY, NEXT LANDING WINDOW and BEST SITE
  FINDER are blue, ASK LUNI stays teal, the rest are a lighter gray.
- **Judge runs after r6** (Sun 15 Nov about 12:20 PM New York; three sub-agents on three models, Presentation fixed at
  4): 20, 21, 21 of 25 (Impact 3/4/4, Creativity 4, Validity 4, Relevance 5). The project notes reached all three
  as instructions, so the runs were not fully blind (told to the user). Common points: the main screen is dense;
  side-by-side comparison of sites and dates is hidden in COMPARE SITES · MORE; a GO reads as more official than the
  team's own rule; power is yes / no only; no outside users. Fixed **on the pre-release only** (public is r6):
  the finder's card for a listed site uses the site's own skyline numbers for SUNLIGHT / EARTH LINK 2023–35
  (`getSiteYears` passed to `createScanPanel`), and the square you stand on is judged with the site's own skyline
  (`judgePoint` with `c.terrain` in `start()` of `js/ui-scan.js`), so the finder and the main verdict cannot differ.
  **Not fixed**, ASK LUNI: "when is the best time to land at Nobile Rim 1 in 2027" (jumps, then sets the year and
  reports a NO-GO), "compare shackleton and malapert" (only moves the site), "go to 85.5S 30E" (lists presets),
  "why is the south pole hard for landers" (status report instead of "I cannot answer that").
  The user then said (about 12:30 PM): "im going to just tell you stuff, and i want you to think about it and then
  build it all at once": wait for the full list, then build it in one batch.
- **Slide deck** (the user, Sun 15 Nov about 12:40 PM New York: "i need you to make the slideshow", 3 minutes, 7 slides
  at most, challenge objectives and NASA data in it, PowerPoint format wanted, "dont make ai looking slides"). Built as
  a Claude Slides deck: https://claude.ai/artifact/QHG42wTJJ7oTapWm3wPmfh (private until the user shares it; it
  downloads as .pptx or PDF from its Share menu). Seven slides: cover, THE CHALLENGE, ONE ANSWER: GO OR NO-GO, WHEN
  THE PLAN SLIPS, CHALLENGE OBJECTIVES (all seven, as a table), NASA DATA, PROOF (with the AI line and the link).
  Real app screenshots only (crops in the scratchpad, uploaded to the deck); Barlow Condensed / Barlow / JetBrains
  Mono; navy and cool paper with the app's blue. Speaker notes hold a timed 3-minute script. The official guide
  (spaceappschallenge.org/resources/project-submission-guide): up to seven slides including the title slide, in
  English, on an external site with a public link, covering team name, member names and the challenge.
  **Still placeholders on the cover: [Team name] and the two [Member name]s** (never told to Claude).
- **The afternoon batch (the user's list, built Sun 15 Nov between about 12:45 and 1:30 PM New York on "Build the new batch now").
  Released as r7.** The user: run only the checks that touch the change; the full set
  at the release. Checked: syntax, `check_assistant` (111), `check_scan`, `check_mission`, test set E (6/6), and a
  browser run of every new feature with no page errors. NOT checked: phones (the user: "idc about phones rn"),
  test set D, the other Node checks, real hardware.
  1. SOLAR PANELS in the Best Site Finder (`#scan-panels`, `placePanels` / `st.panelCfg` / `st.panels` in
     `js/ui-scan.js`; `scan.panels(radiusKm, count)`; ASK LUNI "place 6 solar panels within 3 km"): a distance from
     the lander and a number of panels; one panel on each of the squares inside that distance with the most sunlight
     in the mission (ties: sunlight to spare, then nearest), numbered on the map inside a dashed circle, with a table
     and the energy for the user's panel. Cables and panel-to-panel shadows are not modeled (said on screen).
  2. Skyline picture (`renderHorizon`): the Sun's glow and 8 rays are sized from the Sun's own radius. The Sun and
     Earth are FIXED sizes (`RS = 9`, `RE = 15`; the user: "Earth and the sun change sizes when they get close", so
     the first fix, shrinking them, was replaced, and they no longer follow the picture's height either). When the
     two are close the pair is placed by the real gap between them (`cur.sepDeg` over the sum of the two real
     radii): standing clear until the real discs touch, then overlapping by as much as the real discs do; two darker, smoother bands
     of ground in front of the true skyline for depth (always below the real top edge, said in the tooltip); light
     along the ridge under the Sun.
  3. Verdict strip: warnings live in `#mission-warn` (`.hero-warn`), to the right of the verdict. Test scripts that
     read the eclipse date must read `#mission-warn`, not `#mission-why`.
  4. Finder: `#scan-row` = the SCAN SIZE stack (`#scan-sizes`), the map, the MAP SHOWS stack (`#scan-shows`;
     `#scan-metric` is a box of buttons again, `setMetric` / `hasMetric`). `draw()` sizes the map from the row and
     makes both stacks exactly as tall as the map; the chosen button is blue with a white edge. The side panel is 36%.
     While scanning, BEST SPOT FOUND shows the progress and the best so far, not "…".
  5. NASA DATA USED band: white with a red tag and a red frame, three flashes in 1.5 s, wiped in and out (no fade over
     the top line), held 8 s; also shown for PROOF, the 3D view, ENERGY, the comparison box and the panels.
  6. SIMPLE VIEW starts with the left side folded away (`setSetup` is module-level in `js/app.js`; the tab is large,
     blue and pulses three times). ALL TOOLS, the test sets (`#test…`, `LUNO_TEST`), `LUNO_SETUP_OPEN` and the
     tutorial open it. The ALL TOOLS / SIMPLE VIEW key opens / folds it too.
  7. BEFORE AND AFTER (`js/ui-compare.js`, `offerCompare` / `flushCompare` in `js/app.js`): after NEXT LANDING
     WINDOW or a move in the finder, a box on `body` puts the original plan next to the new one (verdict, sunlight,
     sunlight to spare, longest time without Sun, Earth link, energy; slope and elevation when the site changed) with
     the change in each, KEEP THE NEW PLAN / GO BACK TO THE ORIGINAL, and a "show this after every move" box
     (`luno-compare`). Not during a test, the tutorial or with `LUNO_NO_COMPARE`. ASK LUNI "compare shackleton and
     malapert" opens it for two sites (`compare_sites`, `assistantApi.compareSites`).
  8. ENERGY (`js/plan.js`: `planStats`, `energyBudget`, `SOLAR_W_M2` = 1361; `js/ui-energy.js`; `#energy` panel,
     the yellow `#energy-btn` in the POWER block showing PANEL NOW n W): panel size, efficiency and the lander's power
     use are the user's (`ENERGY_OPTIONS`, kept under `luno-energy`, defaults 2 m2, 30%, 200 W, labeled as values to
     start from); each hour = size x efficiency x 1361 x LUNI's share of the Sun's disc; a battery that starts full;
     tiles, an hour-by-hour chart, the longest time on the battery, a flat-panel comparison, and what is not modeled.
     Sources: NASA SORCE TIM 1360.8 W/m2 (Kopp & Lean 2011). The 30% default has no sourced figure behind it; NASA's
     small-spacecraft report only says multi-junction cells are the state of the art and single-junction about 20%.
     The GO / NO-GO rule does NOT use energy (unchanged on purpose).
  9. ASK LUNI: "go to 85.5S 30E" (compact coordinates), "compare A and B", "best time to land at X in 2027" (sets the
     start of the period, then `next_good_time { from_here }`), "why is the south pole hard" (`pole`), "how much
     energy" (`energy`, opens the panel), a general why-question LUNI has no numbers for (`cant`), "place n solar
     panels within r km".
  10. `docs/submission.md` and `docs/pitch-3min.md`: 99.1% south / 98.9% north instead of "about 99%"; "every number
      is computed from NASA data; the rule is the user's needs"; the better-spot wording; the three new features.
  No change, by the user's word: a GO being the team's rule, IM-2 opening as GO, the finder offering a move from a GO
  site, phones.
- **Judge runs on the afternoon batch** (Sun 15 Nov about 1:30 PM New York; same brief, three models, Presentation
  fixed at 4): 20, 21, 21 of 25 (Impact 3/4/4, Creativity 4, Validity 4, Relevance 5): the same as before the batch.
  Two of the three never opened ENERGY, the solar panels or the before-and-after box. Fixed afterwards, on the
  pre-release: the comparison box now measures "sunlight to spare" over the same span as the verdict (`planSpan`,
  `planStats(..., spanHours)`; it said OVER 3D 12H where the strip said 67D 07H); a hidden Sun or Earth above level
  says BEHIND THE GROUND: THE SKYLINE THERE IS n° HIGH; the PROOF tile gives 99.1% south and 98.9% north; no more
  "for up to 0 hours"; ASK LUNI answers "what is the temperature here" and says a year's first window is the first
  one, not the best. Judges' points NOT acted on (the user's calls): the folded left side hides the site list on
  first load (judge A's top weakness); the default Earth-link need (AT LANDING) lets a mission with 3% Earth link be
  a GO (Shackleton, 14 Mar 2025 09:00); the finder's reduced map can call a GO site's neighbors NO-GO (Malapert,
  14 Jan 2027, 14 days); the side-by-side box covers the ASK LUNI reply; density; no outside users.
  The slide deck was updated for the batch (new screenshots; slide 3 shows ENERGY, slide 4 the finder with solar
  panels and the before-and-after box).
- **GIFs** (the user, Sun 15 Nov about 2 PM New York: "Can you add gifs? i think the area scan one would be a cool
  gif"): `docs/figures/luni-best-site-finder.gif` (800 x 398, 1.7 MB, 9 s: the scan fills in, the best spot is
  starred, the lander moves, a new scan starts) and `docs/figures/luni-skyline-25-days.gif` (1280 x 197, 2.5 MB:
  the Sun and Earth over 25 days at Nobile Rim 1, a frame every 6 hours). Recorded from the real app with
  Playwright (`gifshots.js` in the scratchpad, `LUNO_NO_COMPARE` set) and put together with Pillow; nothing drawn
  by hand or by an image model. In the deck: slide 4 left and slide 2. A PDF export shows one still frame.
- **Deck, last changes before the local judging** (Sun 15 Nov, mid-afternoon New York): slide 5 is now ALL SEVEN
  OBJECTIVES, AND MORE: `docs/figures/luni-more-features.gif` (eight captioned screens the deck did not show: Moon
  map sunlight and water ice, mission history, 3D view, ASK LUNI, mission windows, operations, tutorial) beside the
  seven objectives as short labels (the text table is gone). Slide 7 has a QR code to the public site (read back
  with a decoder: https://galileoleosolis.github.io/LUNI/). The user's own cover text (team "Mystic Reaserch",
  "Lunar Utility for Navigational Intelligence", both names) was left as typed.
  **Visit tracking was asked for and dropped** ("Its fine then, i can find more testers after this"): LUNI has no
  server, the counting services are blocked from this session so nothing could be tested, and a visit count is not
  a tester count. If it comes back: GoatCounter (the user signs up, one script line, a sentence in PROOF), or point
  people at `#test`, which scores six tasks and gives a report to send.
  Claude's own quick score when asked (not blind): Impact 4, Creativity 4, Validity 4, Relevance 5, Presentation 3
  for the deck as it was before the features slide.
- **DONE ON THE PRE-RELEASE, WAITING FOR "release it" (the name with "for" is now in the app, README, docs, ASK LUNI and these notes; public is still r7).** Earlier note: **TO DO AFTER THE LOCAL PRESENTATION (the user, Sun 15 Nov: "It is with for ... change the two later today after
  that presentation"): the full name is "Lunar Utility FOR Navigational Intelligence".** The app, `README`,
  `docs/submission.md`, `docs/pitch-3min.md`, ASK LUNI's "who are you" answer and these notes still say "Lunar
  Utility Navigational Intelligence" without "for". Change every readable place at once, check, then it needs a
  "release it". Not started. The deck cover already says it with "for"; its team name was corrected to
  "Mystic Research" (members: Galileo Solis and Jove Solis, as the user typed them on the cover).
- **SUBMITTED for global judging** (the user, Sun 15 Nov, mid-afternoon New York: "ok its submitted, we can still edit
  this later"). The Project page was filled from `docs/submission.md`: name "LUNI: Lunar Utility for Navigational
  Intelligence", final project link https://galileoleosolis.github.io/LUNI/, the demo link is the user's own
  PowerPoint on a public share (a fallback PDF is at `docs/LUNI-deck.pdf`, rendered here with a stand-in font).
  It can be edited and resubmitted until Sun 11:59 PM New York; only the last saved submission is judged, and it must
  be SUBMITTED again after edits. Rules from the official guide: at most seven slides or the entry is not eligible;
  no likeness of anyone under 18; English; public links with no login.
  Talk: `docs/talk/LUNI-talk-{me,brother,full}.pdf` (the brother speaks slides 1, 3, 4; the user 2, 5, 6, 7).
  Still to do later the same day: the "for" in the name across the app (see the note below), then a release.
- **Design system batch, ON THE TEST BUILD (`/next/`) and the preview page, NOT released (public is r7)**: the user,
  Sun 15 Nov about 4:45 PM New York, approved a plan to put the waiting batch and the design system on the test build
  "for comparison". The design system is a private Claude artifact, "LUNI Console"
  (https://claude.ai/artifact/AEi7gdJMj3FqDx6xNuTV1B; the user: "This is a private doc so dont save it in the repo").
  Everything is in blocks at the end of `css/style.css`: `--sheen` / `--sheen-hi`, dark glass for every choice button
  (`.seg`, `.plan-tabs`, `.mm-layers`, `.tabs`, `#mm-view`; chosen = glazed, white edge; mission needs and ENERGY
  stay amber via `--on1` / `--on2`), the glaze on the smaller action buttons (`--b1` / `--b2`), icons on bands by
  `data-ico` (CSS masks), `section.fcard` wrappers in the Moon map side panel and COMPARE SITES · MORE, a check or
  cross inside `.site-ok`, and a 12.5 px text floor on the wide layout. The `:not(#_)` in those selectors is only
  there to win over older rules. Left-column choices are tightened so they fit (checked at four sizes).
  - Skyline picture: a darker wash on the ground away from the Sun and seeded craters on the near ground (depth).
  - NASA DATA USED band holds 14 s (`HOLD_MS` in `js/sources.js`), pauses under the pointer, and each source is a link
    to where the data comes from (`LINKS`).
  - FULL SCREEN button (`#fs-btn`) in the top strip and a one-time tip (`luno-fs-tip`) when the window is short.
  - Best Site Finder side panel is cards with icons (`section.fcard`, `.fi`; ABOUT THIS SCAN is folded); `draw()` in
    `js/ui-scan.js` sets the body's columns so the side panel gets all the leftover width (two columns of cards on wide screens).
  - Bottom keys are glossy (one sheen over each key's own color, `--k1` / `--k2` at the end of `css/style.css`).
  - Finder stack buttons: 3 px borders, 8 px corners; SCAN SIZE / MAP SHOWS headers 18 px.
- **On the pre-release, waiting for "release it" (will be r8; public is r7), Sun 15 Nov about 3:45 PM New York:**
  the name with "for"; and `DEFAULT_REQ.earthMinPct = 25` in `js/mission.js` (the user: "ok for 3"; a judge found
  Shackleton, 14 Mar 2025 09:00, a GO with Earth in view 3% of the mission: it is now a NO-GO, "EARTH LINK 3% (NEED
  25%)"). The EARTH LINK row starts on 25%. `tests/check_mission.mjs` pins its made-up cases to 0 and checks the
  default on real data (2,519 good landing hours of 9,680, was 2,580). All Node checks touched and test sets E and D
  (6/6 each) pass. A link saved without an `earth=` part now opens with 25%.
  Also made: `CHANGELOG.md`, and `docs/version-history.html` = https://claude.ai/artifact/WBNrhJDohQV5tyZ1QMhS4G
  (a screenshot of every version from two early drafts through r1 to r7 and the test build, stepped through with
  buttons, plus the change log; made by checking out each release commit: r1 `03d208a`, drafts `32e66cd`, `4234c1a`).
  Update both when a release is made. GIFs `docs/figures/luni-energy.gif` and `luni-solar-panels.gif` (0.5 MB each).
  Skipped by the user for now: opening the left side by default, and the side-by-side box covering ASK LUNI's reply.
- **r7 released** on the user's "open the presentation, then release it" (Sun 15 Nov, 1:40 PM New York = 18:40 UTC;
  main b12dd78; GitHub reports the deployment as a success). The full set ran first: all ten Node checks, test sets
  E and D (6/6 each), and the main screen, ENERGY and the finder at six window sizes with no overflow and no page
  errors. The public site now has the whole afternoon batch and the fixes made after the judges. Nothing newer is
  waiting on the pre-release.
- **r6 released** on the user's "publish it" (Sun 15 Nov, 12:05 PM New York = 17:05 UTC; main 8c8cb9c; GitHub reports the
  deployment as a success): the public site now has the batch of fixes (NASA DATA USED band, the one-row finder
  controls, the single EARTH LINK need, pulsing NO-GO, PROOF tiles, `move_to_extreme`), the finder's kept map
  direction and the source text. Nothing newer is waiting on the pre-release. Every note above that says
  "on the pre-release only" is released as of r6.
- **r5 released** on the user's "release it" (Sun 15 Nov, 10:26 AM New York = 15:26 UTC; main 90e2028; GitHub reports the
  deployment as a success): the public site now also has the site's own data card, the WATER ICE layer, the DEEP
  SPACE NETWORK line and the PROOF section against NASA's polar maps. Nothing newer is waiting on the pre-release.
- **r4 released** on the user's "Release it, that was great" (Sun 15 Nov, 9:05 AM New York = 14:05 UTC; main 3093d3b):
  the public site now has everything in this list. Later changes go to the pre-release and need a new "release it".
  The time of the local judging is still not known (asked, not answered).
- **Local judging** (told by the user 15 Nov): each team gets 3 minutes to present and 5 minutes of Q&A at the local
  event on Sunday; the global submission (7 slides or a 30-second video) is due about 6 hours after the local event
  ends. A timed talk and a Q&A sheet are in `docs/pitch-3min.md`.
- Names (the user, 15 Nov): the scan is **BEST SITE FINDER** on every button, key, title and tutorial card (was SCAN
  FOR BETTER SPOT), and the jump is **NEXT LANDING WINDOW** (was NEXT WINDOW, before that NEXT GOOD TIME). ASK LUNI
  understands the old and new phrases. The keys split the name over their two lines (BEST SITE / FINDER).
- Wording: MISSION RECORD / LUNI'S CALCULATION (PROOF), CALCULATED BY LUNI (layer sources), ASK LUNI says
  ENTER A QUESTION OR A COMMAND; icons (`IC` in `js/ui-assistant.js`) on TALK, SEND, SPOKEN ANSWERS, HANDS-FREE, CLOSE.
Second list of notes (15 Nov, dictated; "more feedback as well" is coming), done on the pre-release:
- Steps 1 to 4 are colored bands (`h3[data-step]`, `--sc`); the Moon map side panel has three bands (`h3.band`).
- Tour wording: CHOOSE YOUR SITE AND TIME / GET THE VERDICT / MOVE THROUGH THE MISSION; the word "relax" is gone
  everywhere ("change one mission need").
- Slider: thicker rail and handle, bigger SUN / EARTH / BOTH / SLIDER labels, and a blinking "DRAG THIS ALONG THE BAR"
  pointer (`#tl-hint`) until it is first used. The chart is 128 px tall (was 112).
- The key and the step 2 button read NEXT WINDOW (was NEXT GOOD TIME); ASK LUNI still understands both.
- Action words (`h3 .h-do`) and the ASK LUNI example buttons are larger and bold.
- The left side pops in and out (`#setup-tab`, `.cols.setup-off`; `setSetup` in `js/app.js`); not on phones.
- Found on the way: test set E's shadow answer choices did not match the card's new wording (fixed: YES, ALWAYS / NO).
**Whole Moon and north pole (15 Nov, the user: "not really impressive to just have south pole ... at least the best we
can get on the other parts of the moon"):** on the pre-release, not released.
- `data/layers/index.json` now has three sets: `sp` and `np` (caps poleward of 80 degrees, 480 m: sun, earth, shadow,
  slope, tavg, tmax) and `gl` (whole Moon: sun and earth at quarter-degree squares, tavg and tmax at half-degree).
  `polarValue` in `js/layers.js` gives the cap's value inside a cap and the whole-Moon value elsewhere; shadow exists
  in the caps only. `globalCanvas` draws every layer but shadow; `polarCanvas(id, "sp" | "np")` draws a cap.
- `tools/build_layers.py 480 north` (needs `ldem_60n_240m.img`; the north LOLA map has longitude 0 pointing DOWN,
  checked against the global map: correlation 0.997) and `tools/build_layers_global.py` (ldem_16, 24 directions,
  every 12 h; about 13 minutes). Both keep finished parts in `tools/dem/layers_*` and resume.
- Temperature: caps from the Diviner Polar Resource Product (`build_temperature.py south|north`); the rest from the
  Diviner Global Cumulative Products, 18 files, 2.8 GB (`build_temperature_global.py`: mean and highest bolometric
  temperature over the lunar day per half-degree square; equator 217 K average, 392 K highest).
- The scan's ALL YEARS group now shows everywhere (SHADOW only within 10 degrees of a pole).
Layers as built:
- `js/layers.js` — the one definition of the layers (`LAYERS`: elev, slope, sun, earth, shadow): colors, good / bad
  score, the source sentence shown on screen, `profileAt` + `profileHtml` (the data profile card), `globalCanvas` /
  `polarCanvas` (pictures for the 3D Moon), `polarValue`. Green = good, red = bad everywhere; elevation is neutral.
  The slope colors run 0 to 20 degrees as a scale for the eye; it is labeled as not being a safety limit.
- `tools/build_layers.py` → `data/layers/` (`sp_sun`, `sp_earth`, `sp_shadow`, 480 m grid south of 80S): LOLA 240 m
  skylines in 72 directions against the positions in `data/ephem.bin` every 6 hours over 2023 to 2035, 2 m mast.
  "Permanent shadow" means no part of the Sun's disc at any checked moment in those years (said on screen: the
  18.6-year cycle is not covered). Takes about 15 minutes on 4 cores. `tests/check_layers.mjs` compares the layers
  with LUNI's own numbers at the polar presets; a layer is coarser than a preset's skyline and reads lower on the
  narrow best-lit ridges, which is expected and said in the notes.
- `js/ui-moonmap.js` + the MOON MAP tab (key M; BIG MOON · LAYERS on the small Moon): the same globe moves into the
  screen (`.globe-wrap.big` inside `#mm-globe`), layer buttons, legend, strength slider, LOOK AT buttons, and the
  data profile for the point under the pointer (else the landing site). `js/globe.js` gained `setOverlay` (a skin
  for whole-Moon layers, a south polar cap mesh for the fine ones), `onHoverPoint`, `lookAt`; site marks shrink as
  the camera comes close. `showScreen("main" | "moon" | "history")` in `js/app.js` switches screens.
- Scan (`js/ui-scan.js`): SHOW is three groups (THIS MISSION / THE GROUND / ALL YEARS, the last only south of 80S)
  and the old INSPECT box is the data profile card for the hovered point (else where you are now).
HISTORY tab as built: screen tabs MAIN SCREEN / MISSION HISTORY in the unit's top strip (`.tabs`; key H; "open
mission history" in ASK LUNI). `js/ui-history.js` covers `.cols` with a flat Moon map with numbered markers, the
chosen mission's sourced account, and a table of six landings since 2023 (Chandrayaan-3, SLIM, IM-1, Chang'e 6,
Blue Ghost 1, IM-2) with LUNI's live numbers (Sun height at landing, sunlight left, Earth at landing, slope) and a
30-day Sun / Earth strip with the real end marked. LOAD calls `applyScene` (site, landing hour, mission length, and
`needs` such as no direct Earth link for Chang'e 6; other needs go back to the defaults). SLIM (Shioli crater) was
added as a 14th preset for it. Stories carry `proof: true` when they also belong on the PROOF panel.
Other planets: nothing to build (their light is negligible; their pull on the Moon is already inside DE440).

## Extras list (the user: "keep track of those extras"). Not to be built unless the user picks one.
**Done: 1 (operations plan), 3 (custom coordinates), 5 (the site's own data card). Left: 2, 4, 6, 7, 8.** The user
asked about 2, 4 and 6 on 15 Nov and was told they are for after the deadline (hours each, medium to high risk).
1. Operations plan / light scheduler: the mission's stretches in order (Sun and Earth: work and send data; Sun only;
   dark: sleep; eclipse) with dates and lengths, inside the MISSION PLAN tab. A full drag-and-drop expedition
   scheduler was advised against (big, and no sourced data on what activities need).
2. Finer scan (40 m) near the seven polar presets, where `data/patch/` exists ("that's gonna be an extra").
3. Custom coordinates out in the open on the main screen (task 1 of the layers batch, skipped by the user).
4. Sunlight layer at finer detail, so the best-lit ridge tops stop reading low (now 480 m; a 240 m run takes hours).
5. The landing site's own data profile from its own skyline, instead of the 480 m layer value.
6. Replays before 2023 (Apollo, Chang'e 4): needs the position data extended back; the app covers 2023 to 2035.
7. Windows .exe wrapper (Electron). 8. Earth-campers mode (advised against; keep as a story point).

## Deadline
Confirmed by the user from their team page: submissions close **Sunday 15 Nov 2026 at 11:59 PM, the user's LOCAL time**.
This session's clock and "today's date" are UTC, and the user's local time is not known (it was still Saturday for
them when the UTC date turned to 15 Nov, and Claude wrongly said "tonight"). Never say "today" or "tonight" about the
deadline from the UTC date: ask the user for their local time, or give the time in UTC and say so.
**The user is in New York (US Eastern, UTC-5 in November).** The deadline is Sunday 15 Nov 23:59 New York time, which
is **Monday 16 Nov 04:59 UTC**. New York time = this session's UTC clock minus 5 hours.
**r3 released** on the user's "release it" (Sat 14 Nov, about 10 PM New York; main 9f099f4): the public site now has
everything through the layers, mix, temperature, history, icons and the NEXT SITE fix. Later changes go to the
pre-release again and need a new "release it". The submission: the user chose a 7-slide deck (GIFs on hold; "we can do
slide decks tomorrow") over the 30-second video; the Project page takes JPG / PNG / GIF up to 10 MB and public links
only. The Project page text and the deck do not exist yet; the box titles of the Project tab were asked for.
**Test set E** (15 Nov, for the user's mother, who had one run-through first): now the default with `#test`; A to D
run with `#test-a` ... `#test-d`. Six tasks on the newer screens: load Blue Ghost 1 from MISSION HISTORY, read the
eclipse date, next good landing date at Nobile Rim 1, permanent shadow and temperature of Haworth's floor from the
MOON MAP data profile (answers read from her own screen), scan and move near Malapert. An automated run scores 6/6.
Her run (15 Nov): 6/6, 5:55, ease 3/5. She set dates with the pickers (30 clicks), never used NEXT GOOD TIME, the
verdict buttons, ASK LUNI or the MISSION PLAN / WINDOWS buttons, and clicked the best square in the scan directly.
Most confusing: could not tell "permanent" shadow from dark at that moment. Asked for sections in different colors
and "a cool easter egg". Done since: the Moon map data profile shows RIGHT NOW (Sun, Earth on the mission clock)
apart from ALL YEARS; the layer button reads NEVER SUNLIT; steps 1 to 4 each have a color (`--s1` to `--s4`, blue /
violet / amber / green); Apollo 11 on any 20 July shows a one-time note, and ASK LUNI answers "tell me a joke".
`docs/submission.md` holds the drafted text for every Project-tab box. The user makes the slide deck themselves at the
end (no deck or GIFs from Claude unless asked), will have their mother test the app, and wants the Use of SI "ideas"
line to say the idea and direction were theirs; it says that, and keeps one clause that Claude offered suggestions,
because some features were Claude's proposals.
Three independent judge runs (15 Nov UTC, sub-agents on three models, Presentation fixed at 4): 19, 21, 21 of 25
(Impact 3/4/4, Creativity 3/4/4, Validity 4, Relevance 5). Asked for: outside users, an operations schedule or a
best site-and-date search, a richer power model; found the NEXT SITE bug (fixed), ASK LUNI misreading open questions,
a sunlit Sun shown with a negative height, clipped labels in the scan's SHOW buttons.

## Open work, roughly in priority order
1. **GitHub Pages is ON** (switched on by the user on 14 Nov, serving the `release` branch; GitHub's deployment
   record shows "success" for https://galileoleosolis.github.io/LUNI/). This session cannot open github.io or change
   repository settings (both blocked on purpose), so the user has to look at the live pages. Still to do: the user
   confirms `/LUNI/` and `/LUNI/next/` load, and the link goes into the project submission.
   **Branches:** `main` is work in progress and is never served. `release` is what Pages serves: the released
   version at the root and the newest work in `next/` (the page labels itself TEST BUILD there). Only
   `tools/release.sh` writes to `release`: `next` after pushing work the user wants to try on the real site,
   `promote` ONLY when the user says to release (it changes what the judges see), `promote <commit>` to roll back.
   Releases are numbered in the release branch history (r1 was the first); tags cannot be pushed from this session.
   r2 (14 Nov, 21:08 UTC, main 6c061ff) is the first release under the LUNI name. r3 (15 Nov, about 03:00 UTC,
   main 9f099f4). r4 (15 Nov, 14:05 UTC, main 3093d3b). r5 (15 Nov, 15:26 UTC, main 90e2028). r6 (15 Nov, 17:05 UTC, main 8c8cb9c). **r7 (15 Nov, 18:40 UTC, main b12dd78) is the current public version.**
   To roll back to r6: `tools/release.sh promote 8c8cb9c`.
2. Presentation: story, demo video, project page text. Nothing exists yet.
3. OpenSpace link: built (`js/openspace.js`, CONNECT TO OPENSPACE in the right column) and **confirmed working by the
   user with real OpenSpace on 14 Nov** (LUNI opened from the Pages site, not the preview). Not yet heard: whether the
   camera height and facing after `flyToGeo` look good for the demo video; tune `OS_VIEWS` if asked.
4. Windows .exe wrapper (Electron) if still wanted.
5. Test mode is built (`js/testmode.js`, on with `#test` or `window.LUNO_TEST`): intro, six tasks, local usage log,
   review, copyable report. First run (the user's sibling, 14 Nov): 2/6, ease 2/5. The native date box reset itself
   while he typed the year and blocked the whole test; he never found the site list and read "05Z" as a year.
   Fixed since: click-only UTC pickers, one date format with year, numbered step headers, numbered tags on the Moon,
   clearer task wording. Second run (same person, so a re-check only): 4/6, ease 4/5, "looked broken: not anymore".
   He still never changed the mission length, stepped +1 day 21 times instead of using NEXT WINDOW, and never opened
   the area scan. Fixed since: mission length sits inside the verdict block, and a NO-GO shows two buttons there
   (next good landing time, better spot nearby). Still needs a test with someone who has NOT seen the app.
   Third run (set B, same person): 2/6, ease 4/5. Three runs in a row he used only the left column, the bottom keys
   and the big GO word; never the right column, never the verdict text. He said the charts take too much space.
   Fixed since: mission needs moved to the left column as step 3; a NO-GO shows up to three key-style buttons
   ("land on <date> instead", "find a better spot nearby", one need to relax); eclipse shown as a yellow tag;
   countdowns show the date; keys renamed NEXT GOOD TIME and BETTER SPOT; Moon zoom is faster.
   Task set B (new sites and dates; mission needs, sunset date, eclipse, area scan) is now the default;
   Task set D is now the default (a site low in the list, next good time, two ASK LUNI tasks, scan distance to the
   best point, move there); sets A, B and C run with `#test-a`, `#test-b`, `#test-c`. Set D's scan answer is read
   from the tester's own scan panel, because the chip and the processor scan different grids.
   Fourth run (set C, same person): 5/6, ease 4/5, 7 minutes. He liked that everything to change is on the left.
   He still never pressed NEXT GOOD TIME, BETTER SPOT or the verdict-block buttons (stepped +1 day 20 times; for
   "find a GO point nearby" he clicked through the preset list). Complaints: the test's own date answer box showed the
   month as a number and its year was slow to scroll; Moon zoom slightly too fast.
   Fixed since: the two shortcuts are repeated as buttons in the left column (`#side-scan` under the site list,
   `#side-next` under the landing time); the test's date answer is three pickers like the app's; zoom speed 1.9.
   The user's own look (14 Nov, big screen about 2000 x 1250): "the landing site selection is very hidden, and
   everything is very big". Fixed since: `fitStage` gives a tall window a taller layout (up to `dhMax`) before it
   magnifies; the left column now starts with the site list (framed, with a "more sites" marker), the Moon sits under
   it, and the two shortcut buttons live in the step 1 and step 2 headers (`#side-scan`, `#side-next`). Sites visible
   without scrolling: 7 of 12 on laptop windows (was 4), 12 of 12 on big screens.
   Fifth run (set D, same sibling, the new left column): 6/6, ease 5/5, 6:22. He used ASK LUNI 21 times, typed,
   and it understood every sentence ("The mission will last 28 days likely", "Look for a better spot nearby").
   Problems: pressing TALK did nothing visible (the microphone is refused for him on the preview page; he pressed it
   8 times); he did not see the BETTER SPOT button in the step 1 header and asked for one on the left; after moving
   the site from the scan he was not sure it had moved. Fixed since: a refused microphone says so in the answer
   line and the button reads NO MICROPHONE · TYPE; the better-spot button sits on the Moon picture; moving the site
   from the scan shows a fading confirmation with distance and direction (`toast` in `js/app.js`).
   The user (14 Nov) had only just discovered the mission-clock slider and said it and the Moon must be far more
   obvious. Fixed since: the 30-day chart has a labeled slider rail with a large handle that shows the moment it
   stands on and pulses until first used; the Moon box says DRAG / SCROLL / CLICK and has a BIG MOON button that
   moves it over the middle column (`setBigMoon` in `js/app.js`), with a short GO / NO-GO tag on it.
   Moving the site from the scan (button or a click on a square) now keeps the scan open and animates it: the
   lander glides to the point, the map slides to re-center, and a new scan starts with the old picture as a dim
   backdrop (`pick` in `js/ui-scan.js`; the site only changes when the animation ends, about 2 s).
   The user reported the scan "still jumping off the screen" when moving to the better spot; the cause was never
   pinned down (possibly an old cached copy). A key that moved to the best spot instead of closing the scan was
   tried and rejected: the user wants the bottom key as a plain open / close toggle for the scan menu, lit green
   while open, labeled SCAN FOR BETTER SPOT. All "find a better spot" buttons use that wording.
   The user reported the scan sometimes "picks the worst site as the best". Measured: with no GO point it crowned
   a tied NO-GO corner, and among GO points it ranked by mission sunlight, which is 100% for nearly all of them.
   Now (`bestCell` in `js/scan-core.js`, checked in `tests/check_scan.mjs`): only a GO point can be best, else the
   panel says no point meets the needs; GO points rank by sunlight margin, then slope in whole degrees, then the
   shortest move, then Earth link. Slope is a tie-breaker only: there is no slope limit, because no sourced limit
   has been chosen (a "max slope" mission need was offered to the user, not built).
   ASK LUNI (voice and typed commands) is built and passes its checks, but a real microphone has not been tried:
   the user must test it in Chrome or Edge from localhost or GitHub Pages. The user chose a local model on their own laptop (needs a
   restart with the GPU on; asked about running it on the NPU, which depends on the model program, not on LUNI).
   LUNI's side is built; still needed from the user: which program runs the model, which model, which chip, and a
   test with LUNI opened from the laptop itself (localhost or GitHub Pages; Ollama needs OLLAMA_ORIGINS for Pages).
6. Quick wins: share link, real-mission replays, first-visit guide: done on 14 Nov (see Layout). Left: nothing small.
7. Verify coordinates in `data/sites.json` against their source links; get NASA's coordinates for the nine
   Artemis III candidate regions (current polar presets are LUNI-selected best-lit points near rough centers).
