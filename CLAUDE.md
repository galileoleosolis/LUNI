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
  (40 m, built by `tools/build_patches.py`) and the reduced maps, Sun light with shadow map, LUNO skyline overlay at 2 m.
  On the preview page the patches are served as base64 text copies (see the artifact build step).
- `js/assistant.js`, `js/ui-assistant.js` — ASK LUNI: typed or spoken commands. The assistant is named LUNI (Lunar
  Utility Navigational Intelligence; the user's sibling's idea); the unit and the project stay LUNO. `parse` turns a sentence into tool calls
  (`TOOLS`, `runTool`), answers are built only from LUNO's own numbers. Rules, not a language model, so it works with no
  Earth link; the tool list is the hand-over point if a language model is added. The app side is `assistantApi` in
  `js/app.js`. Speech uses the browser (Web Speech API). Never call `SpeechRecognition.available()` at page load: it
  crashes headless test browsers; it runs only when someone first presses TALK.
- `js/assistant-llm.js` — optional link to a language model running on the user's own computer (any server that
  speaks the OpenAI-style "chat completions with tools" protocol: Ollama, LM Studio, Lemonade, llama.cpp). Off until
  the user connects it in the ASK LUNI panel. Exact commands stay with the rules; open questions (`isOpenQuestion`)
  and anything the rules miss go to the model, which may only call LUNO's tools. Tested against a scripted stand-in
  server only; never with a real model. Hidden on the preview page (it cannot reach other addresses).
- `js/openspace.js` — optional link to OpenSpace on the same computer (WebSocket, port 4682, the protocol of
  openspace-api-js 1.0.2: an `apiHandshake`, then `luascript` messages). OpenSpace follows LUNO's site
  (`flyToGeo("Moon", lat, lon, height)`, navigation or globebrowsing library, whichever exists) and mission clock
  (`time.setTime`). Send-only. Tested against a stand-in server only, never against real OpenSpace. Hidden on the
  preview page.
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
- Look: blue palette is the default (`:root` in `css/style.css`; `?palette=amber|ice|mono` previews others). The user
  asked for bigger text and a clear order of importance: the GO / NO-GO verdict block first, Sun/Earth second.
- American spelling everywhere (center, color, meters, modeled): in the app, the code, the docs and in chat. The user insists.
- No jargon on screen: say "landing" not "T0", dates as `14 JAN 2027 01:00 UTC`, never a bare "Z".
- Headings speak in three voices (the user asked for this): the name of the thing (`.h-t`, bright), what it is
  (plain, dim), and what you can do with it (`.h-do`, bold white with a pointer). Any text that points at a feature
  uses `.h-do`; do not leave an instruction in the dim voice.
- The crowded case to check after any layout change in the middle column: a NO-GO with three "ways to get a GO"
  buttons (Nobile Rim 1, 14 NOV 2026 20:00). The landing-day strip must stay fully visible at 1100 x 700 and up.

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
2. Presentation: story, demo video, project page text. Nothing exists yet.
3. OpenSpace link: LUNO's side is built (`js/openspace.js`, CONNECT TO OPENSPACE in the right column). Still to do:
   the user tries it with real OpenSpace, with LUNO opened from their own computer or GitHub Pages (not the preview).
   Likely trouble spots: the camera height and facing after `flyToGeo`, and the browser asking for local-network access.
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
   The user's own run (15 Nov, big screen about 2000 x 1250): "the landing site selection is very hidden, and
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
   The user (15 Nov) had only just discovered the mission-clock slider and said it and the Moon must be far more
   obvious. Fixed since: the 30-day chart has a labeled slider rail with a large handle that shows the moment it
   stands on and pulses until first used; the Moon box says DRAG / SCROLL / CLICK and has a BIG MOON button that
   moves it over the middle column (`setBigMoon` in `js/app.js`), with a short GO / NO-GO tag on it.
   ASK LUNI (voice and typed commands) is built and passes its checks, but a real microphone has not been tried:
   the user must test it in Chrome or Edge from localhost or GitHub Pages. The user chose a local model on their own laptop (needs a
   restart with the GPU on; asked about running it on the NPU, which depends on the model program, not on LUNO).
   LUNO's side is built; still needed from the user: which program runs the model, which model, which chip, and a
   test with LUNO opened from the laptop itself (localhost or GitHub Pages; Ollama needs OLLAMA_ORIGINS for Pages).
6. Quick wins left: share link, real-mission replays, explainer mode. (Eclipses and partial Sun are done.)
7. Verify coordinates in `data/sites.json` against their source links; get NASA's coordinates for the nine
   Artemis III candidate regions (current polar presets are LUNO-selected best-lit points near rough centers).
