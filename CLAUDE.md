# LUNI — project notes for Claude

**Name:** the product is **LUNI, Lunar Utility Navigational Intelligence** (renamed by the user on 14 Nov 2026 from
LUNO, "Lunar Utility for Navigational Operations"; the idea came from the sibling). Everything a person can read says
LUNI. Internal names were left alone on purpose and still say LUNO: `window.LUNO_B64`, `LUNO_TEST`, `LUNO_NO_GPU`,
the `luno:state` / `luno:command` events, the `luno-*` storage keys, the artifact file `luno.html`, and the pictures
in `docs/figures/`. Do not "fix" those in passing; a rename there has to be done everywhere at once.

LUNI (Lunar Utility Navigational Intelligence) is a team entry for the NASA Space Apps Challenge 2026,
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
- Later the same night (the user): the Best Site Finder's map choices are a second button stack, right of the map
  (`.scan-shows`, MAP SHOWS; names in `STACK` in `js/ui-scan.js`, e.g. SUN · MISSION and SUN · ALL YEARS), with a line
  between it and the scrolling side panel; both stacks use one font size. "Best spot is picked by" stays in the
  side panel (`#scan-rank`). The keys carry no small caption any more (only the four launch-slip keys do): PLAY
  ORBITAL DATA (the user's wording), NEXT LANDING WINDOW, ASK LUNI (in the middle in both views), BEST SITE FINDER,
  NEXT SITE, PIN TO COMPARE, ALL TOOLS / SIMPLE VIEW.
- Bottom keys (the user: the gray ones "look deactivated" next to ASK LUNI): PLAY, NEXT LANDING WINDOW and BEST SITE
  FINDER are blue, ASK LUNI stays teal, the rest are a lighter gray.
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
   main 9f099f4). **r4 (15 Nov, 14:05 UTC, main 3093d3b) is the current public version.** To roll back to r3:
   `tools/release.sh promote 9f099f4`.
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
