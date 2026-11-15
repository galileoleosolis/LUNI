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
import { createOpenSpaceLink, OS_VIEWS, OS_HORIZON } from "./openspace.js";
import { OPENING, storyAt } from "./stories.js";
import { createProofPanel } from "./ui-proof.js";
import { encodeShare, decodeShare, copyText } from "./share.js";
import { startGuide } from "./guide.js";
import { createHistoryPanel } from "./ui-history.js";
import { createMoonMap } from "./ui-moonmap.js";

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
  const row = document.querySelector(".site-row.sel"), list = $("site-list");
  if (row) {                                             // keep the chosen row clear of the "more sites" marker at the bottom of the list
    row.scrollIntoView({ block: "nearest" });
    const over = (row.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom) / zoomOf(list) + 24;
    if (over > 0) list.scrollTop += over;
  }
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
    <span class="story-btns"><button id="story-proof" title="What really happened, with sources, next to what LUNI works out">THE STORY ▸</button><button id="story-now" title="Moves the landing time to the current hour">GO TO TODAY ▸</button><button id="story-x" title="Hide this note">✕</button></span>`;
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
    : v.reasons.map(line).join("") + `<div class="next">${nx ? `NEXT GOOD LANDING TIME: ${stamp(nx.start)}` : v.steep ? "THE SLOPE IS THE SAME ON EVERY DATE: TRY ANOTHER SPOT" : "NO GOOD LANDING TIME IN THE NEXT 12 MONTHS"}</div>`;
  // A NO-GO comes with ways out: another time, another spot, or a mission need that could be relaxed.
  const fixes = [];
  if (!v.ok) {
    const tr = state.scenario.terrain, tryReq = (change) => analyze(state.cal.samples, { ...r, ...change }, STEP_HOURS, tr).at(calIdx()).ok;
    if (nx) fixes.push(["mission-next", `LAND ON ${dayStamp(nx.start)} INSTEAD`, nextWindow]);
    fixes.push(["mission-scan", "SCAN FOR BETTER SPOT", () => scan.toggle(true)]);
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
  if (!list.length) { box.innerHTML = `<div class="empty">NONE IN THIS 12-MONTH VIEW. <b class="h-do">RELAX THE MISSION NEEDS OR TRY ANOTHER SITE</b></div>`; return; }
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
  syncNeeds();
  recompute({ keepIdx: true });
}
function syncNeeds() {
  document.querySelectorAll(".seg[data-req] button").forEach((x) => x.classList.toggle("on", x.dataset.v === String(state.req[x.parentElement.dataset.req])));
}

function buildNeeds() {
  document.querySelectorAll(".seg[data-req]").forEach((seg) => {
    const k = seg.dataset.req;
    const opts = k === "earthAtLanding" ? [[true, "REQUIRED"], [false, "NO"]] : REQ_OPTIONS[k].map((v) => [v, (k === "earthMinPct" || k === "maxSlopeDeg") && v === 0 ? "ANY" : String(v)]);
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
  $("sun-next-date").textContent = sunLeft == null ? "" : `${stamp(new Date(+cur.t + sunLeft * 3600000))}`;
  $("sun-el").textContent = sgn(cur.sunEl) + "°"; $("sun-az").textContent = cur.sunAz.toFixed(1) + "°";
  set("earth-state", cur.earthUp, "EARTH IN VIEW", "NO LINK");
  $("earth-next-label").textContent = cur.earthUp ? "EARTHSET IN" : "EARTHRISE IN";
  $("earth-next").textContent = fmtBig(earthLeft);
  $("earth-next-date").textContent = earthLeft == null ? "" : `${stamp(new Date(+cur.t + earthLeft * 3600000))}`;
  $("earth-el").textContent = sgn(cur.earthEl) + "°"; $("earth-az").textContent = cur.earthAz.toFixed(1) + "°";

  $("sun-ico").className = "ro-ico " + (cur.sunUp ? "go" : "nogo");
  $("earth-ico").className = "ro-ico " + (cur.earthUp ? "go" : "nogo");
  $("hz-sun").href = horizonsUrl(10, cur.t);
  $("hz-earth").href = horizonsUrl(399, cur.t);
  renderHorizon(cur);
  renderTimelineCursor();
  const sp = subPoints(cur.t);
  globe?.setBodies(sp.sun, sp.earth);
  surface?.update();
  openspace?.update(osState());
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
  el("path", { d: ln, fill: "none", stroke: lit ? "#e9eef3" : C.dim, "stroke-width": 1.6 }, svg);
  drawPaths(el("g", { opacity: 0.3 }, svg), 0.999);             // the same paths, faint, where they run behind the ground
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
  const RS = 7, sp = place(cur.sunAz, cur.sunEl, 0.2666, RS);
  if (sp.k > -1) {
    clipAbove("hz-clip-sun", sp);
    const g = el("g", sp.k < 1 ? { "clip-path": "url(#hz-clip-sun)" } : {}, svg), inner = el("g", { transform: `translate(${sp.cx},${sp.cy})` }, g);
    el("circle", { r: 30, fill: "url(#hz-halo)" }, inner);
    for (let a = 0; a < 180; a += 45) { const c = Math.cos(a * Math.PI / 180), s2 = Math.sin(a * Math.PI / 180), len = a % 90 ? 13 : 19; el("line", { x1: -c * len, y1: -s2 * len, x2: c * len, y2: s2 * len, stroke: "#fff2b0", "stroke-width": 1.2, opacity: 0.85 }, inner); }
    el("circle", { r: RS, fill: "#fff3b8", stroke: "#ffd23c", "stroke-width": 1.5 }, inner);
  } else {
    el("circle", { cx: sp.cx, cy: sp.cy, r: RS, fill: "none", stroke: "#ffd23c", "stroke-width": 1.5, "stroke-dasharray": "3 3", opacity: 0.8 }, svg);
  }
  const sunPct = Math.round(cur.sunFrac * 100);

  // Earth, with its real phase: the lit side faces the Sun.
  // Earth is drawn bigger than the Sun because it is: seen from the Moon its disc is about 3.6 times as wide.
  const RE = Math.round(Math.max(13, Math.min(20, H * 0.11))), ep = place(cur.earthAz, cur.earthEl, cur.earthRadDeg || 0.95, RE);
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

  el("title", {}, svg, "The Sun and Earth are drawn larger than life. Their positions, and how much of each the ground hides, are exact.");
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
const TL = { left: 58, right: 4, top: 18, rowH: 14, gap: 4, rail: 27 };      // rail = distance from the axis line down to the slider rail

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
    el("text", { x: 0, y: yy + TL.rowH / 2 + 4.5, fill: color, "font-size": 13.5, "font-weight": 600 }, svg, name);
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
  el("rect", { x: TL.left, y: yRail - 2, width: W - TL.left - TL.right, height: 4, rx: 2, fill: C.dim, opacity: 0.55 }, svg);
  el("text", { x: 0, y: yRail + 4, fill: C.amb, "font-size": 12, "font-weight": 700 }, svg, "SLIDER");
  el("path", { id: "tl-cursor", d: "", fill: "none", stroke: C.amb, "stroke-width": 2 }, svg);
  el("path", { id: "tl-cursor-top", d: "", fill: C.amb }, svg);
  const g = el("g", { id: "tl-handle", class: state.scrubbed ? "" : "nudge" }, svg);
  el("rect", { id: "tl-handle-box", y: yRail - 10, height: 20, rx: 10, fill: C.amb, stroke: "#000", "stroke-width": 1.5 }, g);
  el("text", { id: "tl-handle-text", y: yRail + 4, fill: "#000", "font-size": 12, "font-weight": 700, "text-anchor": "middle" }, g, "");
}

function renderTimelineCursor() {
  const svg = $("timeline"), c = svg.querySelector("#tl-cursor"); if (!c) return;
  const W = svg.clientWidth || 700, n = state.scenario.samples.length;
  const xx = TL.left + (state.idx + 0.5) * (W - TL.left - TL.right) / n, y1 = TL.top + 3 * (TL.rowH + TL.gap) - 4;
  const yRail = y1 + 4 + TL.rail, h = state.idx * STEP_HOURS;
  c.setAttribute("d", `M${xx},6V${yRail}`);
  svg.querySelector("#tl-cursor-top").setAttribute("d", `M${xx - 5},0H${xx + 5}L${xx},7Z`);
  // handle: "◀ +9D 00H ▶", kept inside the chart at both ends
  const label = `◀ ${h ? "+" + fmtT(h) : "LANDING"} ▶`, bw = label.length * 7.6 + 16, bx = Math.max(TL.left, Math.min(W - TL.right - bw, xx - bw / 2));
  const box = svg.querySelector("#tl-handle-box"), txt = svg.querySelector("#tl-handle-text");
  box.setAttribute("x", bx); box.setAttribute("width", bw); txt.setAttribute("x", bx + bw / 2); txt.textContent = label;
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
  for (const [id, n] of [["tab-main", "main"], ["tab-moon", "moon"], ["tab-history", "history"]]) $(id).classList.toggle("on", n === name);
  $("globe-big").textContent = name === "moon" ? "⤡ SMALL MOON" : "⤢ MOON MAP"; $("globe-big").classList.toggle("on", name === "moon");
}

// The lower chart shows one thing at a time: the MISSION PLAN (30 days after landing, with the slider) or GOOD DAYS
// (the 12-month landing-day strip). The room this saves goes to the skyline picture.
function showPlan(which) {
  const plan = which !== "days";
  $("timeline").toggleAttribute("hidden", !plan); $("plan-title-a").hidden = !plan;
  $("calendar").toggleAttribute("hidden", plan); $("cal-title").hidden = plan;
  $("tab-plan").classList.toggle("on", plan); $("tab-days").classList.toggle("on", !plan);
  relayout();
}

// Redraw everything whose size depends on the layout (after the window, the test bar or the story strip changes).
function relayout() { fitStage(); renderTimeline(); updateCalendar(); renderMoment(); }

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
  moonmap = createMoonMap({ globe, getSite: () => state.site, fmt: { site: siteName, lat: fmtLat, lon: fmtLon }, onClose: () => showScreen("main"),
    onUseMix: () => { showScreen("main"); scan.useMix(); } });
  $("globe-big").addEventListener("click", () => showScreen(moonmap.isOpen() ? "main" : "moon"));
  for (const [id, name] of [["tab-main", "main"], ["tab-moon", "moon"], ["tab-history", "history"]]) $(id).addEventListener("click", () => showScreen(name));

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
  $("more-btn").addEventListener("click", () => setMore());
  $("share-btn").addEventListener("click", shareLink);
  $("tab-plan").addEventListener("click", () => showPlan("plan"));
  $("tab-days").addEventListener("click", () => showPlan("days"));
  past = createHistoryPanel({ fmt: { stamp, day: dayStamp, lat: fmtLat, lon: fmtLon }, onLoad: applyScene, onClose: () => showScreen("main") });
  proof = createProofPanel({ fmt: { stamp }, links: () => ({ sun: $("hz-sun").href, earth: $("hz-earth").href }), onReplay: applyScene });
  $("more-close").addEventListener("click", () => setMore(false));
  $("next-window-btn").addEventListener("click", nextWindow);
  $("side-next").addEventListener("click", nextWindow);
  scan = createScanPanel({
    getContext: () => ({ site: state.site, t0: state.t0, req: state.req, terrain: state.scenario.terrain }),
    onPick: (lat, lon) => {
      const from = state.site;
      selectSite({ id: CUSTOM_ID, name: "Custom point", lat, lon });
      toast(`LANDING SITE MOVED ${moveText(from, { lat, lon })} · NOW AT ${fmtLat(lat)} ${fmtLon(lon)}`);
    },
    fmt: { site: siteName, stamp, lat: fmtLat, lon: fmtLon },
  });
  $("scan-btn").addEventListener("click", () => scan.toggle());      // a plain open / close toggle for the scan menu (the user asked for this)
  $("side-scan").addEventListener("click", () => { showScreen("main"); scan.toggle(true); });
  surface = createSurfacePanel({
    getContext: () => ({ site: state.site, cur: state.scenario.samples[state.idx], horizon: state.scenario.horizon }),
    fmt: { site: siteName, stamp },
  });
  $("surface-btn").addEventListener("click", () => surface.toggle(true));
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
  const testing = initTestMode({
    snapshot: () => ({ site: state.site, t0: state.t0, req: state.req, missionOk: state.cal.a.at(calIdx()).ok }),
    relayout,
    onExplore: () => startGuide({ zoomOf }),
  });
  if (!testing) startGuide({ zoomOf, force: !!globalThis.LUNO_GUIDE });
  document.fonts?.ready.then(relayout);
}

init().catch((e) => {
  console.error(e);
  $("mission").className = "hero nogo";
  $("mission-word").textContent = "ERROR";
  $("mission-why").textContent = "THE DATA FILES DID NOT LOAD. SERVE THE FOLDER OVER HTTP (SEE THE README) AND RELOAD.";
});
