// Tests for the mission-needs logic (js/mission.js).
// Run: node tests/check_mission.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { analyze, windowsFrom, dailyStats, DEFAULT_REQ } from "../js/mission.js";
import { initEphemeris } from "../js/ephem.js";
import { setHorizons, sampleSite } from "../js/model.js";

// --- synthetic cases: strings of S (sun), E (earth), B (both), . (neither), one char per hour ---
const mk = (str) => [...str].map((c, i) => ({ sunUp: c === "S" || c === "B", earthUp: c === "E" || c === "B", t: new Date(i * 3600000) }));
const day = (c) => c.repeat(24);
const req = (o) => ({ ...DEFAULT_REQ, ...o });

{ // 3 days of both, then a long night: a 2-day mission fits only if it starts in the first day
  const s = mk(day("B") + day("B") + day("B") + day(".") + day(".") + day("B"));
  const a = analyze(s, req({ days: 2, maxDarkH: 12 }));
  assert.equal(a.at(0).ok, true); assert.equal(a.at(0).sunHeldHours, 72); assert.equal(a.at(0).marginHours, 24);
  assert.equal(a.at(24).ok, true); assert.equal(a.at(24).marginHours, 0);
  assert.equal(a.at(25).ok, false); assert.match(a.at(25).reasons[0], /SUN LOST AFTER 1D 23H/);
  assert.equal(a.at(80).ok, false); assert.equal(a.at(80).reasons[0], "NO SUN AT LANDING");
  const w = windowsFrom(a.mask, s);
  assert.deepEqual(w.map((x) => [x.i0, x.i1]), [[0, 25]]);   // the last day cannot fit a 2-day mission before the data ends
}
{ // short dark gaps are ridden out when allowed, fatal when not
  const s = mk(day("B") + "......" + day("B") + day("B"));
  assert.equal(analyze(s, req({ days: 2, maxDarkH: 12 })).at(0).ok, true);
  assert.equal(analyze(s, req({ days: 2, maxDarkH: 0 })).at(0).ok, false);
  assert.equal(analyze(s, req({ days: 1, maxDarkH: 0 })).at(0).ok, true);   // mission over before the gap begins
  assert.equal(analyze(s, req({ days: 1, maxDarkH: 6 })).at(0).marginOpen, true);   // gap of exactly 6 h is allowed
}
{ // Earth rules
  const s = mk(day("S") + day("B") + day("S") + day("S"));
  assert.equal(analyze(s, req({ days: 2, earthAtLanding: true })).at(0).ok, false);
  assert.equal(analyze(s, req({ days: 2, earthAtLanding: false })).at(0).ok, true);
  assert.equal(analyze(s, req({ days: 2, earthAtLanding: false, earthMinPct: 50 })).at(0).ok, true);
  assert.equal(analyze(s, req({ days: 2, earthAtLanding: false, earthMinPct: 75 })).at(0).ok, false);
  assert.equal(Math.round(analyze(s, req({ days: 2 })).at(0).earthPct), 50);
  const d = dailyStats(s, analyze(s, req({ days: 1, earthAtLanding: true })).mask, 4);
  assert.deepEqual(d.map((x) => x.earth), [0, 1, 0, 0]); assert.equal(d[1].ok, 1); assert.equal(d[0].ok, 0);
}

// --- real data: the fast mask must agree with a from-scratch check at every good and bad hour sampled ---
const root = new URL("..", import.meta.url), read = (p) => readFileSync(new URL(p, root));
const bin = read("data/ephem.bin");
initEphemeris(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), JSON.parse(read("data/ephem.json")));
setHorizons(JSON.parse(read("data/horizons.json")));
const sites = JSON.parse(read("data/sites.json")).sites;
const brute = (s, i, r) => {      // direct restatement of the rules, no shortcuts
  const M = r.days * 24;
  if (!s[i].sunUp || (r.earthAtLanding && !s[i].earthUp)) return false;
  let earth = 0;
  for (let k = i; k < i + M; k++) earth += s[k].earthUp ? 1 : 0;
  if (earth / M * 100 < r.earthMinPct) return false;
  for (let k = i; k < i + M; k++) {
    if (s[k].sunUp || (k > 0 && !s[k - 1].sunUp)) continue;      // only look at the first hour of each dark run
    let e = k; while (e < s.length && !s[e].sunUp) e++;
    if (e - k > r.maxDarkH) return false;
  }
  return true;
};
let checked = 0, good = 0;
for (const id of ["shackleton", "im2", "malapert", "ch3", "apollo11"]) {
  const site = sites.find((x) => x.id === id);
  const s = sampleSite(site, new Date("2026-11-01T00:00:00Z"), 200 * 24);
  for (const r of [DEFAULT_REQ, req({ days: 14, maxDarkH: 0, earthMinPct: 50 }), req({ days: 3, maxDarkH: 48, earthAtLanding: false })]) {
    const a = analyze(s, r);
    for (let i = 0; i + r.days * 24 + 72 < s.length; i += 7) { assert.equal(!!a.mask[i], brute(s, i, r), `${id} hour ${i}`); checked++; good += a.mask[i]; }
  }
}
console.log(`mission logic OK: synthetic cases pass; ${checked} real landing hours cross-checked (${good} good)`);
