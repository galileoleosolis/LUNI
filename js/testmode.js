// First-use test mode: an intro, six tasks with no hints, local usage tracking, a short review, and a text
// report the tester copies and sends back. Nothing leaves the browser: the log lives in memory (and
// sessionStorage, so a refresh does not lose it) until the tester copies the report themselves.
// Enabled by "#test" in the address, or by window.LUNO_TEST on a build made for testing.
import { SITES } from "./sites.js";
import { sampleSite, hoursUntilChange, siteEclipses } from "./model.js";
import { analyze, windowsFrom, DEFAULT_REQ } from "./mission.js";

const $ = (id) => document.getElementById(id);
const KEY = "luno-test-v7";
const site = (id) => SITES.find((s) => s.id === id);
const mission = (id, iso, req = {}) => {
  const t0 = new Date(iso), s = sampleSite(site(id), t0, 400 * 24), a = analyze(s, { ...DEFAULT_REQ, ...req });
  return { v: a.at(0), next: windowsFrom(a.mask, s).find((w) => w.start > t0), samples: s };
};
const kmBetween = (a, b) => {
  const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
  return 2 * 1737.4 * Math.asin(Math.sqrt(h));
};
const day = (d) => d.toISOString().slice(0, 10);

// Each task states its own site and date, so the right answer is computed from the model, not from whatever
// the tester happens to have on screen.
const SET_A = [
  { id: "go-10d", short: "GO for 10 days at IM-2 on 18 Dec?",
    text: "First choose the landing site IM-2 ATHENA. Then set the landing time to 18 December 2026, 00:00 UTC. Question: is this a GO for a 10-day mission?",
    setup: { site: "im2", t0: "2026-12-18T00:00" },
    type: "choice", options: ["GO", "NO-GO"],
    expected: () => (mission("im2", "2026-12-18T00:00:00Z").v.ok ? "GO" : "NO-GO") },
  { id: "sunset", short: "Days until sunset",
    text: "Keep the same site (IM-2 ATHENA) and landing time (18 December 2026, 00:00 UTC). Question: how many days until sunset? Give a whole number.",
    setup: { site: "im2", t0: "2026-12-18T00:00" },
    type: "number", unit: "DAYS",
    expected: () => { const m = mission("im2", "2026-12-18T00:00:00Z"); return +(hoursUntilChange(m.samples, 0, "sunUp") / 24).toFixed(1); },
    check: (ans, exp) => Math.abs(ans - exp) <= 1 },
  { id: "slip", short: "Still GO after a 7-day slip?",
    text: "The launch slips 7 days, so the landing moves to 25 December 2026, 00:00 UTC at the same site. Question: is it still a GO for the 10-day mission?",
    setup: { site: "im2", t0: "2026-12-25T00:00" },
    type: "choice", options: ["GO", "NO-GO"],
    expected: () => (mission("im2", "2026-12-25T00:00:00Z").v.ok ? "GO" : "NO-GO") },
  { id: "next-window", short: "Date the next window opens",
    text: "Stay on IM-2 ATHENA, landing 25 December 2026. Question: on what date does the next good landing window open at this site?",
    setup: { site: "im2", t0: "2026-12-25T00:00" },
    type: "date",
    expected: () => day(mission("im2", "2026-12-25T00:00:00Z").next.start),
    check: (ans, exp) => Math.abs(new Date(ans) - new Date(exp)) <= 86400000 },
  { id: "compare-14d", short: "14-day mission: which site is GO?",
    text: "New situation: the mission is now 14 days long and lands on 18 December 2026, 00:00 UTC. Question: which of these sites is a GO for it, IM-2 ATHENA or MALAPERT MASSIF?",
    reach: { label: "set the mission length to 14 days", test: (s) => s.req.days === 14 },
    type: "choice", options: ["IM-2 ATHENA", "MALAPERT MASSIF", "BOTH", "NEITHER"],
    expected: () => {
      const a = mission("im2", "2026-12-18T00:00:00Z", { days: 14 }).v.ok, b = mission("malapert", "2026-12-18T00:00:00Z", { days: 14 }).v.ok;
      return a && b ? "BOTH" : a ? "IM-2 ATHENA" : b ? "MALAPERT MASSIF" : "NEITHER";
    } },
  { id: "find-go", short: "Find a GO point near Nobile Rim 1",
    text: "Set the mission length back to 10 days. Choose the site NOBILE RIM 1 and set the landing time to 14 November 2026, 16:00 UTC. It is a NO-GO there. Find a point nearby that IS a GO and move the site to it. Press DONE when the screen shows GO for the mission.",
    reach: { label: "got Nobile Rim 1 on 14 Nov 2026 16:00 (a NO-GO) on screen", test: (s) => s.site.id === "nobile1" && s.t0.toISOString().slice(0, 16) === "2026-11-14T16:00" },
    type: "done",
    expected: () => "a GO point within 25 km of Nobile Rim 1",
    answerFrom: (snap) => `${snap.site.id} ${snap.site.lat.toFixed(3)},${snap.site.lon.toFixed(3)} mission ${snap.missionOk ? "GO" : "NO-GO"}`,
    check: (ans, exp, snap) => snap.missionOk && snap.site.id !== "nobile1" && kmBetween(snap.site, site("nobile1")) <= 25 },
];

// Second set: different sites and dates, aimed at the mission needs, the mission clock, eclipses and the area scan.
const SCAN_CASE = { site: "nobile1", t0: "2026-11-14T16:00", name: "NOBILE RIM 1", when: "14 November 2026, 16:00 UTC" };
const SET_B = [
  { id: "b-go", short: "GO at Chandrayaan-3's real landing time?",
    text: "First choose the landing site CHANDRAYAAN-3. Then set the landing time to 23 August 2023, 12:00 UTC (about when it really landed). Question: is this a GO for a 10-day mission?",
    setup: { site: "ch3", t0: "2023-08-23T12:00" },
    type: "choice", options: ["GO", "NO-GO"],
    expected: () => (mission("ch3", "2023-08-23T12:00:00Z").v.ok ? "GO" : "NO-GO") },
  { id: "b-sunset-date", short: "Date the Sun sets after that landing",
    text: "Keep CHANDRAYAAN-3 and 23 August 2023, 12:00 UTC. Question: on what date does the Sun set there?",
    setup: { site: "ch3", t0: "2023-08-23T12:00" },
    type: "date",
    expected: () => { const m = mission("ch3", "2023-08-23T12:00:00Z"); return day(new Date(Date.parse("2023-08-23T12:00:00Z") + hoursUntilChange(m.samples, 0, "sunUp") * 3600000)); },
    check: (ans, exp) => Math.abs(new Date(ans) - new Date(exp)) <= 86400000 },
  { id: "b-dark", short: "Smallest dark setting that gives GO",
    text: "New situation: choose IM-2 ATHENA, landing 17 March 2027, 00:00 UTC, 10-day mission. It is a NO-GO because the Sun goes away for too long. Question: what is the smallest CAN SIT IN THE DARK setting that turns it into a GO?",
    reach: { label: "tried a different CAN SIT IN THE DARK setting", test: (s) => s.req.maxDarkH !== 12 },
    type: "choice", options: ["12", "24", "48", "NONE OF THEM"],
    expected: () => [12, 24, 48].find((h) => mission("im2", "2027-03-17T00:00:00Z", { maxDarkH: h }).v.ok)?.toString() ?? "NONE OF THEM" },
  { id: "b-earth", short: "GO once Earth at landing is not needed?",
    text: "Put CAN SIT IN THE DARK back to 12. New situation: choose SHACKLETON CONNECTING RIDGE, landing 1 December 2026, 00:00 UTC. It is a NO-GO. This lander can land without talking to Earth, so change the mission needs to allow that. Question: is it a GO now?",
    reach: { label: "switched EARTH LINK AT LANDING to NO", test: (s) => s.req.earthAtLanding === false },
    type: "choice", options: ["GO", "STILL NO-GO"],
    expected: () => (mission("shackleton", "2026-12-01T00:00:00Z", { earthAtLanding: false }).v.ok ? "GO" : "STILL NO-GO") },
  { id: "b-eclipse", short: "Date of the eclipse during the mission",
    text: "Put EARTH LINK AT LANDING back to REQUIRED. New situation: choose MALAPERT MASSIF, landing 25 December 2028, 00:00 UTC, 10-day mission. During this mission the Earth passes in front of the Sun (an eclipse). Question: on what date?",
    setup: { site: "malapert", t0: "2028-12-25T00:00" },
    type: "date",
    expected: () => day(siteEclipses(site("malapert"), new Date("2028-12-25T00:00:00Z"), new Date("2029-01-04T00:00:00Z"))[0].peak),
    check: (ans, exp) => Math.abs(new Date(ans) - new Date(exp)) <= 86400000 },
  { id: "b-find-go", short: `Find a GO point near ${SCAN_CASE.name}`,
    text: `Last one: choose ${SCAN_CASE.name} and set the landing time to ${SCAN_CASE.when}, 10-day mission. It is a NO-GO there. Find a point nearby that IS a GO and move the site to it. Press DONE when the screen shows GO.`,
    reach: { label: `got ${SCAN_CASE.name} at ${SCAN_CASE.t0} (a NO-GO) on screen`, test: (s) => s.site.id === SCAN_CASE.site && s.t0.toISOString().slice(0, 16) === SCAN_CASE.t0 },
    type: "done",
    expected: () => `a GO point within 25 km of ${SCAN_CASE.name}`,
    answerFrom: (snap) => `${snap.site.id} ${snap.site.lat.toFixed(3)},${snap.site.lon.toFixed(3)} mission ${snap.missionOk ? "GO" : "NO-GO"}`,
    check: (ans, exp, snap) => snap.missionOk && snap.site.id !== SCAN_CASE.site && kmBetween(snap.site, site(SCAN_CASE.site)) <= 25 && snap.t0.toISOString().slice(0, 16) === SCAN_CASE.t0 },
];

// Third set: new sites and dates again; leans on the mission needs, the "ways to get a GO" buttons and the eclipse tag.
const SET_C = [
  { id: "c-next-time", short: "Date of the next good landing time",
    text: "First choose the landing site CHANDRAYAAN-3. Then set the landing time to 1 December 2026, 00:00 UTC. It is a NO-GO. Question: on what date is the next good landing time?",
    setup: { site: "ch3", t0: "2026-12-01T00:00" },
    type: "date",
    expected: () => day(mission("ch3", "2026-12-01T00:00:00Z").next.start),
    check: (ans, exp) => Math.abs(new Date(ans) - new Date(exp)) <= 86400000 },
  { id: "c-length", short: "Longest mission that is still a GO",
    text: "New situation: choose IM-2 ATHENA, landing 18 December 2026, 00:00 UTC. Question: what is the longest MISSION LENGTH that is still a GO there?",
    reach: { label: "tried a different MISSION LENGTH", test: (s) => s.req.days !== 10 },
    type: "choice", options: ["3", "7", "10", "14", "28"],
    expected: () => String([28, 14, 10, 7, 3].find((d) => mission("im2", "2026-12-18T00:00:00Z", { days: d }).v.ok) ?? "none") },
  { id: "c-dark", short: "Smallest dark setting that gives GO",
    text: "Put MISSION LENGTH back to 10. New situation: choose NOBILE RIM 1, landing 23 January 2027, 00:00 UTC. It is a NO-GO because the Sun goes away for too long. Question: what is the smallest CAN SIT IN THE DARK setting that turns it into a GO?",
    reach: { label: "tried a different CAN SIT IN THE DARK setting", test: (s) => s.req.maxDarkH !== 12 },
    type: "choice", options: ["12", "24", "48", "NONE OF THEM"],
    expected: () => [12, 24, 48].find((h) => mission("nobile1", "2027-01-23T00:00:00Z", { maxDarkH: h }).v.ok)?.toString() ?? "NONE OF THEM" },
  { id: "c-earth", short: "GO once Earth at landing is not needed?",
    text: "Put CAN SIT IN THE DARK back to 12. New situation: choose SHACKLETON CONNECTING RIDGE, landing 1 February 2027, 00:00 UTC. It is a NO-GO. This lander can land without talking to Earth. Change what the mission needs to allow that. Question: is it a GO now?",
    reach: { label: "switched EARTH LINK AT LANDING to NO", test: (s) => s.req.earthAtLanding === false },
    type: "choice", options: ["GO", "STILL NO-GO"],
    expected: () => (mission("shackleton", "2027-02-01T00:00:00Z", { earthAtLanding: false }).v.ok ? "GO" : "STILL NO-GO") },
  { id: "c-eclipse", short: "Date of the eclipse during the mission",
    text: "Put EARTH LINK AT LANDING back to REQUIRED. Stay on SHACKLETON CONNECTING RIDGE and set the landing time to 14 December 2029, 00:00 UTC. During this 10-day mission the Earth passes in front of the Sun (an eclipse). Question: on what date?",
    setup: { site: "shackleton", t0: "2029-12-14T00:00" },
    type: "date",
    expected: () => day(siteEclipses(site("shackleton"), new Date("2029-12-14T00:00:00Z"), new Date("2029-12-24T00:00:00Z"))[0].peak),
    check: (ans, exp) => Math.abs(new Date(ans) - new Date(exp)) <= 86400000 },
  { id: "c-find-go", short: "Find a GO point near IM-2 Athena",
    text: "Last one: choose IM-2 ATHENA and set the landing time to 21 December 2026, 00:00 UTC, with the mission needs as they started (10 days, 12 hours of dark, Earth link at landing required). It is a NO-GO there. Without changing the date or the needs, find a point nearby that IS a GO and move the site to it. Press DONE when the screen shows GO.",
    reach: { label: "got IM-2 Athena at 2026-12-21T00:00 (a NO-GO) on screen", test: (s) => s.site.id === "im2" && s.t0.toISOString().slice(0, 16) === "2026-12-21T00:00" },
    type: "done",
    expected: () => "a GO point within 25 km of IM-2 Athena, same date and needs",
    answerFrom: (snap) => `${snap.site.id} ${snap.site.lat.toFixed(3)},${snap.site.lon.toFixed(3)} mission ${snap.missionOk ? "GO" : "NO-GO"} needs ${snap.req.days}d/${snap.req.maxDarkH}h/${snap.req.earthAtLanding ? "E" : "-"}`,
    check: (ans, exp, snap) => snap.missionOk && snap.site.id !== "im2" && kmBetween(snap.site, site("im2")) <= 25 && snap.t0.toISOString().slice(0, 16) === "2026-12-21T00:00"
      && snap.req.days === 10 && snap.req.maxDarkH === 12 && snap.req.earthAtLanding === true },
];

// Which set runs: C by default; "#test-a" or "#test-b" in the address (or window.LUNO_TEST_SET) picks an earlier one.
const SET_NAME = (location.hash.match(/^#test-([ab])$/)?.[1] || globalThis.LUNO_TEST_SET || "C").toUpperCase();
const TASKS = { A: SET_A, B: SET_B, C: SET_C }[SET_NAME] || SET_C;


const FEATURES = {      // click targets -> the feature they belong to
  "site list": /^site-row/, "3D Moon": /^globe/, "lat/lon boxes": /^(lat|lon)-input/, "landing-time pickers": /^t0-/,
  "launch-slip keys": /^slip/, "NEXT WINDOW": /^(next-window-btn|side-next)/, "AREA SCAN": /^(scan|side-scan)/, "mission needs": /^need:/,
  "verdict-block buttons": /^mission-/, "calendar": /^calendar/, "window list": /^windows/, "timeline": /^timeline/, "PLAY": /^play-btn/, "PIN / compare": /^(pin-btn|compare)/, "NEXT SITE": /^next-site-btn/,
  "ASK LUNO (typed or spoken commands)": /^(talk-btn|comms:|typed:|voice:)/,
};

let T = null, api = null;       // T = test state, api = hooks from app.js

const now = () => Math.round((Date.now() - T.started) / 100) / 10;
const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(T)); } catch {} };
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } };
function log(type, detail) {
  if (!T || T.phase !== "tasks") return;
  T.events.push([now(), T.task + 1, type, detail]);
  save();
}

// What was clicked, in words the report can use.
function describe(el) {
  const n = el.closest?.("#test-bar, #test-overlay") ? null : el.closest?.("button, a, input, select, svg, canvas, .cmp");
  if (!n) return null;
  if (n.matches(".site-row")) return "site-row:" + n.dataset.id;
  if (n.dataset.slip) return "slip:" + n.dataset.slip + "d";
  const seg = n.closest(".seg[data-req]"); if (seg) return `need:${seg.dataset.req}=${n.textContent.trim()}`;
  if (n.closest("#scan")) return "scan:" + (n.id || n.textContent.trim().slice(0, 24) || n.tagName.toLowerCase());
  if (n.closest("#comms")) return "comms:" + (n.id || n.textContent.trim().slice(0, 24));
  if (n.closest("#windows")) return "windows:" + n.textContent.trim().slice(0, 22);
  if (n.closest("#globe")) return "globe";
  if (n.closest(".cmp")) return "compare:card";
  return n.id || n.textContent.trim().slice(0, 24) || n.tagName.toLowerCase();
}

function wireTracking() {
  document.addEventListener("click", (e) => { const d = describe(e.target); if (d) log("click", d); }, true);
  document.addEventListener("change", (e) => { if (/^(lat-input|lon-input|t0-day|t0-month|t0-year|t0-hour)$/.test(e.target.id)) log("input", `${e.target.id}=${e.target.value}`); }, true);
  window.addEventListener("keydown", (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(Arrow|Home| |Escape)/.test(e.key) || /^[spnatvSPNATV/]$/.test(e.key)) log("key", (e.shiftKey ? "Shift+" : "") + (e.key === " " ? "Space" : e.key));
  }, true);
  window.addEventListener("luno:command", (e) => log("input", `${e.detail.via}:"${e.detail.text.slice(0, 60)}" -> ${e.detail.ok ? e.detail.tools.join("+") : "NOT UNDERSTOOD"}`));
  let last = "";
  window.addEventListener("luno:state", () => {
    const s = api.snapshot(), k = `${s.site.id}@${s.site.lat.toFixed(3)},${s.site.lon.toFixed(3)} T0=${s.t0.toISOString().slice(0, 16)} needs=${s.req.days}d/${s.req.maxDarkH}h/${s.req.earthMinPct}%/${s.req.earthAtLanding ? "E" : "-"} ${s.missionOk ? "GO" : "NO-GO"}`;
    if (k !== last) { last = k; log("state", k); }
    const t = T && T.phase === "tasks" && TASKS[T.task];
    if (t && t.reach && t.reach.test(s) && !T.reached) { T.reached = true; save(); }      // did they ever get the task's starting point on screen?
  });
}

// ---------- screens ----------
function overlay(html) {
  const o = $("test-overlay");
  o.innerHTML = `<div class="test-panel">${html}</div>`;
  o.hidden = false;
  return o;
}
const closeOverlay = () => { $("test-overlay").hidden = true; };

function showIntro() {
  const o = overlay(`
    <h2>LUNO · FIRST-USE TEST</h2>
    <p>Thanks for helping. You are testing the tool. The tool is not testing you: if something is hard to find, that is the tool's fault and exactly what we need to know.</p>
    <ul>
      <li>You are a mission planner choosing where and when to land on the Moon.</li>
      <li>There are <b>${TASKS.length} short tasks</b>, shown one at a time in a bar at the top. No hints. It takes about 10 to 15 minutes.</li>
      <li>If you get stuck for more than a couple of minutes, press <b>SKIP</b>. That is useful information too.</li>
      <li>At the end you answer 5 quick questions and get a report to copy and send back.</li>
    </ul>
    <p class="test-small">What is recorded: your clicks and key presses inside this page, how long each task takes, and your answers. It stays in this browser tab. Nothing is sent anywhere unless you copy the report and send it yourself.</p>
    <div class="test-actions"><button class="test-btn go" id="test-start">START THE TEST</button><button class="test-btn" id="test-skip">JUST EXPLORE (NO TEST)</button></div>`);
  o.querySelector("#test-start").addEventListener("click", () => {
    T = { phase: "tasks", started: Date.now(), task: 0, taskStart: 0, events: [], results: [], review: null };
    closeOverlay(); showTask();
  });
  o.querySelector("#test-skip").addEventListener("click", () => { try { sessionStorage.setItem(KEY + "-skip", "1"); } catch {} closeOverlay(); });
}

function showTask() {
  const bar = $("test-bar"), t = TASKS[T.task];
  T.taskStart = now(); T.reached = false; save();
  let ctl = "";
  if (t.type === "choice") ctl = t.options.map((o) => `<button class="test-opt" data-v="${o}">${o}</button>`).join("");
  if (t.type === "number") ctl = `<input id="test-answer" type="number" step="1" min="0" inputmode="numeric" aria-label="Answer"> <span>${t.unit}</span>`;
  if (t.type === "date") {
    const M = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], opt = (v, label) => `<option value="${v}">${label}</option>`;
    ctl = `<span class="test-date"><select id="ta-day" aria-label="Day">${opt("", "DAY")}${Array.from({ length: 31 }, (_, i) => opt(i + 1, String(i + 1).padStart(2, "0"))).join("")}</select>`
      + `<select id="ta-month" aria-label="Month">${opt("", "MONTH")}${M.map((m, i) => opt(i + 1, m)).join("")}</select>`
      + `<select id="ta-year" aria-label="Year">${opt("", "YEAR")}${Array.from({ length: 13 }, (_, i) => opt(2023 + i, 2023 + i)).join("")}</select></span>`;
  }
  bar.innerHTML = `<div class="test-q"><b>TASK ${T.task + 1} OF ${TASKS.length}</b> ${t.text}</div>
    <div class="test-ctl">${ctl}<button class="test-btn go" id="test-submit" ${t.type === "done" ? "" : "disabled"}>${t.type === "done" ? "DONE" : "SUBMIT ANSWER"}</button><button class="test-btn" id="test-stuck">SKIP</button></div>`;
  bar.hidden = false;
  let answer = null;
  const submit = $("test-submit");
  bar.querySelectorAll(".test-opt").forEach((b) => b.addEventListener("click", () => {
    answer = b.dataset.v; bar.querySelectorAll(".test-opt").forEach((x) => x.classList.toggle("on", x === b)); submit.disabled = false;
  }));
  $("test-answer")?.addEventListener("input", (e) => { answer = e.target.value; submit.disabled = answer === ""; });
  bar.querySelectorAll(".test-date select").forEach((sel) => sel.addEventListener("change", () => {
    const d = $("ta-day").value, m = $("ta-month").value, y = $("ta-year").value;
    answer = d && m && y ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
    submit.disabled = !answer || Number.isNaN(+new Date(answer)) || new Date(answer).getUTCDate() !== +d;      // 31 FEB is not a date
  }));
  submit.addEventListener("click", () => finishTask(answer, false));
  $("test-stuck").addEventListener("click", () => finishTask(null, true));
  api.relayout();
}

function finishTask(answer, skipped) {
  const t = TASKS[T.task], snap = api.snapshot(), exp = t.expected();
  if (t.answerFrom && !skipped) answer = t.answerFrom(snap);
  const given = t.type === "number" && answer != null ? Number(answer) : answer;
  const correct = skipped ? false : t.check ? !!t.check(given, exp, snap) : given === exp;
  const ev = T.events.filter((e) => e[1] === T.task + 1);
  T.results.push({ id: t.id, short: t.short, answer: skipped ? "(skipped)" : String(given), expected: String(exp), correct, skipped,
                   seconds: Math.round(now() - T.taskStart), clicks: ev.filter((e) => e[2] === "click").length,
                   screen: `${snap.site.id} T0=${snap.t0.toISOString().slice(0, 16)} ${snap.req.days}d ${snap.missionOk ? "GO" : "NO-GO"}`,
                   // Was the screen actually showing the site and date the task asked for? Tells skill from a lucky answer.
                   reach: t.reach ? `${t.reach.label}: ${T.reached || t.reach.test(snap) ? "YES" : "NO"}` : null,
                   matched: t.setup ? snap.site.id === t.setup.site && snap.t0.toISOString().slice(0, 16) === t.setup.t0 : null });
  log(skipped ? "task-skipped" : "task-answered", skipped ? "" : String(given));
  T.task++;
  if (T.task < TASKS.length) return showTask();
  T.phase = "review"; T.totalSeconds = Math.round(now()); save();
  $("test-bar").hidden = true; api.relayout(); showReview();
}

function showReview() {
  const q = (id, label) => `<label for="${id}">${label}</label><textarea id="${id}" rows="2"></textarea>`;
  const o = overlay(`
    <h2>ALL TASKS DONE · 5 QUICK QUESTIONS</h2>
    <label>Overall, how easy was it to use? (1 = very hard, 5 = very easy)</label>
    <div class="test-rate" id="rv-ease">${[1, 2, 3, 4, 5].map((n) => `<button class="test-opt" data-v="${n}">${n}</button>`).join("")}</div>
    ${q("rv-confusing", "What confused you the most?")}
    ${q("rv-liked", "What did you like?")}
    ${q("rv-change", "What is missing, or what would you change?")}
    ${q("rv-broken", "Did anything look broken or wrong?")}
    <div class="test-actions"><button class="test-btn go" id="test-report">CREATE MY REPORT</button></div>`);
  let ease = "";
  o.querySelectorAll("#rv-ease .test-opt").forEach((b) => b.addEventListener("click", () => { ease = b.dataset.v; o.querySelectorAll("#rv-ease .test-opt").forEach((x) => x.classList.toggle("on", x === b)); }));
  o.querySelector("#test-report").addEventListener("click", () => {
    const v = (id) => $(id).value.trim() || "(blank)";
    T.review = { ease: ease || "(not answered)", confusing: v("rv-confusing"), liked: v("rv-liked"), change: v("rv-change"), broken: v("rv-broken") };
    T.phase = "done"; save(); showReport();
  });
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function buildReport(S, env) {
  const clicks = S.events.filter((e) => e[2] === "click"), keys = S.events.filter((e) => e[2] === "key");
  const acts = S.events.filter((e) => e[2] === "click" || e[2] === "input");
  const used = Object.entries(FEATURES).map(([name, re]) => [name, acts.filter((e) => re.test(e[3])).length]);
  const L = [];
  L.push("=== LUNO FIRST-USE TEST REPORT ===");
  L.push(`Date: ${new Date(S.started).toISOString().slice(0, 16)}Z | Window: ${env.window} | Layout: ${env.layout} | Browser: ${env.browser}`);
  L.push(`Task set: ${SET_NAME}`);
  L.push(`Total time: ${mmss(S.totalSeconds)} | Clicks in the app: ${clicks.length} | Shortcut keys: ${keys.length}`);
  L.push(`Score: ${S.results.filter((r) => r.correct).length}/${S.results.length} correct, ${S.results.filter((r) => r.skipped).length} skipped`);
  L.push("", "TASKS");
  S.results.forEach((r, i) => {
    L.push(`${i + 1}. ${r.short}`);
    L.push(`   answer: ${r.answer} | expected: ${r.expected} | ${r.skipped ? "SKIPPED" : r.correct ? "CORRECT" : "WRONG"} | time ${mmss(r.seconds)} | ${r.clicks} clicks`);
    if (r.reach) L.push(`   ${r.reach}`);
    L.push(`   screen at the end: ${r.screen}${r.matched == null ? "" : r.matched ? " | screen matched the task: YES" : " | screen matched the task: NO (answered without setting it up)"}`);
  });
  L.push("", "FEATURES USED (clicks and edits)");
  L.push(used.filter((u) => u[1]).map((u) => `${u[0]} ${u[1]}`).join(" · ") || "(none)");
  L.push("NEVER USED: " + (used.filter((u) => !u[1]).map((u) => u[0]).join(", ") || "(everything was used)"));
  L.push("", "REVIEW");
  L.push(`Ease of use (1-5): ${S.review.ease}`, `Most confusing: ${S.review.confusing}`, `Liked: ${S.review.liked}`, `Missing / would change: ${S.review.change}`, `Looked broken: ${S.review.broken}`);
  L.push("", "EVENT LOG (m:ss · task · event)");
  const ev = S.events.length > 500 ? S.events.slice(0, 500) : S.events;
  for (const [t, task, type, d] of ev) L.push(`${mmss(t)} T${task} ${type} ${d}`);
  if (S.events.length > 500) L.push(`... ${S.events.length - 500} more events not shown`);
  L.push("=== END OF REPORT ===");
  return L.join("\n");
}

function showReport() {
  const env = { window: `${innerWidth}x${innerHeight}`, layout: document.documentElement.classList.contains("flow") ? "stacked" : "scaled x" + ($("stage").style.getPropertyValue("--s") || "1"),
                browser: (["Edg", "Firefox", "Chrome", "Safari"].map((b) => navigator.userAgent.match(new RegExp(b + "\\/[\\d.]+"))).find(Boolean) || ["unknown"])[0] };
  const text = buildReport(T, env);
  const o = overlay(`
    <h2>YOUR REPORT IS READY</h2>
    <p>Press COPY, then paste it into a message to the person who asked you to test. Thank you!</p>
    <textarea id="test-report-text" class="test-report" readonly rows="14"></textarea>
    <div class="test-actions"><button class="test-btn go" id="test-copy">COPY REPORT</button><span id="test-copied" class="test-small"></span><button class="test-btn" id="test-close">CLOSE AND KEEP EXPLORING</button><button class="test-btn" id="test-again">START A NEW TEST</button></div>`);
  const ta = $("test-report-text"); ta.value = text;
  o.querySelector("#test-copy").addEventListener("click", () => {
    const ok = () => { $("test-copied").textContent = "COPIED. NOW PASTE IT INTO A MESSAGE."; };
    const manual = () => { ta.focus(); ta.select(); $("test-copied").textContent = "PRESS CTRL+C TO COPY THE SELECTED TEXT."; };
    try { navigator.clipboard.writeText(text).then(ok, manual); } catch { manual(); }
  });
  o.querySelector("#test-close").addEventListener("click", closeOverlay);
  o.querySelector("#test-again").addEventListener("click", () => { try { sessionStorage.removeItem(KEY); } catch {} T = null; showIntro(); });
}

export function initTestMode(hooks) {
  const wanted = /^#test(-[ab])?$/.test(location.hash) || globalThis.LUNO_TEST;
  if (!wanted) return;
  api = hooks;
  wireTracking();
  new ResizeObserver(() => api.relayout()).observe($("test-bar"));
  const saved = load();
  if (saved && saved.phase === "tasks" && saved.task < TASKS.length) { T = saved; showTask(); log("resumed", "page was reloaded"); }
  else if (saved && saved.phase === "review") { T = saved; showReview(); }
  else if (saved && saved.phase === "done") { T = saved; showReport(); }
  else { let skip = false; try { skip = sessionStorage.getItem(KEY + "-skip") === "1" && location.hash !== "#test"; } catch {} if (!skip) showIntro(); }
}
