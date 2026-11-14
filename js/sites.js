// Preset landing sites.
// lat: degrees (south negative). lon: degrees east (west negative).
// `approx: true` = rough regional point that still needs an official source.
// Verified rows come from the team's research table (sources linked in `src`).
export const SITES = [
  // --- South pole: Artemis III candidate regions ---
  { id: "nobile1",   name: "Nobile Rim 1",          tag: "ARTEMIS III",  group: "South pole — Artemis III candidates", lat: -85.45,  lon: 36.36,  approx: true,
    src: "https://www.astronomy.com/space-exploration/here-are-the-nine-sites-where-artemis-3-might-land-on-the-moon/" },
  { id: "malapert",  name: "Malapert Massif",       tag: "ARTEMIS III",  group: "South pole — Artemis III candidates", lat: -86.0,   lon: 0.0,    approx: true },
  { id: "haworth",   name: "Haworth",               tag: "ARTEMIS III",  group: "South pole — Artemis III candidates", lat: -87.0,   lon: -5.0,   approx: true },
  { id: "shackleton",name: "Shackleton rim",        tag: "SOUTH POLE",   group: "South pole — Artemis III candidates", lat: -89.45,  lon: -138.0, approx: true },

  // --- South pole region: landed missions ---
  { id: "im2",  name: "IM-2 Athena · Mons Mouton",  tag: "USA 2025",   group: "South polar landings", lat: -84.7906, lon: 29.1957,
    src: "https://en.wikipedia.org/wiki/IM-2" },
  { id: "im1",  name: "IM-1 Odysseus · Malapert A", tag: "USA 2024",   group: "South polar landings", lat: -80.13,   lon: 1.44,
    src: "https://www.hou.usra.edu/meetings/lpsc2025/pdf/2262.pdf" },
  { id: "ch3",  name: "Chandrayaan-3 · Shiv Shakti",tag: "INDIA 2023", group: "South polar landings", lat: -69.373,  lon: 32.319,
    src: "https://planetarynames.wr.usgs.gov/Feature/16272" },

  // --- Reference sites elsewhere ---
  { id: "ce6",      name: "Chang'e 6 · Apollo basin",   tag: "CHINA 2024", group: "Reference sites", lat: -41.6385, lon: -153.9852,
    src: "https://en.wikipedia.org/wiki/Chang%27e_6" },
  { id: "ce4",      name: "Chang'e 4 · Von Kármán",     tag: "CHINA 2019", group: "Reference sites", lat: -45.4446, lon: 177.5991,
    src: "https://en.wikipedia.org/wiki/Chang%27e_4" },
  { id: "apollo11", name: "Apollo 11 · Tranquility",    tag: "USA 1969",   group: "Reference sites", lat: 0.6741,   lon: 23.4731,
    src: "https://lroc.im-ldi.com/visit/exhibits/1/gallery/8" },
  { id: "apollo15", name: "Apollo 15 · Hadley",         tag: "USA 1971",   group: "Reference sites", lat: 26.1322,  lon: 3.634,
    src: "https://apollojournals.org/alsj/alsjcoords.html" },
  { id: "apollo17", name: "Apollo 17 · Taurus-Littrow", tag: "USA 1972",   group: "Reference sites", lat: 20.1881,  lon: 30.7748,
    src: "https://apollojournals.org/alsj/alsjcoords.html" },
];

export const CUSTOM_ID = "custom";
