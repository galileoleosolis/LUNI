// Landing-window calendar: one cell per day for the next 12 months.
const SVGNS = "http://www.w3.org/2000/svg";
const C = { amb: "#ffb000", dim: "#8a6614", grn: "#21e07a", cy: "#5ac8ff", wht: "#f4f4f4", off: "#1b1b1b" };
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export const CAL = { left: 52, right: 4, top: 12, landH: 22, rowH: 6, gap: 3 };

function el(tag, attrs, parent, text) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  parent.appendChild(n);
  return n;
}

// days: [{ ok, sun, earth, t }]; t0Day / missionDays position the landing marker and mission bar.
export function renderCalendar(svg, days, { t0Day, missionDays }) {
  const W = svg.clientWidth || 700, H = svg.clientHeight || 74;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const n = days.length, w = (W - CAL.left - CAL.right) / n;
  const yLand = CAL.top, ySun = yLand + CAL.landH + CAL.gap, yEarth = ySun + CAL.rowH + 2, yAxis = yEarth + CAL.rowH;
  const iso = (d) => d.toISOString().slice(0, 10);

  el("text", { x: 0, y: yLand + CAL.landH / 2 + 4, fill: C.grn, "font-size": 11 }, svg, "LAND");
  el("text", { x: 0, y: ySun + 6, fill: C.dim, "font-size": 8 }, svg, "SUN");
  el("text", { x: 0, y: yEarth + 6, fill: C.dim, "font-size": 8 }, svg, "EARTH");

  days.forEach((d, i) => {
    const x = CAL.left + i * w, cw = Math.max(0.6, w - (w > 3 ? 0.6 : 0));
    const r = el("rect", { x, y: yLand, width: cw, height: CAL.landH, fill: d.ok >= 0.999 ? C.grn : d.ok > 0 ? C.amb : C.off }, svg);
    el("title", {}, r, `${iso(d.t)} · GOOD LANDING HOURS ${Math.round(d.ok * 24)}/24 · SUN ${Math.round(d.sun * 100)}% · EARTH ${Math.round(d.earth * 100)}%`);
    if (d.sun > 0) el("rect", { x, y: ySun, width: cw, height: CAL.rowH, fill: C.grn, opacity: 0.25 + 0.75 * d.sun }, svg);
    if (d.earth > 0) el("rect", { x, y: yEarth, width: cw, height: CAL.rowH, fill: C.cy, opacity: 0.25 + 0.75 * d.earth }, svg);
    if (d.t.getUTCDate() === 1) {
      el("line", { x1: x, x2: x, y1: yLand - 3, y2: yAxis + 3, stroke: C.dim, "stroke-width": 1 }, svg);
      if (x < W - 30) el("text", { x: x + 3, y: yAxis + 12, fill: C.dim, "font-size": 10 }, svg,
        MON[d.t.getUTCMonth()] + (d.t.getUTCMonth() === 0 || i === 0 ? " '" + String(d.t.getUTCFullYear()).slice(2) : ""));
    }
  });

  if (t0Day >= 0 && t0Day < n) {
    const x = CAL.left + (t0Day + 0.5) * w, x1 = Math.min(W - CAL.right, CAL.left + (t0Day + missionDays) * w);
    el("rect", { x: CAL.left + t0Day * w, y: yLand - 2, width: Math.max(2, x1 - CAL.left - t0Day * w), height: CAL.landH + 4, fill: "none", stroke: C.wht, "stroke-width": 1.5 }, svg);
    el("path", { d: `M${x - 5},0H${x + 5}L${x},7Z`, fill: C.wht }, svg);
  }
}

// Which day index an x position (client coordinates) falls on, or -1.
export function dayFromEvent(svg, e, nDays) {
  const r = svg.getBoundingClientRect();
  const f = (e.clientX - r.left - CAL.left) / (r.width - CAL.left - CAL.right);
  return f < 0 || f >= 1 ? -1 : Math.floor(f * nDays);
}
