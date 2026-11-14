import { SITES, CUSTOM_ID } from "./sites.js";
import { getScenario, summarize, hoursUntilChange, horizonAt, STEP_HOURS, IS_DEMO } from "./model.js";

const $ = (id) => document.getElementById(id);
const SVGNS = "http://www.w3.org/2000/svg";

const state = {
  site: SITES[0],
  start: roundToHour(new Date()),
  idx: 0,
  scenario: null,
  summary: null,
  pinned: [],
  playing: null,
};

// ---------- helpers ----------
function roundToHour(d) { const x = new Date(d); x.setUTCMinutes(0, 0, 0); return x; }
function toInputValue(d) { return d.toISOString().slice(0, 16); }
function fromInputValue(v) { return new Date(v + ":00Z"); }
function fmtDate(d) {
  return d.toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " UTC";
}
function fmtShortDate(d) { return d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short" }); }
function fmtDur(h) {
  if (h == null) return "> 30 d";
  const d = Math.floor(h / 24), r = Math.round(h % 24);
  return d > 0 ? `${d} d ${r} h` : `${r} h`;
}
function fmtDeg(x) { return `${x.toFixed(2)}°`; }
function pct(x) { return `${Math.round(x * 100)}%`; }
function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}
function siteLabel(site) { return site.id === CUSTOM_ID ? `Custom (${site.lat.toFixed(2)}°, ${site.lon.toFixed(2)}°E)` : site.name; }

// ---------- controls ----------
function initControls() {
  const sel = $("site-select");
  const groups = {};
  for (const s of SITES) (groups[s.group] ||= []).push(s);
  for (const [g, list] of Object.entries(groups)) {
    const og = document.createElement("optgroup"); og.label = g;
    for (const s of list) { const o = document.createElement("option"); o.value = s.id; o.textContent = s.name; og.appendChild(o); }
    sel.appendChild(og);
  }
  const oc = document.createElement("option"); oc.value = CUSTOM_ID; oc.textContent = "Custom coordinates…"; sel.appendChild(oc);

  sel.addEventListener("change", () => {
    if (sel.value === CUSTOM_ID) {
      state.site = { id: CUSTOM_ID, name: "Custom", lat: +$("lat-input").value, lon: +$("lon-input").value };
    } else {
      state.site = SITES.find((s) => s.id === sel.value);
    }
    recompute();
  });

  const onCoord = () => {
    const lat = parseFloat($("lat-input").value), lon = parseFloat($("lon-input").value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) return;
    state.site = { id: CUSTOM_ID, name: "Custom", lat, lon };
    sel.value = CUSTOM_ID;
    recompute();
  };
  $("lat-input").addEventListener("change", onCoord);
  $("lon-input").addEventListener("change", onCoord);

  $("date-input").addEventListener("change", (e) => {
    if (!e.target.value) return;
    state.start = fromInputValue(e.target.value);
    recompute();
  });
  document.querySelectorAll("[data-slip]").forEach((b) =>
    b.addEventListener("click", () => {
      state.start = new Date(state.start.getTime() + Number(b.dataset.slip) * 86400000);
      recompute();
    }));

  $("time-slider").addEventListener("input", (e) => { state.idx = +e.target.value; renderMoment(); });
  $("play-btn").addEventListener("click", togglePlay);
  $("pin-btn").addEventListener("click", pinCurrent);

  $("timeline").addEventListener("click", (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left - TL.left) / (r.width - TL.left - TL.right);
    if (f < 0 || f > 1) return;
    state.idx = Math.round(f * (state.scenario.samples.length - 1));
    renderMoment();
  });

  if (!IS_DEMO) $("data-badge").remove();
  window.addEventListener("resize", () => { renderTimeline(); renderMoment(); });
}

function syncInputs() {
  $("site-select").value = state.site.id;
  $("lat-input").value = state.site.lat;
  $("lon-input").value = state.site.lon;
  $("date-input").value = toInputValue(state.start);
  $("site-note").textContent = state.site.approx ? "Approximate coordinates (to be verified)." : "";
}

function togglePlay() {
  if (state.playing) { clearInterval(state.playing); state.playing = null; $("play-btn").textContent = "▶"; return; }
  $("play-btn").textContent = "⏸";
  state.playing = setInterval(() => {
    state.idx = (state.idx + 1) % state.scenario.samples.length;
    renderMoment();
  }, 50);
}

// ---------- compute ----------
function recompute() {
  state.scenario = getScenario(state.site, state.start);
  state.summary = summarize(state.scenario.samples);
  state.idx = 0;
  $("time-slider").max = state.scenario.samples.length - 1;
  syncInputs();
  renderSummary();
  renderTimeline();
  renderMoment();
}

// ---------- summary + verdict ----------
function renderSummary() {
  const s = state.summary;
  $("pct-sun").textContent = pct(s.pctSun);
  $("pct-earth").textContent = pct(s.pctEarth);
  $("pct-both").textContent = pct(s.pctBoth);
  $("max-dark").textContent = s.maxDarkHours === 0 ? "none" : fmtDur(s.maxDarkHours);
}

function renderVerdict(cur, sunLeft, earthLeft) {
  const v = $("verdict");
  let cls, icon, title, sub;
  if (!cur.sunUp) {
    cls = "bad"; icon = "🌑"; title = "No sunlight at this moment";
    const back = sunLeft == null ? "not within 30 days" : `in ${fmtDur(sunLeft)}`;
    sub = `Solar power unavailable. Sun returns ${back}.`;
  } else if (!cur.earthUp) {
    cls = "warn"; icon = "📡"; title = "Sunlit, but no direct Earth link";
    sub = `Power OK for ${fmtDur(sunLeft)}. Earth rises ${earthLeft == null ? "not within 30 days" : `in ${fmtDur(earthLeft)}`} (relay needed until then).`;
  } else if (sunLeft != null && sunLeft < 72) {
    cls = "warn"; icon = "⏳"; title = "Good now, but sunset is close";
    sub = `Sunset in ${fmtDur(sunLeft)}, Earthset in ${fmtDur(earthLeft)}.`;
  } else {
    cls = "good"; icon = "✅"; title = "Good landing window";
    sub = `Sunlight for ${fmtDur(sunLeft)} and Earth contact for ${fmtDur(earthLeft)}.`;
  }
  v.className = `verdict ${cls}`;
  v.innerHTML = `<span class="v-icon">${icon}</span><div><div class="v-title">${title}</div><div class="v-sub">${siteLabel(state.site)} · ${fmtDate(cur.t)} — ${sub}</div></div>`;
}

// ---------- moment (cards + horizon) ----------
function renderMoment() {
  const { samples } = state.scenario;
  const cur = samples[state.idx];
  $("time-slider").value = state.idx;
  const dayN = Math.floor(state.idx * STEP_HOURS / 24), hr = (state.idx * STEP_HOURS) % 24;
  $("time-label").textContent = `Day ${dayN} +${hr}h · ${fmtDate(cur.t)}`;

  const sunLeft = hoursUntilChange(samples, state.idx, "sunUp");
  const earthLeft = hoursUntilChange(samples, state.idx, "earthUp");

  setState("sun-state", cur.sunUp, "Sunlit", "In shadow");
  $("sun-el").textContent = fmtDeg(cur.sunEl);
  $("sun-az").textContent = fmtDeg(cur.sunAz);
  $("sun-next-label").textContent = cur.sunUp ? "Sunset in" : "Sunrise in";
  $("sun-next").textContent = fmtDur(sunLeft);

  setState("earth-state", cur.earthUp, "In view", "Below horizon");
  $("earth-el").textContent = fmtDeg(cur.earthEl);
  $("earth-az").textContent = fmtDeg(cur.earthAz);
  $("earth-next-label").textContent = cur.earthUp ? "Earthset in" : "Earthrise in";
  $("earth-next").textContent = fmtDur(earthLeft);

  renderVerdict(cur, sunLeft, earthLeft);
  renderHorizon();
  renderTimelineCursor();
}

function setState(id, on, yes, no) {
  const n = $(id);
  n.textContent = on ? yes : no;
  n.className = `big ${on ? "on" : "off"}`;
}

function renderHorizon() {
  const svg = $("horizon");
  const W = svg.clientWidth || 800, H = svg.clientHeight || 260;
  const P = { l: 44, r: 12, t: 12, b: 26 };
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();

  const { horizon, samples } = state.scenario;
  const win = 72 / STEP_HOURS; // ±3 days of path
  const lo = Math.max(0, state.idx - win), hi = Math.min(samples.length - 1, state.idx + win);
  const pathPts = samples.slice(lo, hi + 1);
  let yMax = Math.max(8, ...horizon) + 2;
  for (const s of pathPts) yMax = Math.max(yMax, s.sunEl + 2, s.earthEl + 2);
  yMax = Math.min(90, Math.ceil(yMax));
  const yMin = Math.min(-3, Math.floor(Math.min(...horizon) - 1));

  const x = (az) => P.l + (az / 360) * (W - P.l - P.r);
  const y = (e) => P.t + (1 - (e - yMin) / (yMax - yMin)) * (H - P.t - P.b);

  // sky gradient
  const defs = el("defs", {}, svg);
  const g = el("linearGradient", { id: "sky", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el("stop", { offset: "0%", "stop-color": "#05070c" }, g);
  el("stop", { offset: "100%", "stop-color": "#0d1322" }, g);
  const glow = el("filter", { id: "glow", x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
  el("feGaussianBlur", { stdDeviation: 3, result: "b" }, glow);
  const m = el("feMerge", {}, glow); el("feMergeNode", { in: "b" }, m); el("feMergeNode", { in: "SourceGraphic" }, m);
  el("rect", { x: P.l, y: P.t, width: W - P.l - P.r, height: H - P.t - P.b, fill: "url(#sky)" }, svg);

  // grid
  const step = yMax - yMin > 30 ? 15 : yMax - yMin > 12 ? 5 : 2;
  for (let e = Math.ceil(yMin / step) * step; e <= yMax; e += step) {
    el("line", { x1: P.l, x2: W - P.r, y1: y(e), y2: y(e), stroke: e === 0 ? "#3b4763" : "#18202f", "stroke-dasharray": e === 0 ? "4 4" : "" }, svg);
    const t = el("text", { x: P.l - 6, y: y(e) + 4, "text-anchor": "end", fill: "#5f6b82", "font-size": 11 }, svg); t.textContent = `${e}°`;
  }
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
  dirs.forEach((d, i) => {
    const az = i * 45;
    el("line", { x1: x(az), x2: x(az), y1: P.t, y2: H - P.b, stroke: "#18202f" }, svg);
    const t = el("text", { x: x(az), y: H - 8, "text-anchor": "middle", fill: "#8a96ad", "font-size": 11, "font-weight": 600 }, svg); t.textContent = d;
  });

  // body paths (break where azimuth wraps)
  const drawPath = (key, color) => {
    let d = "", prev = null;
    for (const s of pathPts) {
      const az = s[`${key}Az`], e = s[`${key}El`];
      d += (prev == null || Math.abs(az - prev) > 180 ? "M" : "L") + x(az).toFixed(1) + "," + y(e).toFixed(1);
      prev = az;
    }
    el("path", { d, fill: "none", stroke: color, "stroke-width": 1.5, "stroke-opacity": 0.5, "stroke-dasharray": "3 3" }, svg);
  };
  drawPath("sun", "var(--sun)");
  drawPath("earth", "var(--earth)");

  // terrain (drawn over paths so it visibly blocks them)
  let td = `M${x(0)},${y(yMin)}`;
  for (let az = 0; az <= 360; az++) td += `L${x(az).toFixed(1)},${y(horizonAt(horizon, az % 360)).toFixed(1)}`;
  td += `L${x(360)},${y(yMin)}Z`;
  el("path", { d: td, fill: "var(--terrain)", stroke: "var(--terrain-edge)", "stroke-width": 1.2 }, svg);

  // current positions
  const cur = samples[state.idx];
  const drawBody = (az, e, up, color, r, label) => {
    const cx = x(az), cy = y(Math.max(yMin, Math.min(yMax, e)));
    el("circle", { cx, cy, r, fill: up ? color : "none", stroke: color, "stroke-width": 2, filter: up ? "url(#glow)" : "", opacity: up ? 1 : 0.6 }, svg);
    const t = el("text", { x: cx, y: cy - r - 6, "text-anchor": "middle", fill: color, "font-size": 11, "font-weight": 700 }, svg);
    t.textContent = up ? label : `${label} (blocked)`;
  };
  drawBody(cur.earthAz, cur.earthEl, cur.earthUp, "var(--earth)", 6, "Earth");
  drawBody(cur.sunAz, cur.sunEl, cur.sunUp, "var(--sun)", 8, "Sun");
}

// ---------- timeline ----------
const TL = { left: 56, right: 8, top: 8, rowH: 22, gap: 8 };

function renderTimeline() {
  const svg = $("timeline");
  const W = svg.clientWidth || 800, H = svg.clientHeight || 120;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const { samples } = state.scenario;
  const n = samples.length, w = (W - TL.left - TL.right) / n;
  const rows = [["Sun", (s) => s.sunUp, "var(--sun)"], ["Earth", (s) => s.earthUp, "var(--earth)"], ["Both", (s) => s.sunUp && s.earthUp, "var(--both)"]];

  rows.forEach(([name, fn, color], r) => {
    const yy = TL.top + r * (TL.rowH + TL.gap);
    el("rect", { x: TL.left, y: yy, width: W - TL.left - TL.right, height: TL.rowH, fill: "var(--dark)", rx: 3 }, svg);
    let i = 0;
    while (i < n) {
      if (!fn(samples[i])) { i++; continue; }
      let j = i; while (j < n && fn(samples[j])) j++;
      el("rect", { x: TL.left + i * w, y: yy, width: (j - i) * w, height: TL.rowH, fill: color, rx: 2 }, svg);
      i = j;
    }
    const t = el("text", { x: TL.left - 8, y: yy + TL.rowH / 2 + 4, "text-anchor": "end", fill: "#8a96ad", "font-size": 11 }, svg); t.textContent = name;
  });

  const yAxis = TL.top + 3 * (TL.rowH + TL.gap) + 2;
  const tickEvery = W < 520 ? 10 : 5;
  for (let day = 0; day <= 30; day += tickEvery) {
    const xx = TL.left + (day * 24 / STEP_HOURS) * w;
    el("line", { x1: xx, x2: xx, y1: TL.top, y2: yAxis - 4, stroke: "#07090f", "stroke-width": 1 }, svg);
    const idx = Math.min(n - 1, day * 24 / STEP_HOURS);
    const t = el("text", { x: xx, y: yAxis + 10, "text-anchor": day === 0 ? "start" : day === 30 ? "end" : "middle", fill: "#5f6b82", "font-size": 10 }, svg);
    t.textContent = `${fmtShortDate(samples[idx].t)}`;
  }
  el("line", { id: "tl-cursor", x1: 0, x2: 0, y1: TL.top - 4, y2: yAxis - 2, stroke: "#fff", "stroke-width": 2 }, svg);
}

function renderTimelineCursor() {
  const svg = $("timeline");
  const c = svg.querySelector("#tl-cursor"); if (!c) return;
  const W = svg.clientWidth || 800, n = state.scenario.samples.length;
  const xx = TL.left + (state.idx + 0.5) * (W - TL.left - TL.right) / n;
  c.setAttribute("x1", xx); c.setAttribute("x2", xx);
}

// ---------- comparison ----------
function pinCurrent() {
  const key = `${state.site.lat},${state.site.lon},${state.start.toISOString()}`;
  if (state.pinned.some((p) => p.key === key)) return;
  state.pinned.push({ key, site: { ...state.site }, start: new Date(state.start), summary: state.summary });
  renderCompare();
}

function renderCompare() {
  const list = $("compare-list");
  list.replaceChildren();
  if (!state.pinned.length) { list.innerHTML = `<p class="hint">No scenarios pinned yet. Use “Add to comparison”.</p>`; return; }
  const score = (p) => p.summary.pctSun * 0.6 + p.summary.pctEarth * 0.4;
  const best = state.pinned.length > 1 ? state.pinned.reduce((a, b) => (score(b) > score(a) ? b : a)) : null;
  for (const p of state.pinned) {
    const d = document.createElement("div");
    d.className = "cmp" + (p === best ? " best" : "");
    const bar = (v, c) => `<div class="bar"><i style="width:${Math.round(v * 100)}%;background:${c}"></i></div>`;
    d.innerHTML = `
      ${p === best ? '<div class="tag">BEST OPTION</div>' : ""}
      <div class="cmp-title">${siteLabel(p.site)}</div>
      <div class="cmp-date">${fmtDate(p.start)}</div>
      <div class="bars">
        <span>Sunlight</span>${bar(p.summary.pctSun, "var(--sun)")}<b>${pct(p.summary.pctSun)}</b>
        <span>Earth</span>${bar(p.summary.pctEarth, "var(--earth)")}<b>${pct(p.summary.pctEarth)}</b>
        <span>Both</span>${bar(p.summary.pctBoth, "var(--both)")}<b>${pct(p.summary.pctBoth)}</b>
      </div>
      <div class="kv"><span>Longest dark</span><b>${p.summary.maxDarkHours ? fmtDur(p.summary.maxDarkHours) : "none"}</b></div>
      <button class="x" title="Remove">✕</button>`;
    d.querySelector(".x").addEventListener("click", (e) => {
      e.stopPropagation();
      state.pinned = state.pinned.filter((q) => q !== p);
      renderCompare();
    });
    d.addEventListener("click", () => { state.site = p.site; state.start = new Date(p.start); recompute(); });
    list.appendChild(d);
  }
}

// ---------- go ----------
initControls();
recompute();
