// Eclipse and partial-Sun checks.
// Run: node tests/check_eclipses.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { initEphemeris, siteFrame, eclipseCover, eclipsesBetween, sunEarthAltAz } from "../js/ephem.js";
import { setHorizons, discAbove, sampleSite } from "../js/model.js";

const root = new URL("..", import.meta.url), read = (p) => readFileSync(new URL(p, root));
const bin = read("data/ephem.bin");
initEphemeris(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), JSON.parse(read("data/ephem.json")));
setHorizons(JSON.parse(read("data/horizons.json")));

// geometry helpers
assert.equal(eclipseCover(2, 0.95), 0); assert.equal(eclipseCover(0.1, 0.95), 1);
assert.ok(Math.abs(eclipseCover(0.95, 0.95) - 0.5) < 0.06);          // Earth's edge through the Sun's center: about half hidden
assert.equal(discAbove(1), 1); assert.equal(discAbove(-1), 0); assert.ok(Math.abs(discAbove(0) - 0.5) < 1e-12);
assert.ok(discAbove(0.5) > 0.78 && discAbove(0.5) < 0.82);

// every eclipse in the ephemeris, seen from a near-side site
const frame = siteFrame(0.6741, 23.4731);
const all = eclipsesBetween(frame, Date.parse("2023-01-01T00:00:00Z"), Date.parse("2035-12-01T00:00:00Z"));
const iso = (d) => d.toISOString().slice(0, 16).replace("T", " ");
console.log(`${all.length} eclipses 2023-2035 at Apollo 11's site (Earth in front of the Sun):`);
for (const e of all) console.log(`  ${iso(e.peak)} UTC  max ${Math.round(e.maxCover * 100)}% of the Sun hidden  ${Math.round((e.end - e.start) / 60000)} min ${e.maxCover >= 0.999 ? "TOTAL" : ""}`);
assert.ok(all.length >= 15 && all.length <= 40, "a dozen years should hold roughly two to three eclipses a year");
// no eclipse can happen unless the Sun and Earth are within about 1.25 degrees
for (const e of all) assert.ok(sunEarthAltAz(frame, e.peak).sepDeg < 1.25);
// hourly samples go dark during a total eclipse
const total = all.find((e) => e.maxCover >= 0.999);
const apollo = { id: "apollo11", lat: 0.6741, lon: 23.4731 };
const s = sampleSite(apollo, new Date(Math.floor(+total.peak / 3600000) * 3600000 - 6 * 3600000), 12);
assert.ok(s.some((x) => x.eclipse > 0.9 && !x.sunUp), "the Sun should count as lost during totality");
assert.ok(s[0].sunUp && s[0].eclipse === 0, "and be fine six hours earlier");
console.log("eclipse logic OK; first total eclipse in the data peaks", iso(total.peak), "UTC");
