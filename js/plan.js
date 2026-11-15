// One plan (a site, a landing time, the mission needs) as numbers a person can compare, and its energy budget.
// Pure functions: no page, so the checks can run them in Node.
import { sampleSite, terrainFor } from "./model.js";
import { analyze } from "./mission.js";

// Sunlight strength where the Moon is. NASA's SORCE Total Irradiance Monitor measured 1,360.8 W per square meter at
// the Earth's distance from the Sun (Kopp & Lean 2011), usually given as 1,361. The Moon keeps within 0.3% of that
// distance; like the Earth it is about 3% closer to the Sun in January than in July, which is not modeled here.
export const SOLAR_W_M2 = 1361;
// The lander's side of the sum is the user's to set. These are choices to start from, not a real lander's numbers.
export const ENERGY_OPTIONS = { areaM2: [1, 2, 5, 10], effPct: [20, 25, 30], loadW: [100, 200, 500, 1000] };
export const DEFAULT_ENERGY = { areaM2: 2, effPct: 30, loadW: 200 };

// Hour by hour over the mission: what a panel that always faces the Sun collects, what the lander uses, and the
// battery that would carry it through every stretch when the panel gives less than the lander needs.
//   samples: hourly, starting at the landing (from sampleSite). e: { areaM2, effPct, loadW }.
export function energyBudget(samples, missionHours, e) {
  const peakW = SOLAR_W_M2 * e.areaM2 * e.effPct / 100, n = Math.min(missionHours, samples.length), D = Math.PI / 180;
  let inWh = 0, flatWh = 0, level = 0, batteryWh = 0, run = 0, runStart = 0, longest = 0, longestStart = 0, elSum = 0, sunHours = 0;
  const power = new Float32Array(n), battery = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = samples[i], g = peakW * s.sunFrac;                 // the share of the Sun's disc in view, times the panel in full Sun
    power[i] = g; inWh += g;
    flatWh += g * Math.max(0, Math.sin(s.sunEl * D));            // the same panel lying flat on level ground
    if (s.sunFrac > 0) { elSum += s.sunEl; sunHours++; }
    level = Math.min(0, level + g - e.loadW);                    // starts full; a surplus refills it, never past full
    battery[i] = level; batteryWh = Math.max(batteryWh, -level);
    if (g < e.loadW) { if (!run) runStart = i; if (++run > longest) { longest = run; longestStart = runStart; } } else run = 0;
  }
  const usedWh = e.loadW * n;
  return { peakW, inWh, usedWh, balanceWh: inWh - usedWh, enough: inWh >= usedWh, batteryWh, endShortWh: -level,
           onBatteryLongestH: longest, onBatteryStart: longest ? samples[longestStart].t : null,
           flatShare: inWh > 0 ? flatWh / inWh : 0, meanSunEl: sunHours ? elSum / sunHours : null, power, battery, hours: n };
}

// The numbers for one plan. terrain: the site's skyline (its own detailed one for a listed site).
//   spanHours: how far ahead to look when measuring "sunlight to spare". Pass the same span the main verdict uses,
//   or the two will give different answers for the same plan.
export function planStats(site, t0, req, terrain = terrainFor(site), energy = DEFAULT_ENERGY, spanHours = 0) {
  const hours = Math.max((req.days + 3) * 24 + req.maxDarkH, Math.round(spanHours));
  const samples = sampleSite(site, t0, hours, terrain);
  const a = analyze(samples, req, 1, terrain), v = a.at(0), M = a.missionSteps;
  let sunH = 0, earthH = 0, dark = 0, longestDark = 0;
  for (let i = 0; i < M; i++) {
    const s = samples[i];
    if (s.sunUp) { sunH++; dark = 0; } else if (++dark > longestDark) longestDark = dark;
    if (s.earthUp) earthH++;
  }
  return { site, t0, ok: v.ok, reasons: v.reasons, missionHours: M, sunHours: sunH, sunPct: sunH / M * 100, longestDarkH: longestDark,
           marginHours: v.marginHours, marginOpen: v.marginOpen, earthHours: earthH, earthPct: v.earthPct,
           slopeDeg: terrain.slopeDeg ?? null, heightM: terrain.heightM ?? null, reduced: !!terrain.reduced || !terrain.real,
           energy: energyBudget(samples, M, energy), samples };
}
