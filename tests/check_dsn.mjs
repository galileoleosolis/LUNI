// js/dsn.js against SPICE's own answers (tests/fixtures/dsn_check.json, written by tools/build_dsn.py with each
// station as the observer): the Moon's height above the horizon at Goldstone, Madrid and Canberra at 240 moments
// that are not on the table's 6-hour grid.   Run: node tests/check_dsn.mjs
import { readFileSync } from "node:fs";
import { initDsn, dsnAt } from "../js/dsn.js";
const root = new URL("..", import.meta.url), read = (p) => readFileSync(new URL(p, root));
const bin = read("data/dsn.bin");
initDsn(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), JSON.parse(read("data/dsn.json")));
const checks = JSON.parse(read("tests/fixtures/dsn_check.json"));
let worst = 0, sum = 0, n = 0, flips = 0, none = 0;
for (const c of checks) {
  const got = dsnAt(Date.parse(c.utc));
  if (!got.some((s) => s.el > 0)) none++;
  for (const s of got) { const d = Math.abs(s.el - c.el[s.name]); worst = Math.max(worst, d); sum += d; n++; if ((s.el > 0) !== (c.el[s.name] > 0)) flips++; }
}
console.log(`${n} values at ${checks.length} moments: mean difference ${(sum / n).toFixed(4)} deg, worst ${worst.toFixed(4)} deg, above/below the horizon disagreements ${flips}, moments with no site in view ${none}`);
const ok = worst < 0.1;
console.log(ok ? "DSN check OK" : "DSN check FAILED");
process.exit(ok ? 0 : 1);
