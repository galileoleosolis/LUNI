// A site's own long-term numbers (js/model.js siteYears) next to the map layers' values at the same place.
// The data card on the MOON MAP shows the site's own numbers for the landing site; this prints both, and fails if
// a site the layer calls "never sunlit" gets sunlight from its own skyline (the card would contradict itself).
// Run: node tests/check_site_years.mjs
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { initEphemeris } from "../js/ephem.js";
import { setHorizons, siteYears } from "../js/model.js";
import { setLayers, polarValue } from "../js/layers.js";

const root = new URL("..", import.meta.url), read = (p) => readFileSync(new URL(p, root));
const bin = read("data/ephem.bin"), meta = JSON.parse(read("data/ephem.json"));
initEphemeris(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), meta);
setHorizons(JSON.parse(read("data/horizons.json")));
const sites = JSON.parse(read("data/sites.json")).sites, index = JSON.parse(read("data/layers/index.json")), ALL = {};
for (const key of ["sp", "np", "gl"]) {
  if (!index[key]) continue;
  ALL[key] = { ...index[key] };
  for (const [k, f] of Object.entries(index[key].files)) ALL[key][k] = new Uint8Array(gunzipSync(read("data/layers/" + f)));
}
setLayers(ALL);
let fail = 0;
console.log("site".padEnd(12), "sunlight % own / layer", "  Earth % own / layer", "  ever sunlit (own)", " never sunlit (layer)");
for (const s of sites) {
  const t = Date.now(), y = siteYears(s), ms = Date.now() - t;
  const ls = polarValue("sun", s.lat, s.lon), le = polarValue("earth", s.lat, s.lon), sh = polarValue("shadow", s.lat, s.lon);
  const f = (v) => (v == null ? "  -  " : v.toFixed(1).padStart(5));
  console.log(s.id.padEnd(12), `${f(y.sun)} / ${f(ls)}`.padEnd(24), `${f(y.earth)} / ${f(le)}`.padEnd(22), String(y.everSun).padEnd(18), sh == null ? "(not a cap)" : sh ? "YES" : "no", ` ${ms} ms`);
  if (sh && y.sun > 1) { fail++; console.log("   ^ the layer says never sunlit, the site's own skyline says it gets sunlight"); }
  if (!(y.sun >= 0 && y.sun <= 100 && y.earth >= 0 && y.earth <= 100)) { fail++; console.log("   ^ out of range"); }
}
console.log(fail ? `${fail} PROBLEM(S)` : "site years OK");
process.exit(fail ? 1 : 0);
