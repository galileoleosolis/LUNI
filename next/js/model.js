// LUNI data provider: real geometry (NASA SPICE) + real terrain horizons (LRO LOLA).
//
// getScenario(site, startDate) returns everything the UI needs:
//   {
//     horizon: Float32Array   terrain skyline elevation (deg), evenly spaced in azimuth from 0 (north) clockwise
//     terrain: { real, heightM, slopeDeg, slopeBaseM, maps, mastM, min, max }
//     samples: [{ t, sunAz, sunEl, earthAz, earthEl, sunUp, earthUp }]   hourly, 30 days
//   }
import { loadEphemeris, siteFrame, sunEarthAltAz, eclipseCover, eclipsesBetween, coverage, inCoverage, MOON_RADIUS_KM, SUN_RADIUS_DEG } from "./ephem.js";
export { subPoints, coverage, inCoverage } from "./ephem.js";

export const STEP_HOURS = 1;
export const SPAN_DAYS = 30;
const FLAT = new Float32Array(360);
const MAP_RES = { ldem_80s_40m: "40 M", ldem_60s_240m: "240 M", ldem_16: "1.9 KM" };   // LOLA map -> pixel size
let HORIZONS = {};

export async function initModel(base = "data/") {
  const [, hz] = await Promise.all([loadEphemeris(base), fetch(base + "horizons.json").then((r) => r.json())]);
  setHorizons(hz);
}
export function setHorizons(hz) {
  HORIZONS = {};
  for (const [id, h] of Object.entries(hz)) {
    if (id.startsWith("_")) continue;
    HORIZONS[id] = { ...h, el: Float32Array.from(h.el_cdeg, (v) => v / 100) };
  }
}

// Terrain computed in the browser for custom points (see terrain.js), keyed by position.
const CUSTOM = new Map();
const key = (site) => `${site.lat},${site.lon}`;
export function setCustomTerrain(site, terrain) { CUSTOM.set(key(site), terrain); }
export function hasTerrain(site) { return terrainFor(site).real; }

// Terrain for a site: the precomputed full-resolution LOLA skyline for presets, the in-browser one for
// custom points once it is ready, and a flat horizon until then.
export function terrainFor(site) {
  const h = HORIZONS[site.id];
  if (h && Math.abs(h.lat - site.lat) < 1e-6 && Math.abs(h.lon - site.lon) < 1e-6) {
    let min = Infinity, max = -Infinity;
    for (const v of h.el) { if (v < min) min = v; if (v > max) max = v; }
    return { real: true, horizon: h.el, heightM: h.height_m, slopeDeg: h.slope_deg, slopeBaseM: h.slope_baseline_m,
             mastM: h.mast_m, maps: [h.near_map, h.far_map].filter(Boolean).map((m) => MAP_RES[m] || m), min, max };
  }
  if (CUSTOM.has(key(site))) return CUSTOM.get(key(site));
  return { real: false, horizon: FLAT, heightM: 0, slopeDeg: null, mastM: 0, maps: [], min: 0, max: 0 };
}

// Skyline elevation (deg) at any azimuth, linearly interpolated.
export function horizonAt(horizon, az) {
  const n = horizon.length, f = (((az % 360) + 360) % 360) * n / 360;
  const i = Math.floor(f) % n, j = (i + 1) % n, k = f - Math.floor(f);
  return horizon[i] * (1 - k) + horizon[j] * k;
}

// Share of a disc above a straight skyline, where d = (height of the disc's center above the skyline) / (disc radius).
export function discAbove(d) {
  if (d >= 1) return 1;
  if (d <= -1) return 0;
  return 0.5 + (d * Math.sqrt(1 - d * d) + Math.asin(d)) / Math.PI;
}

// Eclipses at a site between two times (Earth in front of the Sun), using the site's real height.
export function siteEclipses(site, t0, t1, terrain = terrainFor(site)) {
  return eclipsesBetween(siteFrame(site.lat, site.lon, MOON_RADIUS_KM + (terrain.heightM + terrain.mastM) / 1000), t0, t1);
}

// Hourly Sun/Earth samples for a site over `hours`, judged against its terrain skyline.
// A site's own long-term numbers, from its own skyline: the share of all the years covered in which the Sun's center
// (and the Earth's) stands above the skyline, checked every 6 hours like the map layers, and whether any part of the
// Sun's disc ever shows. Kept per site: about 19,000 moments.
const YEARS = new Map();
export function siteYears(site, terrain = terrainFor(site), stepHours = 6) {
  const k = key(site) + "|" + stepHours;
  if (YEARS.has(k)) return YEARS.get(k);
  const cov = coverage(), frame = siteFrame(site.lat, site.lon, MOON_RADIUS_KM + (terrain.heightM + terrain.mastM) / 1000);
  const t0 = +cov.start, step = stepHours * 3600000, n = Math.floor((cov.end - cov.start) / step);
  let sun = 0, earth = 0, anySun = 0;
  for (let i = 0; i < n; i++) {
    const v = sunEarthAltAz(frame, t0 + i * step), hs = horizonAt(terrain.horizon, v.sunAz);
    if (v.sunEl > hs) sun++;
    if (v.sunEl + SUN_RADIUS_DEG > hs) anySun++;
    if (v.earthEl > horizonAt(terrain.horizon, v.earthAz)) earth++;
  }
  const out = { sun: sun / n * 100, earth: earth / n * 100, everSun: anySun > 0, moments: n };
  YEARS.set(k, out); return out;
}

export function sampleSite(site, startDate, hours, terrain = terrainFor(site)) {
  const horizon = terrain.horizon;
  const frame = siteFrame(site.lat, site.lon, MOON_RADIUS_KM + (terrain.heightM + terrain.mastM) / 1000);
  const n = Math.round(hours / STEP_HOURS), t0 = +startDate;
  const samples = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = new Date(t0 + i * STEP_HOURS * 3600000);
    const s = sunEarthAltAz(frame, t);
    s.t = t;
    // How much of the Sun's disc is usable: the part above the skyline, less any part hidden behind the Earth.
    s.eclipse = s.sepDeg < 1.5 ? eclipseCover(s.sepDeg, s.earthRadDeg) : 0;
    s.sunTerrain = discAbove((s.sunEl - horizonAt(horizon, s.sunAz)) / SUN_RADIUS_DEG);
    s.sunFrac = s.sunTerrain * (1 - s.eclipse);
    s.sunUp = s.sunFrac >= 0.5;                             // at least half the Sun available
    s.earthUp = s.earthEl > horizonAt(horizon, s.earthAz);
    samples[i] = s;
  }
  return samples;
}

export function getScenario(site, startDate) {
  const terrain = terrainFor(site);
  return { horizon: terrain.horizon, terrain, samples: sampleSite(site, startDate, SPAN_DAYS * 24, terrain) };
}

// Summary statistics over the whole span.
export function summarize(samples) {
  let sun = 0, earth = 0, both = 0, run = 0, maxDark = 0;
  for (const s of samples) {
    if (s.sunUp) sun++;
    if (s.earthUp) earth++;
    if (s.sunUp && s.earthUp) both++;
    run = s.sunUp ? 0 : run + 1;
    maxDark = Math.max(maxDark, run);
  }
  const n = samples.length;
  return { pctSun: sun / n, pctEarth: earth / n, pctBoth: both / n, maxDarkHours: maxDark * STEP_HOURS };
}

// Hours from sample i until `key` flips. Returns null if it doesn't flip within the span.
export function hoursUntilChange(samples, i, key) {
  const now = samples[i][key];
  for (let j = i + 1; j < samples.length; j++) if (samples[j][key] !== now) return (j - i) * STEP_HOURS;
  return null;
}
