// Real-mission check: when does LUNO say the Sun rose and set at real landing sites?
// Run: node tests/real_missions.mjs
import { readFileSync } from "node:fs";
import { initEphemeris } from "../js/ephem.js";
import { setHorizons, getScenario } from "../js/model.js";

const root = new URL("..", import.meta.url);
const read = (p) => readFileSync(new URL(p, root));
const bin = read("data/ephem.bin");
initEphemeris(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), JSON.parse(read("data/ephem.json")));
setHorizons(JSON.parse(read("data/horizons.json")));
const sites = Object.fromEntries(JSON.parse(read("data/sites.json")).sites.map((s) => [s.id, s]));

const cases = [
  ["ch3", "2023-08-10T00:00:00Z", "Chandrayaan-3 landed 2023-08-23 12:33 UTC"],
  ["im1", "2024-02-10T00:00:00Z", "IM-1 Odysseus landed 2024-02-22 23:23 UTC"],
  ["im2", "2025-02-20T00:00:00Z", "IM-2 Athena landed 2025-03-06 17:28 UTC"],
];
const iso = (d) => d.toISOString().slice(0, 16).replace("T", " ") + "Z";
for (const [id, start, label] of cases) {
  const sc = getScenario(sites[id], new Date(start));
  console.log(`\n${label}  (${sites[id].name})`);
  for (const key of ["sunUp", "earthUp"]) {
    const ev = [];
    for (let i = 1; i < sc.samples.length; i++)
      if (sc.samples[i][key] !== sc.samples[i - 1][key]) ev.push(`${sc.samples[i][key] ? "rise" : "set "} ${iso(sc.samples[i].t)}`);
    console.log(`  ${key === "sunUp" ? "Sun  " : "Earth"}: starts ${sc.samples[0][key] ? "up" : "down"}; ` + (ev.join(" | ") || "no change in 30 days"));
  }
}
