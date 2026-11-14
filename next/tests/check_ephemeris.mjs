// Compare LUNO's Sun/Earth azimuth and elevation with JPL Horizons reference values.
// Run: node tests/check_ephemeris.mjs
import { readFileSync } from "node:fs";
import { initEphemeris, siteFrame, sunEarthAltAz } from "../js/ephem.js";

const root = new URL("..", import.meta.url);
const meta = JSON.parse(readFileSync(new URL("data/ephem.json", root)));
const bin = readFileSync(new URL("data/ephem.bin", root));
initEphemeris(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), meta);
const fx = JSON.parse(readFileSync(new URL("tests/horizons_fixtures.json", root)));

const DEG = Math.PI / 180;
const sep = (az1, el1, az2, el2) => {   // angular separation between two sky directions, degrees
  const c = Math.sin(el1 * DEG) * Math.sin(el2 * DEG) + Math.cos(el1 * DEG) * Math.cos(el2 * DEG) * Math.cos((az1 - az2) * DEG);
  return Math.acos(Math.min(1, c)) / DEG;
};
const by = {};
for (const r of fx) {
  const v = sunEarthAltAz(siteFrame(r.lat, r.lon), Date.parse(r.t));
  const s = (by[r.site] ||= { n: 0, sun: 0, earth: 0, sunEl: 0, earthEl: 0 });
  s.n++;
  s.sun = Math.max(s.sun, sep(v.sunAz, v.sunEl, r.sunAz, r.sunEl));
  s.earth = Math.max(s.earth, sep(v.earthAz, v.earthEl, r.earthAz, r.earthEl));
  s.sunEl = Math.max(s.sunEl, Math.abs(v.sunEl - r.sunEl));
  s.earthEl = Math.max(s.earthEl, Math.abs(v.earthEl - r.earthEl));
}
let worst = 0;
console.log("site".padEnd(18), "rows", " max Sun err", " max Earth err", " (elevation only: Sun, Earth)  [degrees]");
for (const [k, s] of Object.entries(by)) {
  worst = Math.max(worst, s.sun, s.earth);
  console.log(k.padEnd(18), String(s.n).padStart(4), s.sun.toFixed(4).padStart(12), s.earth.toFixed(4).padStart(14), "   ", s.sunEl.toFixed(4), s.earthEl.toFixed(4));
}
console.log("worst angular error:", worst.toFixed(4), "deg");
process.exit(worst < 0.05 ? 0 : 1);
