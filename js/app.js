import { SITES, CUSTOM_ID, loadSites } from "./sites.js";
import { computeTerrain } from "./terrain.js";
import { hasTerrain, setCustomTerrain, initModel, getScenario, summarize, hoursUntilChange, horizonAt, subPoints, coverage, inCoverage, STEP_HOURS } from "./model.js";
import { createGlobe } from "./globe.js";

const $ = (id) => document.getElementById(id);
const SVGNS = "http://www.w3.org/2000/svg";
const C = { amb: "#ffb000", dim: "#8a6614", faint: "#2a1f06", grn: "#21e07a", red: "#ff3d3d", cy: "#5ac8ff", wht: "#f4f4f4" };

const state = {
  site: null,
  t0: roundToHour(new Date()),   // landing time
  idx: 0,                        // hours after landing (mission clock)
  scenario: null,
  summary: null,
  pinned: [],
  playing: null,
};
let globe = null;

// ---------- formatting ----------
function roundToHour(d) { const x = new Date(d); x.setUTCMinutes(0, 0, 0); return x; }
const pad = (n, w = 2) => String(n).padStart(w, "0");
const toInputValue = (d) => d.toISOString().slice(0, 16);
const fromInputValue = (v) => new Date(v + ":00Z");
const stamp = (d) => d.toISOString().slice(0, 16).replace("T", " ") + "Z";
const fmtBig = (h) => h == null ? "30D+" : `${Math.floor(h / 24)}D ${pad(Math.round(h % 24))}H`;
const fmtT = (h) => h == null ? ">30D" : `${pad(Math.floor(h / 24))}D${pad(Math.round(h % 24))}H`;
const sgn = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(2);
const pct = (x) => `${Math.round(x * 100)}%`;
const fmtLat = (v) => `${Math.abs(v).toFixed(2)}${v < 0 ? "S" : "N"}`;
const normLon = (v) => ((v + 180) % 360 + 360) % 360 - 180;
const fmtLon = (v) => { const l = normLon(v); return `${Math.abs(l).toFixed(2)}${l < 0 ? "W" : "E"}`; };
const siteName = (s) => (s.id === CUSTOM_ID ? "CUSTOM POINT" : s.name).toUpperCase();
function el(tag, attrs = {}, parent, text) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}

// ---------- site selection ----------
function buildSiteList() {
  const box = $("site-list");
  let grp = null, n = 0;
  for (const s of SITES) {
    if (s.group !== grp) { grp = s.group; const g = document.createElement("div"); g.className = "grp"; g.textContent = grp.toUpperCase(); box.appendChild(g); }
    const b = document.createElement("button");
    b.className = "site-row"; b.dataset.id = s.id;
    b.innerHTML = `<span>${pad(++n)} ${s.name}</span><span>${fmtLat(s.lat)}</span>`;
    b.addEventListener("click", () => selectSite(s));
    box.appendChild(b);
  }
}

function selectSite(site, { fly = true } = {}) {
  state.site = site;
  globe?.select(site, { fly });
  recompute();
  if (!hasTerrain(site)) loadCustomTerrain(site);
}

// Custom points: compute the skyline from the reduced LOLA maps, then redraw.
let terrainJob = 0;
async function loadCustomTerrain(site) {
  const job = ++terrainJob;
  state.terrainBusy = true; renderBrief();
  try {
    setCustomTerrain(site, await computeTerrain(site.lat, site.lon));
  } catch (e) {
    console.error(e); state.terrainError = true;
  }
  if (job !== terrainJob) return;
  state.terrainBusy = false;
  if (state.site === site) recompute({ keepIdx: true });
}

function nextSite() {
  const i = SITES.findIndex((s) => s.id === state.site.id);
  selectSite(SITES[(i + 1) % SITES.length]);
}

function syncSiteUI() {
  const s = state.site;
  document.querySelectorAll(".site-row").forEach((b) => b.classList.toggle("sel", b.dataset.id === s.id));
  document.querySelector(".site-row.sel")?.scrollIntoView({ block: "nearest" });
  $("lat-input").value = s.lat; $("lon-input").value = s.lon;
  $("date-input").value = toInputValue(state.t0);
  $("bar-site").textContent = `${siteName(s)} ${fmtLat(s.lat)} ${fmtLon(s.lon)}`;
  $("bar-t0").textContent = stamp(state.t0);
  const note = $("site-note");
  if (s.id === CUSTOM_ID) note.textContent = "CUSTOM POINT";
  else if (s.approx) note.textContent = "APPROXIMATE REGION CENTRE — TO BE VERIFIED";
  else if (s.src) note.innerHTML = `${s.tag} · <a href="${s.src}" target="_blank" rel="noopener">COORDINATE SOURCE</a>`;
  else if (s.srcText) note.textContent = s.srcText.toUpperCase();
  else note.textContent = s.tag || "";
}

// Site details: values LUNO computed from LOLA, then the team's research notes.
function renderBrief() {
  const s = state.site, t = state.scenario.terrain;
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  const num = (v) => (v >= 0 ? "+" : "−") + Math.abs(Math.round(v)).toLocaleString("en-US");
  let h = "";
  if (t.real) {
    h += row("ELEVATION", `${num(t.heightM)} M`);
    h += row("SLOPE", `${t.slopeDeg.toFixed(1)}° OVER ${t.slopeBaseM >= 1000 ? (t.slopeBaseM / 1000).toFixed(1) + " KM" : t.slopeBaseM + " M"}`);
    h += row("SKYLINE", `${sgn(t.min)}° TO ${sgn(t.max)}°`);
    h += row("LOLA MAP", t.maps.join(" + ") + " / PIXEL");
    if (t.reduced) h += row("DETAIL", "REDUCED (CUSTOM POINT)");
  } else {
    h += row("TERRAIN", state.terrainBusy ? "LOADING LOLA MAP…" : "FLAT HORIZON");
  }
  $("brief-lola").innerHTML = h;
  const badge = $("data-badge");
  badge.className = "demo" + (t.real ? " ok" : "");
  badge.textContent = t.real ? `NASA DATA · SPICE DE440 + LOLA TERRAIN${t.reduced ? " (REDUCED DETAIL)" : ""}`
    : state.terrainBusy ? "NASA SPICE POSITIONS · LOADING LOLA TERRAIN…" : "NASA SPICE POSITIONS · FLAT HORIZON (TERRAIN UNAVAILABLE)";
}

// ---------- compute ----------
function recompute({ keepIdx = false } = {}) {
  const cov = coverage(), last = new Date(cov.end.getTime() - 31 * 86400000);
  if (state.t0 < cov.start) state.t0 = cov.start;
  if (state.t0 > last) state.t0 = last;
  state.scenario = getScenario(state.site, state.t0);
  state.summary = summarize(state.scenario.samples);
  if (!keepIdx) state.idx = 0;
  syncSiteUI();
  const s = state.summary;
  $("pct-sun").textContent = pct(s.pctSun);
  $("pct-earth").textContent = pct(s.pctEarth);
  $("pct-both").textContent = pct(s.pctBoth);
  $("max-dark").textContent = s.maxDarkHours ? fmtT(s.maxDarkHours) : "NONE";
  renderBrief();
  renderTimeline();
  renderMoment();
}

function slip(days) {
  state.t0 = new Date(state.t0.getTime() + days * 86400000);
  recompute({ keepIdx: true });
}

function setIdx(i) {
  const n = state.scenario.samples.length;
  state.idx = Math.max(0, Math.min(n - 1, i));
  renderMoment();
}

function togglePlay() {
  const btn = $("play-btn");
  if (state.playing) {
    clearInterval(state.playing); state.playing = null;
    $("play-label").textContent = "▶ PLAY"; btn.classList.remove("on");
    return;
  }
  $("play-label").textContent = "❚❚ PAUSE"; btn.classList.add("on");
  state.playing = setInterval(() => setIdx((state.idx + 2) % state.scenario.samples.length), 60);
}

// ---------- moment: readouts, verdict, horizon, globe ----------
function renderMoment() {
  const { samples } = state.scenario;
  const cur = samples[state.idx];
  const sunLeft = hoursUntilChange(samples, state.idx, "sunUp");
  const earthLeft = hoursUntilChange(samples, state.idx, "earthUp");
  const h = state.idx * STEP_HOURS;

  $("bar-now").textContent = stamp(cur.t);
  $("bar-tplus").textContent = `T+${pad(Math.floor(h / 24))}D${pad(h % 24)}H`;

  const set = (id, on, yes, no) => { const n = $(id); n.textContent = on ? yes : no; n.className = "st " + (on ? "go" : "nogo"); };
  set("sun-state", cur.sunUp, "SUN — GO", "NO SUN");
  $("sun-next-label").textContent = cur.sunUp ? "SUNSET IN" : "SUNRISE IN";
  $("sun-next").textContent = fmtBig(sunLeft);
  $("sun-el").textContent = sgn(cur.sunEl) + "°"; $("sun-az").textContent = cur.sunAz.toFixed(1).padStart(5, "0") + "°";
  set("earth-state", cur.earthUp, "LINK — GO", "NO LINK");
  $("earth-next-label").textContent = cur.earthUp ? "EARTHSET IN" : "EARTHRISE IN";
  $("earth-next").textContent = fmtBig(earthLeft);
  $("earth-el").textContent = sgn(cur.earthEl) + "°"; $("earth-az").textContent = cur.earthAz.toFixed(1).padStart(5, "0") + "°";

  const v = $("verdict");
  let cls, head, tail;
  if (!cur.sunUp) { cls = "nogo"; head = "NO-GO"; tail = `NO SOLAR INPUT · SUNRISE IN ${fmtT(sunLeft)}`; }
  else if (!cur.earthUp) { cls = "caution"; head = "LIMITED"; tail = `SUNLIT, NO DIRECT-TO-EARTH LINK · RELAY NEEDED · EARTHRISE IN ${fmtT(earthLeft)}`; }
  else if (sunLeft != null && sunLeft < 72) { cls = "caution"; head = "CAUTION"; tail = `SUNSET IN ${fmtT(sunLeft)} · EARTHSET IN ${fmtT(earthLeft)}`; }
  else { cls = "go"; head = "GO"; tail = `POWER FOR ${fmtT(sunLeft)} · DIRECT-TO-EARTH LINK FOR ${fmtT(earthLeft)}`; }
  v.className = "verdict " + cls;
  v.innerHTML = `&gt; STATUS: ${head} <span>— ${tail}</span>`;

  renderHorizon(cur);
  renderTimelineCursor();
  const sp = subPoints(cur.t);
  globe?.setBodies(sp.sun, sp.earth);
}

function renderHorizon(cur) {
  const svg = $("horizon");
  const W = svg.clientWidth || 700, H = svg.clientHeight || 230, L = 34, B = 18, T = 6;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const { horizon, samples } = state.scenario;
  const lo = Math.max(0, state.idx - 72), hi = Math.min(samples.length - 1, state.idx + 72);
  const win = samples.slice(lo, hi + 1);

  const tr = state.scenario.terrain;
  let yMax = Math.max(6, tr.max + 2), yMin = Math.min(-4, tr.min - 1);
  for (const s of win) { yMax = Math.max(yMax, s.sunEl + 2, s.earthEl + 2); yMin = Math.min(yMin, Math.max(-12, Math.min(s.sunEl, s.earthEl) - 1)); }
  yMax = Math.min(90, Math.ceil(yMax)); yMin = Math.floor(yMin);
  const x = (a) => L + (a / 360) * (W - L - 4);
  const y = (e) => T + (1 - (e - yMin) / (yMax - yMin)) * (H - B - T);
  const clampY = (e) => y(Math.max(yMin, Math.min(yMax, e)));

  const span = yMax - yMin, step = span > 60 ? 15 : span > 24 ? 10 : span > 12 ? 5 : 2;
  for (let e = Math.ceil(yMin / step) * step; e <= yMax; e += step) {
    el("line", { x1: L, x2: W, y1: y(e), y2: y(e), stroke: e === 0 ? "#5a430c" : "#1d1606" }, svg);
    el("text", { x: L - 6, y: y(e) + 4, fill: C.dim, "font-size": 10, "text-anchor": "end" }, svg, e);
  }
  const narrow = W < 520;
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"].forEach((d, i) => {
    el("line", { x1: x(i * 45), x2: x(i * 45), y1: T, y2: H - B, stroke: "#1d1606" }, svg);
    if (narrow && i % 2) return;
    el("text", { x: Math.min(W - 8, x(i * 45)), y: H - 4, fill: C.dim, "font-size": 10, "text-anchor": "middle" }, svg, narrow ? d : `${pad(i * 45, 3)} ${d}`);
  });

  const track = (key, color) => {
    let d = "", prev = null;
    for (const s of win) {
      const az = s[key + "Az"];
      d += (prev == null || Math.abs(az - prev) > 180 ? "M" : "L") + x(az).toFixed(1) + "," + clampY(s[key + "El"]).toFixed(1);
      prev = az;
    }
    el("path", { d, fill: "none", stroke: color, "stroke-dasharray": "2 4", opacity: 0.75 }, svg);
  };
  track("sun", C.wht); track("earth", C.cy);

  // terrain: filled so it visibly hides whatever is behind it
  let d = `M${x(0)},${H - B}`, ln = "";
  for (let az = 0; az <= 360; az += 0.5) {
    const pt = `${x(az).toFixed(1)},${clampY(horizonAt(horizon, az)).toFixed(1)}`;
    d += "L" + pt; ln += (az ? "L" : "M") + pt;
  }
  el("path", { d: d + `L${x(360)},${H - B}Z`, fill: "#120d02", stroke: "none" }, svg);
  el("path", { d: ln, fill: "none", stroke: C.amb, "stroke-width": 1.6 }, svg);

  // bodies
  const label = (cx, cy, text, color) => {
    const right = cx < W - 130;
    el("text", { x: cx + (right ? 12 : -12), y: Math.max(T + 10, cy - 9), fill: color, "font-size": 11, "font-weight": 600, "text-anchor": right ? "start" : "end" }, svg, text);
  };
  const sx = x(cur.sunAz), sy = clampY(cur.sunEl);
  const g = el("g", { transform: `translate(${sx},${sy})`, opacity: cur.sunUp ? 1 : 0.55 }, svg);
  el("circle", { r: 6, fill: cur.sunUp ? "#ffd23c" : "none", stroke: C.wht, "stroke-width": 1.5 }, g);
  el("line", { x1: -11, x2: 11, stroke: C.wht }, g); el("line", { y1: -11, y2: 11, stroke: C.wht }, g);
  label(sx, sy, cur.sunUp ? `SUN ${sgn(cur.sunEl)}` : "SUN [BLOCKED]", cur.sunUp ? C.wht : C.red);
  const ex = x(cur.earthAz), ey = clampY(cur.earthEl);
  el("rect", { x: ex - 6, y: ey - 6, width: 12, height: 12, fill: cur.earthUp ? C.cy : "none", stroke: C.cy, "stroke-width": 1.5, opacity: cur.earthUp ? 1 : 0.55 }, svg);
  label(ex, ey + 26, cur.earthUp ? `EARTH ${sgn(cur.earthEl)}` : "EARTH [BLOCKED]", cur.earthUp ? C.cy : C.red);
}

// ---------- timeline ----------
const TL = { left: 52, right: 4, top: 14, rowH: 17, gap: 6 };

function renderTimeline() {
  const svg = $("timeline");
  const W = svg.clientWidth || 700, H = svg.clientHeight || 104;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const { samples } = state.scenario;
  const n = samples.length, w = (W - TL.left - TL.right) / n;
  const rows = [["SUN", (s) => s.sunUp, C.grn], ["EARTH", (s) => s.earthUp, C.cy], ["BOTH", (s) => s.sunUp && s.earthUp, C.wht]];
  rows.forEach(([name, fn, color], r) => {
    const yy = TL.top + r * (TL.rowH + TL.gap);
    el("rect", { x: TL.left, y: yy + TL.rowH / 2 - 0.5, width: W - TL.left - TL.right, height: 1, fill: C.dim, opacity: 0.6 }, svg);
    for (let i = 0; i < n;) {
      if (!fn(samples[i])) { i++; continue; }
      let j = i; while (j < n && fn(samples[j])) j++;
      el("rect", { x: TL.left + i * w, y: yy, width: Math.max(1, (j - i) * w), height: TL.rowH, fill: color }, svg);
      i = j;
    }
    el("text", { x: 0, y: yy + TL.rowH / 2 + 4, fill: color, "font-size": 11 }, svg, name);
  });
  const yAxis = TL.top + 3 * (TL.rowH + TL.gap);
  const every = W < 520 ? 10 : 5;
  for (let day = 0; day <= 30; day += every) {
    const xx = TL.left + Math.min(n, day * 24 / STEP_HOURS) * w;
    el("line", { x1: xx, x2: xx, y1: TL.top - 4, y2: yAxis, stroke: "#000", "stroke-width": 1 }, svg);
    const d = samples[Math.min(n - 1, day * 24 / STEP_HOURS)].t;
    el("text", { x: xx, y: yAxis + 11, fill: C.dim, "font-size": 10, "text-anchor": day === 0 ? "start" : day === 30 ? "end" : "middle" }, svg,
      `${day ? "+" + day + "D" : "T0"}${W < 520 && day ? "" : ` ${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`}`);
  }
  el("path", { id: "tl-cursor", d: "", fill: "none", stroke: C.amb, "stroke-width": 2 }, svg);
  el("path", { id: "tl-cursor-top", d: "", fill: C.amb }, svg);
}

function renderTimelineCursor() {
  const svg = $("timeline"), c = svg.querySelector("#tl-cursor"); if (!c) return;
  const W = svg.clientWidth || 700, n = state.scenario.samples.length;
  const xx = TL.left + (state.idx + 0.5) * (W - TL.left - TL.right) / n, y1 = TL.top + 3 * (TL.rowH + TL.gap) - 4;
  c.setAttribute("d", `M${xx},6V${y1}`);
  svg.querySelector("#tl-cursor-top").setAttribute("d", `M${xx - 5},0H${xx + 5}L${xx},7Z`);
}

function scrubFromEvent(e) {
  const svg = $("timeline"), r = svg.getBoundingClientRect();
  const f = (e.clientX - r.left - TL.left) / (r.width - TL.left - TL.right);
  setIdx(Math.round(Math.max(0, Math.min(1, f)) * (state.scenario.samples.length - 1)));
}

// ---------- compare ----------
function pinCurrent() {
  const key = `${state.site.lat},${state.site.lon},${state.t0.toISOString()}`;
  if (!state.pinned.some((p) => p.key === key))
    state.pinned.push({ key, site: { ...state.site }, t0: new Date(state.t0), summary: state.summary });
  renderCompare();
}

function renderCompare() {
  const box = $("compare-list");
  box.replaceChildren();
  if (!state.pinned.length) { box.innerHTML = `<div class="empty">NOTHING PINNED. PRESS [PIN] TO KEEP THIS SITE + DATE, THEN CHANGE EITHER AND PIN AGAIN.</div>`; return; }
  const score = (p) => p.summary.pctSun * 0.6 + p.summary.pctEarth * 0.4;
  const best = state.pinned.length > 1 ? state.pinned.reduce((a, b) => (score(b) > score(a) ? b : a)) : null;
  for (const p of state.pinned) {
    const d = document.createElement("div");
    d.className = "cmp" + (p === best ? " best" : "");
    const bar = (name, v, col) => `<div class="rowb"><span>${name}</span><i><b style="width:${Math.round(v * 100)}%;background:${col}"></b></i><span>${pct(v)}</span></div>`;
    d.innerHTML = `<div class="nm">${p === best ? '<span class="best-tag">BEST</span>' : ""}${siteName(p.site)}</div>
      <div class="dt">T0 ${stamp(p.t0)} · DARK ${p.summary.maxDarkHours ? fmtT(p.summary.maxDarkHours) : "NONE"}</div>
      ${bar("SUN", p.summary.pctSun, C.grn)}${bar("EARTH", p.summary.pctEarth, C.cy)}${bar("BOTH", p.summary.pctBoth, C.wht)}
      <button class="x" title="Remove">✕</button>`;
    d.querySelector(".x").addEventListener("click", (e) => { e.stopPropagation(); state.pinned = state.pinned.filter((q) => q !== p); renderCompare(); });
    d.addEventListener("click", () => { state.t0 = new Date(p.t0); selectSite(p.site); });
    box.appendChild(d);
  }
}

// ---------- wiring ----------
async function init() {
  await Promise.all([loadSites(), initModel()]);
  state.site = SITES[0];
  const cov = coverage();
  $("date-input").min = toInputValue(cov.start); $("date-input").max = toInputValue(new Date(cov.end.getTime() - 31 * 86400000));
  buildSiteList();

  const tip = $("globe-tip");
  globe = createGlobe($("globe"), {
    sites: SITES,
    onPickSite: (s) => selectSite(s),
    onPickCoord: (lat, lon) => selectSite({ id: CUSTOM_ID, name: "Custom point", lat, lon }, { fly: false }),
    onHover: (s, e) => {
      if (!s) { tip.hidden = true; return; }
      const r = $("globe").getBoundingClientRect();
      tip.hidden = false; tip.textContent = s.name.toUpperCase();
      tip.style.left = e.clientX - r.left + "px"; tip.style.top = e.clientY - r.top + "px";
    },
  });

  const onCoord = () => {
    const lat = parseFloat($("lat-input").value), lon = parseFloat($("lon-input").value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) return;
    selectSite({ id: CUSTOM_ID, name: "Custom point", lat, lon });
  };
  $("lat-input").addEventListener("change", onCoord);
  $("lon-input").addEventListener("change", onCoord);
  $("date-input").addEventListener("change", (e) => { if (e.target.value) { state.t0 = fromInputValue(e.target.value); recompute(); } });

  document.querySelectorAll("[data-slip]").forEach((b) => b.addEventListener("click", () => slip(Number(b.dataset.slip))));
  $("play-btn").addEventListener("click", togglePlay);
  $("next-site-btn").addEventListener("click", nextSite);
  $("pin-btn").addEventListener("click", pinCurrent);

  const tl = $("timeline");
  let dragging = false;
  tl.addEventListener("pointerdown", (e) => { dragging = true; tl.setPointerCapture(e.pointerId); scrubFromEvent(e); });
  tl.addEventListener("pointermove", (e) => { if (dragging) scrubFromEvent(e); });
  tl.addEventListener("pointerup", () => { dragging = false; });

  window.addEventListener("keydown", (e) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === "ArrowRight") e.shiftKey ? slip(1) : setIdx(state.idx + 1);
    else if (k === "ArrowLeft") e.shiftKey ? slip(-1) : setIdx(state.idx - 1);
    else if (k === " ") togglePlay();
    else if (k === "s" || k === "S") nextSite();
    else if (k === "p" || k === "P") pinCurrent();
    else if (k === "Home") setIdx(0);
    else return;
    e.preventDefault();
  });

  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { renderTimeline(); renderMoment(); }, 80); });

  renderCompare();
  globe?.select(state.site);
  recompute();
  document.fonts?.ready.then(() => { renderTimeline(); renderMoment(); });
}

init().catch((e) => {
  console.error(e);
  $("verdict").className = "verdict nogo";
  $("verdict").textContent = "> DATA FAILED TO LOAD. SERVE THE FOLDER OVER HTTP (SEE README) AND RELOAD.";
});
