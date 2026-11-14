// LUNO data provider.
//
// getScenario(site, startDate) returns everything the UI needs:
//   {
//     horizon: Float32Array(360)  terrain elevation (deg) for azimuth 0..359 (0 = north, 90 = east)
//     samples: [{ t: Date, sunAz, sunEl, earthAz, earthEl, sunUp, earthUp }]  hourly, 30 days
//   }
//
// THIS FILE IS A PLACEHOLDER. Geometry is a simple analytic model (no SPICE yet) and the
// terrain is seeded random noise (no LOLA yet). The interface stays the same when the real
// data replaces it, so the UI does not need to change.

export const STEP_HOURS = 1;
export const SPAN_DAYS = 30;
export const IS_DEMO = true;

const DEG = Math.PI / 180;
const SYNODIC = 29.530589;   // days, Sun returns to same place in lunar sky
const LIB_LAT_P = 27.2122;   // days, libration in latitude (draconic)
const LIB_LON_P = 27.5546;   // days, libration in longitude (anomalistic)
const J2000 = Date.UTC(2000, 0, 1, 12);

function days(t) { return (t - J2000) / 86400000; }
const D_REF = days(Date.UTC(2026, 10, 24)); // placeholder phase anchor (Horizons: Earth highest at 89.5°S ~24 Nov 2026)

// Local horizontal coordinates of a body at declination dec and hour angle H (radians)
// for an observer at latitude lat (radians). Azimuth: 0 = north, 90 = east.
function altAz(lat, dec, H) {
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const az = Math.atan2(-Math.cos(dec) * Math.sin(H),
                        Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.cos(H) * Math.sin(lat));
  return { el: el / DEG, az: ((az / DEG) % 360 + 360) % 360 };
}

function placeholderSun(d, lat, lon) {
  // Sub-solar point: latitude wobbles ±1.54° over a year; longitude sweeps once per synodic month.
  // Phase tuned so late Nov 2026 has the Sun north-of-pole-negative (south pole lit), matching Horizons.
  const subLat = -1.54 * Math.cos(2 * Math.PI * (d - D_REF) / 346.6) * DEG;
  const subLon = (-360 * d / SYNODIC + 180) * DEG;
  return altAz(lat, subLat, lon - subLon);
}

function placeholderEarth(d, lat, lon) {
  // Sub-Earth point wanders around (0,0) because of libration.
  const subLat = -6.7 * Math.cos(2 * Math.PI * (d - D_REF) / LIB_LAT_P) * DEG;
  const subLon = 7.9 * Math.sin(2 * Math.PI * d / LIB_LON_P) * DEG;
  return altAz(lat, subLat, lon - subLon);
}

// Deterministic pseudo-random terrain horizon per site.
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function placeholderHorizon(latDeg, lonDeg) {
  const seed = Math.round((latDeg + 90) * 1000) * 7919 + Math.round((lonDeg + 360) * 1000);
  const rnd = seededRandom(seed);
  const polar = Math.min(1, Math.max(0, (Math.abs(latDeg) - 60) / 30)); // rougher near poles
  const amp = 0.4 + 2.2 * polar;
  const waves = Array.from({ length: 7 }, (_, i) => ({
    k: i + 1 + Math.floor(rnd() * 3), ph: rnd() * 2 * Math.PI, a: amp * (0.6 + rnd()) / (i + 1),
  }));
  const h = new Float32Array(360);
  for (let az = 0; az < 360; az++) {
    let v = 0.2;
    for (const w of waves) v += w.a * Math.sin(w.k * az * DEG + w.ph);
    h[az] = Math.max(-0.5, v);
  }
  return h;
}

export function horizonAt(horizon, az) {
  const i = Math.floor(az) % 360, j = (i + 1) % 360, f = az - Math.floor(az);
  return horizon[i] * (1 - f) + horizon[j] * f;
}

export function getScenario(site, startDate) {
  const lat = site.lat * DEG, lon = site.lon * DEG;
  const horizon = placeholderHorizon(site.lat, site.lon);
  const n = Math.round(SPAN_DAYS * 24 / STEP_HOURS);
  const samples = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = new Date(startDate.getTime() + i * STEP_HOURS * 3600000);
    const d = days(t);
    const s = placeholderSun(d, lat, lon);
    const e = placeholderEarth(d, lat, lon);
    samples[i] = {
      t,
      sunAz: s.az, sunEl: s.el, earthAz: e.az, earthEl: e.el,
      sunUp: s.el > horizonAt(horizon, s.az),
      earthUp: e.el > horizonAt(horizon, e.az),
    };
  }
  return { horizon, samples };
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
  return {
    pctSun: sun / n, pctEarth: earth / n, pctBoth: both / n,
    maxDarkHours: maxDark * STEP_HOURS,
  };
}

// Hours from sample i until `key` flips. Returns null if it doesn't flip within the span.
export function hoursUntilChange(samples, i, key) {
  const now = samples[i][key];
  for (let j = i + 1; j < samples.length; j++) {
    if (samples[j][key] !== now) return (j - i) * STEP_HOURS;
  }
  return null;
}
