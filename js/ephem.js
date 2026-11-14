// Sun and Earth geometry from NASA SPICE (see tools/build_ephemeris.py).
// data/ephem.bin holds, every 2 hours, the Sun direction and Earth position in the Moon-fixed
// MOON_ME frame. Here we interpolate it and convert to azimuth/elevation for a surface site.

import { fetchBytes } from "./bin.js";

const DEG = Math.PI / 180;
export const MOON_RADIUS_KM = 1737.4;
let E = null;

export function initEphemeris(buffer, meta) {
  E = { t0: Date.parse(meta.start_utc), step: meta.step_hours * 3600000, n: meta.count, a: new Float32Array(buffer), meta };
  return E;
}

export async function loadEphemeris(base = "data/") {
  const [meta, buf] = await Promise.all([
    fetch(base + "ephem.json").then((r) => r.json()),
    fetchBytes(base + "ephem.bin"),
  ]);
  return initEphemeris(buf, meta);
}

export function coverage() {
  return { start: new Date(E.t0), end: new Date(E.t0 + (E.n - 1) * E.step) };
}
export function inCoverage(t) {
  const ms = +t; return ms >= E.t0 && ms <= E.t0 + (E.n - 1) * E.step;
}

// Interpolated [sunX, sunY, sunZ (unit), earthX, earthY, earthZ (km)] at time t (ms or Date).
function sample(t, out) {
  let f = (+t - E.t0) / E.step;
  f = Math.max(0, Math.min(E.n - 1.000001, f));
  const i = Math.floor(f), k = f - i, a = E.a, p = i * 6, q = p + 6;
  for (let j = 0; j < 6; j++) out[j] = a[p + j] * (1 - k) + a[q + j] * k;
  const m = Math.hypot(out[0], out[1], out[2]);
  out[0] /= m; out[1] /= m; out[2] /= m;
  return out;
}

// Local east / north / up unit vectors at a site (planetocentric lat, east lon; the Moon is treated as a sphere).
export function siteFrame(latDeg, lonDeg, radiusKm = MOON_RADIUS_KM) {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  const cl = Math.cos(la), sl = Math.sin(la), co = Math.cos(lo), so = Math.sin(lo);
  return {
    up: [cl * co, cl * so, sl], east: [-so, co, 0], north: [-sl * co, -sl * so, cl],
    pos: [radiusKm * cl * co, radiusKm * cl * so, radiusKm * sl],
  };
}

const dot = (a, b0, b1, b2) => a[0] * b0 + a[1] * b1 + a[2] * b2;
const tmp = new Float64Array(6);

// Azimuth (deg clockwise from north) and elevation (deg above the local horizontal) of Sun and Earth.
export function sunEarthAltAz(frame, t) {
  const s = sample(t, tmp);
  // Sun: parallax across the Moon's radius is under 0.001 degrees, so the center direction is used.
  const sunEl = Math.asin(dot(frame.up, s[0], s[1], s[2])) / DEG;
  const sunAz = Math.atan2(dot(frame.east, s[0], s[1], s[2]), dot(frame.north, s[0], s[1], s[2])) / DEG;
  // Earth: subtract the site position (parallax is up to about 0.26 degrees).
  const ex = s[3] - frame.pos[0], ey = s[4] - frame.pos[1], ez = s[5] - frame.pos[2], r = Math.hypot(ex, ey, ez);
  const earthEl = Math.asin(dot(frame.up, ex, ey, ez) / r) / DEG;
  const earthAz = Math.atan2(dot(frame.east, ex, ey, ez), dot(frame.north, ex, ey, ez)) / DEG;
  return { sunAz: (sunAz + 360) % 360, sunEl, earthAz: (earthAz + 360) % 360, earthEl, earthDistKm: r };
}

// Points on the Moon where the Sun / Earth are straight overhead (deg).
export function subPoints(t) {
  const s = sample(t, tmp);
  const er = Math.hypot(s[3], s[4], s[5]);
  return {
    sun: { lat: Math.asin(s[2]) / DEG, lon: Math.atan2(s[1], s[0]) / DEG },
    earth: { lat: Math.asin(s[5] / er) / DEG, lon: Math.atan2(s[4], s[3]) / DEG },
  };
}
