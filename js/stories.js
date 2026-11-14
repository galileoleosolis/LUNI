// Real landings that LUNI can replay, and what really happened there.
// Every "real" statement below comes from the linked source. Nothing in this file is computed: LUNI's side of each
// comparison is worked out live from its NASA data when the proof panel opens (js/ui-proof.js).
// Times given by the sources in US Central or India time are converted to UTC here (CST = UTC-6, CDT = UTC-5,
// India = UTC+5:30).

export const STORIES = [
  {
    id: "im2", site: "im2", t0: "2025-03-06T17:00:00Z", days: 10,
    name: "IM-2 ATHENA", when: "6 MAR 2025", where: "MONS MOUTON, NEAR THE SOUTH POLE",
    // one short line for the strip above the answer while LUNI stands on this landing
    strip: "IT ENDED ON ITS SIDE IN A CRATER, ABOUT 250 M OFF TARGET",
    real: "Touched down about 17:30 UTC on 6 March 2025. The lander came to rest on its side inside a crater about 250 m from its target (NASA's figure: more than 400 m), could not recharge, and the mission ended the next day.",
    sources: [
      ["Spaceflight Now, 7 Mar 2025", "https://spaceflightnow.com/2025/03/07/intuitive-machines-im-2-mission-ends-with-lander-on-its-side-on-the-moon/"],
      ["SpacePolicyOnline", "https://spacepolicyonline.com/news/im-2-mission-ends-one-day-after-lunar-landing/"],
    ],
  },
  {
    id: "bg1", site: "bg1", t0: "2025-03-02T09:00:00Z", days: 14, touchdown: "2025-03-02T08:34:00Z",
    name: "BLUE GHOST 1", when: "2 MAR 2025", where: "MARE CRISIUM",
    strip: "14 DAYS OF WORK, AN ECLIPSE, THEN QUIET AFTER SUNSET",
    real: "Landed 08:34 UTC on 2 March 2025 for NASA's CLPS program. Firefly counts 346 hours of daylight operations and just over 5 hours into the lunar night; the last data arrived about 23:15 UTC on 16 March. On 14 March the lander photographed Earth covering the Sun: first picture about 05:30 UTC as the eclipse began, Sun fully hidden from about 06:18 UTC, over about 09:52 UTC.",
    sources: [
      ["Firefly Aerospace, mission page", "https://fireflyspace.com/missions/blue-ghost-mission-1/"],
      ["Eclipse pictures and times (FOX 7 Austin)", "https://www.fox7austin.com/news/blue-ghost-lander-eclipse-from-moon"],
      ["Landing site (LROC)", "https://lroc.im-ldi.com/images/1400"],
    ],
  },
  {
    id: "ch3", site: "ch3", t0: "2023-08-23T13:00:00Z", days: 10,
    name: "CHANDRAYAAN-3", when: "23 AUG 2023", where: "SHIV SHAKTI POINT",
    strip: "PUT TO SLEEP ON 4 SEP 2023, JUST AHEAD OF THE LUNAR NIGHT",
    real: "Landed 23 August 2023. ISRO put the lander into sleep mode about 08:00 India time on 4 September 2023 (02:30 UTC), ahead of the lunar night, and hoped it would wake around 22 September 2023.",
    sources: [
      ["News On AIR (India's public broadcaster)", "https://www.newsonair.gov.in/vikram-lander-of-chandrayan-3-put-into-sleep-mode-hopes-for-its-awakening-on-22nd-september-isro"],
    ],
  },
];

// The scene LUNI opens on when the address does not say otherwise: a real landing, on its real date.
export const OPENING = STORIES[0];

export const storyAt = (site, t0) => STORIES.find((s) => s.site === site.id && +new Date(s.t0) === +t0) || null;
