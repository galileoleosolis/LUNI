# LUNI: text for the Space Apps Project page

Each section below matches one box on the Project tab. Copy the text under the heading into that box.
Anything in [square brackets] is for you to fill in or check. This draft was written by the AI assistant from the
project as built; read it and change anything that is not how you would say it.

---

## Project Name

LUNI: Lunar Utility Navigational Intelligence

---

## High-Level Project Summary

LUNI is a web app that answers one question fast: can this mission land here, at this time? You pick a landing site
on the Moon and a landing time, and LUNI gives a plain GO or NO-GO for power and for a direct link to Earth, with the
reason, countdowns to sunset and Earthset, and one-press ways out of a NO-GO: the next landing window, a better
spot nearby, or a mission need to change.

It addresses the challenge directly: it compares sites and dates quickly, shows the Sun and Earth against the real
terrain skyline, and makes the result readable by a planner, a teacher or a curious visitor. Every answer is computed
from NASA data (SPICE positions, LRO LOLA elevation, LRO Diviner temperatures), and the app shows its own proof: it
matches NASA JPL Horizons to 0.0007° and replays real landings next to the published mission record.

It matters because a launch slip or a few hundred meters can turn a workable landing into a dead lander, and today
finding that out takes several specialist tools.

---

## Link to Project Demo

[Tomorrow: the public link to the 7-slide deck goes here.]

---

## Link to Final Project

https://galileoleosolis.github.io/LUNI/

Source code: https://github.com/galileoleosolis/LUNI

---

## Detailed Project Description

**What it does**

- **The answer.** For a site, a landing time and a set of mission needs (mission length, how long the lander can sit
  in the dark, how much Earth link it needs, how steep the ground may be), LUNI says GO or NO-GO and why. A NO-GO comes
  with buttons that get to a GO.
- **The view from the site.** The skyline all the way round, drawn from elevation data, with the Sun, the Earth in its
  real phase, and where each will go over the next 3 days. Eclipses (Earth passing in front of the Sun) are detected
  and flagged.
- **Mission plan, operations and mission windows.** A 30-day timeline with a slider for any moment of the mission; an
  operations view that lays the mission out as stretches in order (power and link, power only, on battery, eclipse);
  and every good landing day for the next 12 months.
- **Where water ice could last.** A map layer and a data card row from NASA's Diviner Polar Resource Product: how deep
  below the surface water ice would stay frozen, at both poles.
- **All sites side by side.** Every site in the list carries a green or red dot for the landing time on screen, and
  a ranked table shows how many good landing days each site has. Any latitude and longitude can be typed in.
- **Best Site Finder.** LUNI checks a grid of points around the site, out to 60 km away, and marks the best
  one that meets the needs. The skylines are computed on the graphics chip when one is available, and each run first
  checks itself against the processor.
- **Moon map with layers.** The 3D Moon with elevation, slope, sunlight, Earth link and temperature for the whole
  Moon, at finer detail around both poles, where permanent shadow is mapped as well. Green is good, red is bad, and each layer names its
  data source. A data profile card gives every layer's value at any point. The layers can be blended with your own
  weights into one score, and that mix can pick the best point in the scan.
- **Mission history.** Six real landings since 2023 (Chandrayaan-3, SLIM, IM-1, Chang'e 6, Blue Ghost Mission 1, IM-2)
  side by side, each loadable into the main screen at its real date and hour.
- **For every skill level.** A simple view by default with every tool one press away, a guided tutorial that
  lights up one part of the screen at a time, plain-language labels, typed or spoken commands (ASK LUNI), a 3D
  first-person view from the surface, a comparison of the site with a place on Earth, and a link that reopens LUNI on
  the exact same question.

**How it works**

LUNI is a static web page with no server. Sun and Earth directions come from a table built from NASA SPICE (DE440) for
2023 to 2035, in the same Moon-fixed frame as the elevation maps. For each site LUNI builds the terrain skyline from
LRO LOLA elevation and compares the Sun's disc and the Earth with it, hour by hour. "Sun" means at least half of the
Sun's disc is in view from 2 m above the ground. The map layers were worked out the same way: for 1.26 million points
around each pole (480 m squares, every 6 hours over 2023 to 2035) and for about a million quarter-degree squares over
the rest of the Moon. Temperatures are NASA's own Diviner values, only re-gridded.

**How we know it is right**

- Sun and Earth positions agree with NASA JPL Horizons within 0.0007° across 1,110 values at 6 sites. The app links
  to NASA's own answer for whatever is on screen.
- Blue Ghost Mission 1: LUNI works out 347 hours of daylight after touchdown; Firefly reported 346. LUNI puts the
  14 March 2025 eclipse at 05:01 to 09:51 UTC with the Sun fully hidden from 06:18; the lander's pictures give about
  05:30, 06:18 and 09:52.
- LUNI's polar map layers agree with NASA's own polar maps from the LRO LOLA team: sunlight correlates at 0.99 at
  both poles with an average gap under 2 points, and "never sunlit" gives the same answer as NASA's permanently
  shadowed regions map in about 99% of 1.26 million squares per pole.
- Chandrayaan-3: LUNI's sunset is 4 September 2023, the day the lander was put to sleep ahead of the lunar night.
- The app lists what it does not model: the landing itself, rocks and craters smaller than a map pixel, panel
  direction, lander tilt, antennas and relay satellites.

**Benefits and what we hope to achieve**

A planner can re-check a site after a schedule slip in seconds instead of moving between several tools. A teacher or
student can see why the Moon's south pole is hard: a Sun that stays within a few degrees of the horizon near the pole, sunsets that take
hours, and craters that never see sunlight next to ridges that almost always do. We hope LUNI is useful as a first
look before detailed analysis, and as a way for anyone to explore real mission conditions.

We tested it with two people and changed the design after each round. The first tester did five rounds; task success
went from 2 of 6 in the first to 6 of 6 in the fifth. A second tester, after one walk-through, completed 6 of 6 tasks
in under 6 minutes on the newest screens and rated ease of use 3 of 5. Her main confusion (whether "shadow" meant
permanent or just dark at that moment) led to a change the same day: the data card now shows "right now" and
"all years" separately. A third person, a friend from a NASA internship program, said there was too much on screen
at once; that led to the simple view, the reorganized Best Site Finder and the guided tutorial.

**Tools**

HTML, CSS and JavaScript (no build step), WebGL2, Web Workers, the Web Speech API, three.js for the 3D views; Python
with NumPy and SpiceyPy to prepare the NASA data; Node.js for the checks; Playwright for layout checks; GitHub Pages
for hosting; an optional link to OpenSpace. The code was written with an AI assistant (see Use of SI).

---

## Use of Super Intelligence (SI)

Yes. We used Claude (Anthropic's large language model, through Claude Code) throughout.

- **Code:** all of the app's code and the data-preparation scripts were written by Claude under our direction. This is
  stated in the app's PROOF panel, in the README, and in the commit history (each commit is marked as co-authored by
  Claude).
- **Ideas:** the idea and the direction are ours. We chose the challenge, decided what LUNI should be and do, and
  directed every change by testing each version and deciding what to keep, change or remove. Claude was the tool that
  built what we asked for; where it offered suggestions, we decided whether to use them.
- **Data:** no data was generated by AI. Every number comes from NASA data through ordinary calculation. Mission facts
  were looked up on the web and each is linked to its source.
- **Text:** this project page text was drafted by Claude and edited by us.
- **Images, video, audio:** none generated by an image, video or audio model. The pictures in the app are drawn by
  its code. The app's speech uses the browser's built-in voice. No NASA logos or mission identifiers are used.
- The assistant inside the app (ASK LUNI) is rule-based, not a language model. A language model on the user's own
  computer can be connected as an option; it is off by default.

---

## NASA Data

- **NASA NAIF SPICE** generic kernels (DE440 planetary ephemeris `de440s.bsp`, `naif0012.tls`, `pck00011.tpc`,
  `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`): positions of the Sun and Earth as seen from the Moon, 2023 to
  2035. https://naif.jpl.nasa.gov/naif/data_generic.html
- **NASA NAIF station and Earth-orientation kernels** (`earthstns_itrf93_260814.bsp`,
  `earth_1962_260806_2126_combined.bpc`): the positions of the Deep Space Network sites at Goldstone, Madrid and
  Canberra and the Earth's rotation, used to say which sites have the Moon in their sky.
  https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
- **NASA JPL Horizons System:** 1,110 reference values used to check LUNI's positions, and live links from the app to
  NASA's own answer. https://ssd.jpl.nasa.gov/horizons/
- **LRO LOLA (Lunar Orbiter Laser Altimeter) gridded elevation**, NASA PDS Geosciences Node: `ldem_80s_40m`,
  `ldem_60s_240m`, `ldem_60n_240m`, `ldem_16`. Used for every skyline, slope, the area scan, the map layers and the 3D surface view.
  https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/
- **LRO LOLA polar illumination maps, 2016 release** (permanently shadowed regions, average visibility of the Sun
  and of Earth, 240 m; Mazarico et al. 2011), NASA PDS, LOLA archive extras: used to check LUNI's own map layers.
  https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/
- **LRO Diviner Lunar Radiometer, Polar Resource Product V2.0** (Paige et al., LRO-L-DLRE-5-PRP-V2.0), NASA PDS:
  annual average and maximum surface temperature around both poles, and the depth at which water ice would stay
  frozen (the product's `ice_depth` column).
  https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/
- **LRO Diviner Global Cumulative Products V1.0** (Williams et al. 2017, LRO-L-DLRE-5-GCP-V1.0), NASA PDS: measured
  surface temperature for the whole Moon in half-degree squares.
  https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gcp/
- **LRO Wide Angle Camera global mosaic** (NASA/GSFC/Arizona State University), through NASA Moon Trek: the picture on
  the 3D Moon and the mission-history map. https://trek.nasa.gov/moon/
- **LROC landing-site pages** for coordinates of Blue Ghost Mission 1, SLIM and Apollo 11.
  https://lroc.im-ldi.com/images/1400 · https://www.lroc.asu.edu/images/1358 · https://lroc.im-ldi.com/visit/exhibits/1/gallery/8
- The challenge's own description and resources for the Lunar Landing Site Navigator challenge.

---

## Space Agency Partner Data and Other References

**Space agency partners**

- **JAXA:** the SLIM landing (19 January 2024) is one of the replayed missions. NASA's Diviner temperature product is
  built on a polar elevation model from JAXA's Kaguya laser altimeter (Araki et al., Science, 2009), as its NASA catalog entry states.
- **ISRO:** the Chandrayaan-3 landing (23 August 2023) is one of the replayed missions; the site coordinates come from the
  IAU / USGS planetary names gazetteer. https://planetarynames.wr.usgs.gov/Feature/16272

**Mission facts (each shown in the app with its link)**

- IM-2 Athena: Spaceflight Now, https://spaceflightnow.com/2025/03/07/intuitive-machines-im-2-mission-ends-with-lander-on-its-side-on-the-moon/ ; SpacePolicyOnline, https://spacepolicyonline.com/news/im-2-mission-ends-one-day-after-lunar-landing/
- Blue Ghost Mission 1: Firefly Aerospace, https://fireflyspace.com/missions/blue-ghost-mission-1/ ; FOX 7 Austin, https://www.fox7austin.com/news/blue-ghost-lander-eclipse-from-moon
- Chandrayaan-3: News On AIR, https://www.newsonair.gov.in/vikram-lander-of-chandrayan-3-put-into-sleep-mode-hopes-for-its-awakening-on-22nd-september-isro ; The Planetary Society, https://planetary.org/space-missions/chandrayaan-3
- SLIM: SpacePolicyOnline, https://spacepolicyonline.com/news/farewell-slim ; Scientific American, https://www.scientificamerican.com/article/japans-slim-mission-is-revived-on-the-moon
- IM-1 Odysseus: Intuitive Machines, https://www.intuitivemachines.com/post/im-1-lunar-night-update-farewell-odysseus ; Universe Today, https://www.universetoday.com/articles/lunar-night-permanently-ends-the-odysseus-mission
- Chang'e 6: collectSPACE, https://www.collectspace.com/news/news-060124a-china-chang'e-6-moon-far-side-sample-landing.html ; SpaceNews, https://spacenews.com/change-6-lands-on-far-side-of-the-moon-to-collect-unique-lunar-samples

**Site coordinates**

- Shackleton connecting ridge: Mazarico et al. 2011, Icarus 211 (LOLA illumination study).
- Apollo 15 and 17: Apollo Lunar Surface Journal, https://apollojournals.org/alsj/alsjcoords.html
- IM-1: https://www.hou.usra.edu/meetings/lpsc2025/pdf/2262.pdf
- IM-2, Chang'e 4, Chang'e 6: Wikipedia articles for each mission.
- Nobile Rim 1 and Malapert Massif are points LUNI itself picked as the best-lit spot near a rough region center, and
  Haworth is an approximate point on the crater floor; the app labels them as such.

**Papers**

- Paige et al., Science 330, 497 (2010): the Diviner polar temperature model.
- Williams et al., Icarus 283, 300-325 (2017): the global surface temperatures of the Moon measured by Diviner.

**Software and fonts**

- three.js and OrbitControls (MIT license), included in the project.
- IBM Plex Mono and Barlow Condensed fonts (SIL Open Font License), included in the project.
- OpenSpace (openspaceproject.com), optional link; its openspace-api-js message format.
- Python, NumPy, SpiceyPy; Node.js; Playwright.
- Claude (Anthropic), through Claude Code: wrote the code (see Use of SI).
