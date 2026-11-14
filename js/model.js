// LUNO data provider: real geometry (NASA SPICE) + real terrain horizons (LRO LOLA).
//
// getScenario(site, startDate) returns everything the UI needs:
//   {
//     horizon: Float32Array   terrain skyline elevation (deg), evenly spaced in azimuth from 0 (north) clockwise
//     terrain: { real, heightM, slopeDeg, slopeBaseM, maps, mastM, min, max }
//     samples: [{ t, sunAz, sunEl, earthAz, earthEl, sunUp, earthUp }]   hourly, 30 days
//   }
import { loadEphemeris, siteFrame, sunEarthAltAz, coverage, inCoverage, MOON_RADIUS_KM } from "./ephem.js";
export { subPoints, coverage, inCoverage } from "./ephem.js";

export const STEP_HOURS = 1;
export const SPAN_DAYS = 30;
const FLAT = new Float32Array(360);
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

// Terrain for a site: the precomputed LOLA skyline for presets, a flat horizon otherwise.
export function terrainFor(site) {
  const h = HORIZONS[site.id];
  if (h && Math.abs(h.lat - site.lat) < 1e-6 && Math.abs(h.lon - site.lon) < 1e-6) {
    let min = Infinity, max = -Infinity;
    for (const v of h.el) { if (v < min) min = v; if (v > max) max = v; }
    return { real: true, horizon: h.el, heightM: h.height_m, slopeDeg: h.slope_deg, slopeBaseM: h.slope_baseline_m,
             mastM: h.mast_m, maps: [h.near_map, h.far_map].filter(Boolean), min, max };
  }
  return { real: false, horizon: FLAT, heightM: 0, slopeDeg: null, mastM: 0, maps: [], min: 0, max: 0 };
}

// Skyline elevation (deg) at any azimuth, linearly interpolated.
export function horizonAt(horizon, az) {
  const n = horizon.length, f = (((az % 360) + 360) % 360) * n / 360;
  const i = Math.floor(f) % n, j = (i + 1) % n, k = f - Math.floor(f);
  return horizon[i] * (1 - k) + horizon[j] * k;
}

export function getScenario(site, startDate) {
  const terrain = terrainFor(site), horizon = terrain.horizon;
  const frame = siteFrame(site.lat, site.lon, MOON_RADIUS_KM + (terrain.heightM + terrain.mastM) / 1000);
  const n = Math.round(SPAN_DAYS * 24 / STEP_HOURS);
  const samples = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = new Date(startDate.getTime() + i * STEP_HOURS * 3600000);
    const s = sunEarthAltAz(frame, t);
    s.t = t;
    s.sunUp = s.sunEl > horizonAt(horizon, s.sunAz);       // centre of the Sun's disc above the skyline
    s.earthUp = s.earthEl > horizonAt(horizon, s.earthAz);
    samples[i] = s;
  }
  return { horizon, terrain, samples };
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
