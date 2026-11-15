import { SITES, CUSTOM_ID, loadSites } from "./sites.js";
import { computeTerrain } from "./terrain.js";
import { hasTerrain, terrainFor, setCustomTerrain, initModel, getScenario, summarize, hoursUntilChange, horizonAt, subPoints, coverage, inCoverage, STEP_HOURS } from "./model.js";
import { createGlobe } from "./globe.js";
import { DEFAULT_REQ, REQ_OPTIONS, analyze, windowsFrom, dailyStats, fmtDH } from "./mission.js";
import { renderCalendar, dayFromEvent } from "./ui-calendar.js";
import { sampleSite, siteEclipses, siteYears } from "./model.js";
import { createScanPanel } from "./ui-scan.js";
import { initTestMode } from "./testmode.js";
import { createSurfacePanel } from "./ui-surface.js";
import { createAssistant } from "./assistant.js";
import { createAssistantPanel } from "./ui-assistant.js";
import { createModelLink } from "./assistant-llm.js";
import { createOpenSpaceLink, OS_VIEWS, OS_HORIZON } from "./openspace.js";
import { OPENING, storyAt } from "./stories.js";
import { createProofPanel } from "./ui-proof.js";
import { encodeShare, decodeShare, copyText } from "./share.js";
import { startGuide } from "./guide.js";
import { createHistoryPanel } from "./ui-history.js";
import { createMoonMap } from "./ui-moonmap.js";
import { loadDsn, dsnAt } from "./dsn.js";
import { initSources, showData } from "./sources.js";
import { createEnergyPanel, watts, kwh } from "./ui-energy.js";
import { showCompare, compareWanted, compareOpen, closeCompare } from "./ui-compare.js";

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
let globe = null, scan = null, surface = null, openspace = null, proof = null, past = null, moonmap = null;

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
  // Fit the height first (never smaller than sMin: a very short window scrolls instead of shrinking the text away).
  // A tall window first gets a taller layout at normal size (more sites, taller charts) and is only magnified past
  // that. Then the unit uses the window's width, within the range of widths the layout is designed for.
  let dh = Math.max(FIT.dhMin, Math.min(FIT.dhMax, vh)), s = Math.max(FIT.sMin, Math.min(FIT.sMax, vh / dh)), dw = vw / s;
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
  // "more below" marker: shown while the list can still be scrolled down
  const more = document.createElement("div"); more.className = "site-more"; more.textContent = "▼ MORE SITES · SCROLL";
  const sync = () => { more.classList.add("off"); more.classList.toggle("off", box.scrollTop + box.clientHeight >= box.scrollHeight - 6); };      // measured without the marker itself
  box.addEventListener("scroll", sync); new ResizeObserver(sync).observe(box); queueMicrotask(() => { box.appendChild(more); sync(); });
  let grp = null, n = 0;
  for (const s of SITES) {
    if (s.group !== grp) { grp = s.group; const g = document.createElement("div"); g.className = "grp"; g.textContent = grp.toUpperCase(); box.appendChild(g); }
    const b = document.createElement("button");
    b.className = "site-row"; b.dataset.id = s.id;
    b.innerHTML = `<span>${pad(++n)} ${s.name}</span><span><i class="site-ok"></i>${fmtLat(s.lat)}</span>`;
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
  flushCompare();
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
  const row = document.querySelector(".site-row.sel"), list = $("site-list");
  if (row) {                                             // keep the chosen row clear of the "more sites" marker at the bottom of the list
    row.scrollIntoView({ block: "nearest" });
    const over = (row.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom) / zoomOf(list) + 24;
    if (over > 0) list.scrollTop += over;
  }
  $("lat-input").value = +(+s.lat).toFixed(3); $("lon-input").value = +(+s.lon).toFixed(3);
  syncT0();
  $("bar-site").textContent = `${siteName(s)} ${fmtLat(s.lat)} ${fmtLon(s.lon)}`;
  $("bar-t0").textContent = stamp(state.t0);
  const note = $("site-note");
  if (s.id === CUSTOM_ID) note.textContent = "CUSTOM POINT";
  else if (s.srcText) note.textContent = s.srcText.toUpperCase();
  else if (s.approx) note.textContent = "APPROXIMATE REGION CENTER — TO BE VERIFIED";
  else if (s.src) note.innerHTML = `${s.tag} · <a href="${s.src}" target="_blank" rel="noopener">COORDINATE SOURCE</a>`;
  else note.textContent = s.tag || "";
  renderStory();
}

// A real landing on screen (the right site at the right hour): say so, and what really happened there.
// The facts and their sources live in js/stories.js.
function renderStory() {
  const st = storyAt(state.site, state.t0), box = $("story");
  box.hidden = !st || state.storyOff === st.id;
  if (box.hidden || box.dataset.id === st.id) return;
  box.dataset.id = st.id;
  box.innerHTML = `<span class="story-text" title="${st.real}"><b class="h-t">REAL LANDING</b> · <b>${st.name}, ${st.when}</b> · ${st.strip}</span>
    <span class="story-btns"><button id="story-proof" title="The mission record, with sources, compared with LUNI's calculation">THE STORY ▸</button><button id="story-now" title="Moves the landing time to the current hour">GO TO TODAY ▸</button><button id="story-x" title="Hide this note">✕</button></span>`;
  $("story-proof").addEventListener("click", () => proof.toggle(true, st.id));
  $("story-now").addEventListener("click", () => setT0(roundToHour(new Date())));
  $("story-x").addEventListener("click", () => { state.storyOff = st.id; box.hidden = true; relayout(); });
}
// Open LUNI on a scene: { site (id), t0, days, needs }. Used by REPLAY in the proof panel and LOAD in mission history.
// The mission needs go back to LUNI's usual ones, with the mission's own length and any need it is known to differ in.
function applyScene(sc) {
  state.req = { ...DEFAULT_REQ, days: sc.days, ...(sc.needs || {}) }; syncNeeds();
  state.t0 = new Date(sc.t0); state.storyOff = null;
  selectSite(SITES.find((s) => s.id === sc.site) || SITES[0]);
}

// Site details: values LUNI computed from LOLA, then the team's research notes.
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
  // the skyline's source bubble also carries what the old top-right badge said about the terrain in use
  const sky = $("src-sky");
  sky.textContent = t.real ? (t.reduced ? "REDUCED MAP" : "") : state.terrainBusy ? "LOADING TERRAIN…" : "FLAT HORIZON · NO TERRAIN";
  sky.classList.toggle("warn", !t.real || !!t.reduced);
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
  // say where this answer's data came from (only while the main screen is the one in view)
  if (!scan?.isOpen() && !moonmap?.isOpen() && !past?.isOpen() && !proof?.isOpen()) showData("verdict", state.scenario.terrain.reduced ? ["DETAIL", "REDUCED LOLA MAP (TYPED-IN POINT)"] : null);
  updateCalendar();
  renderTimeline();
  renderMission();
  renderMoment();
  scan?.refresh(); energy?.refresh();
  surface?.refresh();
  window.dispatchEvent(new Event("luno:state"));
  // A small surprise: Apollo 11's own site on its own day of the year (it landed there on 20 July 1969, 20:17 UTC).
  if (state.site.id === "apollo11" && state.t0.getUTCMonth() === 6 && state.t0.getUTCDate() === 20 && !state.eagle) {
    state.eagle = true; toast("20 JULY · ON THIS DAY IN 1969, APOLLO 11 LANDED RIGHT HERE: “THE EAGLE HAS LANDED.”", 9000);
  }
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
  const key = `${state.site.lat},${state.site.lon},${terrain.real},${terrain.slopeDeg},${+start},${JSON.stringify(state.req)}`;
  if (state.cal?.key !== key) {
    const cov = coverage();
    const days = Math.max(31, Math.min(365, Math.floor((cov.end - start) / DAY) - state.req.days - 3));
    const samples = sampleSite(state.site, start, (days + state.req.days + 3) * 24, terrain);
    const a = analyze(samples, state.req, STEP_HOURS, terrain);
    for (let i = days * 24; i < a.mask.length; i++) a.mask[i] = 0;      // landing days beyond the strip are not offered
    state.cal = { key, start, days, samples, a, windows: windowsFrom(a.mask, samples), daily: dailyStats(samples, a.mask, days) };
    renderVersus();
  }
  renderCalendar($("calendar"), state.cal.daily, { t0Day: Math.floor((state.t0 - state.cal.start) / DAY), missionDays: state.req.days });
  renderWindows();
  renderRank();
}
const calIdx = () => Math.round((state.t0 - state.cal.start) / 3600000 / STEP_HOURS);

// Every preset for this mission, side by side: GO or NO-GO at the landing time on screen, the number of good landing
// days in the months the calendar shows, and the next window. Worked out once per (months shown, mission needs).
let rank = { key: "", rows: [] };
function renderRank() {
  const c = state.cal, key = `${+c.start},${c.days},${JSON.stringify(state.req)}`;
  if (rank.key !== key) {
    rank = { key, rows: SITES.map((site) => {
      const terrain = terrainFor(site), samples = sampleSite(site, c.start, (c.days + state.req.days + 3) * 24, terrain), a = analyze(samples, state.req, STEP_HOURS, terrain);
      for (let i = c.days * 24; i < a.mask.length; i++) a.mask[i] = 0;
      let good = 0;
      for (let d = 0; d < c.days; d++) { let any = 0; for (let i = d * 24; i < (d + 1) * 24; i++) any |= a.mask[i]; good += any; }
      return { site, mask: a.mask, good, windows: windowsFrom(a.mask, samples) };
    }) };
  }
  const i = calIdx(), box = $("rank");
  for (const r of rank.rows) {                       // the dots in the site list
    const dot = document.querySelector(`.site-row[data-id="${r.site.id}"] .site-ok`);
    if (dot) { dot.className = "site-ok " + (r.mask[i] ? "go" : "nogo"); dot.title = r.mask[i] ? "GO at this landing time" : "NO-GO at this landing time"; }
  }
  box.replaceChildren(...[...rank.rows].sort((a, b) => b.good - a.good || a.site.name.localeCompare(b.site.name)).map((r, n) => {
    const b = document.createElement("button"), ok = !!r.mask[i], nx = r.windows.find((w) => w.end >= state.t0);
    b.className = "rank-row" + (r.site.id === state.site.id ? " cur" : ""); b.style.setProperty("--f", (r.good / c.days * 100).toFixed(1) + "%");
    b.innerHTML = `<span class="rk-n">${n + 1}</span><span class="rk-name">${siteName(r.site)}</span><span class="rk-ok ${ok ? "go" : "nogo"}">${ok ? "GO" : "NO-GO"}</span><span class="rk-days">${r.good} DAYS</span>`;
    b.title = nx ? `Next landing window opens ${stamp(nx.start)}` : "No landing window in the months shown";
    b.addEventListener("click", () => selectSite(r.site));
    return b;
  }));
  $("rank-note").textContent = `DAYS = DAYS WITH A GOOD LANDING HOUR, OUT OF THE ${c.days} FROM ${dayStamp(c.start)}, FOR A ${state.req.days}-DAY MISSION WITH YOUR NEEDS. GO / NO-GO IS FOR THE LANDING TIME ON SCREEN.`;
}

// The answer: can this mission land at this site at this time?
function renderMission() {
  const r = state.req, v = state.cal.a.at(calIdx()), nx = state.cal.windows.find((w) => w.start > state.t0);
  $("mission").className = "hero " + (v.ok ? "go" : "nogo");
  $("mission-word").textContent = v.ok ? "GO" : "NO-GO";
  $("mission-title").textContent = ""; $("mission-title").hidden = true;      // the landing time and mission length are already on screen
  const line = (label, value) => `<div class="hw"><span>${label}</span><b>${value}</b></div>`;      // one fact a row: what it is, then the value
  $("mission-why").innerHTML = v.ok
    ? line("SUNLIGHT", `${v.marginOpen ? "MORE THAN " : ""}${fmtDH(Math.max(0, v.marginHours))} LONGER THAN NEEDED`) + line("EARTH LINK", `IN VIEW ${Math.round(v.earthPct)}% OF THE MISSION`)
    : v.reasons.map((x, i) => line(i ? "AND" : "WHY", x)).join("") + line(nx ? "NEXT WINDOW" : "NEXT STEP", nx ? stamp(nx.start) : v.steep ? "THE SLOPE IS THE SAME ON EVERY DATE: TRY ANOTHER SPOT" : "NO LANDING WINDOW IN THE NEXT 12 MONTHS");
  // A NO-GO comes with ways out: another time, another spot, or a mission need that could be relaxed.
  const fixes = [];
  if (!v.ok) {
    const tr = state.scenario.terrain, tryReq = (change) => analyze(state.cal.samples, { ...r, ...change }, STEP_HOURS, tr).at(calIdx()).ok;
    if (nx) fixes.push(["mission-next", `LAND ON ${dayStamp(nx.start)} INSTEAD`, nextWindow]);
    if (v.steep) {                                               // too steep: the next slope limit that fits, or no limit at all
      const sl = REQ_OPTIONS.maxSlopeDeg.find((x) => x > r.maxSlopeDeg && tryReq({ maxSlopeDeg: x })) ?? (tryReq({ maxSlopeDeg: 0 }) ? 0 : null);
      if (sl != null) fixes.push(["mission-fix-slope", sl ? `ALLOW SLOPES UP TO ${sl}°` : "ACCEPT ANY SLOPE", () => setReq("maxSlopeDeg", sl)]);
    }
    const dark = REQ_OPTIONS.maxDarkH.find((hh) => hh > r.maxDarkH && tryReq({ maxDarkH: hh }));
    if (dark) fixes.push(["mission-fix-dark", `LET IT SIT ${dark} H IN THE DARK`, () => setReq("maxDarkH", dark)]);
    if (r.earthAtLanding && tryReq({ earthAtLanding: false })) fixes.push(["mission-fix-earth", "LAND WITHOUT AN EARTH LINK", () => setReq("earthAtLanding", false)]);
    const days = [...REQ_OPTIONS.days].reverse().find((d) => d < r.days && tryReq({ days: d }));
    if (days) fixes.push(["mission-fix-days", `SHORTEN THE MISSION TO ${days} DAYS`, () => setReq("days", days)]);
  }
  fixes.length = Math.min(fixes.length, 3);                      // keep it to one row
  // On a NO-GO the keys that can fix it pulse: the next landing window (when there is one) and the Best Site Finder.
  for (const [id, on] of [["next-window-btn", !v.ok && !!nx], ["side-next", !v.ok && !!nx], ["scan-btn", !v.ok]]) $(id).classList.toggle("fixit", on);
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
  // Warnings sit to the right of the verdict, in their own box (the user: "to the right and not underneath").
  $("mission-warn").innerHTML = hit.map((e) =>
    `<div class="warn"><b>⚠ ECLIPSE ON ${dayStamp(e.peak)}</b><span>EARTH HIDES ${e.maxCover >= 0.995 ? "ALL" : Math.round(e.maxCover * 100) + "%"} OF THE SUN FOR UP TO ${Math.round((e.end - e.start) / 3600000)} HOURS</span></div>`).join("");
  $("mission-warn").hidden = !hit.length;
  state.mission = { v, next: nx ? nx.start : null, fixes, eclipses: hit };      // kept for the command assistant
  // the same answer, short, for the BIG MOON view (which covers the verdict block)
  $("globe-verdict").className = "globe-verdict" + (v.ok ? " go" : "");
  $("globe-verdict").innerHTML = `<b>${v.ok ? "GO" : "NO-GO"}</b>${siteName(state.site)} · ${r.days}-DAY MISSION${v.ok ? "" : " · " + v.reasons[0]}`;
  return v;
}

function renderWindows() {
  const box = $("windows"), all = state.cal.windows;
  const from = all.findIndex((w) => w.end >= state.t0);
  const list = from < 0 ? [] : all.slice(from, from + 4);
  box.replaceChildren();
  if (!list.length) { box.innerHTML = `<div class="empty">NONE IN THIS 12-MONTH VIEW. <b class="h-do">CHANGE A MISSION NEED OR TRY ANOTHER SITE</b></div>`; return; }
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
  if (w) { const before = { site: state.site, t0: state.t0 }; setT0(w.start); offerCompare(before, "date"); return; }
  for (const b of [$("next-window-btn"), $("side-next")]) { b.classList.add("flash"); setTimeout(() => b.classList.remove("flash"), 500); }
}

// BEFORE AND AFTER: when the Best Site Finder moves the site or NEXT LANDING WINDOW moves the date, a box puts the
// original plan next to the new one and shows what was gained (the user asked for this after the judges said the
// comparison was hidden). Not during a test or the tutorial, and not when the user has switched it off.
let quietCompare = false, pendingCompare = null, energy = null;
function offerCompare(before, kind) {
  if (!compareWanted() || quietCompare || globalThis.LUNO_NO_COMPARE || document.querySelector(".tour-card")) return;
  const date = kind === "date", where = (site) => `${siteName(site)}<small>${fmtLat(site.lat)} ${fmtLon(site.lon)}</small>`;
  showCompare({
    title: date ? "NEXT LANDING WINDOW · WHAT CHANGED" : "NEW LANDING SITE · WHAT CHANGED",
    lead: date ? `${siteName(state.site)} · THE SAME SITE AT A NEW LANDING TIME · ${state.req.days}-DAY MISSION` : `LANDING ${stamp(state.t0)} · THE SAME TIME AT A NEW SITE · ${state.req.days}-DAY MISSION`,
    a: { label: date ? stamp(before.t0) : where(before.site), site: before.site, t0: before.t0, terrain: terrainFor(before.site) },
    b: { label: date ? stamp(state.t0) : where(state.site), site: state.site, t0: state.t0, terrain: state.scenario.terrain },
    req: state.req,
    buttons: [["KEEP THE NEW PLAN ▸", null, true], ["◂ GO BACK TO THE ORIGINAL", () => { if (before.site !== state.site) selectSite(before.site); setT0(before.t0); }]],
  });
}
function flushCompare() { if (!pendingCompare || state.terrainBusy) return; const b = pendingCompare; pendingCompare = null; offerCompare(b, "site"); }

// Change one mission need (from its buttons or from a "way to get a GO" button) and keep the buttons in step.
function setReq(k, val) { setReqs({ [k]: val }); }
function setReqs(change) {
  state.req = { ...state.req, ...change };
  syncNeeds();
  recompute({ keepIdx: true });
}
const earthLinkValue = (r) => (r.earthMinPct > 0 ? String(r.earthMinPct) : r.earthAtLanding ? "landing" : "none");
function syncNeeds() {
  document.querySelectorAll(".seg[data-req] button").forEach((x) => { const k = x.parentElement.dataset.req; x.classList.toggle("on", x.dataset.v === (k === "earthLink" ? earthLinkValue(state.req) : String(state.req[k]))); });
  // SIMPLE VIEW shows the mission length only; a need that is not at its usual setting brings the rest into view.
  if (Object.keys(DEFAULT_REQ).some((k) => k !== "days" && state.req[k] !== DEFAULT_REQ[k])) openNeeds(true);
}
function openNeeds(open) {
  document.querySelector(".needs").classList.toggle("open", open);
  $("needs-more").textContent = open ? "▾ SHOW FEWER NEEDS" : "▸ 3 MORE MISSION NEEDS";
}
// SIMPLE VIEW (the default): the few keys and needs most people use. ALL TOOLS: everything. Kept under "luno-view".
let setSetup = () => {};
function setTools(all, keep = true) {
  document.documentElement.classList.toggle("simple", !all);
  $("tools-btn").innerHTML = all ? "SIMPLE VIEW" : "ALL TOOLS";
  if (keep) try { localStorage.setItem("luno-view", all ? "all" : "simple"); } catch {}
  requestAnimationFrame(relayout);
}

function buildNeeds() {
  document.querySelectorAll(".seg[data-req]").forEach((seg) => {
    const k = seg.dataset.req;
    // EARTH LINK is one row for two needs: a link at landing (earthAtLanding) and a share of the mission (earthMinPct).
    const opts = k === "earthLink" ? [["none", "NONE"], ["landing", "AT LANDING"], ...REQ_OPTIONS.earthMinPct.filter((v) => v > 0).map((v) => [v, v + "%"])]
      : REQ_OPTIONS[k].map((v) => [v, k === "maxSlopeDeg" && v === 0 ? "ANY" : String(v)]);
    for (const [val, label] of opts) {
      const b = document.createElement("button");
      b.textContent = label; b.dataset.v = String(val);
      b.classList.toggle("on", b.dataset.v === (k === "earthLink" ? earthLinkValue(state.req) : String(state.req[k])));
      b.addEventListener("click", () => (k === "earthLink" ? setReqs(val === "none" ? { earthAtLanding: false, earthMinPct: 0 } : { earthAtLanding: true, earthMinPct: val === "landing" ? 0 : val }) : setReq(k, val)));
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
    $("play-label").textContent = "▶ PLAY ORBITAL DATA"; btn.classList.remove("on");
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
  $("sun-next-date").textContent = sunLeft == null ? "" : `${stamp(new Date(+cur.t + sunLeft * 3600000))}`;
  $("sun-el").textContent = sgn(cur.sunEl) + "°"; $("sun-az").textContent = cur.sunAz.toFixed(1) + "°";
  if (energy) $("sun-watts").textContent = `PANEL NOW ${watts(energy.now(cur.sunFrac))}`;
  // In view below level: the site stands high, so the skyline in that direction dips under the horizontal.
  const lowNote = (id, up, el) => { const n = $(id); n.hidden = !(up && el < 0); if (!n.hidden) n.textContent = "BELOW LEVEL, BUT THE SKYLINE THERE DIPS LOWER"; };
  lowNote("sun-low", cur.sunUp, cur.sunEl);
  set("earth-state", cur.earthUp, "EARTH IN VIEW", "NO LINK");
  $("earth-next-label").textContent = cur.earthUp ? "EARTHSET IN" : "EARTHRISE IN";
  $("earth-next").textContent = fmtBig(earthLeft);
  $("earth-next-date").textContent = earthLeft == null ? "" : `${stamp(new Date(+cur.t + earthLeft * 3600000))}`;
  $("earth-el").textContent = sgn(cur.earthEl) + "°"; $("earth-az").textContent = cur.earthAz.toFixed(1) + "°";
  lowNote("earth-low", cur.earthUp, cur.earthEl);
  // Which Deep Space Network sites have the Moon in their sky right now (only said while Earth is in view from the site).
  const dsn = cur.earthUp ? dsnAt(cur.t)?.filter((s) => s.el > 0) : null, dsnBox = $("earth-dsn");
  dsnBox.hidden = !dsn;
  if (dsn) dsnBox.innerHTML = dsn.length ? `<b>DEEP SPACE NETWORK:</b> ${dsn.map((s) => `${s.name} ${Math.round(s.el)}°`).join(" · ")}` : "NO DEEP SPACE NETWORK SITE HAS THE MOON IN ITS SKY NOW";

  $("sun-ico").className = "ro-ico " + (cur.sunUp ? "go" : "nogo");
  $("earth-ico").className = "ro-ico " + (cur.earthUp ? "go" : "nogo");
  $("hz-sun").href = horizonsUrl(10, cur.t);
  $("hz-earth").href = horizonsUrl(399, cur.t);
  renderHorizon(cur);
  renderTimelineCursor();
  renderOps();
  const sp = subPoints(cur.t);
  globe?.setBodies(sp.sun, sp.earth);
  surface?.update();
  openspace?.update(osState());
  window.dispatchEvent(new Event("luno:clock"));
}
const osState = () => { const cur = state.scenario.samples[state.idx]; return { site: state.site, t: cur.t, heightM: state.scenario.terrain.heightM, sunAz: cur.sunAz }; };

// A JPL Horizons query for the same site and moment, so anyone can compare NASA's answer with LUNI's.
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
  yMax = Math.min(90, Math.ceil(yMax)); yMin = Math.floor(Math.min(yMin, -0.22 * yMax));      // always leave a band of ground in the picture
  const x = (a) => L + (a / 360) * (W - L - 4);
  const y = (e) => T + (1 - (e - yMin) / (yMax - yMin)) * (H - B - T);
  const clampY = (e) => y(Math.max(yMin, Math.min(yMax, e)));

  // The sky is black even in daytime: there is no air to light it up.
  const defs = el("defs", {}, svg);
  const grad = (id, stops, attrs) => { const g = el(attrs.r ? "radialGradient" : "linearGradient", { id, ...attrs }, defs); for (const [o, c, a = 1] of stops) el("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g); };
  const lit = cur.sunUp;                                         // sunlit ground is pale gray, ground in shadow nearly black
  grad("hz-ground", lit ? [[0, "#aab1b9"], [0.5, "#6b727b"], [1, "#3a4048"]] : [[0, "#39445a"], [0.5, "#1e2634"], [1, "#0e131b"]], { x1: 0, y1: 0, x2: 0, y2: 1 });
  grad("hz-halo", [[0, "#fff6c8", 0.95], [0.28, "#ffd23c", 0.5], [1, "#ffd23c", 0]], { r: 0.5 });

  const span = yMax - yMin, step = [2, 5, 10, 15, 30, 45].find((v) => v / span * (H - B - T) >= 15 && span / v <= 7) || 90;      // height labels at least 15 px apart
  for (let e = Math.ceil(yMin / step) * step; e <= yMax; e += step) {
    el("line", { x1: L, x2: W, y1: y(e), y2: y(e), stroke: e === 0 ? C.grid0 : C.grid }, svg);
    el("text", { x: L - 6, y: y(e) + 4, fill: C.dim, "font-size": 12.5, "text-anchor": "end" }, svg, e + "°");
  }
  const narrow = W < 520;
  for (let i = 0; i <= 8; i++) el("line", { x1: x(i * 45), x2: x(i * 45), y1: T, y2: H - B, stroke: C.grid }, svg);

  // Paths: where each has been (faint) and where it goes in the next 3 days (bright, with a mark every day).
  const pathD = (key, list) => {
    let d = "", prev = null;
    for (const s of list) {
      const az = s[key + "Az"];
      d += (prev == null || Math.abs(az - prev) > 180 ? "M" : "L") + x(az).toFixed(1) + "," + clampY(s[key + "El"]).toFixed(1);
      prev = az;
    }
    return d;
  };
  const past = samples.slice(lo, state.idx + 1), ahead = samples.slice(state.idx, hi + 1);
  const drawPaths = (parent, fade) => {
    for (const [key, color] of [["sun", "#ffd23c"], ["earth", C.cy]]) {
      el("path", { d: pathD(key, past), fill: "none", stroke: color, "stroke-dasharray": "1 5", opacity: 0.45 * fade }, parent);
      el("path", { d: pathD(key, ahead), fill: "none", stroke: color, "stroke-width": 1.8, "stroke-dasharray": "5 4", opacity: fade }, parent);
      const far = ahead.length > 1 ? Math.abs(x(ahead.at(-1)[key + "Az"]) - x(ahead[0][key + "Az"])) : 0;
      for (let d = 1; d * 24 / STEP_HOURS < ahead.length; d++) {
        const s = ahead[d * 24 / STEP_HOURS], cx = x(s[key + "Az"]), cy = clampY(s[key + "El"]);
        if (far < 24) continue;                                  // it hardly moves (Earth hangs in one place): no day marks
        el("circle", { cx, cy, r: 3, fill: color, opacity: fade }, parent);
        if (fade === 1 && far > 60 && far < 0.8 * W) el("text", { x: cx, y: cy - 7, fill: color, "font-size": 12, "font-weight": 600, "text-anchor": "middle" }, parent, `+${d}D`);
      }
    }
  };
  drawPaths(svg, 1);

  // The ground: solid, so it hides whatever is behind it.
  let d = `M${x(0)},${H - B}`, ln = "";
  for (let az = 0; az <= 360; az += 0.5) {
    const pt = `${x(az).toFixed(1)},${clampY(horizonAt(horizon, az)).toFixed(1)}`;
    d += "L" + pt; ln += (az ? "L" : "M") + pt;
  }
  el("path", { d: d + `L${x(360)},${H - B}Z`, fill: "url(#hz-ground)", stroke: "none" }, svg);
  const ridgeLine = el("path", { d: ln, fill: "none", stroke: lit ? "#e9eef3" : C.dim, "stroke-width": 1.6 }, svg);
  drawPaths(el("g", { opacity: 0.3 }, svg), 0.999);             // the same paths, faint, where they run behind the ground
  // Depth: two nearer bands of ground in front of the skyline, each darker and smoother. They are for the eye only;
  // they always stay below the true skyline (the top edge), which alone decides what the ground hides.
  {
    const N = 720, hz = Array.from({ length: N + 1 }, (_, i) => clampY(horizonAt(horizon, i / 2)));
    const smooth = (w) => hz.map((_, i) => { let t = 0; for (let k = -w; k <= w; k++) t += hz[(((i + k) % N) + N) % N]; return t / (2 * w + 1); });
    const floor = H - B, top = Math.min(...hz), G = Math.max(18, floor - hz.reduce((t, v) => t + v, 0) / hz.length);
    const s1 = smooth(24), s2 = smooth(80);
    const near = hz.map((v, i) => Math.min(floor, Math.max(v + 0.13 * G, s1[i] + 0.24 * G)));
    const front = near.map((v, i) => Math.min(floor, Math.max(v + 0.12 * G, s2[i] + 0.52 * G + 0.035 * G * Math.sin(i / N * Math.PI * 10))));
    grad("hz-near", lit ? [[0, "#7c838c"], [1, "#2b3037"]] : [[0, "#252e40"], [1, "#0c1018"]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    grad("hz-front", lit ? [[0, "#4d535b"], [1, "#16191e"]] : [[0, "#171d2a"], [1, "#06080c"]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    for (const [ys, fill, edge] of [[near, "url(#hz-near)", lit ? "#c3cad2" : "#4d5d7c"], [front, "url(#hz-front)", lit ? "#8b929b" : "#34405a"]]) {
      if (floor - top < 26) break;                               // too little ground in the picture for bands
      let dd = "";
      for (let i = 0; i <= N; i++) dd += (i ? "L" : "M") + x(i / 2).toFixed(1) + "," + ys[i].toFixed(1);
      el("path", { d: dd + `L${x(360)},${floor}L${x(0)},${floor}Z`, fill, stroke: "none" }, svg);
      el("path", { d: dd, fill: "none", stroke: edge, "stroke-width": 1, opacity: 0.55 }, svg);
    }
  }
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"].forEach((dname, i) => {
    if (narrow && i % 2) return;
    el("text", { x: Math.min(W - 8, x(i * 45)), y: H - 4, fill: C.dim, "font-size": 12.5, "text-anchor": "middle" }, svg, dname);
  });

  // The Sun and Earth are drawn larger than life, so each is placed against the skyline by how much of its real disc
  // the ground hides: clear of the ground when its whole disc is in view, cut by the skyline when part of it is.
  const place = (az, elv, radDeg, r) => {
    const ySky = clampY(horizonAt(horizon, az)), k = (elv - horizonAt(horizon, az)) / radDeg;      // k: disc radii above the skyline
    const cy = k >= 1 ? Math.min(clampY(elv), ySky - r - 1) : k <= -1 ? Math.max(clampY(elv), ySky + r + 3) : ySky - k * r;
    return { cx: x(az), cy: Math.max(T + r, Math.min(H - B - 2, cy)), ySky, k };
  };
  const label = (cx, cy, text, color, dy = -12, off = 14) => {
    const right = cx < W - 170;
    const t = el("text", { x: cx + (right ? off : -off), y: Math.max(T + 11, cy + dy), fill: color, "font-size": 13.5, "font-weight": 700, "text-anchor": right ? "start" : "end", stroke: "#000", "stroke-width": 3, "paint-order": "stroke" }, svg, text);
    return t;
  };
  const clipAbove = (id, p) => { const c = el("clipPath", { id }, defs); el("rect", { x: 0, y: 0, width: W, height: Math.max(0, p.ySky) }, c); };

  // Sun
  // Both are drawn larger than life, at sizes that never change; Earth stays the bigger of the two, as it is from
  // the Moon (about 3.6 times wider). Drawn that large, the two discs would overlap on the picture while the real
  // ones are still well apart, which looks like an eclipse that is not happening. So when they are close, the pair is
  // placed by the real gap between them, the same way each is placed against the skyline: standing clear of each
  // other until the real discs touch, then overlapping by as much as the real discs do.
  const RS = 9, RE = 15;                                         // fixed sizes: the picture changes height with the layout, and the two must not change with it
  const sp = place(cur.sunAz, cur.sunEl, 0.2666, RS), ep = place(cur.earthAz, cur.earthEl, cur.earthRadDeg || 0.95, RE);
  if (sp.k > -1 && ep.k > -1) {
    const u = (cur.sepDeg ?? 99) / (0.2666 + (cur.earthRadDeg || 0.95));      // the real gap, where 1 = the two discs just touch
    let dx = sp.cx - ep.cx, dy = sp.cy - ep.cy, d = Math.hypot(dx, dy);
    const want = u < 1 ? u * (RS + RE) : Math.max(d, RS + RE + 3);
    if (Math.abs(want - d) > 0.5) {
      if (d < 0.01) { dx = 0; dy = -1; d = 1; }
      const mx = (sp.cx + ep.cx) / 2, my = (sp.cy + ep.cy) / 2, ux = dx / d, uy = dy / d;
      sp.cx = mx + ux * want / 2; sp.cy = my + uy * want / 2; ep.cx = mx - ux * want / 2; ep.cy = my - uy * want / 2;
      for (const [b, r] of [[sp, RS], [ep, RE]]) {                 // a disc that is wholly above the skyline stays above it
        if (b.k >= 1) b.cy = Math.min(b.cy, b.ySky - r - 1);
        b.cy = Math.max(T + r, Math.min(H - B - 2, b.cy));
      }
    }
  }
  if (sp.k > -1) {
    clipAbove("hz-clip-sun", sp);
    const g = el("g", sp.k < 1 ? { "clip-path": "url(#hz-clip-sun)" } : {}, svg), inner = el("g", { transform: `translate(${sp.cx},${sp.cy})` }, g);
    el("circle", { r: RS * 3.4, fill: "url(#hz-halo)" }, inner);      // the glow and the rays are sized from the Sun itself, so they always fit it
    for (let a = 0; a < 180; a += 22.5) { const c = Math.cos(a * Math.PI / 180), s2 = Math.sin(a * Math.PI / 180), len = RS * (a % 90 === 0 ? 2.7 : a % 45 === 0 ? 2.15 : 1.65); el("line", { x1: -c * len, y1: -s2 * len, x2: c * len, y2: s2 * len, stroke: "#fff2b0", "stroke-width": Math.max(1, RS * 0.14), "stroke-linecap": "round", opacity: a % 45 === 0 ? 0.9 : 0.6 }, inner); }
    el("circle", { r: RS, fill: "#fff3b8", stroke: "#ffd23c", "stroke-width": 1.5 }, inner);
  } else {
    el("circle", { cx: sp.cx, cy: sp.cy, r: RS, fill: "none", stroke: "#ffd23c", "stroke-width": 1.5, "stroke-dasharray": "3 3", opacity: 0.8 }, svg);
  }
  const sunPct = Math.round(cur.sunFrac * 100);

  // Earth, with its real phase: the lit side faces the Sun.
  // Earth is drawn bigger than the Sun because it is: seen from the Moon its disc is about 3.6 times as wide.
  if (ep.k > -1) {
    clipAbove("hz-clip-earth", ep);
    const g = el("g", ep.k < 1 ? { "clip-path": "url(#hz-clip-earth)" } : {}, svg), e = el("g", { transform: `translate(${ep.cx},${ep.cy})` }, g);
    const cid = el("clipPath", { id: "hz-earth-disc" }, defs); el("circle", { r: RE }, cid);
    el("circle", { r: RE + 2.5, fill: "#6fb7ff", opacity: 0.28 }, e);
    const face = el("g", { "clip-path": "url(#hz-earth-disc)" }, e);
    el("circle", { r: RE, fill: "#2a6fd8" }, face);
    const art = el("g", { transform: `scale(${(RE / 9).toFixed(3)})` }, face);      // land and cloud shapes are drawn for a radius of 9
    el("path", { d: "M-6,-3q3,-4 6,-1t3,5q-4,3 -7,1z M2,3q3,-1 5,2l-2,4q-4,0 -3,-6z", fill: "#3fae6a" }, art);
    el("path", { d: "M-9,-5q6,3 12,-1 M-8,4q7,-3 15,1 M-4,-8q5,2 9,0", fill: "none", stroke: "#fff", "stroke-width": 1.6, opacity: 0.85 }, art);
    const kLit = (1 - Math.cos((cur.sepDeg ?? 90) * Math.PI / 180)) / 2;                       // share of Earth's face that is lit, as seen from the Moon
    let dAz = cur.sunAz - cur.earthAz; dAz = ((dAz + 540) % 360) - 180;
    const toSun = Math.atan2(clampY(cur.sunEl) - clampY(cur.earthEl), dAz * (W - L - 4) / 360) * 180 / Math.PI;
    const rx = RE * Math.abs(1 - 2 * kLit);
    el("path", { d: `M0,${-RE}A${RE},${RE} 0 0 0 0,${RE}A${rx.toFixed(2)},${RE} 0 0 ${kLit < 0.5 ? 0 : 1} 0,${-RE}Z`, fill: "#02060f", opacity: 0.88, transform: `rotate(${toSun.toFixed(1)})` }, face);
    el("circle", { r: RE, fill: "none", stroke: "#9fd0ff", "stroke-width": 1 }, e);
  } else {
    el("circle", { cx: ep.cx, cy: ep.cy, r: RE, fill: "none", stroke: C.cy, "stroke-width": 1.5, "stroke-dasharray": "3 3", opacity: 0.8 }, svg);
  }
  const sunText = sp.k <= -1 ? "SUN · BEHIND THE GROUND" : cur.eclipse > 0.01 && cur.sunTerrain > 0 ? `SUN · EARTH HIDES ${Math.round(cur.eclipse * 100)}%` : sp.k < 1 ? `SUN · ${sunPct}% IN VIEW` : `SUN ${sgn(cur.sunEl)}°`, sunCol = cur.sunUp ? "#ffe27a" : C.red;
  const earthText = ep.k <= -1 ? "EARTH · BEHIND THE GROUND" : cur.earthUp ? `EARTH ${sgn(cur.earthEl)}°` : "EARTH · NO LINK", earthCol = cur.earthUp ? C.cy : C.red;
  if (Math.abs(ep.cx - sp.cx) < 190 && Math.abs(ep.cy - sp.cy) < 50) {
    // The two are close together: stack both names beside the pair, so neither name lands on the other body.
    const right = Math.max(sp.cx, ep.cx) < W - 190, xx = right ? Math.max(sp.cx + 24, ep.cx + RE + 7) : Math.min(sp.cx - 24, ep.cx - RE - 7);
    const y0 = Math.max(T + 11, Math.min(H - B - 22, Math.min(sp.cy, ep.cy) + 2));
    for (const [text, color, dy] of [[sunText, sunCol, 0], [earthText, earthCol, 17]])
      el("text", { x: xx, y: y0 + dy, fill: color, "font-size": 13.5, "font-weight": 700, "text-anchor": right ? "start" : "end", stroke: "#000", "stroke-width": 3, "paint-order": "stroke" }, svg, text);
  } else {
    label(sp.cx, sp.cy, sunText, sunCol);
    label(ep.cx, ep.cy, earthText, earthCol, -RE - 1, RE + 6);
  }

  // Light from the Sun along the top of the ridge beneath it.
  if (sp.k > -1 && lit) {
    const g2 = el("linearGradient", { id: "hz-rim", gradientUnits: "userSpaceOnUse", x1: sp.cx - 150, x2: sp.cx + 150, y1: 0, y2: 0 }, defs);
    for (const [o, a] of [[0, 0], [0.5, 0.95], [1, 0]]) el("stop", { offset: o, "stop-color": "#fff4bf", "stop-opacity": a }, g2);
    ridgeLine.after(el("path", { d: ln, fill: "none", stroke: "url(#hz-rim)", "stroke-width": 2.6 }));
  }
  el("title", {}, svg, "The Sun and Earth are drawn larger than life. Their positions, and how much of each the ground hides, are exact. The top edge of the ground is the real skyline; the darker bands in front of it are only there to give the picture depth.");
}

// ---------- this site next to Earth ----------
// The site's side comes from the year of hourly samples behind the landing-day strip; the Earth side is a place on
// Earth's equator (day and night about 12 hours each, Sun overhead at noon around the equinoxes, and a sunset that
// takes about 2 minutes because the Sun's 0.53-degree disc sinks at 15 degrees an hour).
function versus() {
  const S = state.cal.samples, n = Math.min(S.length, state.cal.days * 24), r = Math.PI / 180;
  const vec = (s) => [Math.cos(s.earthEl * r) * Math.sin(s.earthAz * r), Math.cos(s.earthEl * r) * Math.cos(s.earthAz * r), Math.sin(s.earthEl * r)];
  let sunRun = 0, darkRun = 0, maxSun = 0, maxDark = 0, hi = -90, earthUp = 0, m = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const s = S[i];
    if (s.sunUp) { sunRun++; darkRun = 0; } else { darkRun++; sunRun = 0; }
    maxSun = Math.max(maxSun, sunRun); maxDark = Math.max(maxDark, darkRun); hi = Math.max(hi, s.sunEl); earthUp += s.earthUp ? 1 : 0;
    const v = vec(s); m[0] += v[0]; m[1] += v[1]; m[2] += v[2];
  }
  const len = Math.hypot(...m) || 1; let spread = 0;
  for (let i = 0; i < n; i += 6) { const v = vec(S[i]); spread = Math.max(spread, Math.acos(Math.min(1, (v[0] * m[0] + v[1] * m[1] + v[2] * m[2]) / len)) / r); }
  // How long a sunset takes: from the last hour with the whole disc clear of the skyline to the first hour with none of it.
  let setH = null;
  for (let i = 1; i < n && setH == null; i++) {
    if (!(S[i - 1].sunTerrain >= 1 && S[i].sunTerrain < 1)) continue;
    let j = i; while (j < n && S[j].sunTerrain > 0 && S[j].sunTerrain < 1) j++;
    if (j < n && S[j].sunTerrain <= 0) setH = Math.max(1, j - i);
  }
  const span = (h) => (h >= n ? "ALL YEAR" : h === 0 ? "NONE" : fmtT(h * STEP_HOURS));
  const rows = [
    ["LONGEST UNBROKEN SUNLIGHT", span(maxSun), "ABOUT 12 H"],
    ["LONGEST DARK SPELL", span(maxDark), "ABOUT 12 H"],
    ["THE SUN'S HIGHEST POINT", `${hi.toFixed(1)}°`, "90° (OVERHEAD)"],
    ["A SUNSET TAKES", setH == null ? "NO FULL SUNSET" : setH < 48 ? `ABOUT ${setH} H` : `ABOUT ${Math.round(setH / 24)} DAYS`, "ABOUT 2 MIN"],
    ["EARTH IN THE SKY", earthUp ? `WITHIN ${Math.ceil(spread)}° OF ONE SPOT, IN VIEW ${Math.round(earthUp / n * 100)}% OF THE TIME` : "NEVER IN VIEW FROM HERE", "(THE MOON) CROSSES THE WHOLE SKY EVERY DAY"],
  ];
  return { rows, note: `HERE: ${state.cal.days} DAYS FROM ${dayStamp(state.cal.start)}, FROM LUNI'S HOURLY SUN AND EARTH POSITIONS. EARTH: A PLACE ON THE EQUATOR. THE MOON HAS NO AIR, SO THE SKY IS BLACK EVEN AT NOON AND SHADOWS ARE FULLY DARK.` };
}
function renderVersus() {
  const v = versus();
  $("versus").innerHTML = `<tr><th></th><th>HERE</th><th>ON EARTH</th></tr>` + v.rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("");
  $("versus-note").textContent = v.note;
}

// ---------- timeline ----------
const TL = { left: 64, right: 4, top: 18, rowH: 16, gap: 4, rail: 32 };      // rail = distance from the axis line down to the slider rail

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
    el("text", { x: 0, y: yy + TL.rowH / 2 + 4.5, fill: color, "font-size": 15.5, "font-weight": 700 }, svg, name);
  });
  const yAxis = TL.top + 3 * (TL.rowH + TL.gap);
  const every = W < 520 ? 10 : 5;
  for (let day = 0; day <= 30; day += every) {
    const xx = TL.left + Math.min(n, day * 24 / STEP_HOURS) * w;
    el("line", { x1: xx, x2: xx, y1: TL.top - 4, y2: yAxis, stroke: "#000", "stroke-width": 1 }, svg);
    const d = samples[Math.min(n - 1, day * 24 / STEP_HOURS)].t;
    el("text", { x: xx, y: yAxis + 12, fill: C.dim, "font-size": 12.5, "text-anchor": day === 0 ? "start" : day === 30 ? "end" : "middle" }, svg,
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
  // The bracket's label sits to the right of the bracket; when there is no room there (a 28-day mission), it moves inside.
  const mLabel = `THE ${state.req.days}-DAY MISSION`, mW = mLabel.length * 7.5 + 6;
  if (mEnd + 5 + mW <= W - TL.right) el("text", { x: mEnd + 5, y: TL.top - 5, fill: C.wht, "font-size": 12 }, svg, mLabel);
  else {
    el("rect", { x: mEnd - 10 - mW, y: TL.top - 15, width: mW + 4, height: 12, fill: "#000" }, svg);
    el("text", { x: mEnd - 9, y: TL.top - 5, fill: C.wht, "font-size": 12, "text-anchor": "end" }, svg, mLabel);
  }
  // The slider: a rail under the chart and a handle that carries the moment it stands on.
  const yRail = yAxis + TL.rail;
  el("rect", { x: TL.left, y: yRail - 4, width: W - TL.left - TL.right, height: 8, rx: 4, fill: C.dim, opacity: 0.7 }, svg);
  el("text", { x: 0, y: yRail + 4, fill: C.amb, "font-size": 15.5, "font-weight": 700 }, svg, "SLIDER");
  el("path", { id: "tl-cursor", d: "", fill: "none", stroke: C.amb, "stroke-width": 2 }, svg);
  el("path", { id: "tl-cursor-top", d: "", fill: C.amb }, svg);
  const g = el("g", { id: "tl-handle", class: state.scrubbed ? "" : "nudge" }, svg);
  el("rect", { id: "tl-handle-box", y: yRail - 13, height: 26, rx: 13, fill: C.amb, stroke: "#000", "stroke-width": 1.5 }, g);
  el("text", { id: "tl-handle-text", y: yRail + 5, fill: "#000", "font-size": 14, "font-weight": 700, "text-anchor": "middle" }, g, "");
  el("rect", { id: "tl-hint-bg", y: yRail - 10, height: 20, width: 236, fill: "#000" }, g);
  el("text", { id: "tl-hint", y: yRail + 5, fill: cssVar("--key-y"), "font-size": 14, "font-weight": 700 }, g, "");      // shown until the slider is first used
}

function renderTimelineCursor() {
  const svg = $("timeline"), c = svg.querySelector("#tl-cursor"); if (!c) return;
  const W = svg.clientWidth || 700, n = state.scenario.samples.length;
  const xx = TL.left + (state.idx + 0.5) * (W - TL.left - TL.right) / n, y1 = TL.top + 3 * (TL.rowH + TL.gap) - 4;
  const yRail = y1 + 4 + TL.rail, h = state.idx * STEP_HOURS;
  c.setAttribute("d", `M${xx},6V${yRail}`);
  svg.querySelector("#tl-cursor-top").setAttribute("d", `M${xx - 5},0H${xx + 5}L${xx},7Z`);
  // handle: "◀ +9D 00H ▶", kept inside the chart at both ends
  const label = `◀ ${h ? "+" + fmtT(h) : "LANDING"} ▶`, bw = label.length * 8.8 + 18, bx = Math.max(TL.left, Math.min(W - TL.right - bw, xx - bw / 2));
  const box = svg.querySelector("#tl-handle-box"), txt = svg.querySelector("#tl-handle-text");
  box.setAttribute("x", bx); box.setAttribute("width", bw); txt.setAttribute("x", bx + bw / 2); txt.textContent = label;
  const hint = svg.querySelector("#tl-hint"), right = bx + bw + 250 < W;      // the pointer to the handle sits on whichever side has room
  svg.querySelector("#tl-hint-bg").setAttribute("x", right ? bx + bw + 4 : bx - 240);
  hint.setAttribute("x", right ? bx + bw + 10 : bx - 10); hint.setAttribute("text-anchor", right ? "start" : "end"); hint.textContent = right ? "◀◀ DRAG THIS ALONG THE BAR" : "DRAG THIS ALONG THE BAR ▶▶";
}

function scrubFromEvent(e) {
  const svg = $("timeline"), r = svg.getBoundingClientRect(), z = zoomOf(svg);
  const f = ((e.clientX - r.left) / z - TL.left) / (svg.clientWidth - TL.left - TL.right);
  setIdx(Math.round(Math.max(0, Math.min(1, f)) * (state.scenario.samples.length - 1)));
}

// ---------- compare ----------
// The panel behind COMPARE · MORE (pinned options, next landing times, site numbers, OpenSpace, credits).
function setMore(show = $("more-panel").hidden) { $("more-panel").hidden = !show; $("more-btn").classList.toggle("on", show); }

function pinCurrent() {
  const key = `${state.site.lat},${state.site.lon},${state.t0.toISOString()}`;
  if (!state.pinned.some((p) => p.key === key))
    state.pinned.push({ key, site: { ...state.site }, t0: new Date(state.t0), summary: state.summary, days: state.req.days, mission: state.cal.a.at(calIdx()) });
  renderCompare();
  setMore(true);                                       // pinning is asking to compare: show the pinned options
}

function renderCompare() {
  const box = $("compare-list");
  box.replaceChildren();
  if (!state.pinned.length) { box.innerHTML = `<div class="empty">NOTHING PINNED. <b class="h-do">PRESS THE PIN KEY</b> TO KEEP THIS SITE + DATE, THEN CHANGE EITHER AND PIN AGAIN.</div>`; return; }
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

// A short confirmation at the top of the screen that fades by itself.
let toastTimer = 0;
function toast(text, ms = 4600, raw = false) {      // raw: text to be read and copied exactly (a link), not a short confirmation
  const n = $("toast");
  n.hidden = true; void n.offsetWidth;                 // restart the fade if one is already showing
  n.textContent = raw ? text : "✓ " + text; n.classList.toggle("raw", raw); n.hidden = false; n.style.animationDuration = ms + "ms";
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { n.hidden = true; }, ms);
}
// "1.90 KM TO THE SOUTHEAST": how far and which way b is from a, on the Moon.
function moveText(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r, la = a.lat * r, lb = b.lat * r;
  const km = 2 * 1737.4 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2));
  const brg = (Math.atan2(Math.sin(dLon) * Math.cos(lb), Math.cos(la) * Math.sin(lb) - Math.sin(la) * Math.cos(lb) * Math.cos(dLon)) / r + 360) % 360;
  const dir = ["NORTH", "NORTHEAST", "EAST", "SOUTHEAST", "SOUTH", "SOUTHWEST", "WEST", "NORTHWEST"][Math.round(brg / 45) % 8];
  return km < 0.005 ? "0 KM" : `${km < 10 ? km.toFixed(2) : km.toFixed(1)} KM TO THE ${dir}`;
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
  moveToExtreme: (what, which) => { showScreen("main"); return scan.extreme(what, which); },
  placePanels: (radiusKm, count) => { showScreen("main"); return scan.panels(radiusKm, count); },
  // two listed sites side by side at the landing time on screen
  compareSites: (A, B) => { showScreen("main"); const name = (x) => `${siteName(x)}<small>${fmtLat(x.lat)} ${fmtLon(x.lon)}</small>`;
    return showCompare({ title: "TWO SITES SIDE BY SIDE", lead: `LANDING ${stamp(state.t0)} · ${state.req.days}-DAY MISSION · YOUR MISSION NEEDS`, heads: ["SITE A", "SITE B"], gainHead: "B AGAINST A",
      a: { label: name(A), site: A, t0: state.t0, terrain: terrainFor(A) }, b: { label: name(B), site: B, t0: state.t0, terrain: terrainFor(B) }, req: state.req,
      buttons: [[`GO TO ${siteName(A)}`, () => selectSite(A)], [`GO TO ${siteName(B)}`, () => selectSite(B)], ["CLOSE", null, true]] }); },
  energyText: () => { const b = energy.budget(), r = state.req; if (!energy.isOpen()) energy.toggle(true);
    return `With the panel and power use set under ENERGY, the panel gives ${watts(b.peakW)} in full Sun. Over the ${r.days}-day mission it collects ${kwh(b.inWh)} and the lander uses ${kwh(b.usedWh)}. ` +
      (b.enough ? (b.batteryWh > 0 ? `That is enough, with a battery of at least ${kwh(b.batteryWh)}; the longest time on the battery is ${b.onBatteryLongestH} hours.` : "That is enough, and the panel never drops below what the lander uses.") : "That is not enough energy: it needs a bigger panel, less power use, or more Sun."); },
  openProof: (show) => { if (proof.isOpen() !== show) proof.toggle(show); },
  openHistory: (show) => { if (past.isOpen() !== show) showScreen(show ? "history" : "main"); },
  openMoonMap: (show, layerId) => { if (moonmap.isOpen() !== show) showScreen(show ? "moon" : "main"); if (show && layerId) moonmap.setLayer(layerId); },
  share: () => shareLink(),
  versus: () => versus(),
  pin: () => pinCurrent(),
};

// Which screen is up: "main", "moon" (MOON MAP) or "history" (MISSION HISTORY).
function showScreen(name) {
  past.toggle(name === "history"); moonmap.toggle(name === "moon");
  if (name === "history") showData("history");
  for (const [id, n] of [["tab-main", "main"], ["tab-moon", "moon"], ["tab-history", "history"]]) $(id).classList.toggle("on", n === name);
  $("globe-big").textContent = name === "moon" ? "⤡ SMALL MOON" : "⤢ MOON MAP"; $("globe-big").classList.toggle("on", name === "moon");
}

// The lower chart shows one thing at a time: the MISSION PLAN (30 days after landing, with the slider) or MISSION WINDOWS
// (the 12-month landing-day strip). The room this saves goes to the skyline picture.
function showPlan(which) {
  for (const [name, svg, title, tab] of [["plan", "timeline", "plan-title-a", "tab-plan"], ["ops", "ops", "ops-title", "tab-ops"], ["days", "calendar", "cal-title", "tab-days"]]) {
    const on = name === (which === "days" || which === "ops" ? which : "plan");
    $(svg).toggleAttribute("hidden", !on); $(title).hidden = !on; $(tab).classList.toggle("on", on);
  }
  relayout();
}

// ---------- operations plan ----------
// The mission, stretch by stretch: what the Sun and Earth allow, in order. It is a reading of LUNI's own hourly
// answers (Sun up, Earth in view, eclipse), not a flight schedule: nothing here knows what the lander has to do.
const OPS = {
  both:  { name: "POWER + LINK", long: "SUN UP AND EARTH IN VIEW: POWER AND A LINK TO EARTH", fill: "#e9eef5", ink: "#06101f" },
  sun:   { name: "POWER, NO LINK", long: "SUN UP, EARTH HIDDEN: POWER, BUT NO LINK TO EARTH", fill: "#21e07a", ink: "#04210f" },
  earth: { name: "BATTERY, LINK", long: "NO SUN, EARTH IN VIEW: ON BATTERY, WITH A LINK", fill: "#1f8f9c", ink: "#fff" },
  dark:  { name: "BATTERY, NO LINK", long: "NO SUN AND NO EARTH: ON BATTERY, NO LINK", fill: "#2b3340", ink: "#dfe6ee" },
  ecl:   { name: "ECLIPSE", long: "ECLIPSE: EARTH IS IN FRONT OF THE SUN, ON BATTERY", fill: "#ffd23c", ink: "#1a1300" },
};
function opsStretches() {
  const { samples } = state.scenario, n = Math.min(samples.length, state.req.days * 24 / STEP_HOURS), out = [];
  const kind = (s) => (!s.sunUp && s.eclipse > 0.05 && s.sunTerrain > 0 ? "ecl" : s.sunUp ? (s.earthUp ? "both" : "sun") : s.earthUp ? "earth" : "dark");
  for (let i = 0; i < n;) { const k = kind(samples[i]); let j = i; while (j < n && kind(samples[j]) === k) j++; out.push({ k, i, j }); i = j; }
  return { list: out, n };
}
function renderOps() {
  const svg = $("ops"); if (svg.hasAttribute("hidden")) return;
  const W = svg.clientWidth || 700, H = svg.clientHeight || 128, L = 4, R = 4;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.replaceChildren();
  const { samples } = state.scenario, { list, n } = opsStretches(), w = (W - L - R) / n, y0 = 30, bh = 46;
  const hrs = {}, noSun = list.filter((s) => s.k !== "both" && s.k !== "sun");
  for (const s of list) hrs[s.k] = (hrs[s.k] || 0) + (s.j - s.i) * STEP_HOURS;
  let longest = 0, run = 0; for (let i = 0; i < n; i++) { run = samples[i].sunUp ? 0 : run + STEP_HOURS; longest = Math.max(longest, run); }
  const total = n * STEP_HOURS, share = (k) => Math.round((hrs[k] || 0) / total * 100);
  const slim = W < 620;                              // phones: the short forms
  el("text", { x: L, y: 15, fill: C.wht, "font-size": slim ? 12.5 : 13.5, "font-weight": 600 }, svg,
    `${slim ? "BOTH" : "POWER + LINK"} ${share("both")}% · ${slim ? "POWER" : "POWER ONLY"} ${share("sun")}% · BATTERY ${100 - share("both") - share("sun")}%` + (noSun.length && !slim ? ` · LONGEST WITHOUT SUN ${fmtDH(longest)} (YOUR LIMIT ${state.req.maxDarkH} H)` : ""));
  for (const s of list) {
    const o = OPS[s.k], x = L + s.i * w, bw = Math.max(1.5, (s.j - s.i) * w - 1), dur = fmtDH((s.j - s.i) * STEP_HOURS);
    const g = el("g", { class: "ops-b", "data-i": s.i }, svg);
    el("rect", { x, y: y0, width: bw, height: bh, fill: o.fill, stroke: "#000", "stroke-width": 1 }, g);
    el("title", {}, g, `${o.long}\n${stamp(samples[s.i].t)} TO ${stamp(samples[Math.min(samples.length - 1, s.j)].t)} · ${dur}`);
    if (bw > o.name.length * 8.2 + 8) { el("text", { x: x + bw / 2, y: y0 + 20, fill: o.ink, "font-size": 13.5, "font-weight": 700, "text-anchor": "middle" }, g, o.name); el("text", { x: x + bw / 2, y: y0 + 37, fill: o.ink, "font-size": 13, "text-anchor": "middle" }, g, dur); }
    else if (bw > dur.length * 8 + 6) el("text", { x: x + bw / 2, y: y0 + 29, fill: o.ink, "font-size": 13, "font-weight": 700, "text-anchor": "middle" }, g, dur);
  }
  const every = state.req.days <= 7 ? 1 : state.req.days <= 14 ? 2 : 7;
  for (let d = 0; d <= state.req.days; d += every) {
    const i = Math.min(n, d * 24 / STEP_HOURS), xx = L + i * w, t = samples[Math.min(samples.length - 1, i)].t;
    el("line", { x1: xx, x2: xx, y1: y0 + bh, y2: y0 + bh + 5, stroke: C.dim, "stroke-width": 1 }, svg);
    el("text", { x: xx, y: y0 + bh + 18, fill: C.dim, "font-size": 12.5, "text-anchor": d === 0 ? "start" : d + every > state.req.days ? "end" : "middle" }, svg, !d ? "LANDING" : slim ? `+${d}D` : `+${d}D · ${pad(t.getUTCDate())} ${MONTHS[t.getUTCMonth()]}`);
  }
  // the stretch the mission clock stands in
  const cur = list.find((s) => state.idx >= s.i && state.idx < s.j);
  if (state.idx < n) { const xx = L + (state.idx + 0.5) * w; el("path", { d: `M${xx},${y0 - 5}V${y0 + bh + 3}`, stroke: C.amb, "stroke-width": 2 }, svg); el("path", { d: `M${xx - 5},${y0 - 9}H${xx + 5}L${xx},${y0 - 2}Z`, fill: C.amb }, svg); }
  const until = cur && samples[Math.min(samples.length - 1, cur.j)].t;
  el("text", { x: L, y: H - 6, fill: C.amb, "font-size": slim ? 12.5 : 13 }, svg, !cur ? "THE CLOCK IS PAST THE END OF THE MISSION"
    : slim ? `NOW: ${OPS[cur.k].name} · UNTIL ${dayStamp(until)}` : `AT THE MISSION CLOCK: ${OPS[cur.k].name} · FROM ${stamp(samples[cur.i].t)} UNTIL ${stamp(until)}`);
}

// Redraw everything whose size depends on the layout (after the window, the test bar or the story strip changes).
let tourPrepare = () => {};
function relayout() { fitStage(); renderTimeline(); renderOps(); updateCalendar(); renderMoment(); }

// ---------- share link ----------
const PUBLIC_URL = "https://galileoleosolis.github.io/LUNI/";      // the preview page has no address of its own to share
function applyShare(sh) {
  state.site = sh.siteId ? SITES.find((s) => s.id === sh.siteId) : { id: CUSTOM_ID, name: "Custom point", lat: sh.lat, lon: sh.lon };
  if (sh.t0) state.t0 = sh.t0;
  state.req = sh.req; state.storyOff = null;
}
async function shareLink() {
  const hash = encodeShare({ site: state.site, t0: state.t0, req: state.req, custom: state.site.id === CUSTOM_ID });
  const url = (globalThis.LUNO_B64 ? PUBLIC_URL : location.href.split("#")[0]) + hash;
  if (await copyText(url)) toast("LINK COPIED · IT OPENS LUNI ON THIS SITE, LANDING TIME AND MISSION NEEDS");
  else toast("Copying is not allowed on this page. The link: " + url, 20000, true);
  return url;
}

// ---------- wiring ----------
async function init() {
  // The work-in-progress copy on the public site lives under /next/: say so on the unit, so nobody mistakes it for the release.
  if (/\/next\//.test(location.pathname)) document.querySelector(".unit-top span").insertAdjacentHTML("beforeend", ' <b class="wip">· TEST BUILD (NOT RELEASED)</b>');
  fitStage();
  await Promise.all([loadSites(), initModel()]);
  loadDsn().then(() => { if (state.scenario) renderMoment(); }).catch((e) => console.warn("DSN table not loaded", e));
  // Where LUNI opens: on the question written in a share link, else on a real landing (IM-2 Athena, 6 March 2025).
  applyShare(decodeShare(location.hash, SITES) || { siteId: OPENING.site, t0: new Date(OPENING.t0), req: { ...DEFAULT_REQ, days: OPENING.days } });
  window.addEventListener("hashchange", () => { const sh = decodeShare(location.hash, SITES); if (sh) { applyShare(sh); syncNeeds(); selectSite(state.site); } });
  buildT0();
  buildSiteList();

  const tip = $("globe-tip");
  globe = createGlobe($("globe"), {
    sites: SITES,
    labels: $("globe-labels"),
    onPickSite: (s) => selectSite(s),
    onPickCoord: (lat, lon) => selectSite({ id: CUSTOM_ID, name: "Custom point", lat, lon }, { fly: false }),
    onHoverPoint: (p) => moonmap?.hoverPoint(p),
    onHover: (s, e) => {
      if (!s) { tip.hidden = true; return; }
      const r = $("globe").getBoundingClientRect(), z = zoomOf($("globe"));
      tip.hidden = false; tip.textContent = s.name.toUpperCase();
      tip.style.left = (e.clientX - r.left) / z + "px"; tip.style.top = (e.clientY - r.top) / z + "px";
    },
  });

  // Screens: MAIN, MOON MAP (the Moon made big, with data layers) and MISSION HISTORY. One at a time.
  moonmap = createMoonMap({ globe, getSite: () => state.site, fmt: { site: siteName, lat: fmtLat, lon: fmtLon, stamp }, onClose: () => showScreen("main"),
    getNow: () => state.scenario?.samples[state.idx],
    getSiteYears: () => (state.site.id !== CUSTOM_ID && terrainFor(state.site).real ? siteYears(state.site) : null),
    onUseMix: () => { showScreen("main"); scan.useMix(); } });
  $("globe-big").addEventListener("click", () => showScreen(moonmap.isOpen() ? "main" : "moon"));
  for (const [id, name] of [["tab-main", "main"], ["tab-moon", "moon"], ["tab-history", "history"]]) $(id).addEventListener("click", () => showScreen(name));

  const onCoord = () => {
    const lat = parseFloat($("lat-input").value), lon = parseFloat($("lon-input").value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) return;
    selectSite({ id: CUSTOM_ID, name: "Custom point", lat, lon });
  };
  $("coord-go").addEventListener("click", onCoord);
  $("lat-input").addEventListener("change", onCoord);
  $("lon-input").addEventListener("change", onCoord);

  document.querySelectorAll("[data-slip]").forEach((b) => b.addEventListener("click", () => slip(Number(b.dataset.slip))));
  $("play-btn").addEventListener("click", () => togglePlay());
  $("next-site-btn").addEventListener("click", () => nextSite());      // not nextSite itself: the click event must not arrive as its "by"
  $("pin-btn").addEventListener("click", pinCurrent);
  $("more-btn").addEventListener("click", () => setMore());
  $("share-btn").addEventListener("click", shareLink);
  $("tab-plan").addEventListener("click", () => showPlan("plan"));
  $("tab-days").addEventListener("click", () => showPlan("days"));
  $("tab-ops").addEventListener("click", () => showPlan("ops"));
  initSources();
  $("ops").addEventListener("click", (e) => { const g = e.target.closest(".ops-b"); if (g) setIdx(+g.dataset.i); });
  past = createHistoryPanel({ fmt: { stamp, day: dayStamp, lat: fmtLat, lon: fmtLon }, onLoad: applyScene, onClose: () => showScreen("main") });
  energy = createEnergyPanel({ getContext: () => ({ site: state.site, t0: state.t0, req: state.req, terrain: state.scenario.terrain, samples: state.scenario.samples }),
    fmt: { site: siteName, stamp }, onChange: () => renderMoment() });
  proof = createProofPanel({ fmt: { stamp }, links: () => ({ sun: $("hz-sun").href, earth: $("hz-earth").href }), onReplay: applyScene });
  $("more-close").addEventListener("click", () => setMore(false));
  $("next-window-btn").addEventListener("click", nextWindow);
  $("tools-btn").addEventListener("click", () => { const all = document.documentElement.classList.contains("simple"); setTools(all); setSetup(all); });      // SIMPLE VIEW also folds the left side away
  $("needs-more").addEventListener("click", () => openNeeds(!document.querySelector(".needs").classList.contains("open")));
  openNeeds(document.querySelector(".needs").classList.contains("open"));
  let allAtStart = /^#test-[a-d]\b/.test(location.hash) || !!globalThis.LUNO_ALL_TOOLS;      // the older test sets use every key
  try { allAtStart ||= localStorage.getItem("luno-view") === "all"; } catch {}
  setTools(allAtStart, false);
  // The left side (site, time, needs) pops in and out; the answer and charts take the freed room.
  setSetup = (show) => {
    document.querySelector(".cols").classList.toggle("setup-off", !show);
    $("setup-tab").textContent = show ? "◀ HIDE" : "▶ SHOW SITE · TIME · NEEDS";
    requestAnimationFrame(relayout);
  };
  $("setup-tab").addEventListener("click", () => setSetup(document.querySelector(".cols").classList.contains("setup-off")));
  // Before each tutorial card: the main screen with nothing open over it, so the part being explained is in view.
  tourPrepare = () => {
    showScreen("main"); if (document.querySelector(".cols").classList.contains("setup-off")) setSetup(true);
    closeCompare(); if (energy.isOpen()) energy.toggle(false);
    if (scan.isOpen()) scan.toggle(false); if (proof.isOpen()) proof.toggle(false); if (surface.isOpen()) surface.toggle(false); if (comms.isOpen()) comms.toggle(false);
    setMore(false); showPlan("plan");
  };
  // SIMPLE VIEW starts with the left side folded away (the user: "left panel defaulted collapsed"): the answer gets
  // the whole screen and one tab opens site, time and needs. ALL TOOLS, the test sets and the tutorial start with it open.
  setSetup(allAtStart || /^#test/.test(location.hash) || !!globalThis.LUNO_TEST || !!globalThis.LUNO_SETUP_OPEN);
  $("side-next").addEventListener("click", nextWindow);
  scan = createScanPanel({
    getContext: () => ({ site: state.site, t0: state.t0, req: state.req, terrain: state.scenario.terrain }),
    onPick: (lat, lon) => {
      const from = state.site;
      pendingCompare = { site: from, t0: state.t0 };
      selectSite({ id: CUSTOM_ID, name: "Custom point", lat, lon });
      toast(`LANDING SITE MOVED ${moveText(from, { lat, lon })} · NOW AT ${fmtLat(lat)} ${fmtLon(lon)}`);
      flushCompare();
    },
    getSiteYears: () => (state.site.id !== CUSTOM_ID && terrainFor(state.site).real ? siteYears(state.site) : null),
    fmt: { site: siteName, stamp, lat: fmtLat, lon: fmtLon },
  });
  $("scan-btn").addEventListener("click", () => scan.toggle());      // a plain open / close toggle for the scan menu (the user asked for this)
  surface = createSurfacePanel({
    getContext: () => ({ site: state.site, cur: state.scenario.samples[state.idx], horizon: state.scenario.horizon }),
    fmt: { site: siteName, stamp },
  });
  $("surface-btn").addEventListener("click", () => { surface.toggle(true); showData("surface"); });
  buildNeeds();
  // OpenSpace link: off until asked for; not offered on the preview page, which cannot reach programs on this computer.
  if (globalThis.LUNO_B64) $("os-box").hidden = true;
  else {
    openspace = createOpenSpaceLink({ onStatus: (st, text) => { $("os-status").textContent = text; $("os-btn").classList.toggle("on", st === "on"); $("os-btn").textContent = st === "on" ? "OPENSPACE: CONNECTED" : st === "connecting" ? "CONNECTING…" : "CONNECT TO OPENSPACE"; } });
    $("os-btn").addEventListener("click", () => { if (openspace.connected) openspace.disconnect(); else { openspace.update(osState()); openspace.connect(); } });
    for (const [label, m] of [...OS_VIEWS, ["HORIZON", OS_HORIZON]]) {
      const b = document.createElement("button"); b.textContent = label; b.classList.toggle("on", m === openspace.view);
      b.title = m === OS_HORIZON ? "Low camera turned to look along the ground toward the Sun's side of the skyline. New: not yet tried with real OpenSpace." : `Camera ${m / 1000} km above the site`;
      b.addEventListener("click", () => { openspace.setView(m); [...$("os-view").children].forEach((x) => x.classList.toggle("on", x === b)); });
      $("os-view").appendChild(b);
    }
  }
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
  tl.addEventListener("pointerdown", (e) => { dragging = true; state.scrubbed = true; tl.querySelector("#tl-handle")?.classList.remove("nudge"); tl.setPointerCapture(e.pointerId); scrubFromEvent(e); });
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
    else if (k === "Escape" && (past.isOpen() || moonmap.isOpen())) showScreen("main");
    else if (k === "h" || k === "H") showScreen(past.isOpen() ? "main" : "history");
    else if (k === "m" || k === "M") showScreen(moonmap.isOpen() ? "main" : "moon");
    else if (k === "Escape" && compareOpen()) closeCompare();
    else if (k === "Escape" && energy.isOpen()) energy.toggle(false);
    else if (k === "Escape" && proof.isOpen()) proof.toggle(false);
    else if (k === "Escape" && !$("more-panel").hidden) setMore(false);
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

  let rz; window.addEventListener("resize", () => { fitStage(); clearTimeout(rz); rz = setTimeout(relayout, 80); });

  renderCompare();
  selectSite(state.site);
  const testing = quietCompare = initTestMode({
    snapshot: () => ({ site: state.site, t0: state.t0, req: state.req, missionOk: state.cal.a.at(calIdx()).ok }),
    relayout,
    onExplore: () => startGuide({ prepare: tourPrepare }),
  });
  if (!testing) startGuide({ prepare: tourPrepare, force: !!globalThis.LUNO_GUIDE });
  $("tour-btn").addEventListener("click", () => startGuide({ prepare: tourPrepare, force: true }));
  document.fonts?.ready.then(relayout);
}

init().catch((e) => {
  console.error(e);
  $("mission").className = "hero nogo";
  $("mission-word").textContent = "ERROR";
  $("mission-why").textContent = "THE DATA FILES DID NOT LOAD. SERVE THE FOLDER OVER HTTP (SEE THE README) AND RELOAD.";
});
