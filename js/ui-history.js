// MISSION HISTORY screen: real landings since 2023 side by side, each replayed with LUNI's own NASA data, with a
// button that loads the landing into the main screen at its real date, hour and mission needs.
// What really happened comes from js/stories.js (sourced). Everything in the LUNI columns is computed here, live.
import { SITES } from "./sites.js";
import { sampleSite, terrainFor, siteEclipses, STEP_HOURS } from "./model.js";
import { analyze, DEFAULT_REQ } from "./mission.js";
import { STORIES } from "./stories.js";
import { firstMoment } from "./ui-proof.js";

const HOUR = 3600000, DAY = 86400000, SPAN_DAYS = 30, SVGNS = "http://www.w3.org/2000/svg";
const el = (tag, attrs, parent, text) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; parent?.appendChild(n); return n; };

// LUNI's numbers for one landing.
export function missionFacts(story) {
  const site = SITES.find((s) => s.id === story.site), tr = terrainFor(site), t0 = new Date(story.t0);
  const req = { ...DEFAULT_REQ, days: story.days, ...(story.needs || {}) };
  const samples = sampleSite(site, t0, SPAN_DAYS * 24, tr), v = analyze(samples, req, STEP_HOURS, tr).at(0), s0 = samples[0];
  const sunset = s0.sunTerrain >= 0.5 ? firstMoment(site, tr, t0, (s) => s.sunTerrain < 0.5, 40) : null;
  let earth = 0; for (const s of samples) earth += s.earthUp ? 1 : 0;
  return { site, tr, t0, req, samples, v, s0, sunset, sunHours: sunset ? (sunset - t0) / HOUR : null, earthPct: earth / samples.length * 100,
           eclipses: siteEclipses(site, t0, new Date(+t0 + SPAN_DAYS * DAY), tr).filter((e) => e.maxCover >= 0.05) };
}

export function createHistoryPanel({ fmt, onLoad, onClose }) {
  const $ = (id) => document.getElementById(id), box = $("history");
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let rows = null, sel = STORIES[0].id, sort = "date";
  const SORTS = { date: ["BY DATE", (a, b) => a.f.t0 - b.f.t0], lat: ["BY LATITUDE (SOUTH FIRST)", (a, b) => a.f.site.lat - b.f.site.lat], sun: ["BY SUNLIGHT LEFT", (a, b) => (b.f.sunHours ?? 0) - (a.f.sunHours ?? 0)] };
  const dh = (h) => `${Math.floor(h / 24)}D ${String(Math.round(h % 24)).padStart(2, "0")}H`;

  // 30 days after landing as two bars (Sun, Earth), with the real events marked on them.
  function strip(st, f) {
    const W = 420, H = 34, svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", class: "hist-strip" }), n = f.samples.length, w = W / n;
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    [["sunUp", css("--grn"), 2], ["earthUp", css("--cy"), 18]].forEach(([key, color, y]) => {
      el("rect", { x: 0, y: y + 6, width: W, height: 1, fill: css("--dim"), opacity: 0.6 }, svg);
      for (let i = 0; i < n;) { if (!f.samples[i][key]) { i++; continue; } let j = i; while (j < n && f.samples[j][key]) j++; el("rect", { x: i * w, y, width: Math.max(1, (j - i) * w), height: 13, fill: color }, svg); i = j; }
    });
    for (const e of f.eclipses) { const r = el("rect", { x: (e.start - f.t0) / HOUR * w - 1, y: 1, width: Math.max(4, (e.end - e.start) / HOUR * w + 2), height: 15, fill: css("--key-y") }, svg); el("title", {}, r, "Eclipse: Earth passes in front of the Sun"); }
    for (let d = 5; d < SPAN_DAYS; d += 5) el("line", { x1: d * 24 * w, x2: d * 24 * w, y1: 0, y2: H, stroke: "#000", "stroke-width": 1 }, svg);
    const mark = (m, main) => {
      const x = (new Date(m.t) - f.t0) / HOUR * w; if (x < 0 || x > W) return;
      const g = el("g", {}, svg); el("line", { x1: x, x2: x, y1: 0, y2: H, stroke: "#fff", "stroke-width": main ? 2 : 1.2, "stroke-dasharray": main ? "" : "3 2" }, g);
      if (main) el("path", { d: `M${x - 5},0H${x + 5}L${x},7Z`, fill: "#fff" }, g);
      el("title", {}, g, m.text);
    };
    (st.marks || []).forEach((m) => mark(m, false)); if (st.end) mark(st.end, true);
    return svg;
  }

  function compute() {
    rows = STORIES.map((st) => { try { return { st, f: missionFacts(st) }; } catch (e) { console.error(e); return null; } }).filter(Boolean)
      .sort((a, b) => a.f.t0 - b.f.t0);                 // numbered in the order they happened
  }

  // Flat map of the whole Moon (the same NASA mosaic as the globe; longitude 0, the middle of the near side, is at the center).
  function drawMap() {
    const pins = $("hist-pins"), W = 340, H = 170, GAP = 23; pins.replaceChildren();
    const at = rows.map((r) => ({ r, x: ((((r.f.site.lon + 180) % 360) + 360) % 360) / 360 * W, y: (90 - r.f.site.lat) / 180 * H }));
    // Markers that would sit on top of each other are moved apart sideways. This only happens near the poles,
    // where the flat map stretches a short distance on the ground into a long one on the picture.
    for (let pass = 0; pass < 8; pass++) for (const a of at) for (const b of at) {
      if (a === b || Math.abs(a.y - b.y) > GAP - 6 || Math.abs(a.x - b.x) >= GAP) continue;
      const push = (GAP - Math.abs(a.x - b.x)) / 2 + 0.5, dir = a.x < b.x || (a.x === b.x && a.r.f.t0 < b.r.f.t0) ? -1 : 1;
      a.x += dir * push; b.x -= dir * push;
    }
    at.forEach(({ r, x, y }, i) => {
      const b = document.createElement("button"), s = r.f.site;
      b.className = "hist-pin" + (r.st.id === sel ? " on" : ""); b.textContent = String(i + 1); b.title = `${r.st.name} · ${fmt.lat(s.lat)} ${fmt.lon(s.lon)}`;
      b.style.left = x / W * 100 + "%"; b.style.top = Math.min(H - 11, y) / H * 100 + "%";
      b.addEventListener("click", () => { sel = r.st.id; render(); });
      pins.appendChild(b);
    });
  }

  function drawDetail() {
    const r = rows.find((x) => x.st.id === sel) || rows[0], st = r.st, f = r.f, n = rows.indexOf(r) + 1;
    const needs = `${f.req.days}-DAY MISSION · CAN SIT ${f.req.maxDarkH} H IN THE DARK · EARTH LINK AT LANDING ${f.req.earthAtLanding ? "REQUIRED" : "NOT REQUIRED"}`;
    $("hist-detail").innerHTML = `<div class="hist-text"><div class="hist-name"><b class="hist-num">${n}</b><b>${st.name}</b> · ${st.who}</div>
      <div class="hist-where">LANDED ${st.when}, ${st.landed} · ${st.where} · ${fmt.lat(f.site.lat)} ${fmt.lon(f.site.lon)}</div>
      <p>${esc(st.real)}</p></div>
      <div class="hist-side"><div class="hist-luni"><b class="h-t">LUNI, FOR THAT HOUR:</b> <span class="hist-verdict ${f.v.ok ? "go" : "nogo"}">${f.v.ok ? "GO" : "NO-GO"}</span> FOR A ${f.req.days}-DAY MISSION${f.v.ok ? "" : ": " + f.v.reasons.join(", ")}
        ${f.eclipses.map((e) => `<span class="warn">⚠ ECLIPSE ON ${fmt.day(e.peak)}</span>`).join(" ")}</div>
      <button id="hist-load" class="hist-load" title="${esc(needs)}">LOAD INTO THE MAIN SCREEN ▸<small>${fmt.stamp(f.t0)} · ${f.req.days}-DAY MISSION${f.req.earthAtLanding ? "" : " · NO DIRECT EARTH LINK ASKED FOR"}</small></button>
      <div class="hist-src">SOURCES: ${st.sources.map(([name, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(name.toUpperCase())} ↗</a>`).join(" · ")}</div></div>`;
    $("hist-load").addEventListener("click", () => { onClose(); onLoad({ site: st.site, t0: st.t0, days: st.days, needs: st.needs }); });
  }

  function drawTable() {
    const list = [...rows].sort(SORTS[sort][1]), maxSun = Math.max(...rows.map((r) => r.f.sunHours ?? 0), 1), body = $("hist-rows");
    $("hist-sort").replaceChildren(...Object.entries(SORTS).map(([k, [label]]) => { const b = document.createElement("button"); b.textContent = label; b.classList.toggle("on", k === sort); b.addEventListener("click", () => { sort = k; drawTable(); }); return b; }));
    body.replaceChildren();
    for (const r of list) {
      const { st, f } = r, tr = document.createElement("div"), n = rows.indexOf(r) + 1;
      tr.className = "hist-row" + (st.id === sel ? " on" : ""); tr.dataset.id = st.id;
      const bar = (share, cls) => `<i class="hist-bar"><b class="${cls}" style="width:${Math.round(Math.max(0, Math.min(1, share)) * 100)}%"></b></i>`;
      const sunUp = f.s0.sunTerrain >= 0.5;
      tr.innerHTML = `<div class="c-name"><b class="hist-num">${n}</b><span><b>${st.name}</b><small>${st.when} · ${st.who.split(" · ")[0]}</small></span></div>
        <div class="c-num ${sunUp ? "ok" : "bad"}"><b>${f.s0.sunEl >= 0 ? "+" : "−"}${Math.abs(f.s0.sunEl).toFixed(1)}°</b>${bar(f.s0.sunEl / 45, sunUp ? "g" : "r")}</div>
        <div class="c-num ${f.sunHours ? "ok" : "bad"}"><b>${f.sunHours == null ? (sunUp ? "30D+" : "NONE") : dh(f.sunHours)}</b>${bar((f.sunHours ?? (sunUp ? 720 : 0)) / Math.max(maxSun, 1), "g")}</div>
        <div class="c-num ${f.s0.earthUp ? "ok" : "bad"}"><b>${f.s0.earthUp ? "IN VIEW" : "NOT IN VIEW"}</b><small>${Math.round(f.earthPct)}% OF 30 DAYS</small></div>
        <div class="c-num"><b>${f.tr.slopeDeg == null ? "—" : f.tr.slopeDeg.toFixed(1) + "°"}</b><small>OVER ${f.tr.slopeBaseM >= 1000 ? (f.tr.slopeBaseM / 1000).toFixed(1) + " KM" : f.tr.slopeBaseM + " M"}</small></div>
        <div class="c-strip"></div>
        <div class="c-end">${esc(st.end?.text || "")}</div>
        <div class="c-go"><button class="mini-btn" data-load="${st.id}">LOAD ▸</button></div>`;
      tr.querySelector(".c-strip").appendChild(strip(st, f));
      tr.addEventListener("click", (e) => { if (e.target.closest("[data-load]")) return; sel = st.id; render(); });
      tr.querySelector("[data-load]").addEventListener("click", () => { onClose(); onLoad({ site: st.site, t0: st.t0, days: st.days, needs: st.needs }); });
      body.appendChild(tr);
    }
  }
  function render() { drawMap(); drawDetail(); drawTable(); }

  function toggle(show = box.hidden) {
    if (show) { if (!rows) compute(); render(); }
    box.hidden = !show;
  }
  $("hist-close").addEventListener("click", () => onClose());
  return { toggle, isOpen: () => !box.hidden };
}
