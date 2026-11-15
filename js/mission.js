// Mission needs: what counts as a "good" landing time, and where the good landing windows are.
// Pure functions over hourly samples ({ sunUp, earthUp, t }), so they run in the page, in workers and in Node tests.

export const DEFAULT_REQ = {
  days: 10,            // mission length
  maxDarkH: 12,        // longest stretch without sunlight the mission can ride out
  earthAtLanding: true,
  earthMinPct: 0,      // minimum share of the mission with Earth in view (0 = any)
  maxSlopeDeg: 0,      // steepest ground the lander accepts, in degrees (0 = any; the choice is the planner's, LUNI suggests no limit)
};
export const REQ_OPTIONS = { days: [3, 7, 10, 14, 28], maxDarkH: [0, 12, 24, 48], earthMinPct: [0, 25, 50, 75], maxSlopeDeg: [0, 5, 10, 15] };

// One pass over the samples. Afterwards `at(i)` and `mask` answer "can we land at hour i?".
//
// Rules for landing at hour i with a mission of M hours:
//   1. the Sun is up at landing;
//   2. no dark period longer than maxDarkH begins before the mission ends
//      (held[i] = hours from i until such a period begins);
//   3. Earth is in view at landing, if required;
//   4. Earth is in view for at least earthMinPct of the mission;
//   5. the ground is no steeper than maxSlopeDeg, when a limit is set and the slope is known
//      (ground = { slopeDeg, slopeBaseM }: a property of the place, the same at every hour).
export function analyze(samples, req, stepHours = 1, ground = null) {
  const steep = req.maxSlopeDeg > 0 && ground?.slopeDeg != null && ground.slopeDeg > req.maxSlopeDeg;
  const n = samples.length, M = Math.round(req.days * 24 / stepHours), maxDark = req.maxDarkH / stepHours;
  const held = new Int32Array(n), earthSum = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) earthSum[i + 1] = earthSum[i] + (samples[i].earthUp ? 1 : 0);

  // Walk backwards, tracking where the next too-long dark period starts.
  let nextLong = n, known = false;      // known = a long dark period was actually found (not just the end of data)
  const knownAt = new Uint8Array(n);
  for (let i = n - 1; i >= 0;) {
    if (samples[i].sunUp) { held[i] = nextLong - i; knownAt[i] = known ? 1 : 0; i--; continue; }
    let j = i; while (j >= 0 && !samples[j].sunUp) j--;          // dark run is j+1 .. i
    if (i - j > maxDark) { nextLong = j + 1; known = true; }
    for (let k = i; k > j; k--) { held[k] = 0; knownAt[k] = 1; }
    i = j;
  }

  const earthPct = (i) => { const e = Math.min(n, i + M); return e > i ? (earthSum[e] - earthSum[i]) / (e - i) * 100 : 0; };
  const mask = new Uint8Array(n);
  for (let i = 0; i + M <= n; i++) {
    mask[i] = !steep && samples[i].sunUp && held[i] >= M && (!req.earthAtLanding || samples[i].earthUp) && earthPct(i) >= req.earthMinPct ? 1 : 0;
  }

  return {
    mask, held, missionSteps: M, stepHours,
    // Full verdict for landing at sample i.
    at(i) {
      const s = samples[i], reasons = [], ep = earthPct(i);
      if (!s.sunUp) reasons.push("NO SUN AT LANDING");
      else if (held[i] < M) reasons.push(`SUN LOST AFTER ${fmtDH(held[i] * stepHours)}`);
      if (req.earthAtLanding && !s.earthUp) reasons.push("NO EARTH LINK AT LANDING");
      if (ep < req.earthMinPct) reasons.push(`EARTH LINK ${Math.round(ep)}% (NEED ${req.earthMinPct}%)`);
      if (steep) reasons.push(`GROUND SLOPE ${ground.slopeDeg.toFixed(1)}° (LIMIT ${req.maxSlopeDeg}°)`);
      return {
        ok: reasons.length === 0, reasons, earthPct: ep, steep,
        sunHeldHours: held[i] * stepHours,
        marginHours: (held[i] - M) * stepHours,
        marginOpen: !knownAt[i],            // true = sunlight lasted to the end of the data, so the margin is "at least"
      };
    },
  };
}

// Contiguous runs of good landing hours: [{ i0, i1, start, end }] (i1 exclusive; end = last good hour).
export function windowsFrom(mask, samples) {
  const out = [];
  for (let i = 0; i < mask.length;) {
    if (!mask[i]) { i++; continue; }
    let j = i; while (j < mask.length && mask[j]) j++;
    out.push({ i0: i, i1: j, start: samples[i].t, end: samples[j - 1].t });
    i = j;
  }
  return out;
}

// Per-day shares for the calendar strip: good landing hours, sunlit hours, Earth-in-view hours.
export function dailyStats(samples, mask, days, stepsPerDay = 24) {
  const out = [];
  for (let d = 0; d < days; d++) {
    let ok = 0, sun = 0, earth = 0, n = 0;
    for (let i = d * stepsPerDay; i < (d + 1) * stepsPerDay && i < samples.length; i++, n++) {
      ok += mask[i]; sun += samples[i].sunUp ? 1 : 0; earth += samples[i].earthUp ? 1 : 0;
    }
    if (!n) break;
    out.push({ ok: ok / n, sun: sun / n, earth: earth / n, t: samples[d * stepsPerDay].t });
  }
  return out;
}

export function fmtDH(h) {
  const d = Math.floor(h / 24), r = Math.round(h % 24);
  return `${d}D ${String(r).padStart(2, "0")}H`;
}
