// Shared helpers for the style drafts.
import { SITES } from "../js/sites.js";
import { getScenario, summarize, hoursUntilChange, horizonAt } from "../js/model.js";
export { SITES, horizonAt };
export function load(siteId = "shackleton", idx = null) {
  const site = SITES.find((s) => s.id === siteId);
  const start = new Date(Date.UTC(2026, 10, 14, 15));
  const sc = getScenario(site, start);
  if (idx == null) { // pick a moment where both Sun and Earth are up, a day into the window
    const sep = (s) => { const d = Math.abs(s.sunAz - s.earthAz) % 360; return Math.min(d, 360 - d); };
    const f = sc.samples.findIndex((s) => s.sunUp && s.earthUp && sep(s) > 70);
    idx = f < 0 ? 0 : f;
  }
  const sum = summarize(sc.samples);
  const cur = sc.samples[idx];
  return { site, start, sc, sum, cur, idx, t: cur.t,
    sunLeft: hoursUntilChange(sc.samples, idx, "sunUp"),
    earthLeft: hoursUntilChange(sc.samples, idx, "earthUp") };
}
export const dur = (h) => h == null ? ">30d" : `${String(Math.floor(h / 24)).padStart(2, "0")}d ${String(Math.round(h % 24)).padStart(2, "0")}h`;
export const durWords = (h) => h == null ? "over 30 days" : `${Math.floor(h / 24)} d ${Math.round(h % 24)} h`;
export const pct = (x) => `${Math.round(x * 100)}%`;
export const sgn = (x, d = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);
// SVG path helpers
export function terrainPath(h, x, y, yBottom) {
  let d = `M${x(0)},${yBottom}`;
  for (let az = 0; az <= 360; az++) d += `L${x(az).toFixed(1)},${y(horizonAt(h, az % 360)).toFixed(1)}`;
  return d + `L${x(360)},${yBottom}Z`;
}
export function terrainLine(h, x, y) {
  let d = "";
  for (let az = 0; az <= 360; az++) d += `${az ? "L" : "M"}${x(az).toFixed(1)},${y(horizonAt(h, az % 360)).toFixed(1)}`;
  return d;
}
export function track(samples, key, x, y) {
  let d = "", prev = null;
  for (const s of samples) {
    const az = s[key + "Az"], e = s[key + "El"];
    d += (prev == null || Math.abs(az - prev) > 180 ? "M" : "L") + x(az).toFixed(1) + "," + y(e).toFixed(1);
    prev = az;
  }
  return d;
}
export const stamp = (d) => d.toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "") + " UTC";
