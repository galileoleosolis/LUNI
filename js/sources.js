// The NASA DATA USED band: whenever LUNI calculates or shows something, a bright band slides over the screen's top
// line (site · landing · mission clock, which is also shown elsewhere) and names the NASA data it came from, then
// slides away. One place, every screen. showData("verdict") or showData([["WHAT", "SOURCE"], ...]).
const SETS = {
  verdict: [["SUN + EARTH POSITIONS", "NASA NAIF SPICE (DE440)"], ["SKYLINE AT THE SITE", "NASA LRO LOLA ELEVATION"]],
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
const HOLD_MS = 6500;

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
  band.innerHTML = `<b>NASA DATA USED</b>` + rows.map(([k, v]) => `<span><i>${k}</i> ${v}</span>`).join("");
  band.hidden = true; void band.offsetWidth; band.hidden = false;      // restart the slide-in if one is already showing
  band.style.animationDuration = HOLD_MS + "ms";
  clearTimeout(timer); timer = setTimeout(() => { band.hidden = true; }, HOLD_MS);
}
