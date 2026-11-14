// Area scan: judge every point of a grid around a site against the mission needs.
// Pure logic shared by the scan workers and the Node tests.
import { computeTerrain, destination, mapResFor } from "./terrain.js";
import { sampleSite } from "./model.js";
import { analyze } from "./mission.js";

export const SCAN_AZ_STEP = 3;      // degrees between skyline samples during a scan (the site view uses 1)

// Scan sizes on offer, chosen so the grid spacing never goes below the map's pixel size.
// fine = the skylines come from the graphics chip, which is fast enough for a point on every map pixel.
export function scanOptions(lat, fine = false) {
  const res = mapResFor(lat);
  if (fine && res <= 240) return [{ radiusKm: 2, n: 17 }, { radiusKm: 5, n: 41 }, { radiusKm: 15, n: 121 }, { radiusKm: 30, n: 241 }, { radiusKm: 60, n: 241 }];
  if (fine && res <= 960) return [{ radiusKm: 10, n: 21 }, { radiusKm: 25, n: 53 }, { radiusKm: 50, n: 105 }, { radiusKm: 100, n: 209 }];
  if (res <= 240) return [{ radiusKm: 2, n: 17 }, { radiusKm: 5, n: 21 }, { radiusKm: 15, n: 21 }];
  if (res <= 960) return [{ radiusKm: 10, n: 21 }, { radiusKm: 25, n: 21 }, { radiusKm: 50, n: 21 }];
  return [{ radiusKm: 40, n: 21 }, { radiusKm: 100, n: 21 }, { radiusKm: 250, n: 21 }];
}

// n x n points, north up: row 0 is the northern edge, column 0 the western edge.
export function scanGrid(site, radiusKm, n) {
  const step = (2 * radiusKm * 1000) / (n - 1), c = (n - 1) / 2, pts = [];
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) {
    const e = (k - c) * step, nn = (c - r) * step, d = Math.hypot(e, nn);
    const p = d < 1e-6 ? { lat: site.lat, lon: site.lon } : destination(site.lat, site.lon, Math.atan2(e, nn) * 180 / Math.PI, d);
    pts.push({ r, k, eastKm: e / 1000, northKm: nn / 1000, lat: p.lat, lon: p.lon, dist: d });
  }
  return { n, stepM: step, radiusKm, points: pts };
}

// One grid point: terrain skyline from the reduced LOLA maps, then the mission verdict for landing at t0.
export async function evaluatePoint(lat, lon, t0, req) {
  return judgePoint(lat, lon, await computeTerrain(lat, lon, SCAN_AZ_STEP), t0, req);
}

// The same verdict from a skyline that is already known (terrain = { horizon, heightM, mastM, slopeDeg }).
export function judgePoint(lat, lon, terrain, t0, req) {
  const hours = (req.days + 3) * 24 + req.maxDarkH;
  const samples = sampleSite({ lat, lon }, t0, hours, terrain);
  const a = analyze(samples, req), v = a.at(0), M = a.missionSteps;
  let sun = 0;
  for (let i = 0; i < M; i++) sun += samples[i].sunUp ? 1 : 0;
  return { heightM: terrain.heightM, slopeDeg: terrain.slopeDeg, sunPct: sun / M * 100, earthPct: v.earthPct,
           ok: v.ok, marginHours: v.marginHours, reason: v.reasons[0] || "" };
}

// Best cell: among points that meet the needs, the most sunlight then the most Earth link; otherwise the most sunlight.
export function bestCell(cells) {
  let best = null;
  const score = (c) => (c.ok ? 1000 : 0) + c.sunPct + c.earthPct / 1000;
  for (const c of cells) if (c && (!best || score(c) > score(best))) best = c;
  return best;
}
