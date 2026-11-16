# LUNI change log

Times are New York time. **Public version: r11.** The test build (`/next/`) is the same until new work is added.

## r9 to r11: small releases after the award
Sun 15 Nov · 7:20 PM to 7:45 PM  
**r11 is the public version.**

- r9: the project page at `/about/` (the project, the Best Use of Data result, the classroom lesson, the timeline).
- r10: every listed landing site checked against its source. Five match NASA's LRO camera team; Chang'e 4 was about 420 m off and now uses the LRO camera team's position; each site shows what the check found.
- r11: the user test opens with a one-minute tour (four cards), and the report says whether it was read.

## r8: The LUNI Console look
Sun 15 Nov · 6:33 PM · released after the local judging (Best Use of Data award)

- The full name with “for”: Lunar Utility for Navigational Intelligence.
- The default Earth-link need is now 25% of the mission (was only "at landing"), so a plan with almost no Earth link is no longer a GO.
- The look now follows the LUNI Console design system: glossy keys, dark glass choice buttons everywhere, glazed action buttons, cards with icons in the Best Site Finder, the Moon map and COMPARE SITES · MORE, an icon on every section band.
- A check or a cross inside the green and red dots in the site list; no text to read under 12.5 px.
- NASA DATA USED band stays 14 seconds and each source is a link.
- View from the site: shaded ground and craters for depth. FULL SCREEN button.
- Fixed on the way: mission-needs buttons spilling out of the left column, and the Moon map data card losing its bars.
- Outside the app: the slide deck, GIFs, the talk scripts, the design system page.

## r7: Energy, before and after, solar panels
Sun 15 Nov · 1:40 PM · 116 saves

- ENERGY: an hour-by-hour power budget with the battery needed.
- BEFORE AND AFTER box when the site or the date moves.
- SOLAR PANELS placed on the sunniest squares near the lander.
- Skyline picture: depth, bigger rays, fixed sizes, no false eclipse.
- Finder: vertical button stacks against the map.
- NASA band in white and red; warnings to the right of the verdict.
- SIMPLE VIEW starts with the left side folded.
- ASK LUNI: coordinates, comparing two sites, energy, temperature.

## r6: NASA data out loud
Sun 15 Nov · 12:05 PM · 107 saves

- NASA DATA USED band every time something is calculated.
- Best Site Finder: the map holds still after a move, so its points no longer slide.
- One EARTH LINK need instead of two.
- Verdict strip tidied; a NO-GO pulses, and so do the keys that can fix it.
- PROOF opens on four headline numbers.
- ASK LUNI: move to the highest, coldest, flattest spot.

## r5: More NASA data
Sun 15 Nov · 10:26 AM · 103 saves

- WATER ICE layer from NASA's Diviner polar product.
- DEEP SPACE NETWORK line: which NASA stations can see the Moon.
- The site's data card uses the site's own detailed skyline.
- PROOF: LUNI's polar maps checked against NASA's own (0.99).

## r4: Simple view and the tutorial
Sun 15 Nov · 9:05 AM · 96 saves

- SIMPLE VIEW by default; ALL TOOLS one press away.
- A guided tutorial that lights up one part at a time.
- Whole-Moon layers and the north pole.
- Renamed: BEST SITE FINDER and NEXT LANDING WINDOW.
- The answer as one strip, with Sun and Earth side by side under it.
- Custom coordinates on the main screen; every site ranked with a GO / NO-GO dot.
- OPERATIONS plan beside MISSION PLAN and MISSION WINDOWS.
- Colored step bands, a bigger slider, icons on the ASK LUNI buttons.

## r3: Proof and the Moon map
Sat 14 Nov · 10:13 PM · 75 saves

- Two-column layout, brighter palette.
- PROOF panel: three real landings replayed against the mission record.
- Opens on a real landing (IM-2); copy link; first-visit guide; slope need.
- MISSION HISTORY: six real landings since 2023.
- MOON MAP with data layers and a data card for any point.
- Temperature from NASA Diviner, and YOUR MIX of layers.
- 3D surface view, second version.
- The scan's best point must meet the needs.
- Less clutter: big icons, one lower chart at a time.

## r2: Renamed LUNI
Sat 14 Nov · 4:08 PM · 53 saves

- The product becomes LUNI.
- Mission-clock slider with a real handle.
- Headings in three voices: the name, what it is, what you can do.
- Moving the site from the scan is animated and stays in the scan.
- Clear message when the microphone is refused.

## r1: First public version
Sat 14 Nov · 3:16 PM · 40 saves

- Mission needs, GO / NO-GO, and the landing-window calendar.
- Area scan, with the skylines worked out on the graphics chip.
- Eclipses, and a one-click check against NASA JPL Horizons.
- 3D view from the surface.
- ASK LUNO: typed and spoken commands.
- Link to OpenSpace.
- Built-in user test; four rounds of testing changed the layout each time.
- Blue palette, bigger text, the verdict first.

## Draft 2: The field unit
Sat 14 Nov · 10:36 AM · 3 saves

- Redesigned as a console inside a rugged field unit.
- 3D Moon to pick a site, and a checked list of sites.
- Eight minutes later: real NASA data (SPICE positions, LOLA terrain).

## Draft 1: First sketch
Sat 14 Nov · 10:21 AM · 1 save

- A plain page with made-up numbers, to try the idea.
- Called LUNO at this point.

To put an older version back: `tools/release.sh promote <commit>` (r6 is `8c8cb9c`, r5 `90e2028`, r4 `3093d3b`, r3 `9f099f4`, r2 `6c061ff`, r1 `03d208a`; r7 is `b12dd78`).
