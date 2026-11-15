// The NASA DATA USED band: whenever LUNI calculates or shows something, a bright band slides over the screen's top
// line (site · landing · mission clock, which is also shown elsewhere) and names the NASA data it came from, then
// slides away. One place, every screen. showData("verdict") or showData([["WHAT", "SOURCE"], ...]).
const SETS = {
  verdict: [["SUN + EARTH POSITIONS", "NASA NAIF SPICE (DE440)"], ["SKYLINE AT THE SITE", "NASA LRO LOLA ELEVATION"]],
  compare: [["BOTH PLANS, SUN + EARTH", "NASA NAIF SPICE (DE440)"], ["BOTH SKYLINES", "NASA LRO LOLA ELEVATION"]],
  energy: [["SUNLIGHT STRENGTH AT THE MOON", "NASA: 1,361 W PER SQUARE METER"], ["HOURS OF SUN", "NASA NAIF SPICE + NASA LRO LOLA"]],
  panels: [["SUNLIGHT ON EVERY SQUARE", "NASA NAIF SPICE (DE440) + NASA LRO LOLA"]],
  finder: [["TERRAIN OF EVERY SQUARE", "NASA LRO LOLA ELEVATION"], ["SUN + EARTH", "NASA NAIF SPICE (DE440)"]],
  history: [["LUNI'S NUMBERS", "NASA NAIF SPICE + NASA LRO LOLA"], ["MISSION RECORDS", "THE SOURCES LISTED FOR EACH LANDING"]],
  surface: [["THE GROUND", "NASA LRO LOLA ELEVATION (40 M NEAR THE POLAR SITES)"], ["SUN + EARTH", "NASA NAIF SPICE (DE440)"]],
  proof: [["CHECKED AGAINST", "NASA JPL HORIZONS · NASA LRO LOLA POLAR MAPS · REAL LANDINGS"]],
  layers: {
    none: [["THE MOON PICTURE", "NASA LRO WIDE ANGLE CAMERA MOSAIC"]],
    elev: [["ELEVATION", "NASA LRO LOLA LASER ALTIMETER"]], slope: [["SLOPE, FROM ELEVATION", "NASA LRO LOLA LASER ALTIMETER"]],
    sun: [["SUN POSITIONS", "NASA NAIF SPICE (DE440)"], ["TERRAIN", "NASA LRO LOLA"]], earth: [["EARTH POSITIONS", "NASA NAIF SPICE (DE440)"], ["TERRAIN", "NASA LRO LOLA"]],
    shadow: [["SUN POSITIONS", "NASA NAIF SPICE (DE440)"], ["TERRAIN", "NASA LRO LOLA"]],
    temp: [["TEMPERATURE", "NASA LRO DIVINER RADIOMETER"]], ice: [["WATER ICE DEPTH", "NASA LRO DIVINER POLAR RESOURCE PRODUCT"]],
    mix: [["YOUR MIX OF", "NASA SPICE · NASA LRO LOLA · NASA LRO DIVINER"]],
  },
};
let band = null, timer = 0;
const HOLD_MS = 14000;
// Where each source lives, so the band can link to it. Matched by a word in the source's name.
const LINKS = [[/HORIZONS/, "https://ssd.jpl.nasa.gov/horizons/"], [/SPICE/, "https://naif.jpl.nasa.gov/naif/data_generic.html"], [/DIVINER/, "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/"],
  [/LOLA/, "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/"], [/WIDE ANGLE/, "https://trek.nasa.gov/moon/"], [/1,361/, "https://lasp.colorado.edu/sorce/instruments/tim/science/"]];
const linked = (v) => { const hit = LINKS.find(([re]) => re.test(v)); return hit ? `<a href="${hit[1]}" target="_blank" rel="noopener" title="Opens the NASA source in a new tab"><u>${v}</u> ↗</a>` : `<u>${v}</u>`; };

export function initSources() {
  const bar = document.querySelector("header.bar"); if (!bar || band) return;
  band = document.createElement("div"); band.className = "data-band"; band.hidden = true; band.setAttribute("role", "status"); band.setAttribute("aria-live", "polite");
  bar.appendChild(band);
}
// what: a key of SETS, "layer:<id>", or rows [[what, source], ...]. extra: one more row (e.g. a reduced-map note).
export function showData(what, extra = null) {
  if (!band) return;
  let rows = Array.isArray(what) ? what : what.startsWith("layer:") ? SETS.layers[what.slice(6)] || SETS.layers.none : SETS[what];
  if (!rows) return;
  if (extra) rows = [...rows, extra];
  // White with a red tag: on purpose not the unit's own blue, so it cannot blend into the screen behind it.
  band.innerHTML = `<b>NASA DATA USED</b>` + rows.map(([k, v]) => `<span><i>${k}</i> ${linked(v)}</span>`).join("");
  band.hidden = true; void band.offsetWidth; band.hidden = false;      // restart the slide-in if one is already showing
  clearTimeout(timer); timer = setTimeout(() => { band.hidden = true; }, HOLD_MS);
}
