// Tests for the area scan (js/scan-core.js) using the reduced LOLA maps.
// Run: node tests/check_scan.mjs
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { setIndex, putGrid, makeGrid, computeTerrain } from "../js/terrain.js";
import { initEphemeris } from "../js/ephem.js";
import { sampleSite } from "../js/model.js";
import { analyze, DEFAULT_REQ } from "../js/mission.js";
import { scanGrid, evaluatePoint, bestCell, scanOptions, SCAN_AZ_STEP } from "../js/scan-core.js";

const root = new URL("..", import.meta.url), read = (p) => readFileSync(new URL(p, root));
const index = JSON.parse(read("data/dem/index.json"));
setIndex(index);
for (const name of ["sp_cap", "sp_wide", "global"]) {
  const raw = gunzipSync(read("data/dem/" + index[name].file));
  putGrid(name, makeGrid(index[name], new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)));
}
const bin = read("data/ephem.bin");
initEphemeris(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), JSON.parse(read("data/ephem.json")));

// 1. grid geometry: center is the site, corners are radius*sqrt(2) away, spacing respects the map pixel
const ridge = { lat: -89.45, lon: -137.31 };
const g = scanGrid(ridge, 2, 17);
const mid = g.points[8 * 17 + 8];
assert.ok(Math.abs(mid.lat - ridge.lat) < 1e-9 && Math.abs(mid.lon - ridge.lon) < 1e-9);
assert.ok(Math.abs(g.points[0].dist - 2000 * Math.SQRT2) < 1e-6);
assert.equal(g.points[0].northKm, 2); assert.equal(g.points[0].eastKm, -2);
for (const lat of [-89, -70, 10]) for (const o of scanOptions(lat)) assert.ok(2 * o.radiusKm * 1000 / (o.n - 1) >= (lat < -80.5 ? 240 : lat < -62 ? 960 : 3700));

// 2. the center cell equals a direct evaluation done the long way
const t0 = new Date("2027-05-01T00:00:00Z"), req = { ...DEFAULT_REQ, days: 28, maxDarkH: 48, earthAtLanding: false };
const direct = await (async () => {
  const terrain = await computeTerrain(ridge.lat, ridge.lon, SCAN_AZ_STEP);
  const s = sampleSite(ridge, t0, (req.days + 3) * 24 + req.maxDarkH, terrain), v = analyze(s, req).at(0);
  return { ok: v.ok, earthPct: v.earthPct, sunPct: s.slice(0, req.days * 24).filter((x) => x.sunUp).length / (req.days * 24) * 100 };
})();
const viaScan = await evaluatePoint(mid.lat, mid.lon, t0, req);
assert.equal(viaScan.ok, direct.ok); assert.equal(viaScan.sunPct, direct.sunPct); assert.equal(viaScan.earthPct, direct.earthPct);

// 3. scanning from a spot 1.2 km off the Shackleton ridge in polar winter should lead back to the high ground
const off = scanGrid({ lat: -89.45, lon: -137.31 }, 2, 17).points.find((p) => p.eastKm === 1 && p.northKm === -0.75);
const g2 = scanGrid({ lat: off.lat, lon: off.lon }, 2, 17);
const t = performance.now();
const cells = [];
for (const p of g2.points) cells.push({ ...p, ...(await evaluatePoint(p.lat, p.lon, t0, req)) });
const ms = (performance.now() - t) / cells.length;
const center = cells[8 * 17 + 8], lit = cells.reduce((a, b) => (b.sunPct > a.sunPct ? b : a));
const sorted = cells.map((c) => c.sunPct).sort((a, b) => a - b);
console.log(`scan 17x17: ${ms.toFixed(0)} ms per point; sunlight over the 28-day window: min ${sorted[0].toFixed(0)}%, median ${sorted[144].toFixed(0)}%, max ${sorted[288].toFixed(0)}%`);
console.log(`start point: ${center.sunPct.toFixed(0)}% sun at ${center.heightM.toFixed(0)} m; best-lit cell: ${lit.sunPct.toFixed(0)}% sun at ${lit.heightM.toFixed(0)} m, ${lit.eastKm} km E / ${lit.northKm} km N`);
assert.ok(lit.sunPct >= center.sunPct + 10, "the best-lit cell should be clearly better lit than the off-ridge start");
assert.ok(lit.heightM > center.heightM, "and on higher ground");

// 4. choosing the best point
// No point meets the needs in that winter scan, so there must be no "best point" at all (it used to crown a NO-GO corner).
assert.ok(cells.every((c) => !c.ok) && bestCell(cells) === null, "no GO point -> no best point");
const mk = (o) => ({ ok: true, marginHours: 50, slopeDeg: 5, eastKm: 1, northKm: 0, earthPct: 80, sunPct: 100, ...o });
const pick = (list) => list.indexOf(bestCell(list));
assert.equal(pick([mk({ ok: false, sunPct: 100, marginHours: 500 }), mk({ marginHours: 1 })]), 1, "a NO-GO point never wins, whatever its sunlight");
assert.equal(pick([mk({ marginHours: 0 }), mk({ marginHours: 31 }), mk({ marginHours: 12 })]), 1, "the longest sunlight margin wins");
assert.equal(pick([mk({ slopeDeg: 18 }), mk({ slopeDeg: 2 }), mk({ slopeDeg: 9 })]), 1, "same margin: the gentlest slope wins");
assert.equal(pick([mk({ eastKm: 5 }), mk({ eastKm: 0, northKm: 0 }), mk({ eastKm: 2 })]), 1, "same margin and slope: the shortest move wins (staying put if possible)");
assert.equal(pick([mk({ earthPct: 40 }), mk({ earthPct: 95 })]), 1, "all else equal: more Earth link wins");
assert.equal(pick([mk({ slopeDeg: 2.2 }), mk({ slopeDeg: 1.8, eastKm: 4 })]), 0, "a slope difference under a degree does not justify a longer move");
assert.equal(bestCell([null, null]), null);
console.log("area scan OK");
