// Compare the in-browser terrain method (reduced maps) with the full-resolution skylines in data/horizons.json.
// Run: node tests/check_terrain.mjs
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { setIndex, putGrid, makeGrid, computeTerrain } from "../js/terrain.js";
import { initEphemeris } from "../js/ephem.js";
import { setHorizons, setCustomTerrain, getScenario, summarize, horizonAt } from "../js/model.js";

const root = new URL("..", import.meta.url);
const read = (p) => readFileSync(new URL(p, root));
const index = JSON.parse(read("data/dem/index.json"));
setIndex(index);
for (const name of ["sp_cap", "sp_wide", "global"]) {
  const raw = gunzipSync(read("data/dem/" + index[name].file));
  putGrid(name, makeGrid(index[name], new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)));
}
const bin = read("data/ephem.bin");
initEphemeris(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), JSON.parse(read("data/ephem.json")));
const hz = JSON.parse(read("data/horizons.json"));
setHorizons(hz);
const sites = JSON.parse(read("data/sites.json")).sites;

console.log("site".padEnd(11), "height full/reduced (m)", " skyline diff mean/max (deg)", " 30-day sunlit full/reduced", " Earth full/reduced", " ms");
const t0 = new Date("2026-11-14T00:00:00Z");
for (const s of sites) {
  const t = performance.now();
  const tr = await computeTerrain(s.lat, s.lon);
  const ms = performance.now() - t;
  const full = Float32Array.from(hz[s.id].el_cdeg, (v) => v / 100);
  let sum = 0, mx = 0;
  for (let az = 0; az < 360; az++) { const d = Math.abs(horizonAt(tr.horizon, az) - horizonAt(full, az)); sum += d; mx = Math.max(mx, d); }
  const a = summarize(getScenario(s, t0).samples);
  const custom = { ...s, id: "custom" };
  setCustomTerrain(custom, tr);
  const b = summarize(getScenario(custom, t0).samples);
  const p = (x) => (x * 100).toFixed(0).padStart(3) + "%";
  console.log(s.id.padEnd(11), `${hz[s.id].height_m.toFixed(0).padStart(7)} / ${tr.heightM.toFixed(0).padStart(6)}      `,
    `${(sum / 360).toFixed(2)} / ${mx.toFixed(2).padStart(5)}             `, `${p(a.pctSun)} / ${p(b.pctSun)}            `, `${p(a.pctEarth)} / ${p(b.pctEarth)}   `, ms.toFixed(0).padStart(5));
}
