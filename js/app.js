import { SITES, CUSTOM_ID, loadSites } from "./sites.js";
import { computeTerrain } from "./terrain.js";
import { hasTerrain, setCustomTerrain, initModel, getScenario, summarize, hoursUntilChange, horizonAt, subPoints, coverage, inCoverage, STEP_HOURS } from "./model.js";
import { createGlobe } from "./globe.js";
import { DEFAULT_REQ, REQ_OPTIONS, analyze, windowsFrom, dailyStats, fmtDH } from "./mission.js";
import { renderCalendar, dayFromEvent } from "./ui-calendar.js";
import { sampleSite, siteEclipses } from "./model.js";
import { createScanPanel } from "./ui-scan.js";
import { initTestMode } from "./testmode.js";
import { createSurfacePanel } from "./ui-surface.js";
import { createAssistant } from "./assistant.js";
import { createAssistantPanel } from "./ui-assistant.js";
import { createModelLink } from "./assistant-llm.js";

const $ = (id) => document.getElementById(id);
const SVGNS = "http://www.w3.org/2000/svg";
// Chart colors come from the CSS palette, so charts follow whichever palette is active.
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const C = {};
for (const [k, v] of Object.entries({ amb: "--amb", dim: "--dim", faint: "--faint", grn: "--grn", red: "--red", cy: "--cy", wht: "--wht", grid: "--grid", grid0: "--grid0", fill: "--fill" }))
  Object.defineProperty(C, k, { get: () => cssVar(v) });

const state = {
  site: null,
  t0: roundToHour(new Date()),   // landing time
  idx: 0,                        // hours after landing (mission clock)
  scenario: null,
  summary: null,
  pinned: [],
  playing: null,
  req: { ...DEFAULT_REQ },       // mission needs
  cal: null,                     // year of landing-window data for the current site + needs
};
let globe = null, scan = null, surface = null;

// ---------- sizing ----------
// Wide windows: lay the unit out at a design size and scale it to fit. Narrow windows: stacked layout.
const FIT = { flowBelow: 900, dhMin: 872, dhMax: 1120, dwMin: 1252, dwMax: 1732, sMin: 0.72, sMax: 1.6 };
function fitStage() {
  const root = document.documentElement, cs = getComputedStyle(document.body);
  const vw = root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const bar = $("test-bar"), barH = bar && !bar.hidden ? bar.offsetHeight + 8 : 0;      // test-mode task bar sits above the unit
  const vh = window.innerHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - barH;
  const flow = root.clientWidth < FIT.flowBelow;
  root.classList.toggle("flow", flow);
  if (flow) return;
  // Fit the height first (never smaller than sMin: a very short window scrolls instead of shrinking the text away),
  // then let the unit use the window's width, within the range of widths the layout is designed for.
  let s = Math.max(FIT.sMin, Math.min(FIT.sMax, vh / FIT.dhMin)), dw = vw / s, dh = FIT.dhMin;
  if (dw < FIT.dwMin) { dw = FIT.dwMin; s = vw / dw; dh = Math.max(FIT.dhMin, Math.min(FIT.dhMax, vh / s)); }   // narrow window: width decides, use spare height
  dw = Math.min(dw, FIT.dwMax);
  const st = $("stage").style;
  $("stage").classList.toggle("tight", dw < 1500);
  st.setProperty("--dw", Math.round(dw)); st.setProperty("--dh", Math.round(dh)); st.setProperty("--s", s.toFixed(4));
}
// Ratio of on-screen pixels to layout pixels for an element (the stage may be scaled).
const zoomOf = (node) => (node.getBoundingClientRect().width / (node.clientWidth || 1)) || 1;

// ---------- formatting ----------
function roundToHour(d) { const x = new Date(d); x.setUTCMinutes(0, 0, 0); return x; }
const pad = (n, w = 2) => String(n).padStart(w, "0");
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
// One date format everywhere, always with the year and "UTC" spelled out: 18 DEC 2026 00:00 UTC
const dayStamp = (d) => `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const stamp = (d) => `${dayStamp(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
const fmtBig = (h) => h == null ? "30D+" : `${Math.floor(h / 24)}D ${pad(Math.round(h % 24))}H`;
const fmtT = (h) => h == null ? "OVER 30D" : `${Math.floor(h / 24)}D ${pad(Math.round(h % 24))}H`;
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

// Landing time: four pickers (day, month, year, hour), all UTC. Nothing to type, so it cannot be half-entered.
const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
function buildT0() {
  const cov = coverage(), opt = (sel, list) => { sel.replaceChildren(...list.map(([v, t]) => new Option(t, v))); };
  opt($("t0-month"), MONTHS.map((m, i) => [i, m]));
  opt($("t0-year"), Array.from({ length: cov.end.getUTCFullYear() - cov.start.getUTCFullYear() }, (_, i) => [cov.start.getUTCFullYear() + i, cov.start.getUTCFullYear() + i]));
  opt($("t0-hour"), Array.from({ length: 24 }, (_, h) => [h, `${pad(h)}:00 UTC`]));
  for (const id of ["t0-day", "t0-month", "t0-year", "t0-hour"]) $(id).addEventListener("change", () => {
    const y = +$("t0-year").value, m = +$("t0-month").value, d = Math.min(+$("t0-day").value, daysIn(y, m));
    state.t0 = new Date(Date.UTC(y, m, d, +$("t0-hour").value));
    recompute();
  });
}
function syncT0() {
  const t = state.t0, n = daysIn(t.getUTCFullYear(), t.getUTCMonth()), day = $("t0-day");
  if (day.options.length !== n) day.replaceChildren(...Array.from({ length: n }, (_, i) => new Option(pad(i + 1), i + 1)));
  day.value = t.getUTCDate(); $("t0-month").value = t.getUTCMonth(); $("t0-year").value = t.getUTCFullYear(); $("t0-hour").value = t.getUTCHours();
}

function nextSite(by = 1) {
  const i = SITES.findIndex((s) => s.id === state.site.id);
  selectSite(SITES[(Math.max(i, by > 0 ? -1 : 0) + by + SITES.length) % SITES.length]);
}

function syncSiteUI() {
  const s = state.site;
  document.querySelectorAll(".site-row").forEach((b) => b.classList.toggle("sel", b.dataset.id === s.id));
  document.querySelector(".site-row.sel")?.scrollIntoView({ block: "nearest" });
  $("lat-input").value = s.lat; $("lon-input").value = s.lon;
  syncT0();
  $("bar-site").textContent = `${siteName(s)} ${fmtLat(s.lat)} ${fmtLon(s.lon)}`;
  $("bar-t0").textContent = stamp(state.t0);
  const note = $("site-note");
  if (s.id === CUSTOM_ID) note.textContent = "CUSTOM POINT";
  else if (s.srcText) note.textContent = s.srcText.toUpperCase();
  else if (s.approx) note.textContent = "APPROXIMATE REGION CENTER — TO BE VERIFIED";
  else if (s.src) note.innerHTML = `${s.tag} · <a href="${s.src}" target="_blank" rel="noopener">COORDINATE SOURCE</a>`;
  else note.textContent = s.tag || "";
}

// Site details: values LUNO computed from LOLA, then the team's research notes.
function renderBrief() {
  const s = state.site, t = state.scenario.terrain;
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  const num = (v) => (v >= 0 ? "+" : "−") + Math.abs(Math.round(v)).toLocaleString("en-US");
  let h = "";
  if (t.real) {
    h += row("HEIGHT", `${num(t.heightM)} M`);
    h += row("SLOPE", `${t.slopeDeg.toFixed(1)}° OVER ${t.slopeBaseM >= 1000 ? (t.slopeBaseM / 1000).toFixed(1) + " KM" : t.slopeBaseM + " M"}`);
    h += row("SKYLINE HEIGHT", `${sgn(t.min)}° TO ${sgn(t.max)}°`);
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
  const cov = coverage(), last = new Date(cov.end.getTime() - 70 * 86400000);
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
  updateCalendar();
  renderTimeline();
  renderMission();
  renderMoment();
  scan?.refresh();
  surface?.refresh();
  window.dispatchEvent(new Event("luno:state"));
}

// ---------- mission needs, landing windows, calendar ----------
const DAY = 86400000;
const monthStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

// A year of hourly samples from the start of T0's month, judged against the mission needs.
// Rebuilt only when the site, its terrain, the needs or the year in view change.
function updateCalendar() {
  // Keep the strip anchored while T0 stays inside it, so clicking a day does not shift the view.
  const inView = state.cal && state.t0 >= state.cal.start && state.t0 < new Date(+state.cal.start + (state.cal.days - 1) * DAY);
  const start = inView ? state.cal.start : monthStart(state.t0), terrain = state.scenario.terrain;
  const key = `${state.site.lat},${state.site.lon},${terrain.real},${+start},${JSON.stringify(state.req)}`;
  if (state.cal?.key !== key) {
    const cov = coverage();
    const days = Math.max(31, Math.min(365, Math.floor((cov.end - start) / DAY) - state.req.days - 3));
    const samples = sampleSite(state.site, start, (days + state.req.days + 3) * 24, terrain);
    const a = analyze(samples, state.req, STEP_HOURS);
    for (let i = days * 24; i < a.mask.length; i++) a.mask[i] = 0;      // landing days beyond the strip are not offered
    state.cal = { key, start, days, samples, a, windows: windowsFrom(a.mask, samples), daily: dailyStats(samples, a.mask, days) };
  }
  renderCalendar($("calendar"), state.cal.daily, { t0Day: Math.floor((state.t0 - state.cal.start) / DAY), missionDays: state.req.days });
  renderWindows();
}
const calIdx = () => Math.round((state.t0 - state.cal.start) / 3600000 / STEP_HOURS);

// The answer: can this mission land at this site at this time?
function renderMission() {
  const r = state.req, v = state.cal.a.at(calIdx()), nx = state.cal.windows.find((w) => w.start > state.t0);
  $("mission").className = "hero " + (v.ok ? "go" : "nogo");
  $("mission-word").textContent = v.ok ? "GO" : "NO-GO";
  $("mission-title").textContent = `${r.days}-DAY MISSION · LANDING ${stamp(state.t0)}`;
  const line = (s) => `<div>${s}</div>`;
  $("mission-why").innerHTML = v.ok
    ? line(`SUNLIGHT LASTS ${v.marginOpen ? "MORE THAN " : ""}${fmtDH(Math.max(0, v.marginHours))} LONGER THAN THE MISSION NEEDS`) + line(`EARTH IS IN VIEW FOR ${Math.round(v.earthPct)}% OF THE MISSION`)
    : v.reasons.map(line).join("") + `<div class="next">${nx ? `NEXT GOOD LANDING TIME: ${stamp(nx.start)}` : "NO GOOD LANDING TIME IN THE NEXT 12 MONTHS"}</div>`;
  // A NO-GO comes with ways out: another time, another spot, or a mission need that could be relaxed.
  const fixes = [];
  if (!v.ok) {
    const tryReq = (change) => analyze(state.cal.samples, { ...r, ...change }, STEP_HOURS).at(calIdx()).ok;
    if (nx) fixes.push(["mission-next", `LAND ON ${dayStamp(nx.start)} INSTEAD`, nextWindow]);
    fixes.push(["mission-scan", "FIND A BETTER SPOT NEARBY", () => scan.toggle(true)]);
    const dark = REQ_OPTIONS.maxDarkH.find((hh) => hh > r.maxDarkH && tryReq({ maxDarkH: hh }));
    if (dark) fixes.push(["mission-fix-dark", `LET IT SIT ${dark} H IN THE DARK`, () => setReq("maxDarkH", dark)]);
    if (r.earthAtLanding && tryReq({ earthAtLanding: false })) fixes.push(["mission-fix-earth", "LAND WITHOUT AN EARTH LINK", () => setReq("earthAtLanding", false)]);
    const days = [...REQ_OPTIONS.days].reverse().find((d) => d < r.days && tryReq({ days: d }));
    if (days) fixes.push(["mission-fix-days", `SHORTEN THE MISSION TO ${days} DAYS`, () => setReq("days", days)]);
  }
  fixes.length = Math.min(fixes.length, 3);                      // keep it to one row: another time, another spot, one need to relax
  $("mission-fix").hidden = !fixes.length;
  $("mission-fix-list").replaceChildren(...fixes.map(([id, label, run]) => {
    const b = document.createElement("button"); b.id = id; b.className = "hero-next"; b.textContent = label + " ▸"; b.addEventListener("click", run); return b;
  }));
  // Eclipses during the mission (Earth passing in front of the Sun), if the Sun would otherwise be in view.
  const end = new Date(+state.t0 + r.days * DAY), i0 = calIdx();
  const hit = siteEclipses(state.site, state.t0, end, state.scenario.terrain).filter((e) => {
    const s = state.cal.samples[i0 + Math.round((e.peak - state.t0) / 3600000 / STEP_HOURS)];
    return s && s.sunTerrain > 0 && e.maxCover >= 0.05;
  });
  for (const e of hit) $("mission-why").insertAdjacentHTML("beforeend",
    `<div class="warn">⚠ ECLIPSE ON ${dayStamp(e.peak)}: EARTH HIDES ${e.maxCover >= 0.995 ? "ALL" : Math.round(e.maxCover * 100) + "%"} OF THE SUN FOR UP TO ${Math.round((e.end - e.start) / 3600000)} HOURS</div>`);
  state.mission = { v, next: nx ? nx.start : null, fixes, eclipses: hit };      // kept for the command assistant
  return v;
}

function renderWindows() {
  const box = $("windows"), all = state.cal.windows;
  const from = all.findIndex((w) => w.end >= state.t0);
  const list = from < 0 ? [] : all.slice(from, from + 4);
  box.replaceChildren();
  if (!list.length) { box.innerHTML = `<div class="empty">NONE IN THIS 12-MONTH VIEW. RELAX THE NEEDS OR TRY ANOTHER SITE.</div>`; return; }
  for (const w of list) {
    const b = document.createElement("button"), cur = w.start <= state.t0 && state.t0 <= w.end;
    if (cur) b.className = "cur";
    b.innerHTML = `<span>${cur ? "▶ " : ""}${dayStamp(w.start)} <b>${pad(w.start.getUTCHours())}:00</b></span><span>OPEN ${fmtDH((w.i1 - w.i0) * STEP_HOURS)}</span>`;
    b.title = `Window opens ${stamp(w.start)} and closes ${stamp(w.end)}. Click to land at its start.`;
    b.addEventListener("click", () => setT0(w.start));
    box.appendChild(b);
  }
}

function setT0(d) { state.t0 = new Date(d); recompute(); }

function nextWindow() {
  const w = state.cal.windows.find((x) => x.start > state.t0);
  if (w) return setT0(w.start);
  for (const b of [$("next-window-btn"), $("side-next")]) { b.classList.add("flash"); setTimeout(() => b.classList.remove("flash"), 500); }
}

// Change one mission need (from its buttons or from a "way to get a GO" button) and keep the buttons in step.
function setReq(k, val) {
  state.req = { ...state.req, [k]: val };
  document.querySelectorAll(`.seg[data-req="${k}"] button`).forEach((x) => x.classList.toggle("on", x.dataset.v === String(val)));
  recompute({ keepIdx: true });
}

function buildNeeds() {
  document.querySelectorAll(".seg[data-req]").forEach((seg) => {
    const k = seg.dataset.req;
    const opts = k === "earthAtLanding" ? [[true, "REQUIRED"], [false, "NO"]] : REQ_OPTIONS[k].map((v) => [v, k === "earthMinPct" && v === 0 ? "ANY" : String(v)]);
    for (const [val, label] of opts) {
      const b = document.createElement("button");
      b.textContent = label; b.dataset.v = String(val); b.classList.toggle("on", state.req[k] === val);
      b.addEventListener("click", () => setReq(k, val));
      seg.appendChild(b);
    }
  });
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

function togglePlay(on = !state.playing) {
  const btn = $("play-btn");
  if (on === !!state.playing) return;
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
  $("bar-tplus").textContent = h ? `(${fmtT(h)} AFTER LANDING)` : "(AT LANDING)";
  $("clock-head").textContent = h ? `SUN AND EARTH ${fmtT(h)} AFTER LANDING · ${stamp(cur.t)}` : "SUN AND EARTH AT THE LANDING TIME";

  const set = (id, on, yes, no) => { const n = $(id); n.textContent = on ? yes : no; n.className = "st " + (on ? "go" : "nogo"); };
  set("sun-state", cur.sunUp, cur.sunFrac >= 0.995 ? "SUNLIT" : `SUN ${Math.round(cur.sunFrac * 100)}%`, cur.sunFrac <= 0.005 ? "NO SUN" : `SUN ${Math.round(cur.sunFrac * 100)}%`);
  const ecl = $("sun-eclipse");
  ecl.hidden = !(cur.eclipse > 0.01 && cur.sunTerrain > 0);
  if (!ecl.hidden) ecl.textContent = `ECLIPSE: EARTH HIDES ${Math.round(cur.eclipse * 100)}% OF THE SUN`;
  const sunNext = sunLeft == null ? null : samples[state.idx + sunLeft / STEP_HOURS];      // what ends the sunlight: the skyline or an eclipse
  $("sun-next-label").textContent = cur.sunUp ? (sunNext && sunNext.eclipse > 0.4 ? "ECLIPSE IN" : "SUNSET IN") : (cur.eclipse > 0.4 ? "ECLIPSE ENDS IN" : "SUNRISE IN");
  $("sun-next").textContent = fmtBig(sunLeft);
  $("sun-next-date").textContent = sunLeft == null ? "" : `ON ${stamp(new Date(+cur.t + sunLeft * 3600000))}`;
  $("sun-el").textContent = sgn(cur.sunEl) + "°"; $("sun-az").textContent = cur.sunAz.toFixed(1).padStart(5, "0") + "°";
  set("earth-state", cur.earthUp, "EARTH IN VIEW", "NO LINK");
  $("earth-next-label").textContent = cur.earthUp ? "EARTHSET IN" : "EARTHRISE IN";
  $("earth-next").textContent = fmtBig(earthLeft);
  $("earth-next-date").textContent = earthLeft == null ? "" : `ON ${stamp(new Date(+cur.t + earthLeft * 3600000))}`;
  $("earth-el").textContent = sgn(cur.earthEl) + "°"; $("earth-az").textContent = cur.earthAz.toFixed(1).padStart(5, "0") + "°";

  $("hz-sun").href = horizonsUrl(10, cur.t);
  $("hz-earth").href = horizonsUrl(399, cur.t);
  renderHorizon(cur);
  renderTimelineCursor();
  const sp = subPoints(cur.t);
  globe?.setBodies(sp.sun, sp.earth);
  surface?.update();
}

// A JPL Horizons query for the same site and moment, so anyone can compare NASA's answer with LUNO's.
// (Horizons does not let other web pages read its answers, so this opens it in a new tab.)
function horizonsUrl(body, t) {
  const tr = state.scenario.terrain, lonE = ((state.site.lon % 360) + 360) % 360, altKm = (tr.heightM + tr.mastM) / 1000;
  const q = { format: "text", COMMAND: `'${body}'`, CENTER: "'coord@301'", COORD_TYPE: "'GEODETIC'",
              SITE_COORD: `'${lonE.toFixed(4)},${state.site.lat.toFixed(4)},${altKm.toFixed(4)}'`,
              TLIST: `'${t.toISOString().slice(0, 16).replace("T", " ")}'`, QUANTITIES: "'4'", MAKE_EPHEM: "'YES'", OBJ_DATA: "'NO'" };
  return "https://ssd.jpl.nasa.gov/api/horizons.api?" + new URLSearchParams(q).toString();
}

function renderHorizon(cur) {
  const svg = $("horizon");
  const W = svg.clientWidth || 700, H = svg.clientHeight || 230, L = 40, B = 20, T = 6;
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
    el("line", { x1: L, x2: W, y1: y(e), y2: y(e), stroke: e === 0 ? C.grid0 : C.grid }, svg);
    el("text", { x: L - 6, y: y(e) + 4, fill: C.dim, "font-size": 11.5, "text-anchor": "end" }, svg, e + "°");
  }
  const narrow = W < 520;
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"].forEach((d, i) => {
    el("line", { x1: x(i * 45), x2: x(i * 45), y1: T, y2: H - B, stroke: C.grid }, svg);
    if (narrow && i % 2) return;
    el("text", { x: Math.min(W - 8, x(i * 45)), y: H - 4, fill: C.dim, "font-size": 11.5, "text-anchor": "middle" }, svg, d);
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
  el("path", { d: d + `L${x(360)},${H - B}Z`, fill: C.fill, stroke: "none" }, svg);
  el("path", { d: ln, fill: "none", stroke: C.amb, "stroke-width": 1.6 }, svg);

  // bodies
  const label = (cx, cy, text, color) => {
    const right = cx < W - 130;
    el("text", { x: cx + (right ? 12 : -12), y: Math.max(T + 10, cy - 9), fill: color, "font-size": 12.5, "font-weight": 600, "text-anchor": right ? "start" : "end" }, svg, text);
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
const TL = { left: 58, right: 4, top: 18, rowH: 16, gap: 5 };

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
    el("text", { x: 0, y: yy + TL.rowH / 2 + 4, fill: color, "font-size": 12.5 }, svg, name);
  });
  const yAxis = TL.top + 3 * (TL.rowH + TL.gap);
  const every = W < 520 ? 10 : 5;
  for (let day = 0; day <= 30; day += every) {
    const xx = TL.left + Math.min(n, day * 24 / STEP_HOURS) * w;
    el("line", { x1: xx, x2: xx, y1: TL.top - 4, y2: yAxis, stroke: "#000", "stroke-width": 1 }, svg);
    const d = samples[Math.min(n - 1, day * 24 / STEP_HOURS)].t;
    el("text", { x: xx, y: yAxis + 12, fill: C.dim, "font-size": 11.5, "text-anchor": day === 0 ? "start" : day === 30 ? "end" : "middle" }, svg,
      W < 520 || day === 30 ? (day ? `+${day}D` : "LANDING") : `${day ? "+" + day + "D · " : ""}${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}`);
  }
  for (let i = 0; i < n; i++) {                                                  // eclipse hours: a yellow notch on the SUN row
    if (!(samples[i].eclipse > 0.05 && samples[i].sunTerrain > 0)) continue;
    let j = i; while (j < n && samples[j].eclipse > 0.05) j++;
    const r = el("rect", { x: TL.left + i * w - 1, y: TL.top - 1, width: Math.max(4, (j - i) * w + 2), height: TL.rowH + 2, fill: cssVar("--key-y") }, svg);
    el("title", {}, r, "Eclipse: Earth passes in front of the Sun");
    i = j;
  }
  const mEnd = TL.left + Math.min(n, state.req.days * 24 / STEP_HOURS) * w;      // mission length from T0
  el("path", { d: `M${TL.left},${TL.top - 3}v-5H${mEnd}v5`, fill: "none", stroke: C.wht, "stroke-width": 1.2 }, svg);
  el("text", { x: Math.min(mEnd + 5, W - 76), y: TL.top - 5, fill: C.wht, "font-size": 11 }, svg, state.req.days < 30 ? `THE ${state.req.days}-DAY MISSION` : "");
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
  const svg = $("timeline"), r = svg.getBoundingClientRect(), z = zoomOf(svg);
  const f = ((e.clientX - r.left) / z - TL.left) / (svg.clientWidth - TL.left - TL.right);
  setIdx(Math.round(Math.max(0, Math.min(1, f)) * (state.scenario.samples.length - 1)));
}

// ---------- compare ----------
function pinCurrent() {
  const key = `${state.site.lat},${state.site.lon},${state.t0.toISOString()}`;
  if (!state.pinned.some((p) => p.key === key))
    state.pinned.push({ key, site: { ...state.site }, t0: new Date(state.t0), summary: state.summary, days: state.req.days, mission: state.cal.a.at(calIdx()) });
  renderCompare();
}

function renderCompare() {
  const box = $("compare-list");
  box.replaceChildren();
  if (!state.pinned.length) { box.innerHTML = `<div class="empty">NOTHING PINNED. PRESS [PIN] TO KEEP THIS SITE + DATE, THEN CHANGE EITHER AND PIN AGAIN.</div>`; return; }
  const score = (p) => (p.mission.ok ? 10 : 0) + p.summary.pctSun * 0.6 + p.summary.pctEarth * 0.4;      // meeting the needs comes first
  const best = state.pinned.length > 1 ? state.pinned.reduce((a, b) => (score(b) > score(a) ? b : a)) : null;
  for (const p of state.pinned) {
    const d = document.createElement("div");
    d.className = "cmp" + (p === best ? " best" : "");
    const bar = (name, v, col) => `<div class="rowb"><span>${name}</span><i><b style="width:${Math.round(v * 100)}%;background:${col}"></b></i><span>${pct(v)}</span></div>`;
    d.innerHTML = `<div class="nm">${p === best ? '<span class="best-tag">BEST</span>' : ""}${siteName(p.site)}</div>
      <div class="dt">LANDING ${stamp(p.t0)}</div>
      <div class="dt"><span class="${p.mission.ok ? "tag-go" : "tag-nogo"}">${p.days}D ${p.mission.ok ? "GO" : "NO-GO"}</span>${p.mission.ok ? `MARGIN ${p.mission.marginOpen ? ">" : "+"}${fmtDH(Math.max(0, p.mission.marginHours))}` : p.mission.reasons[0]}</div>
      ${bar("SUN", p.summary.pctSun, C.grn)}${bar("EARTH", p.summary.pctEarth, C.cy)}${bar("BOTH", p.summary.pctBoth, C.wht)}
      <button class="x" title="Remove">✕</button>`;
    d.querySelector(".x").addEventListener("click", (e) => { e.stopPropagation(); state.pinned = state.pinned.filter((q) => q !== p); renderCompare(); });
    d.addEventListener("click", () => { state.t0 = new Date(p.t0); selectSite(p.site); });
    box.appendChild(d);
  }
}

// ---------- command assistant ----------
// Everything the assistant (typed or spoken commands) may read or do. It goes through the same functions as the keys.
const assistantApi = {
  sites: () => SITES,
  needOptions: () => REQ_OPTIONS,
  snapshot() {
    const { samples, terrain } = state.scenario, cur = samples[state.idx], cov = coverage();
    const sunLeft = hoursUntilChange(samples, state.idx, "sunUp"), earthLeft = hoursUntilChange(samples, state.idx, "earthUp");
    const sunNext = sunLeft == null ? null : samples[state.idx + sunLeft / STEP_HOURS];
    return {
      site: state.site, siteName: state.site.id === CUSTOM_ID ? "Custom point" : state.site.name.replace(/ · /g, ", "), t0: state.t0, idx: state.idx * STEP_HOURS, maxIdx: (samples.length - 1) * STEP_HOURS,
      req: state.req, landing: samples[0], cur, sunLeft, earthLeft, sunNextIsEclipse: !!(sunNext && sunNext.eclipse > 0.4),
      verdict: state.mission.v, next: state.mission.next, options: state.mission.fixes.map((f) => f[1]), eclipses: state.mission.eclipses,
      terrain, terrainBusy: !!state.terrainBusy, coverage: { start: cov.start, last: new Date(cov.end.getTime() - 70 * 86400000) },
    };
  },
  selectSite: (site) => selectSite(site),
  selectPoint: (lat, lon) => selectSite({ id: CUSTOM_ID, name: "Custom point", lat, lon }),
  stepSite: (by) => nextSite(by),
  setT0: (d) => setT0(d),
  setReq: (k, v) => setReq(k, v),
  setIdx: (hours) => setIdx(Math.round(hours / STEP_HOURS)),
  play: (on) => togglePlay(on),
  openScan: (show) => { if (scan.isOpen() !== show) scan.toggle(show); },
  openSurface: (show) => { if (surface.isOpen() !== show) surface.toggle(show); },
  pickBest: () => { const b = $("scan-go-best"); if (!scan.isOpen() || b.disabled) return false; b.click(); return true; },
  takeOption: (i) => state.mission.fixes[i]?.[2](),
  pin: () => pinCurrent(),
};

// ---------- wiring ----------
async function init() {
  fitStage();
  await Promise.all([loadSites(), initModel()]);
  state.site = SITES[0];
  buildT0();
  buildSiteList();

  const tip = $("globe-tip");
  globe = createGlobe($("globe"), {
    sites: SITES,
    labels: $("globe-labels"),
    onPickSite: (s) => selectSite(s),
    onPickCoord: (lat, lon) => selectSite({ id: CUSTOM_ID, name: "Custom point", lat, lon }, { fly: false }),
    onHover: (s, e) => {
      if (!s) { tip.hidden = true; return; }
      const r = $("globe").getBoundingClientRect(), z = zoomOf($("globe"));
      tip.hidden = false; tip.textContent = s.name.toUpperCase();
      tip.style.left = (e.clientX - r.left) / z + "px"; tip.style.top = (e.clientY - r.top) / z + "px";
    },
  });

  const onCoord = () => {
    const lat = parseFloat($("lat-input").value), lon = parseFloat($("lon-input").value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) return;
    selectSite({ id: CUSTOM_ID, name: "Custom point", lat, lon });
  };
  $("lat-input").addEventListener("change", onCoord);
  $("lon-input").addEventListener("change", onCoord);

  document.querySelectorAll("[data-slip]").forEach((b) => b.addEventListener("click", () => slip(Number(b.dataset.slip))));
  $("play-btn").addEventListener("click", () => togglePlay());
  $("next-site-btn").addEventListener("click", nextSite);
  $("pin-btn").addEventListener("click", pinCurrent);
  $("next-window-btn").addEventListener("click", nextWindow);
  $("side-next").addEventListener("click", nextWindow);
  scan = createScanPanel({
    getContext: () => ({ site: state.site, t0: state.t0, req: state.req }),
    onPick: (lat, lon) => selectSite({ id: CUSTOM_ID, name: "Custom point", lat, lon }),
    fmt: { site: siteName, stamp, lat: fmtLat, lon: fmtLon },
  });
  $("scan-btn").addEventListener("click", () => scan.toggle());
  $("side-scan").addEventListener("click", () => scan.toggle(true));
  surface = createSurfacePanel({
    getContext: () => ({ site: state.site, cur: state.scenario.samples[state.idx], horizon: state.scenario.horizon }),
    fmt: { site: siteName, stamp },
  });
  $("surface-btn").addEventListener("click", () => surface.toggle(true));
  buildNeeds();
  const assistant = createAssistant(assistantApi);
  const comms = createAssistantPanel({ assistant, model: createModelLink({ assistant, sites: assistantApi.sites, needOptions: assistantApi.needOptions }) });
  $("calendar").addEventListener("click", (e) => {
    const d = dayFromEvent($("calendar"), e, state.cal.days);
    if (d < 0) return;
    let i = d * 24; const end = i + 24;
    while (i < end && !state.cal.a.mask[i]) i++;                     // first good landing hour that day, else midnight
    setT0(state.cal.samples[i < end ? i : d * 24].t);
  });

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
    else if (k === "t" || k === "T") comms.talk();
    else if (k === "/") comms.type();
    else if (k === "Escape" && comms.isOpen()) comms.toggle(false);
    else if (k === "s" || k === "S") nextSite();
    else if (k === "p" || k === "P") pinCurrent();
    else if (k === "n" || k === "N") nextWindow();
    else if (k === "a" || k === "A") scan.toggle();
    else if (k === "v" || k === "V") surface.toggle();
    else if (k === "Escape" && surface.isOpen()) surface.toggle(false);
    else if (k === "Escape" && scan.isOpen()) scan.toggle(false);
    else if (k === "Home") setIdx(0);
    else return;
    e.preventDefault();
  });

  let rz; window.addEventListener("resize", () => { fitStage(); clearTimeout(rz); rz = setTimeout(() => { renderTimeline(); updateCalendar(); renderMoment(); }, 80); });

  renderCompare();
  globe?.select(state.site);
  recompute();
  initTestMode({
    snapshot: () => ({ site: state.site, t0: state.t0, req: state.req, missionOk: state.cal.a.at(calIdx()).ok }),
    relayout: () => { fitStage(); renderTimeline(); updateCalendar(); renderMoment(); },
  });
  document.fonts?.ready.then(() => { renderTimeline(); updateCalendar(); renderMoment(); });
}

init().catch((e) => {
  console.error(e);
  $("mission").className = "hero nogo";
  $("mission-word").textContent = "ERROR";
  $("mission-why").textContent = "THE DATA FILES DID NOT LOAD. SERVE THE FOLDER OVER HTTP (SEE THE README) AND RELOAD.";
});
