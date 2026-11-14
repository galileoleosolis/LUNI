// Terrain horizons for custom points, computed in the browser from reduced LRO LOLA elevation maps
// (data/dem, built by tools/build_web_dem.py). Same method as tools/lola.py, with coarser maps.

import { fetchBytes, gunzip } from "./bin.js";

const DEG = Math.PI / 180;
const R = 1737400;       // meters
export const MAST_M = 2;

let base = "data/dem/";
let index = null;
const grids = {};        // name -> Promise<grid>

class Grid {
  constructor(meta, data) { Object.assign(this, meta); this.data = data; }
  // Height in meters at fractional row/col, NaN outside the map.
  sample(r, c) {
    const { rows, cols, data } = this;
    let r0 = Math.floor(r), c0 = Math.floor(c), c1;
    const fr = r - r0, fc = c - c0;
    if (this.kind === "cylindrical") {
      r0 = Math.max(0, Math.min(rows - 2, r0));
      c0 = ((c0 % cols) + cols) % cols; c1 = (c0 + 1) % cols;
    } else {
      if (r0 < 0 || c0 < 0 || r0 >= rows - 1 || c0 >= cols - 1) return NaN;
      c1 = c0 + 1;
    }
    const a = r0 * cols, b = a + cols;
    return (data[a + c0] * (1 - fr) * (1 - fc) + data[a + c1] * (1 - fr) * fc + data[b + c0] * fr * (1 - fc) + data[b + c1] * fr * fc) * this.quant_m;
  }
  height(lat, lon) {
    if (this.kind === "cylindrical") return this.sample((90 - lat) * this.ppd - 0.5, ((lon % 360) + 360) % 360 * this.ppd - 0.5);
    // south polar stereographic; the pole sits at the grid center unless the map is a patch cut from elsewhere
    const r = 2 * R * Math.tan((90 + lat) * DEG / 2), pr = this.pole_row ?? (this.rows - 1) / 2, pc = this.pole_col ?? (this.cols - 1) / 2;
    return this.sample(pr - r * Math.cos(lon * DEG) / this.scale_m, pc + r * Math.sin(lon * DEG) / this.scale_m);
  }
  get res() { return this.kind === "cylindrical" ? R * DEG / this.ppd : this.scale_m; }
}

// Undo the row-wise delta encoding in place.
export function undelta(a, rows, cols) {
  for (let r = 0; r < rows; r++) { let p = r * cols; for (let c = 1; c < cols; c++) a[p + c] += a[p + c - 1]; }
  return a;
}
export function makeGrid(meta, int16) { return new Grid(meta, undelta(int16, meta.rows, meta.cols)); }
export function setIndex(ix, dir) { index = ix; if (dir) base = dir; }
export function putGrid(name, grid) { grids[name] = Promise.resolve(grid); }

async function loadGrid(name) {
  if (!index) index = await fetch(base + "index.json").then((r) => r.json());
  const meta = index[name];
  return makeGrid(meta, new Int16Array(await gunzip(await fetchBytes(base + meta.file))));
}
const grid = (name) => (grids[name] ||= loadGrid(name));
export const getGrid = grid;

// Detailed patch around a preset site (data/patch, built by tools/build_patches.py), or null if there is none.
let patchIndex = null;
const patches = {};
export function loadPatch(siteId) {
  return (patches[siteId] ||= (async () => {
    const dir = base.replace(/dem\/$/, "patch/");
    patchIndex ||= await fetch(dir + "index.json").then((r) => r.json()).catch(() => ({}));
    const meta = patchIndex[siteId];
    return meta ? makeGrid(meta, new Int16Array(await gunzip(await fetchBytes(dir + meta.file)))) : null;
  })());
}

// Which maps a point needs: [near (or null), far].
export function mapsFor(lat) {
  if (lat <= -80.5) return ["sp_cap", "sp_wide"];
  if (lat <= -62) return [null, "sp_wide"];
  return [null, "global"];
}

// Point reached from (lat, lon) going distM meters along azimuth azDeg (clockwise from north) on the sphere.
export function destination(lat, lon, azDeg, distM) {
  const la = lat * DEG, a = azDeg * DEG, d = distM / R;
  const s2 = Math.max(-1, Math.min(1, Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(a)));
  return { lat: Math.asin(s2) / DEG, lon: lon + Math.atan2(Math.sin(a) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * s2) / DEG };
}

// Pixel size (m) of the best map available at a latitude, without loading it.
export function mapResFor(lat) { return lat <= -80.5 ? 240 : lat <= -62 ? 960 : R * DEG / 8; }

export const NEAR_LIMIT_M = 60e3;      // the fine map is used out to this distance, the wide map beyond
export const skylineSteps = (res) => distances(res);
export const RADIUS_M = R;

// Ground slope (deg) at a point, over two pixels of the given map.
export function slopeAt(best, lat, lon) {
  const la = lat * DEG, lo = lon * DEG, sl = Math.sin(la), cl = Math.cos(la);
  const b = 2 * best.res, step = (az) => {
    const d = b / 2 / R, a = az * DEG;
    const s2 = sl * Math.cos(d) + cl * Math.sin(d) * Math.cos(a), l2 = Math.asin(s2);
    return best.height(l2 / DEG, (lo + Math.atan2(Math.sin(a) * Math.sin(d) * cl, Math.cos(d) - sl * s2)) / DEG);
  };
  const slope = Math.atan(Math.hypot((step(0) - step(180)) / b, (step(90) - step(270)) / b)) / DEG;
  return Number.isFinite(slope) ? slope : null;
}

function distances(nearRes, dMax = 250e3) {
  const out = [];
  for (let d = Math.max(30, nearRes / 4); d < dMax; d += Math.max(nearRes / 2, 0.0015 * d)) out.push(d);
  return out;
}

// Terrain horizon at (lat, lon): skyline elevation (deg) per azimuth, plus the site's height and slope.
export async function computeTerrain(lat, lon, azStep = 1) {
  const [nearName, farName] = mapsFor(lat);
  const [near, far] = await Promise.all([nearName ? grid(nearName) : null, grid(farName)]);
  const best = near || far;
  let h0 = best.height(lat, lon);
  if (!Number.isFinite(h0)) h0 = far.height(lat, lon);

  const la = lat * DEG, lo = lon * DEG, sl = Math.sin(la), cl = Math.cos(la);
  const up = [cl * Math.cos(lo), cl * Math.sin(lo), sl];
  const rp = R + h0 + MAST_M, P = [rp * up[0], rp * up[1], rp * up[2]];
  const dist = distances(best.res), n = Math.round(360 / azStep);
  const horizon = new Float32Array(n);
  const nearLimit = near ? NEAR_LIMIT_M : 0;
  let min = Infinity, max = -Infinity;

  for (let i = 0; i < n; i++) {
    const a = i * azStep * DEG, sa = Math.sin(a), ca = Math.cos(a);
    let bestEl = -90;
    for (let k = 0; k < dist.length; k++) {
      const d = dist[k] / R, sd = Math.sin(d), cd = Math.cos(d);
      const sl2 = Math.max(-1, Math.min(1, sl * cd + cl * sd * ca));
      const la2 = Math.asin(sl2), lo2 = lo + Math.atan2(sa * sd * cl, cd - sl * sl2);
      const latD = la2 / DEG, lonD = lo2 / DEG;
      let h = NaN;
      if (near && dist[k] <= nearLimit && latD <= near.min_lat) h = near.height(latD, lonD);
      if (!Number.isFinite(h)) h = far.height(latD, lonD);
      if (!Number.isFinite(h)) continue;
      const rq = R + h, cl2 = Math.cos(la2);
      const vx = rq * cl2 * Math.cos(lo2) - P[0], vy = rq * cl2 * Math.sin(lo2) - P[1], vz = rq * sl2 - P[2];
      const el = Math.asin((vx * up[0] + vy * up[1] + vz * up[2]) / Math.hypot(vx, vy, vz));
      if (el > bestEl) bestEl = el;
    }
    const e = bestEl / DEG;
    horizon[i] = e; if (e < min) min = e; if (e > max) max = e;
  }

  const b = 2 * best.res;
  return { real: true, reduced: true, horizon, heightM: h0, slopeDeg: slopeAt(best, lat, lon), slopeBaseM: Math.round(b),
           mastM: MAST_M, maps: [near, far].filter(Boolean).map((g) => (g.res >= 1000 ? (g.res / 1000).toFixed(1) + " KM" : g.res + " M")), min, max };
}
