// Real landings that LUNI can replay, and what really happened there.
// Fields: site (preset id), t0 (the landing hour LUNI loads), days and needs (mission needs to load with it),
// landed (the real touchdown time, as the source gives it), end and marks (real events, drawn on the HISTORY strips),
// strip (one line), real (the full account), sources. proof: true puts the landing on the PROOF panel as well.
// Every "real" statement below comes from the linked source. Nothing in this file is computed: LUNI's side of each
// comparison is worked out live from its NASA data when the proof panel opens (js/ui-proof.js).
// Times given by the sources in US Central or India time are converted to UTC here (CST = UTC-6, CDT = UTC-5,
// India = UTC+5:30).

export const STORIES = [
  {
    id: "im2", site: "im2", t0: "2025-03-06T17:00:00Z", days: 10, proof: true,
    name: "IM-2 ATHENA", when: "6 MAR 2025", where: "MONS MOUTON, NEAR THE SOUTH POLE", who: "USA · INTUITIVE MACHINES, NASA CLPS",
    landed: "ABOUT 17:30 UTC", end: { t: "2025-03-07T06:15:00Z", text: "ENDED 7 MAR 2025, ABOUT 06:15 UTC: UNDER 13 HOURS AFTER LANDING" },
    // one short line for the strip above the answer while LUNI stands on this landing
    strip: "IT ENDED ON ITS SIDE IN A CRATER, ABOUT 250 M OFF TARGET",
    real: "Touched down about 17:30 UTC on 6 March 2025. The lander came to rest on its side inside a crater about 250 m from its target (NASA's figure: more than 400 m), could not recharge, and the mission ended the next day.",
    sources: [
      ["Spaceflight Now, 7 Mar 2025", "https://spaceflightnow.com/2025/03/07/intuitive-machines-im-2-mission-ends-with-lander-on-its-side-on-the-moon/"],
      ["SpacePolicyOnline", "https://spacepolicyonline.com/news/im-2-mission-ends-one-day-after-lunar-landing/"],
    ],
  },
  {
    id: "bg1", site: "bg1", t0: "2025-03-02T09:00:00Z", days: 14, touchdown: "2025-03-02T08:34:00Z", proof: true,
    name: "BLUE GHOST 1", when: "2 MAR 2025", where: "MARE CRISIUM", who: "USA · FIREFLY AEROSPACE, NASA CLPS",
    landed: "08:34 UTC", end: { t: "2025-03-16T23:15:00Z", text: "LAST DATA 16 MAR 2025, ABOUT 23:15 UTC" },
    strip: "14 DAYS OF WORK, AN ECLIPSE, THEN QUIET AFTER SUNSET",
    real: "Landed 08:34 UTC on 2 March 2025 for NASA's CLPS program. Firefly counts 346 hours of daylight operations and just over 5 hours into the lunar night; the last data arrived about 23:15 UTC on 16 March. On 14 March the lander photographed Earth covering the Sun: first picture about 05:30 UTC as the eclipse began, Sun fully hidden from about 06:18 UTC, over about 09:52 UTC.",
    sources: [
      ["Firefly Aerospace", "https://fireflyspace.com/missions/blue-ghost-mission-1/"],
      ["Eclipse (FOX 7 Austin)", "https://www.fox7austin.com/news/blue-ghost-lander-eclipse-from-moon"],
      ["Site (LROC)", "https://lroc.im-ldi.com/images/1400"],
    ],
  },
  {
    // Designed for one lunar day (about 14 Earth days); it landed with about 12 days of that daylight left.
    id: "ch3", site: "ch3", t0: "2023-08-23T13:00:00Z", days: 10, proof: true,
    name: "CHANDRAYAAN-3", when: "23 AUG 2023", where: "SHIV SHAKTI POINT", who: "INDIA · ISRO",
    landed: "ABOUT 12:34 UTC", end: { t: "2023-09-04T02:30:00Z", text: "LANDER PUT TO SLEEP 4 SEP 2023, ABOUT 02:30 UTC" },
    strip: "PUT TO SLEEP ON 4 SEP 2023, JUST AHEAD OF THE LUNAR NIGHT",
    real: "Landed 23 August 2023 at about 18:04 India time (12:34 UTC), built to work for one lunar day (about 14 Earth days). ISRO put the lander into sleep mode about 08:00 India time on 4 September 2023 (02:30 UTC), ahead of the lunar night, and hoped it would wake around 22 September 2023.",
    sources: [
      ["News On AIR (India)", "https://www.newsonair.gov.in/vikram-lander-of-chandrayan-3-put-into-sleep-mode-hopes-for-its-awakening-on-22nd-september-isro"],
      ["The Planetary Society", "https://planetary.org/space-missions/chandrayaan-3"],
    ],
  },
  {
    id: "slim", site: "slim", t0: "2024-01-19T15:00:00Z", days: 10,
    name: "SLIM", when: "19 JAN 2024", where: "SHIOLI CRATER", who: "JAPAN · JAXA",
    landed: "15:20 UTC", end: { t: "2024-01-31T12:00:00Z", text: "DORMANT FROM ABOUT 31 JAN 2024, AS THE SUN SET" },
    marks: [{ t: "2024-01-19T18:00:00Z", text: "SWITCHED OFF ABOUT 18:00 UTC, BATTERY AT 12%" }, { t: "2024-01-28T12:00:00Z", text: "CONTACT AND POWER BACK ON 28 JAN 2024" }],
    strip: "IT LANDED NOSE-DOWN WITH ITS SOLAR CELLS FACING WEST, AND WOKE 9 DAYS LATER",
    real: "Landed 19 January 2024 at 15:20 UTC, about 55 m from its target, but upside-down, with its solar cells facing west. JAXA switched it off at about 18:00 UTC with the battery at 12%. Contact and power came back on 28 January, after the direction of the sunlight changed; it went dormant as the Sun set around 31 January. The last contact was on 28 April 2024.",
    sources: [
      ["SpacePolicyOnline", "https://spacepolicyonline.com/news/farewell-slim"],
      ["Scientific American", "https://www.scientificamerican.com/article/japans-slim-mission-is-revived-on-the-moon"],
      ["Site (LROC)", "https://www.lroc.asu.edu/images/1358"],
    ],
  },
  {
    id: "im1", site: "im1", t0: "2024-02-22T23:00:00Z", days: 7,
    name: "IM-1 ODYSSEUS", when: "22 FEB 2024", where: "MALAPERT A, NEAR THE SOUTH POLE", who: "USA · INTUITIVE MACHINES, NASA CLPS",
    landed: "23:23 UTC", end: { t: "2024-02-29T12:00:00Z", text: "LAST CONTACT 29 FEB 2024, AS NIGHT CAME ON", dayOnly: true },
    strip: "IT TIPPED OVER ON LANDING AND STILL WORKED FOR ABOUT 7 DAYS",
    real: "Landed 22 February 2024 at 23:23 UTC, the first US landing since Apollo 17, and tipped over on touchdown. Its payloads were designed to run for up to seven days before the lunar night. Intuitive Machines ended the mission on 29 February 2024 as the night came on.",
    sources: [
      ["Intuitive Machines: Farewell Odysseus", "https://www.intuitivemachines.com/post/im-1-lunar-night-update-farewell-odysseus"],
      ["Universe Today", "https://www.universetoday.com/articles/lunar-night-permanently-ends-the-odysseus-mission"],
    ],
  },
  {
    // The far side never sees Earth, so the mission talked through the Queqiao-2 relay satellite: no direct link is asked for.
    id: "ce6", site: "ce6", t0: "2024-06-01T22:00:00Z", days: 3, needs: { earthAtLanding: false },
    name: "CHANG'E 6", when: "1 JUN 2024", where: "APOLLO BASIN, FAR SIDE", who: "CHINA · CNSA",
    landed: "22:23 UTC", end: { t: "2024-06-03T23:38:00Z", text: "LEFT WITH ITS SAMPLES 3 JUN 2024, ABOUT 23:38 UTC" },
    strip: "THE FIRST SAMPLES FROM THE FAR SIDE: IT LEFT AFTER 2 DAYS, TALKING THROUGH A RELAY SATELLITE",
    real: "Landed 1 June 2024 at 22:23 UTC in the Apollo basin on the far side, where Earth is never in the sky, so it talked to Earth through the Queqiao-2 relay satellite. It collected the first samples from the far side and its ascent stage lifted off about two days later, on 3 June.",
    sources: [
      ["collectSPACE", "https://www.collectspace.com/news/news-060124a-china-chang'e-6-moon-far-side-sample-landing.html"],
      ["SpaceNews", "https://spacenews.com/change-6-lands-on-far-side-of-the-moon-to-collect-unique-lunar-samples"],
    ],
  },
];

// The scene LUNI opens on when the address does not say otherwise: a real landing, on its real date.
export const OPENING = STORIES[0];

export const storyAt = (site, t0) => STORIES.find((s) => s.site === site.id && +new Date(s.t0) === +t0) || null;
