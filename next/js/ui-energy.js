// ENERGY: how much power this plan collects and uses, hour by hour, and the battery that would carry it through.
// The Sun's side is NASA data (sunlight strength, and LUNI's hourly share of the Sun's disc in view from SPICE and
// LOLA). The lander's side (panel size, efficiency, power use) is the user's to set, and the screen says so.
import { planStats, energyBudget, SOLAR_W_M2, ENERGY_OPTIONS, DEFAULT_ENERGY } from "./plan.js";
import { showData } from "./sources.js";

const $ = (id) => document.getElementById(id);
const KEY = "luno-energy";
let cfg = null;
export function getEnergy() {
  if (cfg) return cfg;
  cfg = { ...DEFAULT_ENERGY };
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); for (const k of Object.keys(cfg)) if (ENERGY_OPTIONS[k].includes(s?.[k])) cfg[k] = s[k]; } catch {}
  return cfg;
}
function setEnergy(k, v) { cfg = { ...getEnergy(), [k]: v }; try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} }
export const kwh = (wh) => (Math.abs(wh) >= 99950 ? Math.round(wh / 1000).toLocaleString("en-US") : (wh / 1000).toFixed(Math.abs(wh) < 9950 ? 2 : 1)) + " kWh";
export const watts = (w) => (w >= 9950 ? (w / 1000).toFixed(1) + " kW" : Math.round(w).toLocaleString("en-US") + " W");

const ROWS = [["areaM2", "SOLAR PANEL SIZE", (v) => v + " M²"], ["effPct", "PANEL TURNS INTO POWER", (v) => v + "%"], ["loadW", "THE LANDER USES", (v) => (v >= 1000 ? v / 1000 + " KW" : v + " W")]];

export function createEnergyPanel({ getContext, fmt, onChange }) {
  const box = $("energy"), body = $("energy-body");

  function chart(b, t0) {
    const W = 1200, H = 214, L = 70, R = 14, top = 14, mid = 108, bot = 190, n = b.hours, x = (i) => L + (W - L - R) * i / Math.max(1, n - 1);
    const pMax = Math.max(b.peakW, getEnergy().loadW) * 1.08, yP = (w) => mid - 10 - (mid - 10 - top) * w / pMax;
    const bMax = Math.max(1, b.batteryWh), yB = (wh) => mid + 22 + (bot - mid - 22) * (-wh) / bMax;
    let area = `M${x(0)},${yP(0)}`, line = "";
    for (let i = 0; i < n; i++) { area += `L${x(i).toFixed(1)},${yP(b.power[i]).toFixed(1)}`; line += (i ? "L" : "M") + x(i).toFixed(1) + "," + yB(b.battery[i]).toFixed(1); }
    area += `L${x(n - 1)},${yP(0)}Z`;
    const days = Math.round(n / 24), stepD = days > 14 ? 7 : days > 7 ? 2 : 1;
    let ticks = "";
    for (let d = 0; d <= days; d += stepD) ticks += `<line x1="${x(d * 24)}" x2="${x(d * 24)}" y1="${top}" y2="${bot}" class="en-grid"/><text x="${x(d * 24)}" y="${H - 6}" class="en-tick" text-anchor="${d === 0 ? "start" : d + stepD > days ? "end" : "middle"}">${d ? "+" + d + " DAYS" : "LANDING"}</text>`;
    const load = getEnergy().loadW;
    return `<svg class="en-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Panel power and battery level over the mission, hour by hour">${ticks}
      <path d="${area}" class="en-power"/><line x1="${L}" x2="${W - R}" y1="${yP(load)}" y2="${yP(load)}" class="en-load"/>
      <text x="${L - 6}" y="${yP(b.peakW) + 4}" class="en-ax" text-anchor="end">${watts(b.peakW)}</text><text x="${L - 6}" y="${yP(0) + 4}" class="en-ax" text-anchor="end">0</text>
      <text x="${W - R - 6}" y="${yP(load) - 6}" class="en-loadt" text-anchor="end">THE LANDER USES ${watts(load)}</text>
      <text x="${L + 6}" y="${top + 13}" class="en-cap">PANEL POWER</text>
      <line x1="${L}" x2="${W - R}" y1="${yB(0)}" y2="${yB(0)}" class="en-full"/><path d="${line}" class="en-batt"/>
      <text x="${L - 6}" y="${yB(0) + 4}" class="en-ax" text-anchor="end">FULL</text><text x="${L - 6}" y="${yB(-bMax) + 4}" class="en-ax" text-anchor="end">${b.batteryWh > 0 ? "−" + kwh(b.batteryWh).replace(" kWh", "") : ""}</text>
      <text x="${L + 6}" y="${mid + 14}" class="en-cap">BATTERY (kWh BELOW FULL)</text></svg>`;
  }

  function build() {
    const c = getContext(), e = getEnergy(), p = planStats(c.site, c.t0, c.req, c.terrain, e), b = p.energy;
    const seg = ROWS.map(([k, label, show]) => `<div class="en-row"><span>${label}</span><div class="seg" data-k="${k}">${ENERGY_OPTIONS[k].map((v) => `<button data-v="${v}" class="${e[k] === v ? "on" : ""}">${show(v)}</button>`).join("")}</div></div>`).join("");
    const ratio = b.usedWh ? b.inWh / b.usedWh : 0;
    const verdict = b.enough
      ? `<div class="en-verdict go"><b>ENOUGH ENERGY</b><span>THE PANEL COLLECTS ${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)} TIMES WHAT THE LANDER USES OVER THE ${c.req.days}-DAY MISSION${b.batteryWh > 0 ? `, WITH A BATTERY OF AT LEAST ${kwh(b.batteryWh)} FOR THE TIMES WITHOUT ENOUGH SUN` : ", AND NEVER DROPS BELOW WHAT THE LANDER NEEDS"}</span></div>`
      : `<div class="en-verdict nogo"><b>NOT ENOUGH ENERGY</b><span>THE PANEL COLLECTS ${kwh(b.inWh)} AND THE LANDER USES ${kwh(b.usedWh)}. NO BATTERY SIZE FIXES THAT: IT NEEDS A BIGGER PANEL, LESS POWER USE, OR MORE SUN</span></div>`;
    const tile = (big, text) => `<div><b>${big}</b><span>${text}</span></div>`;
    body.innerHTML = `
      <p class="en-lead">${fmt.site(c.site)} · LANDING ${fmt.stamp(c.t0)} · ${c.req.days}-DAY MISSION</p>
      <div class="en-top"><div class="en-inputs"><h3 class="band" data-band="2" data-ico="sliders"><b class="h-t">YOUR LANDER</b> · <b class="h-do">CLICK TO CHANGE</b></h3>${seg}
        <p class="en-note">THESE THREE ARE YOURS TO SET. THEY ARE VALUES TO START FROM, NOT A REAL LANDER'S NUMBERS.</p></div>
        <div class="en-out">${verdict}<div class="proof-tiles en-tiles">
          ${tile(watts(b.peakW), "FROM THE PANEL IN FULL SUN")}${tile(kwh(b.inWh), "COLLECTED OVER THE MISSION")}${tile(kwh(b.usedWh), "USED BY THE LANDER")}${tile(b.enough ? (b.batteryWh > 0 ? kwh(b.batteryWh) : "NONE") : "—", "BATTERY NEEDED")}</div></div></div>
      <h3 class="band" data-band="1" data-ico="bolt"><b class="h-t">HOUR BY HOUR</b> · PANEL POWER ON TOP, THE BATTERY BELOW</h3>
      ${chart(b, c.t0)}
      <ul class="en-facts">
        <li>${b.onBatteryLongestH ? `<b>LONGEST TIME ON THE BATTERY: ${b.onBatteryLongestH} H</b>, STARTING ${fmt.stamp(b.onBatteryStart)}.` : "<b>NEVER ON THE BATTERY:</b> THE PANEL ALWAYS GIVES AT LEAST WHAT THE LANDER USES."}</li>
        <li><b>THE SUN IS ${b.meanSunEl == null ? "NEVER UP" : b.meanSunEl.toFixed(1) + "° HIGH ON AVERAGE"}.</b> ${b.inWh > 0 ? `THE SAME PANEL LYING FLAT ON LEVEL GROUND WOULD COLLECT ONLY ${Math.max(0, b.flatShare * 100).toFixed(b.flatShare < 0.1 ? 1 : 0)}% OF THIS, SO THE PANEL IN THIS ESTIMATE ALWAYS FACES THE SUN.` : ""}</li>
      </ul>
      <details class="proof-sec"><summary><h3><b class="h-t">HOW THIS IS WORKED OUT</b> · AND WHAT IT LEAVES OUT</h3></summary>
        <ul>
          <li><b>Sunlight strength:</b> ${SOLAR_W_M2.toLocaleString("en-US")} watts on every square meter facing the Sun. NASA's SORCE Total Irradiance Monitor measured 1,360.8 W/m² at the Earth's distance from the Sun (Kopp &amp; Lean 2011); the Moon is at that distance too, and has no air to weaken it.</li>
          <li><b>Each hour:</b> panel size × efficiency × ${SOLAR_W_M2.toLocaleString("en-US")} × the share of the Sun's disc in view. That share is LUNI's own, from NASA SPICE (where the Sun is), NASA LRO LOLA (the skyline) and any eclipse by the Earth.</li>
          <li><b>The battery:</b> starts full. Each hour it gains what the panel gives beyond the lander's use, or loses the shortfall. The size shown is the deepest it is ever drawn down.</li>
          <li><b>Not modeled:</b> the Sun's distance changing by about 3% over the year, a panel that cannot turn all the way to the Sun, dust, heat and aging of the cells, heaters that draw more in the dark, and losses in the battery and wiring. A real power budget needs those. This is a first look.</li>
        </ul></details>`;
    body.querySelectorAll(".seg[data-k] button").forEach((btn) => btn.addEventListener("click", () => { setEnergy(btn.parentElement.dataset.k, +btn.dataset.v); build(); onChange?.(); }));
  }
  function toggle(show = box.hidden) {
    if (show) { build(); showData("energy"); }
    box.hidden = !show; $("energy-btn").classList.toggle("on", show);
    if (show) body.scrollTop = 0;
  }
  $("energy-btn").addEventListener("click", () => toggle());
  $("energy-close").addEventListener("click", () => toggle(false));
  return { toggle, isOpen: () => !box.hidden, refresh: () => { if (!box.hidden) build(); },
           // for the POWER readout and ASK LUNI: this hour's panel power, and the mission's budget
           now: (sunFrac) => SOLAR_W_M2 * getEnergy().areaM2 * getEnergy().effPct / 100 * sunFrac,
           budget: () => { const c = getContext(); return energyBudget(c.samples, c.req.days * 24, getEnergy()); } };
}
