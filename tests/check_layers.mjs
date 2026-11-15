// South polar map layers (data/layers, built by tools/build_layers.py) against LUNI's own site numbers.
// A layer uses the 240 m map, 72 skyline directions and one value per 480 m, so it cannot match a preset site's
// full-detail skyline exactly; this check shows how close it is and fails if the two stop telling the same story.
// Run: node tests/check_layers.mjs
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { initEphemeris, siteFrame, sunEarthAltAz, MOON_RADIUS_KM } from "../js/ephem.js";
import { setHorizons, terrainFor, horizonAt } from "../js/model.js";
import { setLayers, polarValue, mixScore, getMix, setMix } from "../js/layers.js";

const root = new URL("..", import.meta.url), read = (p) => readFileSync(new URL(p, root));
const bin = read("data/ephem.bin"), meta = JSON.parse(read("data/ephem.json"));
initEphemeris(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), meta);
setHorizons(JSON.parse(read("data/horizons.json")));
const sites = JSON.parse(read("data/sites.json")).sites;
const index = JSON.parse(read("data/layers/index.json")), ALL = {};
for (const key of ["sp", "np", "gl"]) {
  if (!index[key]) continue;
  ALL[key] = { ...index[key] };
  for (const [k, f] of Object.entries(index[key].files)) ALL[key][k] = new Uint8Array(gunzipSync(read("data/layers/" + f)));
}
setLayers(ALL);
const ix = index.sp, P = ALL.sp;

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
// Whole Moon (coarse): the near side always has Earth, the far side never; away from the poles the Sun is up about half the time.
if (ALL.gl) {
  const at = (id) => sites.find((x) => x.id === id), a11 = at("apollo11"), far = at("ce4");
  const e1 = polarValue("earth", a11.lat, a11.lon), e2 = polarValue("earth", far.lat, far.lon), s1 = polarValue("sun", a11.lat, a11.lon), t1 = polarValue("temp", a11.lat, a11.lon), h1 = polarValue("tmax", a11.lat, a11.lon);
  console.log(`whole Moon: Apollo 11 Earth ${e1}%, sunlight ${s1}%, temperature ${t1} K average and ${h1} K at its hottest; Chang'e 4 (far side) Earth ${e2}%`);
  if (!(e1 >= 99 && e2 <= 1 && s1 > 40 && s1 < 55 && t1 > 180 && t1 < 250 && h1 > 350)) { fail++; console.log("FAIL: whole-Moon layers do not look right"); }
  if (polarValue("shadow", a11.lat, a11.lon) !== null) { fail++; console.log("FAIL: permanent shadow is only worked out at the poles"); }
} else console.log("whole-Moon layers not built yet");
// North cap: same method as the south. The Sun cannot be up more than about half the time on average, and some ground is in permanent shadow.
// A cap's near-side half must see Earth far more often than its far-side half (averaged over an area, because a
// single point can sit in a crater).
const areaMean = (id, sign, lon0) => { let sum = 0, n = 0; for (let la = 81; la <= 89; la += 0.25) for (let d = -50; d <= 50; d += 2.5) { const v = polarValue(id, sign * la, lon0 + d); if (v != null) { sum += v; n++; } } return sum / n; };
for (const [name, key, sign] of [["south", "sp", -1], ["north", "np", 1]]) {
  if (!ALL[key]) { console.log(`${name} cap not built yet`); continue; }
  const near = areaMean("earth", sign, 0), far = areaMean("earth", sign, 180), east = areaMean("earth", sign, 90), west = areaMean("earth", sign, -90);
  console.log(`${name} cap: Earth in view ${near.toFixed(1)}% on the near-side half, ${far.toFixed(1)}% on the far-side half, ${east.toFixed(1)}% / ${west.toFixed(1)}% toward 90E / 90W`);
  if (!(near > far + 20 && Math.abs(east - west) < 8)) { fail++; console.log(`FAIL: the ${name} cap is turned the wrong way`); }
}
if (ALL.np) {
  const st = index.np.stats;
  console.log(`north cap: stats ${JSON.stringify(st)}`);
  if (!(st.shadow_share_pct > 1 && st.shadow_share_pct < 20 && st.sun_mean_pct > 15 && st.sun_mean_pct < 45 && polarValue("temp", 89.9, 0) != null)) { fail++; console.log("FAIL: north cap does not look right"); }
} else console.log("north cap not built yet");
// Temperature (NASA Diviner, re-gridded): the shadowed crater floor must be far colder than the sunlit ridge.
const tH = polarValue("temp", haworth.lat, haworth.lon), tR = polarValue("temp", ridge.lat, ridge.lon), hot = polarValue("tmax", ridge.lat, ridge.lon);
console.log(`temperature: Haworth floor ${tH} K average, Shackleton ridge ${tR} K average, ${hot} K at its hottest; region ${JSON.stringify(ix.temperature.avg_k)} K`);
if (!(tH > 15 && tH < 80 && tR > tH + 40 && hot >= tR)) { fail++; console.log("FAIL: temperatures do not look like Diviner's"); }
// YOUR MIX: a weighted average of the parts' scores.
const w0 = getMix();
for (const k of Object.keys(w0)) setMix(k, 0);
setMix("sun", 3); setMix("slope", 1);
const m1 = mixScore({ sun: 80, earth: 0, slope: 10, temp: 100 });      // (3 * 0.8 + 1 * 0.5) / 4 = 72.5
if (Math.abs(m1 - 72.5) > 1e-9) { fail++; console.log("FAIL: mix of sun 80% and slope 10 deg should be 72.5, got", m1); }
if (mixScore({ sun: null, slope: 3 }) !== null) { fail++; console.log("FAIL: a mix with a missing weighted part must be null"); }
setMix("sun", 0); setMix("slope", 0);
if (mixScore({ sun: 80, slope: 3 }) !== null) { fail++; console.log("FAIL: all weights 0 must give no score"); }
for (const [k, v] of Object.entries(w0)) setMix(k, v);
console.log(`mean difference ${(sumAbs / n).toFixed(1)} points`);
console.log(fail ? `${fail} layer checks FAILED` : "layer checks OK");
process.exit(fail ? 1 : 0);
