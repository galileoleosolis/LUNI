// PROOF panel: how anyone can tell LUNI's answers are right, and where LUNI stops.
// The "real" side of each mission comes from js/stories.js (sourced); LUNI's side is computed here, live, from the
// same data and the same functions the rest of the app uses. Nothing on LUNI's side is typed in by hand.
import { showData } from "./sources.js";
import { SITES } from "./sites.js";
import { sampleSite, terrainFor } from "./model.js";
import { siteFrame, eclipsesBetween, MOON_RADIUS_KM } from "./ephem.js";
import { analyze, DEFAULT_REQ } from "./mission.js";
import { STORIES } from "./stories.js";

const MIN5 = 300000, HOUR = 3600000, DAY = 86400000;

// First moment after `from` when `test(sample)` becomes true, to the nearest 5 minutes (null if not within maxDays).
export function firstMoment(site, terrain, from, test, maxDays = 40) {
  const coarse = sampleSite(site, from, maxDays * 24, terrain);
  const i = coarse.findIndex((s, j) => j > 0 && test(s) && !test(coarse[j - 1]));
  if (i < 0) return null;
  for (let t = +coarse[i - 1].t + MIN5; t < +coarse[i].t; t += MIN5) if (test(sampleSite(site, new Date(t), 1, terrain)[0])) return new Date(t);
  return coarse[i].t;
}
const sunGone = (s) => s.sunTerrain < 0.5, sunBack = (s) => s.sunTerrain >= 0.5;      // the skyline only; eclipses are listed separately

// LUNI's side of each real mission: [what, what really happened, what LUNI works out].
export function replay(story, fmt) {
  const site = SITES.find((s) => s.id === story.site), tr = terrainFor(site), t0 = new Date(story.t0);
  const hm = (d) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const rows = [];
  if (story.id === "bg1") {
    const down = new Date(story.touchdown), set = firstMoment(site, tr, down, sunGone);
    rows.push(["DAYLIGHT AFTER TOUCHDOWN", "346 HOURS (FIREFLY'S COUNT)", set ? `${Math.round((set - down) / HOUR)} HOURS · SUNSET ${fmt.stamp(set)}` : "NO SUNSET FOUND"]);
    const frame = siteFrame(site.lat, site.lon, MOON_RADIUS_KM + (tr.heightM + tr.mastM) / 1000);
    const e = eclipsesBetween(frame, t0, new Date(+t0 + 16 * DAY), 1)[0];      // to the minute
    rows.push(["ECLIPSE OF 14 MAR 2025", "BEGAN ABOUT 05:30 UTC · SUN FULLY HIDDEN FROM ABOUT 06:18 · OVER ABOUT 09:52",
      e ? `${hm(e.start)} TO ${hm(e.end)} UTC${e.maxCover >= 0.995 ? ` · SUN FULLY HIDDEN FROM ${hm(e.peak)}` : ` · UP TO ${Math.round(e.maxCover * 100)}% HIDDEN`}` : "NO ECLIPSE FOUND"]);
  } else if (story.id === "ch3") {
    const set = firstMoment(site, tr, t0, sunGone), rise = set && firstMoment(site, tr, set, sunBack);
    rows.push(["SUNSET", "LANDER PUT TO SLEEP 4 SEP 2023, ABOUT 02:30 UTC, AHEAD OF THE NIGHT", set ? `SUNSET ${fmt.stamp(set)}` : "NO SUNSET FOUND"]);
    rows.push(["NEXT SUNRISE", "ISRO HOPED FOR A WAKE-UP AROUND 22 SEP 2023", rise ? `SUNRISE ${fmt.stamp(rise)}` : "NO SUNRISE FOUND"]);
  } else if (story.id === "im2") {
    const req = { ...DEFAULT_REQ, days: story.days }, s = sampleSite(site, t0, (req.days + 3) * 24 + req.maxDarkH, tr), v = analyze(s, req, 1, tr).at(0);
    rows.push(["THE PLANNED SPOT, AT LANDING", "ATHENA MISSED IT BY ABOUT 250 M AND ENDED ON ITS SIDE IN A CRATER, UNABLE TO RECHARGE",
      `${v.ok ? "GO" : "NO-GO"} FOR ${req.days} DAYS · SUN ONLY ${s[0].sunEl.toFixed(1)}° ABOVE THE HORIZON · EARTH ${s[0].earthUp ? "IN VIEW" : "NOT IN VIEW"}`]);
    rows.push(["WHAT THIS SHOWS", "THE SITE AND DATE WERE WORKABLE. THE LANDING ITSELF WAS NOT.", "LUNI JUDGES THE EXACT POINT IT IS GIVEN. WITH THE SUN THIS LOW, GROUND A FEW HUNDRED METERS AWAY CAN BE DARK: THE BEST SITE FINDER MAPS IT."]);
  }
  return rows;
}

// LUNI's polar layers against the LOLA team's own polar maps: numbers worked out once by tools/compare_lola_illum.py
// (1.26 million squares a pole) and kept in data/layers/index.json.
let layerCheckHtml = null;
function layerCheck() {
  return (layerCheckHtml ||= fetch("data/layers/index.json").then((r) => r.json()).then((ix) => {
    const c = ix.nasa_check; if (!c) return "<p>NOT AVAILABLE IN THIS BUILD.</p>";
    const n = (v) => Number(v).toLocaleString("en-US"), cell = (k, f) => `<td class="luni">${f(c.sp[k])}</td><td class="luni">${f(c.np[k])}</td>`;
    const pct = (o) => `SAME PATTERN: ${o.r.toFixed(2)} OF 1.00 · AVERAGE GAP ${o.mean_abs_diff} POINTS · ${o.within_10_points_pct}% OF SQUARES WITHIN 10 POINTS`;
    return `<table><tr><th></th><th>SOUTH POLE (${n(c.sp.squares)} SQUARES)</th><th>NORTH POLE (${n(c.np.squares)} SQUARES)</th></tr>
      <tr><td>SUNLIGHT</td>${cell("sun", pct)}</tr>
      <tr><td>EARTH IN VIEW</td>${cell("earth", pct)}</tr>
      <tr><td>NEVER SUNLIT</td>${cell("shadow", (o) => `SAME ANSWER IN ${o.same_answer_pct.toFixed(1)}% OF SQUARES · LUNI ${n(o.luni_km2)} KM², NASA ${n(o.nasa_km2)} KM²`)}</tr></table>
      <div class="proof-src">NASA'S MAPS: THE LRO LOLA TEAM'S POLAR ILLUMINATION MAPS, 2016 RELEASE (PERMANENTLY SHADOWED REGIONS, AVERAGE VISIBILITY OF THE SUN AND OF EARTH, 240 M). <a href="https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/" target="_blank" rel="noopener">NASA PDS ↗</a><br>
      THE TWO ARE NOT THE SAME MEASUREMENT: NASA COUNTS ANY PART OF THE DISC, AT THE SURFACE, OVER A LONG PERIOD; LUNI COUNTS THE DISC'S CENTER, 2 M ABOVE THE SURFACE, OVER 2023 TO 2035. THAT IS WHY LUNI'S EARTH NUMBERS RUN ABOUT 5 POINTS LOWER.</div>`;
  }).catch(() => "<p>COULD NOT BE LOADED.</p>"));
}

export function createProofPanel({ fmt, onReplay, links }) {
  const $ = (id) => document.getElementById(id), box = $("proof");
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  function build() {
    const l = links();
    let h = `<section><h3><b class="step">1</b><b class="h-t">SUN AND EARTH POSITIONS</b> · CHECKED AGAINST NASA'S OWN CALCULATOR</h3>
      <div class="proof-big"><b>0.0007°</b><span>THE WORST DIFFERENCE BETWEEN LUNI AND NASA JPL HORIZONS IN 1,110 SUN AND EARTH POSITIONS<br>(6 SITES FROM THE EQUATOR TO THE SOUTH POLE, 2023 TO 2035). THE SUN'S DISC IS 0.53° WIDE: THE ERROR IS ABOUT 1/750 OF IT.</span></div>
      <p><b class="h-do">CHECK ANY MOMENT YOURSELF:</b> NASA'S ANSWER FOR THE SITE AND TIME ON SCREEN NOW: <a href="${l.sun}" target="_blank" rel="noopener">SUN ↗</a> <a href="${l.earth}" target="_blank" rel="noopener">EARTH ↗</a> · ITS AZIMUTH IS LUNI'S DIRECTION, ITS ELEVATION IS LUNI'S HEIGHT.</p></section>`;
    h += `<section><h3><b class="step">2</b><b class="h-t">REAL LANDINGS, REPLAYED</b> · THE MISSION RECORD COMPARED WITH LUNI'S CALCULATION</h3>`;
    for (const st of STORIES.filter((x) => x.proof)) {
      let rows;
      try { rows = replay(st, fmt); } catch (e) { console.error(e); rows = [["", "", "COULD NOT BE CALCULATED"]]; }
      h += `<div class="proof-card" data-card="${st.id}"><div class="proof-card-head"><span><b>${st.name}</b> · ${st.when} · ${st.where}</span><button class="mini-btn" data-replay="${st.id}">REPLAY IT IN LUNI ▸</button></div>
        <table><tr><th></th><th>MISSION RECORD (PUBLISHED SOURCES)</th><th>LUNI'S CALCULATION (LIVE, FROM NASA DATA)</th></tr>
        ${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td class="luni">${esc(r[2])}</td></tr>`).join("")}</table>
        <div class="proof-src">SOURCES: ${st.sources.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(n.toUpperCase())} ↗</a>`).join(" · ")}</div></div>`;
    }
    h += `</section><section><h3><b class="step">3</b><b class="h-t">THE MAP LAYERS</b> · CHECKED AGAINST NASA'S OWN POLAR MAPS</h3><div id="proof-layers" class="proof-card"><p>LOADING…</p></div>`;
    h += `</section><section><h3><b class="step">4</b><b class="h-t">THE GROUND</b> · NASA'S LASER ELEVATION MAPS (LRO LOLA)</h3>
      <ul><li>THE ${SITES.length} LISTED SITES USE SKYLINES BUILT FROM THE FULL MAPS: 40 M AND 240 M PER PIXEL IN THE SOUTH POLAR REGION, 1.9 KM ELSEWHERE.</li>
      <li>ANY OTHER POINT, AND EVERY SCAN, USES REDUCED MAPS (240 M TO 3.8 KM PER PIXEL) AND SAYS SO ON SCREEN. AGAINST THE FULL MAPS, THE REDUCED SKYLINES DIFFER BY 0.04° TO 1.0° ON AVERAGE AT THE LISTED SITES.</li>
      <li>WHEN A SCAN RUNS ON THE GRAPHICS CHIP, EVERY RUN FIRST COMPARES ITS SKYLINE WITH THE PROCESSOR'S AND FALLS BACK IF THEY DIFFER BY MORE THAN 0.02°.</li></ul></section>`;
    h += `<section><h3><b class="step">5</b><b class="h-t">WHERE LUNI STOPS</b> · WHAT IT DOES NOT KNOW</h3>
      <ul><li><b>THE LANDING ITSELF.</b> LUNI JUDGES THE EXACT POINT IT IS GIVEN. A LANDER THAT COMES DOWN 250 M AWAY, OR ON ITS SIDE, IS IN DIFFERENT LIGHT.</li>
      <li><b>SMALL THINGS.</b> ROCKS AND CRATERS SMALLER THAN A MAP PIXEL ARE NOT IN THE DATA. SLOPE IS MEASURED OVER 80 M TO 3.8 KM, DEPENDING ON THE MAP.</li>
      <li><b>POWER.</b> "SUN" MEANS AT LEAST HALF THE SUN'S DISC IS IN VIEW FROM 2 M ABOVE THE GROUND. PANEL DIRECTION, LANDER TILT AND TEMPERATURE ARE NOT MODELED.</li>
      <li><b>EARTH LINK.</b> "LINK" MEANS THE CENTER OF EARTH IS ABOVE THE SKYLINE. ANTENNAS, GROUND STATIONS AND RELAY SATELLITES ARE NOT MODELED.</li>
      <li><b>DATES.</b> 2023 TO 2035 (THE SPAN OF THE POSITION DATA LUNI CARRIES).</li>
      <li><b>THE 3D VIEW.</b> ANYTHING SMALLER THAN THE 40 M DATA (ROCKS, THE LANDER) IS ILLUSTRATIVE.</li>
      <li><b>HOW IT WAS MADE.</b> THE CODE WAS WRITTEN WITH AN AI ASSISTANT (CLAUDE), DIRECTED AND TESTED BY THE TEAM. EVERY NUMBER COMES FROM NASA DATA AND THE CHECKS ABOVE, NONE FROM THE AI.</li></ul></section>`;
    // Headline numbers first; each section's detail opens on a click, so the panel is calm at first sight.
    const bg = STORIES.find((x) => x.id === "bg1"); let hours = null;
    try { hours = /(\d+) HOURS/.exec(replay(bg, fmt)[0][2])?.[1] || null; } catch {}
    const tiles = `<div class="proof-tiles">
      <div><b>0.0007°</b><span>LARGEST GAP BETWEEN LUNI AND NASA JPL HORIZONS IN 1,110 SUN AND EARTH POSITIONS</span></div>
      <div><b>${hours ? hours + " H" : "3 LANDINGS"}</b><span>${hours ? "OF DAYLIGHT AFTER BLUE GHOST 1 LANDED, BY LUNI. FIREFLY COUNTED 346 H" : "REAL LANDINGS REPLAYED NEXT TO THEIR MISSION RECORDS"}</span></div>
      <div><b id="proof-t3">…</b><span>HOW CLOSELY LUNI'S SUNLIGHT MAP FOLLOWS NASA'S OWN POLAR MAP (1.00 = THE SAME)</span></div>
      <div><b id="proof-t4">…</b><span>OF SOUTH POLE SQUARES GIVE THE SAME "NEVER SUNLIT" ANSWER AS NASA'S PERMANENT-SHADOW MAP<i id="proof-t4n"></i></span></div></div>
      <p class="proof-hint"><b class="h-do">CLICK A LINE BELOW TO OPEN ITS DETAILS</b></p>`;
    $("proof-body").innerHTML = tiles + h.replace(/<section><h3>([\s\S]*?)<\/h3>/g, '<details class="proof-sec"><summary><h3>$1</h3></summary>').replace(/<\/section>/g, "</details>");
    layerCheck().then((c) => { const at = $("proof-layers"); if (at) at.innerHTML = c; });
    fetch("data/layers/index.json").then((r) => r.json()).then((ix) => { const c = ix.nasa_check; if (!c) return;
      const t3 = $("proof-t3"), t4 = $("proof-t4"); if (t3) t3.textContent = Math.min(c.sp.sun.r, c.np.sun.r).toFixed(2); const one = (v) => (Math.round(v * 10 + 1e-6) / 10).toFixed(1) + "%"; if (t4) t4.textContent = one(c.sp.shadow.same_answer_pct); const n4 = $("proof-t4n"); if (n4) n4.textContent = ` · NORTH POLE: ${one(c.np.shadow.same_answer_pct)}`; }).catch(() => {});
    $("proof-body").querySelectorAll("[data-replay]").forEach((b) => b.addEventListener("click", () => { toggle(false); onReplay(STORIES.find((s) => s.id === b.dataset.replay)); }));
  }
  // card: the id of a real landing to bring into view (from the story strip)
  function toggle(show = box.hidden, card = null) {
    if (show) build();
    box.hidden = !show; $("proof-btn").classList.toggle("on", show); if (show) showData("proof");
    if (show) { $("proof-body").scrollTop = 0; if (card) { const c = $("proof-body").querySelector(`[data-card="${card}"]`); const d = c?.closest("details"); if (d) d.open = true; c?.classList.add("hot"); c?.scrollIntoView({ block: "center" }); } }
  }
  $("proof-btn").addEventListener("click", () => toggle());
  $("proof-close").addEventListener("click", () => toggle(false));
  return { toggle, isOpen: () => !box.hidden };
}
