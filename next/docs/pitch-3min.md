# LUNI: the 3-minute talk and the Q&A sheet

For the local judging: 3 minutes to present, 5 minutes of questions. This was drafted by the AI assistant from the
project as built. Say it in your own words; the numbers are the part to keep exact. Every number here is also in the
app's PROOF panel or in `docs/submission.md`.

It is about 420 words, which is close to 2 minutes 50 seconds at a calm pace. That is an estimate from the word
count, so time yourself with the clicks, and cut the part marked (CUT FIRST)
if you run long.

## Before you walk up

- Open LUNI in a tall browser window (the skyline picture is bigger). Close the tutorial card.
- Set it up ahead of time: site NOBILE RIM 1, landing 14 NOV 2026 20:00 UTC, mission length 10. It shows NO-GO.
- Have MISSION HISTORY one click away (the tab at the top).
- Know which address you are showing. The public site only has what was released; newer work is on the /next/ page
  until it is released.

## The talk

**0:00 to 0:25 · The problem**

"A lander on the Moon needs two things to stay alive: sunlight for power, and a clear line to Earth to talk. At the
Moon's south pole the Sun only skims the horizon, so one hill, or one day's delay, can take both away. NASA's tools can
tell you this, but they are built for specialists and you need several of them. Our challenge was to make that answer
fast and clear for anyone."

**0:25 to 0:40 · What we built**

"This is LUNI. You choose where and when, and it answers one question: can this mission land here, at this time?
GO or NO-GO, with the reason."

**0:40 to 1:50 · Live demo (70 seconds, four moves)**

1. Point at the screen. "Nobile Rim 1, one of the south pole regions, landing 14 November. NO-GO: no Earth link at
   landing. Here is the Sun above the skyline, and here is Earth, behind the ground."
2. Press **BEST SITE FINDER**. "One way out: keep the date and move the site. LUNI checks hundreds of points around
   us. Green works, and the star is the best one." Press **BACK TO THE MAIN SCREEN**.
3. Press **NEXT LANDING WINDOW**. "The other way: keep the site and move the date. Say the launch slips. One press
   finds the next window that works. Now it is a GO."
4. Drag the **slider**. "And this is the whole mission, hour by hour: when we have Sun, when we have Earth, when it
   gets dark."

(CUT FIRST) 5. Open **MISSION HISTORY**. "It also replays six real landings since 2023 on their real dates."

**1:50 to 2:25 · Why you can trust it**

"Everything is calculated from NASA data: SPICE for where the Sun and Earth are, the LRO laser altimeter for the
terrain, and LRO Diviner for temperature. We checked it two ways. Against NASA's JPL Horizons, our Sun and Earth
positions agree within 0.0007 degrees. And against real missions: for Blue Ghost Mission 1, LUNI calculates 347 hours
of daylight after landing. Firefly reported 346. LUNI also finds the eclipse that lander photographed on 14 March 2025."

**2:25 to 2:45 · Who it is for**

"A mission planner can re-check a site after a schedule slip in seconds. A teacher or a student can see why the south
pole is so hard. We tested it with people who had never seen it and changed the design after every round; our first
tester went from 2 of 6 tasks to 6 of 6."

**2:45 to 3:00 · Close**

"LUNI turns several specialist tools into one clear answer, and it shows its own proof. It runs in any browser, with
no install and no server. Thank you."

## Questions you may get, with honest answers

**How accurate is it?**
Positions agree with NASA JPL Horizons within 0.0007 degrees across 1,110 values at 6 sites. Blue Ghost: 347 hours of
daylight calculated, 346 reported. The eclipse on 14 March 2025: LUNI gives 05:01 to 09:51 UTC with the Sun fully
hidden from 06:18; the lander's pictures give about 05:30, 06:18 and 09:52. Chandrayaan-3: LUNI's sunset is
4 September 2023, the day the lander was put to sleep. The map layers were checked against NASA's own polar maps from
the LOLA team: sunlight matches at 0.99, and "never sunlit" gives the same answer as NASA's permanent-shadow map in
about 99% of the squares.

**What NASA data does it use?**
NASA NAIF SPICE (the DE440 ephemeris) for Sun and Earth positions, 2023 to 2035. LRO LOLA elevation maps for terrain
and skylines. LRO Diviner for temperature. The Moon picture is the LRO wide-angle camera mosaic.

**What does it NOT do?**
It does not model the landing itself, rocks and craters smaller than a map pixel, which way the solar panels face,
lander tilt, antennas, or relay satellites. It is a first look before detailed analysis. The PROOF panel lists these limits.

**How detailed is the terrain?**
The preset polar sites use 40-meter and 240-meter maps. Custom points and the Best Site Finder use reduced maps (240
meters to 3.8 km), and the screen says so. The whole-Moon layers are coarser still (480-meter squares near the poles).

**How do you decide the Sun is "up"?**
At least half of the Sun's disc is in view from 2 meters above the ground, after the terrain skyline and any eclipse.

**What does "never sunlit" (permanent shadow) mean in LUNI?**
No part of the Sun's disc is visible at any checked moment from 2023 to 2035. It does not cover the Moon's full
18.6-year cycle, and the screen says that.

**Are the landing sites official?**
The past landings are at their published coordinates. The south pole candidate presets are points LUNI picked as
best-lit near the rough centers of the regions; they are not NASA's official coordinates, and getting those is on our list.

**Is the sunlight map exact?**
No. It is a 480-meter grid, so narrow ridge tops read low: 16 to 25 points lower than LUNI's own detailed answer at
the three best-lit ridge sites. At ordinary sites it is within about 1 point. The screen says this.

**How is this different from Quickmap, Moon Trek or Horizons?**
Those give expert data. LUNI gives the decision: GO or NO-GO, the reason, and the fix. It uses the same kind of data
and links to Horizons so you can check any answer.

**How did you use AI?**
The idea and the direction were ours. An AI assistant (Claude) wrote the code and offered suggestions, and we tested
and corrected it. It is disclosed on the project page and inside the app's PROOF panel. No AI-made images or video.

**Does ASK LUNI use an AI model?**
No. It is built-in rules, so it works with no internet link. There is an optional link to a model on your own
computer, which is off by default.

**Who tested it?**
Two family members and one friend. The first tester did five rounds (2 of 6 tasks, up to 6 of 6). The second finished
6 of 6 in under 6 minutes and rated ease of use 3 of 5. The friend said there was too much on screen, which led to the
simple view and the guided tutorial. We have not tested with a mission planner.

**What would you build next?**
A power model that knows the panels and the battery, finer detail in the Best Site Finder near the poles, NASA's official coordinates for the Artemis candidate regions, and landings before 2023.

**Does it need a server or an install?**
No. It is a static web page; all the NASA data is prepared ahead of time and loaded by the browser.
