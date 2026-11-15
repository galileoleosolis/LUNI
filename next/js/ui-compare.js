// BEFORE AND AFTER: two plans side by side, with what was gained and lost. Shown when the Best Site Finder moves the
// site or NEXT LANDING WINDOW moves the date, and for "compare <site> and <site>" in ASK LUNI. One fixed box on the
// page body, so the scaled console under it needs no zoom math.
import { planStats } from "./plan.js";
import { fmtDH } from "./mission.js";
import { getEnergy, kwh } from "./ui-energy.js";
import { showData } from "./sources.js";

const KEY = "luno-compare";
export const compareWanted = () => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } };
let open = null;
export const compareOpen = () => !!open;
export function closeCompare() { if (open) { open.remove(); open = null; } }

// a, b: { label, site, t0, terrain }. buttons: [[text, run, primary?], ...]. fmt: { site, stamp, lat, lon }.
// span(t0): hours of data to look through from that landing time, the same as the main verdict does.
export function showCompare({ title, lead, a, b, req, fmt, buttons, heads = ["BEFORE", "AFTER"], gainHead = "CHANGE", span = () => 0 }) {
  closeCompare();
  const e = getEnergy(), A = planStats(a.site, a.t0, req, a.terrain, e, span(a.t0)), B = planStats(b.site, b.t0, req, b.terrain, e, span(b.t0));
  const sign = (v, unit, digits = 0) => (Math.abs(v) < 0.5 * 10 ** -digits ? "SAME" : (v > 0 ? "+" : "−") + Math.abs(v).toFixed(digits) + unit);
  const hrs = (h) => fmtDH(h);                               // the same wording as the verdict strip
  // each row: label, value A, value B, the change as text, and whether the change is good (1), bad (-1) or neither (0)
  const rows = [
    ["VERDICT", A.ok ? "GO" : "NO-GO", B.ok ? "GO" : "NO-GO", A.ok === B.ok ? "SAME" : B.ok ? "NOW A GO" : "NOW A NO-GO", B.ok - A.ok, true],
    ["SUNLIGHT IN THE MISSION", `${Math.round(A.sunPct)}% · ${A.sunHours} H`, `${Math.round(B.sunPct)}% · ${B.sunHours} H`, sign(B.sunHours - A.sunHours, " H"), Math.sign(B.sunHours - A.sunHours)],
    ["SUNLIGHT TO SPARE AFTER IT", A.marginHours > 0 ? (A.marginOpen ? "OVER " : "") + hrs(A.marginHours) : "NONE", B.marginHours > 0 ? (B.marginOpen ? "OVER " : "") + hrs(B.marginHours) : "NONE",
      sign(Math.max(0, B.marginHours) - Math.max(0, A.marginHours), " H"), Math.sign(Math.max(0, B.marginHours) - Math.max(0, A.marginHours))],
    ["LONGEST TIME WITHOUT SUN", A.longestDarkH ? A.longestDarkH + " H" : "NONE", B.longestDarkH ? B.longestDarkH + " H" : "NONE", sign(B.longestDarkH - A.longestDarkH, " H"), -Math.sign(B.longestDarkH - A.longestDarkH)],
    ["EARTH LINK IN THE MISSION", `${Math.round(A.earthPct)}%`, `${Math.round(B.earthPct)}%`, sign(B.earthPct - A.earthPct, " POINTS"), Math.sign(Math.round(B.earthPct) - Math.round(A.earthPct))],
    ["ENERGY COLLECTED", kwh(A.energy.inWh), kwh(B.energy.inWh), sign((B.energy.inWh - A.energy.inWh) / 1000, " kWh", 1), Math.sign(Math.round((B.energy.inWh - A.energy.inWh) / 100))],
  ];
  if (a.site !== b.site) {
    if (A.slopeDeg != null && B.slopeDeg != null) rows.push(["GROUND SLOPE", A.slopeDeg.toFixed(1) + "°", B.slopeDeg.toFixed(1) + "°", sign(B.slopeDeg - A.slopeDeg, "°", 1), -Math.sign(Math.round((B.slopeDeg - A.slopeDeg) * 10))]);
    if (A.heightM != null && B.heightM != null) rows.push(["ELEVATION", Math.round(A.heightM).toLocaleString("en-US") + " M", Math.round(B.heightM).toLocaleString("en-US") + " M", sign(B.heightM - A.heightM, " M"), 0]);
  }
  const cls = (g) => (g > 0 ? "good" : g < 0 ? "bad" : "same");
  const box = document.createElement("div"); box.className = "cmp-pop"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", title);
  box.innerHTML = `<div class="cmp-card">
    <div class="cmp-head"><b>${title}</b><button class="cmp-x" title="Close (Esc)">✕</button></div>
    ${lead ? `<p class="cmp-lead">${lead}</p>` : ""}
    <table class="cmp-table"><thead><tr><th></th><th><i>${heads[0]}</i>${a.label}</th><th><i>${heads[1]}</i>${b.label}</th><th><i>${gainHead}</i></th></tr></thead><tbody>
    ${rows.map(([k, va, vb, d, g, big]) => `<tr class="${big ? "big" : ""}"><td>${k}</td><td class="${big ? (A.ok ? "go" : "nogo") : ""}">${va}</td><td class="${big ? (B.ok ? "go" : "nogo") : ""}">${vb}</td><td class="${cls(g)}">${g > 0 ? "▲ " : g < 0 ? "▼ " : ""}${d}</td></tr>`).join("")}
    </tbody></table>
    <p class="cmp-note">GREEN ▲ = BETTER FOR THE MISSION, RED ▼ = WORSE. ENERGY IS FOR YOUR PANEL (${e.areaM2} M², ${e.effPct}%), SET UNDER POWER › ENERGY.${A.reduced !== B.reduced ? " ONE OF THE TWO USES THE REDUCED MAP, SO SMALL DIFFERENCES ARE NOT RELIABLE." : ""}</p>
    <div class="cmp-btns"></div>
    <label class="cmp-keep"><input type="checkbox" ${compareWanted() ? "checked" : ""}> SHOW THIS AFTER EVERY MOVE</label></div>`;
  const row = box.querySelector(".cmp-btns");
  for (const [text, run, primary] of buttons) {
    const btn = document.createElement("button"); btn.textContent = text; btn.className = primary ? "primary" : "";
    btn.addEventListener("click", () => { closeCompare(); run?.(); }); row.appendChild(btn);
  }
  box.querySelector(".cmp-x").addEventListener("click", closeCompare);
  box.addEventListener("click", (ev) => { if (ev.target === box) closeCompare(); });
  box.querySelector(".cmp-keep input").addEventListener("change", (ev) => { try { localStorage.setItem(KEY, ev.target.checked ? "on" : "off"); } catch {} });
  document.body.appendChild(box); open = box;
  showData("compare");
  return { A, B };
}
