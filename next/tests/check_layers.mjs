// South polar map layers (data/layers, built by tools/build_layers.py) against LUNI's own site numbers.
// A layer uses the 240 m map, 72 skyline directions and one value per 480 m, so it cannot match a preset site's
// full-detail skyline exactly; this check shows how close it is and fails if the two stop telling the same story.
// Run: node tests/check_layers.mjs
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { initEphemeris, siteFrame, sunEarthAltAz, MOON_RADIUS_KM } from "../js/ephem.js";
import { setHorizons, terrainFor, horizonAt } from "../js/model.js";
import { setPolar, polarValue } from "../js/layers.js";

const root = new URL("..", import.meta.url), read = (p) => readFileSync(new URL(p, root));
const bin = read("data/ephem.bin"), meta = JSON.parse(read("data/ephem.json"));
initEphemeris(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), meta);
setHorizons(JSON.parse(read("data/horizons.json")));
const sites = JSON.parse(read("data/sites.json")).sites;
const ix = JSON.parse(read("data/layers/index.json")).sp, P = { ...ix };
for (const [k, f] of Object.entries(ix.files)) P[k] = new Uint8Array(gunzipSync(read("data/layers/" + f)));
setPolar(P);

const t0 = Date.parse(meta.start_utc), stepMs = ix.step_hours * 3600000;
let fail = 0, sumAbs = 0, n = 0;
console.log(`layer grid ${P.n} x ${P.n} at ${P.scale_m} m, ${ix.moments} moments, ${ix.years}; stats`, JSON.stringify(ix.stats));
console.log("site".padEnd(12), "sunlight % layer / site", "  Earth % layer / site", "  shadow");
for (const s of sites.filter((x) => x.lat <= ix.min_lat)) {
  const tr = terrainFor(s), frame = siteFrame(s.lat, s.lon, MOON_RADIUS_KM + (tr.heightM + tr.mastM) / 1000);
  let sun = 0, earth = 0;
  for (let i = 0; i < ix.moments; i++) {
    const v = sunEarthAltAz(frame, t0 + i * stepMs);
    if (v.sunEl > horizonAt(tr.horizon, v.sunAz)) sun++;
    if (v.earthEl > horizonAt(tr.horizon, v.earthAz)) earth++;
  }
  const ls = polarValue("sun", s.lat, s.lon), le = polarValue("earth", s.lat, s.lon), sh = polarValue("shadow", s.lat, s.lon);
  const ss = sun / ix.moments * 100, se = earth / ix.moments * 100;
  console.log(s.id.padEnd(12), `${ls.toFixed(1).padStart(6)} / ${ss.toFixed(1).padStart(5)}`.padEnd(24), `${le.toFixed(1).padStart(6)} / ${se.toFixed(1).padStart(5)}`.padEnd(22), sh ? "YES" : "no");
  sumAbs += Math.abs(ls - ss) + Math.abs(le - se); n += 2;
  if (Math.abs(ls - ss) > 30 || Math.abs(le - se) > 30) { fail++; console.log("   ^ more than 30 points apart"); }
  if (sh && ss > 1) { fail++; console.log("   ^ marked permanent shadow, but the site's own skyline lets the Sun in"); }
}
// A permanently shadowed crater floor must be marked, and a well-lit ridge must not be.
const haworth = sites.find((s) => s.id === "haworth"), ridge = sites.find((s) => s.id === "shackleton");
if (polarValue("shadow", haworth.lat, haworth.lon) !== 1) { fail++; console.log("FAIL: Haworth's floor is not marked as permanent shadow"); }
if (polarValue("shadow", ridge.lat, ridge.lon) !== 0) { fail++; console.log("FAIL: the Shackleton ridge is marked as permanent shadow"); }
if (polarValue("sun", 0, 0) !== null) { fail++; console.log("FAIL: a value outside the region"); }
console.log(`mean difference ${(sumAbs / n).toFixed(1)} points`);
console.log(fail ? `${fail} layer checks FAILED` : "layer checks OK");
process.exit(fail ? 1 : 0);
