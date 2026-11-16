// Area-scan panel: a north-up heat map of the ground around the site for the current landing time and needs.
import { runScan, runScanGpu } from "./scan.js";
import { createGpuSkyline } from "./scan-gpu.js";
import { scanOptions, bestCell, keepUp, judgePoint } from "./scan-core.js";
import { showData } from "./sources.js";
import { SOLAR_W_M2 } from "./plan.js";
import { getEnergy, kwh } from "./ui-energy.js";
import { mapResFor } from "./terrain.js";
import { layer, legendHtml, loadPolar, polarValue, polarMeta, goodColor, elevColor, SHADOW_COLOR, profileHtml, mixScore, mixText } from "./layers.js";

// A scanned point's score in YOUR MIX (0..100): the all-years layers at the point, with the scan's own slope for it.
const cellMix = (c) => mixScore({ sun: polarValue("sun", c.lat, c.lon), earth: polarValue("earth", c.lat, c.lon), temp: polarValue("temp", c.lat, c.lon), slope: c.slopeDeg });

const $ = (id) => document.getElementById(id);
const METRICS = {
  sun:   { label: "SUNLIGHT", ends: ["DARK = NO SUNLIGHT", "BRIGHT = ALWAYS SUNLIT"], unit: "% OF MISSION IN SUNLIGHT", value: (c) => c.sunPct, ramp: [[18, 12, 2], [255, 176, 0], [255, 244, 200]] },
  earth: { label: "EARTH LINK", ends: ["DARK = NO EARTH LINK", "BRIGHT = ALWAYS IN VIEW"], unit: "% OF MISSION WITH EARTH IN VIEW", value: (c) => c.earthPct, ramp: [[4, 14, 22], [40, 130, 190], [190, 235, 255]] },
  needs: { label: "MEETS NEEDS", unit: "", value: (c) => (c.ok ? 100 : 0), ramp: null },
  // The ground itself, and the all-years layers (the same ones as on the MOON MAP screen; south of 80S only).
  slope:  { label: "SLOPE", lay: "slope", rgb: (c) => (c.slopeDeg == null ? null : goodColor(1 - c.slopeDeg / 20)) },
  elev:   { label: "ELEVATION", rgb: (c, x) => elevColor((c.heightM - x.lo) / Math.max(1, x.hi - x.lo)) },
  ysun:   { label: "SUNLIGHT", lay: "sun", polar: true, rgb: (c) => { const v = polarValue("sun", c.lat, c.lon); return v == null ? null : goodColor(v / 100); } },
  yearth: { label: "EARTH LINK", lay: "earth", polar: true, rgb: (c) => { const v = polarValue("earth", c.lat, c.lon); return v == null ? null : goodColor(v / 100); } },
  temp:   { label: "TEMPERATURE", lay: "temp", polar: true, rgb: (c) => { const v = polarValue("temp", c.lat, c.lon); return v == null ? null : layer("temp").color(v); } },
  mix:    { label: "YOUR MIX", lay: "mix", polar: true, rgb: (c) => { const v = cellMix(c); return v == null ? null : goodColor(v / 100); } },
  ice:    { label: "WATER ICE", lay: "ice", polar: true, capsOnly: true, rgb: (c) => { const v = polarValue("ice", c.lat, c.lon); return v == null ? null : layer("ice").color(v) || [58, 62, 70]; } },
  shadow: { label: "SHADOW", lay: "shadow", polar: true, capsOnly: true, rgb: (c) => { const v = polarValue("shadow", c.lat, c.lon); return v == null ? null : v ? SHADOW_COLOR : [58, 62, 70]; } },
};
const GROUPS = [["THIS MISSION", ["needs", "sun", "earth"]], ["THE GROUND", ["slope", "elev"]], ["ALL YEARS, 2023 TO 2035", ["ysun", "yearth", "shadow", "ice", "temp"]], ["BLENDED WITH YOUR WEIGHTS", ["mix"]]];
const NO_DATA = [26, 28, 34];
const lerp = (a, b, t) => a + (b - a) * t;
function rampColor(ramp, v) {            // v in 0..100
  const t = Math.max(0, Math.min(1, v / 100)), k = t < 0.5 ? 0 : 1, f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  return ramp[k].map((x, i) => Math.round(lerp(x, ramp[k + 1][i], f)));
}

const GO_RGB = [33, 224, 122], NOGO_RGB = [70, 14, 14];
const BEST_PX = 26;                                      // least size of the best-point star box on the map
const GLIDE_MS = 1100, HOLD_MS = 300, PAN_MS = 700;      // moving the site: lander travels, pauses, map slides
// A small lander: the mark for "where you are now" on the map and in the side panel.
const LANDER_SVG = `<svg class="lander" viewBox="-10 -10 20 20" width="15" height="15" aria-hidden="true"><path d="M-4.5-7h9l2 6h-13zM-5-1l-4 8M5-1l4 8M-10.5 7h3.5M7 7h3.5M-2-1l-1 3h6l-1-3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
function drawLander(ctx, x, y, s) {
  const p = new Path2D("M-4.5-7h9l2 6h-13zM-5-1l-4 8M5-1l4 8M-10.5 7h3.5M7 7h3.5M-2-1l-1 3h6l-1-3");
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 20, s / 20); ctx.lineJoin = ctx.lineCap = "round";
  ctx.strokeStyle = "#000"; ctx.lineWidth = 4.6; ctx.stroke(p); ctx.fillStyle = "#fff"; ctx.fill(new Path2D("M-4.5-7h9l2 6h-13z"));
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.8; ctx.stroke(p); ctx.restore();
}
const DIRS = ["NORTH", "NORTHEAST", "EAST", "SOUTHEAST", "SOUTH", "SOUTHWEST", "WEST", "NORTHWEST"];
// "2.76 KM" and "WEST" for a point's offset from the site
const away = (c) => { const d = Math.hypot(c.eastKm, c.northKm); return [d < 10 ? d.toFixed(2) : d.toFixed(1), DIRS[Math.round(((Math.atan2(c.eastKm, c.northKm) * 180 / Math.PI + 360) % 360) / 45) % 8]]; };

export function createScanPanel({ getContext, onPick, getSiteYears, fmt }) {
  const panel = $("scan"), canvas = $("scan-canvas"), ctx = canvas.getContext("2d");
  const tile = document.createElement("canvas"), tctx = tile.getContext("2d");
  let st = { metric: "needs", opt: 1, cells: [], grid: null, run: null, key: "", done: 0, total: 0, hover: null, engine: "" };
  // The graphics chip, if this computer has a usable one: made on first use, dropped for good if it ever fails a check.
  let gpu;
  // The chip's own name as the browser reports it, trimmed to the part a person recognizes.
  let chipLabel;
  const chipName = () => chipLabel ??= (() => {
    const raw = gpu?.info() || "", m = raw.match(/^ANGLE \(([^,]*), ([^,]*)/);
    if (/swiftshader|llvmpipe|basic render|software/i.test(raw)) return "SOFTWARE STAND-IN, NO REAL GPU IN USE";
    return (m ? m[2] : raw).replace(/\(0x[0-9a-f]+\)/gi, "").replace(/\b(Direct3D|OpenGL|Vulkan|Metal).*$/i, "").replace(/\((R|TM)\)/gi, "").replace(/\s+/g, " ").trim().toUpperCase().slice(0, 48);
  })();
  const chipFor = (site) => { if (gpu === undefined) gpu = globalThis.LUNO_NO_GPU ? null : createGpuSkyline(); return gpu && mapResFor(site.lat) <= 960 ? gpu : null; };

  function buildSeg(el, items, get, set) {
    el.replaceChildren();
    items.forEach(([val, label]) => {
      const b = document.createElement("button");
      b.textContent = label; b.classList.toggle("on", get() === val);
      b.addEventListener("click", () => { set(val); [...el.children].forEach((x) => x.classList.toggle("on", x === b)); });
      el.appendChild(b);
    });
  }

  function start() {
    const c = getContext(), chip = chipFor(c.site), opts = scanOptions(c.site.lat, !!chip);
    if (st.opt >= opts.length) st.opt = opts.length - 1;
    const o = opts[st.opt];
    // After a move made inside this panel the map keeps the direction it had (near a pole, north turns from place to
    // place, and a map redrawn north-up would slide every point sideways). Any other change of site starts north-up again.
    const kept = st.nextUp && Math.abs(st.nextUp.lat - c.site.lat) < 2e-4 && Math.abs(((st.nextUp.lon - c.site.lon + 540) % 360) - 180) < 2e-4;
    const up = kept ? st.nextUp.up : 0; if (!kept) st.nextUp = null;
    const key = `${c.site.lat},${c.site.lon},${+c.t0},${JSON.stringify(c.req)},${o.radiusKm},${o.n},${up.toFixed(3)}`;
    buildSeg($("scan-radius"), opts.map((x, i) => [i, `${x.radiusKm} KM`]), () => st.opt, (v) => { st.opt = v; start(); });
    const polarOk = true;                                  // the all-years layers cover the whole Moon (finer poleward of 80 degrees)
    if (!polarMeta()) loadPolar().then(() => schedule()).catch(() => {});
    if (METRICS[st.metric].capsOnly && Math.abs(c.site.lat) < 79.5) st.metric = "needs";
    buildMetrics(polarOk, Math.abs(c.site.lat) >= 79.5);
    $("scan-title").innerHTML = `<b class="scan-name">BEST SITE FINDER</b>`;
    const res = mapResFor(c.site.lat);
    // Slope depends on the distance it is measured over: the scan's map is coarser than a listed site's own map.
    const slopeNote = () => { const t = c.terrain; return `SLOPES IN THE SCAN ARE MEASURED OVER ${fmtStep(2 * res)}${t?.real && !t.reduced && t.slopeBaseM < 2 * res ? `; THIS SITE'S OWN FIGURE, ${t.slopeDeg.toFixed(1)}° OVER ${fmtStep(t.slopeBaseM)}, COMES FROM A FINER MAP` : ""}. `; };
    const note = () => { $("scan-note").textContent = `SCAN USES THE ${res >= 1000 ? (res / 1000).toFixed(1) + " KM" : res + " M"} LOLA MAP, ONE CHECK EVERY ${fmtStep(2 * o.radiusKm * 1000 / (o.n - 1))}. ${c.terrain?.real && !c.terrain.reduced ? "THE SQUARE YOU ARE ON IS JUDGED WITH THIS SITE'S OWN FINER MAP, THE SAME AS THE MAIN SCREEN. " : ""}${slopeNote()}${st.engine}`; };
    note();
    if (key === st.key) return draw();
    st.run?.cancel();
    if (!st.moving) st.under = null;                       // a backdrop only makes sense right after a move
    st.moving = false;
    showData("finder");
    st.panels = null; $("panels-out").innerHTML = st.panelCfg ? "PANELS WILL BE PLACED WHEN THE SCAN FINISHES" : "";
    st.key = key; st.cells = new Array(o.n * o.n).fill(null); st.done = 0; st.total = o.n * o.n; st.hover = null; st.took = ""; st.onChip = !!chip;
    const t00 = performance.now(), secs = () => ((performance.now() - t00) / 1000).toFixed(1);
    // The square you stand on, at a listed site: judged with the site's own detailed skyline, exactly as on the main
    // screen, so the two can never give different answers for the same spot (a judge saw GO there and NO here).
    const mid = (o.n - 1) / 2, T = c.terrain;
    let own = null;
    if (T?.real && !T.reduced) { const j = judgePoint(c.site.lat, c.site.lon, T, c.t0, c.req); own = { sunPct: j.sunPct, earthPct: j.earthPct, ok: j.ok, marginHours: j.marginHours, reason: j.reason }; }
    const common = { site: c.site, radiusKm: o.radiusKm, n: o.n, up, t0: c.t0, req: c.req,
      onCell: (p, r, done, total) => { if (r) st.cells[p.r * o.n + p.k] = { ...p, ...r, ...(own && p.r === mid && p.k === mid ? own : null) }; st.done = done; st.total = total; schedule(); } };
    if (chip) {
      let check = "";
      st.engine = "SKYLINES: ON THE GRAPHICS CHIP.";
      st.run = runScanGpu({ ...common, gpu: chip,
        onCheck: (diff) => { check = ` CHECKED AGAINST THE PROCESSOR AT THE SITE: SAME SKYLINE WITHIN ${diff < 0.001 ? "0.001" : diff.toFixed(3)}°.`; st.engine = `SKYLINES: ON THE GRAPHICS CHIP.${check}`; note(); },
        onDone: () => { st.took = secs(); st.under = null; note(); if (st.panelCfg) placePanels(); draw(); runPending(); },
        onFail: (why) => { console.warn("GPU scan dropped:", why); gpu = null; st.key = ""; st.engine = ""; start(); } });      // back to the processor, for good
    } else {
      st.engine = "SKYLINES: ON THE PROCESSOR.";
      st.run = runScan({ ...common, onDone: () => { st.took = secs(); st.under = null; if (st.panelCfg) placePanels(); draw(); runPending(); } });
    }
    note();
    st.grid = st.run.grid;
    draw();
  }
  const fmtStep = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + " KM" : Math.round(m) + " M");

  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };

  function draw() {
    if (panel.hidden || !st.grid) return;
    const hint = $("scan-hint"); if (hint) hint.dataset.m = st.metric === "needs" ? "needs" : "other";   // the green / red sentence only fits the GO map
    const n = st.grid.n, row = $("scan-row"), sizes = $("scan-sizes"), shows = $("scan-shows"), flow = document.documentElement.classList.contains("flow");
    // The two button stacks stand against the map's left and right edges and are exactly as tall as the map, so no
    // room is left over between them (the user: "vertical selections", "get rid of empty space").
    // A square map can only use as much width as it has height. Whatever is left over goes to the reading panel,
    // which lays its cards out side by side when it is wide (a full-screen laptop left a third of the screen empty).
    const body = panel.querySelector(".scan-body");
    if (flow) body.style.gridTemplateColumns = "";
    else { const availH = body.clientHeight - $("scan-go-best").offsetHeight - 14, stacks = sizes.offsetWidth + shows.offsetWidth; body.style.gridTemplateColumns = `${Math.round(Math.max(320, Math.min(body.clientWidth - 330, availH + stacks)))}px minmax(0, 1fr)`; }
    const size = Math.max(160, Math.floor(flow ? Math.min(row.clientWidth, window.innerHeight * 0.6) : Math.min(row.clientWidth - sizes.offsetWidth - shows.offsetWidth, row.clientHeight))), dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.width = canvas.style.height = size + "px";
    sizes.style.height = shows.style.height = flow ? "" : size + "px";
    $("scan-go-best").style.width = (flow ? size : size + sizes.offsetWidth + shows.offsetWidth) + "px";
    canvas.width = canvas.height = size * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#050402"; ctx.fillRect(0, 0, size, size);
    const cw = size / n, m = METRICS[st.metric], H = (r, k) => st.cells[r * n + k]?.heightM;
    const span = { lo: Infinity, hi: -Infinity };          // lowest and highest ground in the scan, for the elevation colors
    for (const c of st.cells) if (c) { if (c.heightM < span.lo) span.lo = c.heightM; if (c.heightM > span.hi) span.hi = c.heightM; }
    // A move in progress: first the lander glides to the chosen point, then the map slides so that point is the center.
    const A = st.anim, mid = (n - 1) / 2, ease = (t) => t * t * (3 - 2 * t);
    const el = A ? performance.now() - A.t0 : 0, glide = A ? ease(Math.min(1, el / GLIDE_MS)) : 0, pan = A ? ease(Math.max(0, Math.min(1, (el - GLIDE_MS - HOLD_MS) / PAN_MS))) : 0;
    const offX = A ? (A.c.k - mid) * cw : 0, offY = A ? (A.c.r - mid) * cw : 0;
    ctx.imageSmoothingEnabled = false;
    if (st.under && st.under.n === n) {      // the picture from before the move, shifted and dimmed, until the new scan covers it
      ctx.globalAlpha = 0.4; ctx.drawImage(st.under.img, -st.under.dk * cw, -st.under.dr * cw, size, size); ctx.globalAlpha = 1;
    }
    ctx.save(); ctx.translate(-offX * pan, -offY * pan);

    // One image pixel per scan point, then stretched: quick even for tens of thousands of points.
    if (tile.width !== n) tile.width = tile.height = n;
    const img = tctx.createImageData(n, n), px = img.data, inv = 1 / (st.grid.stepM * 1.6);
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) {
      const c = st.cells[r * n + k], o = (r * n + k) * 4;
      if (!c) continue;                                    // not scanned yet: see-through
      const rgb = m.rgb ? (m.rgb(c, span) || NO_DATA) : m.ramp ? rampColor(m.ramp, m.value(c)) : c.ok ? GO_RGB : NOGO_RGB;
      // light hill shading from the neighbors' heights, so ridges and crater walls show through the colors
      const w = H(r, k - 1) ?? c.heightM, e = H(r, k + 1) ?? c.heightM, no = H(r - 1, k) ?? c.heightM, so = H(r + 1, k) ?? c.heightM;
      const shade = Math.max(0.72, Math.min(1.18, 1 + ((w - e) + (no - so)) * inv));
      px[o] = Math.min(255, rgb[0] * shade); px[o + 1] = Math.min(255, rgb[1] * shade); px[o + 2] = Math.min(255, rgb[2] * shade); px[o + 3] = 255;
    }
    tctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(tile, 0, 0, size, size);
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1;
    if (cw >= 7) for (let i = 1; i < n; i++) { ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, size); ctx.moveTo(0, i * cw); ctx.lineTo(size, i * cw); ctx.stroke(); }

    const mark = (c, color, star) => {
      const x = (c.k + 0.5) * cw, y = (c.r + 0.5) * cw, m = Math.max(cw, star ? BEST_PX : 13);      // marks keep a readable size on fine maps
      ctx.strokeStyle = color; ctx.lineWidth = star ? (color === "#000" ? 5 : 2.5) : 2;
      if (star) {      // a dark box with a white star: readable on bright and on dark ground alike
        ctx.fillStyle = "#000"; ctx.fillRect(x - m / 2, y - m / 2, m, m); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.strokeRect(x - m / 2 + 1, y - m / 2 + 1, m - 2, m - 2);
        ctx.fillStyle = "#fff"; ctx.font = `700 ${Math.max(10, m * 0.72)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("★", x, y + 1);
      }
      else { ctx.beginPath(); ctx.moveTo(x - m * 0.8, y); ctx.lineTo(x + m * 0.8, y); ctx.moveTo(x, y - m * 0.8); ctx.lineTo(x, y + m * 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, m * 0.45, 0, 7); ctx.stroke(); }
    };
    const center = { r: (n - 1) / 2, k: (n - 1) / 2 }, best = bestNow();
    // a label on a dark plate, kept inside the map
    // big = the best-point label: larger, black on a white plate, so it is the first thing the eye finds on the map
    const tag = (text, x, y, big) => {
      const fs = big ? 16 : 11, hgt = big ? 26 : 16, padX = big ? 9 : 5;
      ctx.font = `700 ${fs}px sans-serif`; const w = ctx.measureText(text).width + 2 * padX;
      const tx = Math.max(3, Math.min(size - w - 3, x - w / 2)), ty = Math.max(3, Math.min(size - hgt - 3, y));
      if (big) { ctx.fillStyle = "#000"; ctx.fillRect(tx - 2, ty - 2, w + 4, hgt + 4); }
      ctx.fillStyle = big ? "#fff" : "rgba(0,0,0,.78)"; ctx.fillRect(tx, ty, w, hgt);
      ctx.fillStyle = big ? "#000" : "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(text, tx + padX, ty + hgt / 2 + 0.5);
    };
    const cx = (center.k + 0.5) * cw, cy = (center.r + 0.5) * cw, here = 26, moved = best && !(best.r === center.r && best.k === center.k);
    if (best && st.done === st.total) {
      const bx = (best.k + 0.5) * cw, by = (best.r + 0.5) * cw;
      if (moved) {      // the way from here to the best point, with its length
        ctx.setLineDash([6, 4]); ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke();
        ctx.lineWidth = 1.8; ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
      }
      mark(best, "#fff", true);
      const bm = Math.max(cw, BEST_PX) / 2;
      if (!A) tag(moved ? `★ BEST SPOT · ${away(best)[0]} KM AWAY` : "★ YOU ARE AT THE BEST SPOT", bx, moved ? (by > cy ? by + bm + 7 : by - bm - 35) : by - bm - 50, true);
    }
    if (st.panels && !A) {                               // solar panels: the circle they were chosen in, and a numbered mark on each
      const pxKm = cw / (st.grid.stepM / 1000);
      ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.strokeStyle = "#ffd23c"; ctx.beginPath(); ctx.arc(cx, cy, st.panels.radiusKm * pxKm, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      st.panels.cells.forEach((c, i) => {
        const px = (c.k + 0.5) * cw, py = (c.r + 0.5) * cw, m = Math.max(cw * 0.92, 17);
        ctx.fillStyle = "#ffd23c"; ctx.fillRect(px - m / 2, py - m / 2, m, m); ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.strokeRect(px - m / 2, py - m / 2, m, m);
        ctx.fillStyle = "#000"; ctx.font = `700 ${Math.max(11, m * 0.62)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), px, py + 1);
      });
    }
    const lx = cx + offX * glide, ly = cy + offY * glide;
    if (A) { ctx.beginPath(); ctx.arc(lx, ly, 17 + 5 * Math.sin(el / 110), 0, 7); ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 2; ctx.stroke(); }
    drawLander(ctx, lx, ly, here);
    if (A) tag(glide < 1 ? "MOVING THE SITE…" : "✓ SITE MOVED HERE", lx, ly + 18);
    else if (moved || !(best && st.done === st.total)) tag("YOU ARE HERE", cx, cy + (best && st.done === st.total && (best.r + 0.5) * cw > cy ? -32 : 16));
    ctx.restore();
    // distance bar, bottom left: a round number of km close to a fifth of the map
    const across = st.grid.radiusKm * 2 * (n / (n - 1)), barKm = [50, 20, 10, 5, 2, 1, 0.5, 0.2].find((v) => v <= across / 4.5) || 0.2, barPx = barKm / across * size;
    ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(8, size - 30, Math.max(barPx, 46) + 12, 23);
    ctx.fillStyle = "#fff"; ctx.fillRect(14, size - 14, barPx, 3); ctx.fillRect(14, size - 18, 1.5, 7); ctx.fillRect(14 + barPx - 1.5, size - 18, 1.5, 7);
    ctx.font = "600 10px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText(`${barKm} KM`, 14, size - 19);
    {                                                    // north arrow, bottom right: it leans once the map has been kept steady through a move
      const ax = size - 24, ay = size - 26, a = -(st.grid.up || 0) * Math.PI / 180;
      ctx.save(); ctx.translate(ax, ay); ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.beginPath(); ctx.arc(0, 0, 19, 0, 7); ctx.fill();
      ctx.rotate(a); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(5.5, 1); ctx.lineTo(-5.5, 1); ctx.closePath(); ctx.fill();
      ctx.font = "700 10px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("N", 0, 9); ctx.restore();
    }
    if (st.hover && !A) { const m = Math.max(cw, 9); ctx.strokeStyle = "#5ac8ff"; ctx.lineWidth = 2; ctx.strokeRect((st.hover.k + 0.5) * cw - m / 2 + 1, (st.hover.r + 0.5) * cw - m / 2 + 1, m - 2, m - 2); }

    // side readouts
    const finished = st.done === st.total;
    $("scan-progress").textContent = finished ? `${st.total.toLocaleString("en-US")} POINTS CHECKED${st.took ? " IN " + st.took + " S" : ""}` : `SCANNING ${st.done.toLocaleString("en-US")} / ${st.total.toLocaleString("en-US")}`;
    $("scan-engine").textContent = st.onChip ? `COMPUTED ON THE GRAPHICS CHIP (GPU)${chipName() ? ": " + chipName() : ""}` : "COMPUTED ON THE PROCESSOR";
    $("scan-progress").className = finished ? "ok" : "";
    const sq = st.grid.stepM / 1000, sqTxt = `${+sq.toFixed(2)} KM`;
    $("scan-scale").innerHTML = `<b>EACH SQUARE = ${sqTxt} × ${sqTxt} OF GROUND</b><br>MAP IS ${st.grid.radiusKm * 2} KM ACROSS · ${Math.abs(st.grid.up || 0) < 0.5 ? "NORTH UP" : "NORTH IS AT THE N ARROW (THE MAP HOLDS STILL WHEN YOU MOVE)"} · ${LANDER_SVG} = WHERE YOU ARE NOW · ★ = BEST POINT`;
    $("scan-showing").textContent = STACK[st.metric];
    $("scan-legend").classList.toggle("flat", !m.ramp);
    $("scan-legend").classList.toggle("lay", !!m.rgb);
    $("scan-legend").innerHTML = m.lay ? legendHtml(layer(m.lay)) + `<div class="scan-src">${m.lay === "mix" ? "YOUR MIX = " + mixText() + ". CHANGE THE WEIGHTS ON THE MOON MAP SCREEN. " : ""}${layer(m.lay).source}</div>`
      : m.rgb ? `<div class="lay-legend"><i style="background:linear-gradient(90deg,${[0, 0.25, 0.5, 0.75, 1].map((t) => `rgb(${elevColor(t)})`).join(",")})"></i><div class="ends"><span>◀ ${Math.round(span.lo).toLocaleString("en-US")} M<br>LOWEST HERE</span><span>${Math.round(span.hi).toLocaleString("en-US")} M ▶<br>HIGHEST HERE</span></div></div><div class="scan-src">${layer("elev").source}</div>`
      : m.ramp
      ? `<i style="background:linear-gradient(90deg,${[0, 50, 100].map((v) => `rgb(${rampColor(m.ramp, v)})`).join(",")})"></i><span>0%</span><span>${m.unit}</span><span>100%</span><div class="ends"><span>◀ ${m.ends[0]}</span><span>${m.ends[1]} ▶</span></div>`
      : `<b style="background:#21e07a"></b> GREEN = MISSION WORKS THERE<br><b style="background:#460e0e"></b> DARK RED = IT DOES NOT`;
    const cellText = (c) => `${c.eastKm >= 0 ? "E" : "W"} ${Math.abs(c.eastKm).toFixed(2)} KM · ${c.northKm >= 0 ? "N" : "S"} ${Math.abs(c.northKm).toFixed(2)} KM<br>${fmt.lat(c.lat)} ${fmt.lon(c.lon)} · ELEV ${Math.round(c.heightM).toLocaleString("en-US")} M${c.slopeDeg == null ? "" : ` · SLOPE ${c.slopeDeg.toFixed(0)}°`}<br>SUN ${Math.round(c.sunPct)}% · EARTH ${Math.round(c.earthPct)}% · <span class="${c.ok ? "ok" : "bad"}">${c.ok ? "GO" : "NO-GO"}</span>${c.ok ? `<br>SUNLIGHT TO SPARE: ${c.marginHours >= 72 ? "3 DAYS OR MORE" : Math.max(0, Math.round(c.marginHours)) + " H"}` : "<br>" + c.reason}`;
    const cur = st.cells[center.r * n + center.k];
    $("scan-here").innerHTML = cur ? cellText(cur) : "";
    const far = best && away(best);
    $("scan-best").innerHTML = !finished ? `<b class="dist">SCANNING · ${Math.round(100 * st.done / Math.max(1, st.total))}% DONE</b><br>${best ? `BEST SO FAR: ${far[0]} KM AWAY, TO THE ${far[1]}` : "NO SPOT THAT MEETS THE NEEDS YET"}` : !best ? `<b class="dist bad">NO POINT IN THIS AREA MEETS THE MISSION NEEDS AT THIS LANDING TIME</b><br><b class="h-do">TRY A BIGGER SCAN SIZE</b>, OR CLOSE THE SCAN AND PRESS <b class="h-do">NEXT LANDING WINDOW</b>` : (best.r === center.r && best.k === center.k ? `<b class="dist">YOU ARE ALREADY AT THE BEST POINT IN THIS AREA</b><br>` : `<b class="dist">${far[0]} KM AWAY, TO THE ${far[1]}</b><br>`) + cellText(best);
    if (finished && best && st.rank === "mix" && polarOkNow) { const v = cellMix(best); if (v != null) $("scan-best").insertAdjacentHTML("beforeend", `<br><b class="h-do">PICKED BY YOUR MIX</b>: ${Math.round(v)} OF 100 (${mixText()})`); }
    const canMove = finished && best && !(best.r === center.r && best.k === center.k);
    $("scan-go-best").disabled = !canMove;
    $("scan-go-best").textContent = !finished ? "SCANNING…" : canMove ? "MOVE MY SITE TO THE BEST SPOT ▸" : best ? "YOU ARE AT THE BEST SPOT" : "NO SPOT HERE MEETS THE NEEDS";
    // Data profile: every layer at one point (the point under the pointer, else where you are now), each marked good or bad.
    const pc = st.hover || cur;
    // Where you are now, on a preset site: its sunlight and Earth link over the years come from the site's own detailed
    // skyline, the same numbers as on the MOON MAP card (the coarser layer reads low on narrow ridges; a judge saw 53 vs 78).
    const own = !st.hover && cur && polarOkNow && polarMeta() ? getSiteYears?.() : null;
    const lay = own ? [polarValue("sun", cur.lat, cur.lon), polarValue("earth", cur.lat, cur.lon)] : null;
    const ownNote = own ? `<div class="prof-note">SUNLIGHT AND EARTH LINK 2023–35: FROM THIS SITE'S OWN DETAILED SKYLINE${lay[0] != null && lay[1] != null ? ` (THE COARSER MAP LAYER, WHICH COLORS THE MAP, READS ${Math.round(lay[0])}% AND ${Math.round(lay[1])}%)` : ""}.</div>` : "";
    $("scan-prof-of").textContent = st.hover ? "THE POINT UNDER THE POINTER" : "WHERE YOU ARE NOW";
    $("scan-hover").innerHTML = !pc ? "CHECKING THIS SPOT FIRST" : (st.hover ? `${away(pc)[0]} KM FROM WHERE YOU ARE · ` : "") + `${fmt.lat(pc.lat)} ${fmt.lon(pc.lon)}` + profileHtml(cellProfile(pc, span, polarOkNow, own)) + ownNote
      + (st.hover ? `<b class="h-do">CLICK TO MOVE THE SITE HERE</b>` : `<b class="h-do">MOVE OVER THE MAP</b> TO READ ANY POINT. <b class="h-do">CLICK</b> TO MOVE THE SITE THERE.`);
  }

  // The best point. Usually LUNI's own rule (bestCell). With "pick by your mix" on: among the points that meet the
  // mission needs, the one with the highest mix score; the shortest move wins a tie.
  function bestNow() {
    if (st.rank !== "mix" || !polarOkNow || !polarMeta()) return bestCell(st.cells);
    let best = null, bs = -1, bd = Infinity;
    for (const c of st.cells) {
      if (!c || !c.ok) continue;
      const s = cellMix(c); if (s == null) continue;
      const d = Math.hypot(c.eastKm, c.northKm), r = Math.round(s);
      if (r > bs || (r === bs && d < bd)) { best = c; bs = r; bd = d; }
    }
    return best;
  }
  // The rows of the data profile card for one scanned point.
  let polarOkNow = false;
  function cellProfile(c, span, polarOk, own = null) {
    const row = (label, text, score, share, rgb, note = "") => ({ label, text, score, share: Math.max(0, Math.min(1, share)), rgb: rgb || goodColor(score ?? 0.5), note });
    const rows = [
      row("MEETS THE NEEDS", c.ok ? "YES" : "NO", c.ok ? 1 : 0, 1),
      row("MISSION SUNLIGHT", `${Math.round(c.sunPct)}%`, c.sunPct / 100, c.sunPct / 100),
      row("MISSION EARTH LINK", `${Math.round(c.earthPct)}%`, c.earthPct / 100, c.earthPct / 100),
      c.slopeDeg == null ? { label: "SLOPE", text: null, note: "NO DATA" } : row("SLOPE", `${c.slopeDeg.toFixed(1)}°`, 1 - Math.min(1, c.slopeDeg / 20), c.slopeDeg / 20),
      row("ELEVATION", `${Math.round(c.heightM).toLocaleString("en-US")} M`, null, (c.heightM - span.lo) / Math.max(1, span.hi - span.lo), elevColor((c.heightM - span.lo) / Math.max(1, span.hi - span.lo))),
    ];
    if (polarOk && polarMeta()) {
      const s = own ? own.sun : polarValue("sun", c.lat, c.lon), e = own ? own.earth : polarValue("earth", c.lat, c.lon), sh = polarValue("shadow", c.lat, c.lon);
      rows.push(s == null ? { label: "SUNLIGHT 2023–35", text: null, note: "NO DATA" } : row("SUNLIGHT 2023–35", `${Math.round(s)}%`, s / 100, s / 100),
                e == null ? { label: "EARTH LINK 2023–35", text: null, note: "NO DATA" } : row("EARTH LINK 2023–35", `${Math.round(e)}%`, e / 100, e / 100),
                sh == null ? { label: "PERMANENT SHADOW", text: null, note: "POLES ONLY" } : row("PERMANENT SHADOW", sh ? "YES" : "NO", sh ? 0 : 1, 1, sh ? SHADOW_COLOR : null));
      const t = polarValue("temp", c.lat, c.lon), mx = own ? mixScore({ sun: s, earth: e, temp: t, slope: c.slopeDeg }) : cellMix(c), T = layer("temp");
      if (t != null) rows.push(row("TEMPERATURE (AVG)", T.brief(t), null, (t - T.lo) / (T.hi - T.lo), T.color(t)));
      if (mx != null) rows.push(row("YOUR MIX", `${Math.round(mx)} OF 100`, mx / 100, mx / 100));
    }
    return rows;
  }
  // MAP SHOWS: one drop-down over the map, grouped. The names say which sunlight is meant, because the mission's
  // and the all-years ones sit in the same list.
  const STACK = { needs: "GO / NO-GO", sun: "SUN · MISSION", earth: "EARTH · MISSION", slope: "SLOPE", elev: "ELEVATION", ysun: "SUN · ALL YEARS", yearth: "EARTH · ALL YEARS", shadow: "NEVER SUNLIT", ice: "WATER ICE", temp: "TEMPERATURE", mix: "YOUR MIX" };
  function buildMetrics(polarOk, nearPole) {
    polarOkNow = polarOk;
    const box = $("scan-metric"); box.replaceChildren();
    for (const [title, ids] of GROUPS) {
      if (METRICS[ids[0]].polar && !polarOk) continue;
      const g = document.createElement("div"); g.className = "scan-mgroup"; g.title = title;
      for (const id of ids) {
        if (METRICS[id].capsOnly && !nearPole) continue;     // permanent shadow and ice are only worked out near the poles
        const o = document.createElement("button"); o.textContent = STACK[id]; o.dataset.id = id; o.classList.toggle("on", id === st.metric);
        o.addEventListener("click", () => setMetric(id)); g.appendChild(o);
      }
      if (g.children.length) box.appendChild(g);
    }
    const rank = $("scan-rank"); rank.replaceChildren();
    if (polarOk) {      // who picks the best point
      rank.innerHTML = `<span>★ BEST SPOT IS PICKED BY</span><div class="seg"></div>`;
      for (const [id, label] of [["luni", "SUNLIGHT TO SPARE"], ["mix", "YOUR MIX"]]) {
        const b = document.createElement("button"); b.textContent = label; b.classList.toggle("on", (st.rank || "luni") === id);
        b.addEventListener("click", () => { st.rank = id; [...rank.lastChild.children].forEach((x) => x.classList.toggle("on", x === b)); draw(); });
        rank.lastChild.appendChild(b);
      }
    }
  }

  const hasMetric = (id) => !!$("scan-metric").querySelector(`button[data-id="${id}"]`);
  const setMetric = (id) => { st.metric = id; for (const b of $("scan-metric").querySelectorAll("button")) b.classList.toggle("on", b.dataset.id === id); draw(); };
  const cellAt = (e) => {
    if (!st.grid) return null;
    const r = canvas.getBoundingClientRect(), n = st.grid.n;
    const k = Math.floor((e.clientX - r.left) / r.width * n), row = Math.floor((e.clientY - r.top) / r.height * n);
    return k < 0 || row < 0 || k >= n || row >= n ? null : st.cells[row * n + k];
  };
  canvas.addEventListener("pointermove", (e) => { const c = cellAt(e); if (c !== st.hover) { st.hover = c; schedule(); } });
  canvas.addEventListener("pointerleave", () => { st.hover = null; schedule(); });
  canvas.addEventListener("click", (e) => { const c = cellAt(e); if (c) pick(c); });
  $("scan-go-best").addEventListener("click", () => { const b = bestNow(); if (b) pick(b); });
  $("scan-close").addEventListener("click", () => toggle(false));
  new ResizeObserver(() => schedule()).observe($("scan-row"));

  // Moving the site from the scan: stay here, show the lander travel to the point, slide the map so the new site is
  // the center, then scan again around it. The old picture stays as a faint backdrop until the new one covers it.
  function pick(c) {
    if (st.anim || !st.grid) return;
    const n = st.grid.n, mid = (n - 1) / 2;
    if (c.r === mid && c.k === mid) return;                // already here
    st.anim = { c, t0: performance.now() }; st.hover = null;
    const step = () => {
      if (!st.anim) return;
      if (panel.hidden) { st.anim = null; return; }
      draw();
      if (performance.now() - st.anim.t0 < GLIDE_MS + HOLD_MS + PAN_MS) return requestAnimationFrame(step);
      const img = document.createElement("canvas"); img.width = img.height = n; img.getContext("2d").drawImage(tile, 0, 0);
      st.under = { img, dk: c.k - mid, dr: c.r - mid, n }; st.moving = true; st.anim = null;
      const from = st.cells[mid * n + mid] || getContext().site, to = { lat: +c.lat.toFixed(4), lon: +c.lon.toFixed(4) };
      st.nextUp = { ...to, up: keepUp(from, to, st.grid.up || 0) };
      onPick(to.lat, to.lon);
    };
    requestAnimationFrame(step);
  }
  // "Move to the highest elevation", "go to the coldest spot": the point of the scanned area with the largest or
  // smallest value of one map choice (ties go to the nearest point). If the scan is not finished the move waits for it.
  const EXT = {
    elev: [(c) => c.heightM, (v) => `${Math.round(v).toLocaleString("en-US")} m`], slope: [(c) => c.slopeDeg, (v) => `${v.toFixed(1)} degrees`],
    sun: [(c) => c.sunPct, (v) => `${Math.round(v)}%`], earth: [(c) => c.earthPct, (v) => `${Math.round(v)}%`],
    ysun: [(c) => polarValue("sun", c.lat, c.lon), (v) => `${Math.round(v)}%`], yearth: [(c) => polarValue("earth", c.lat, c.lon), (v) => `${Math.round(v)}%`],
    temp: [(c) => polarValue("temp", c.lat, c.lon), (v) => `${Math.round(v - 273.15)} °C`],
    ice: [(c) => { const v = polarValue("ice", c.lat, c.lon); return v == null || v >= 99 ? null : v; }, (v) => (v < 0.006 ? "at the surface" : `${v.toFixed(2)} m down`)],
    mix: [(c) => cellMix(c), (v) => `${Math.round(v)} of 100`],
  };
  function extreme(id, which) {
    if (!EXT[id]) return { state: "none" };
    if (panel.hidden) toggle(true);
    if (METRICS[id] && hasMetric(id)) setMetric(id);
    if (!st.grid || st.done < st.total || st.anim) { st.pendingExtreme = [id, which]; return { state: "pending" }; }
    const [get, show] = EXT[id], sign = which === "lowest" ? -1 : 1, mid = (st.grid.n - 1) / 2;
    let best = null, bv = null;
    for (const c of st.cells) {
      if (!c) continue; const v = get(c); if (v == null || !Number.isFinite(v)) continue;
      const better = bv == null || sign * (v - bv) > 1e-9 || (Math.abs(v - bv) <= 1e-9 && Math.hypot(c.r - mid, c.k - mid) < Math.hypot(best.r - mid, best.k - mid));
      if (better) { best = c; bv = v; }
    }
    if (!best) return { state: "none" };
    const [km, dir] = away(best);
    if (best.r === mid && best.k === mid) return { state: "same", value: show(bv) };
    pick(best);
    return { state: "moved", value: show(bv), km, dir: dir.toLowerCase() };
  }
  // SOLAR PANELS: the user gives a distance from the landing site and a number of panels; LUNI puts one panel on each
  // of the squares inside that distance with the most sunlight during the mission. Ties go to the square with the
  // most sunlight to spare after the mission, then to the nearest. One panel a square.
  function placePanels() {
    const out = $("panels-out"), g = st.grid;
    if (!g || st.done < st.total) { out.innerHTML = "PANELS WILL BE PLACED WHEN THE SCAN FINISHES"; return; }
    const cfg = st.panelCfg, stepKm = g.stepM / 1000, R = Math.max(stepKm, Math.min(g.radiusKm, cfg.radiusKm)), dist = (c) => Math.hypot(c.eastKm, c.northKm);
    const cand = st.cells.filter((c) => c && dist(c) <= R + 1e-6);
    cand.sort((a, b) => b.sunPct - a.sunPct || b.marginHours - a.marginHours || dist(a) - dist(b));
    const N = Math.max(1, Math.min(20, cfg.count, cand.length)), cells = cand.slice(0, N);
    st.panels = { radiusKm: R, cells };
    const e = getEnergy(), hours = getContext().req.days * 24, each = (c) => SOLAR_W_M2 * e.areaM2 * e.effPct / 100 * c.sunPct / 100 * hours;
    const total = cells.reduce((t, c) => t + each(c), 0), far = cells.reduce((t, c) => Math.max(t, dist(c)), 0);
    out.innerHTML = `<b class="dist">${N} PANEL${N === 1 ? "" : "S"} WITHIN ${+R.toFixed(2)} KM</b>${R < cfg.radiusKm ? ` (THE SCAN ONLY REACHES ${g.radiusKm} KM: PICK A BIGGER SCAN SIZE FOR MORE)` : ""}
      <table class="panels-table"><tr><th>#</th><th>WHERE</th><th>SUN IN THE MISSION</th><th>ENERGY</th></tr>
      ${cells.map((c, i) => `<tr><td><i>${i + 1}</i></td><td>${dist(c) < stepKm / 2 ? "AT THE LANDER" : `${away(c)[0]} KM ${away(c)[1]}`}</td><td>${Math.round(c.sunPct)}%</td><td>${kwh(each(c))}</td></tr>`).join("")}</table>
      <b>ALL ${N} TOGETHER: ABOUT ${kwh(total)}</b> OVER THE ${getContext().req.days}-DAY MISSION · FARTHEST PANEL ${far < 10 ? far.toFixed(2) : far.toFixed(1)} KM FROM THE LANDER
      <div class="scan-src">PICKED BY THE MOST SUNLIGHT DURING THE MISSION, THEN THE MOST SUNLIGHT TO SPARE AFTER IT, THEN THE SHORTEST DISTANCE. ONE PANEL A SQUARE (${fmtStep(g.stepM)}). ENERGY IS FOR YOUR PANEL (${e.areaM2} M², ${e.effPct}%, SET UNDER POWER › ENERGY) FACING THE SUN, AT ${SOLAR_W_M2.toLocaleString("en-US")} W PER SQUARE METER (NASA). CABLES AND SHADOWS BETWEEN PANELS ARE NOT MODELED.</div>`;
    showData("panels");
    draw();
  }
  $("panels-open").addEventListener("click", () => {
    const f = $("panels-form"); f.hidden = !f.hidden;
    if (!f.hidden && !$("panels-radius").value && st.grid) $("panels-radius").value = +(st.grid.radiusKm / 2).toFixed(1);
    if (!f.hidden) $("panels-radius").focus();
  });
  $("panels-go").addEventListener("click", () => {
    const r = parseFloat($("panels-radius").value), n = parseInt($("panels-count").value, 10);
    if (!(r > 0) || !(n >= 1)) { $("panels-out").innerHTML = `<b class="dist bad">TYPE A DISTANCE IN KM AND A NUMBER OF PANELS</b>`; return; }
    st.panelCfg = { radiusKm: r, count: n }; placePanels();
  });
  $("panels-clear").addEventListener("click", () => { st.panelCfg = null; st.panels = null; $("panels-out").innerHTML = ""; draw(); });
  const runPending = () => { const p = st.pendingExtreme; st.pendingExtreme = null; if (p && !panel.hidden) extreme(p[0], p[1]); };
  globalThis.lunoScanDebug = () => st;                   // for the checks: the scan's current grid and cells
  function toggle(show = panel.hidden) {
    panel.hidden = !show;
    $("scan-btn").classList.toggle("on", show);
    if (!show) { st.anim = null; st.under = null; }
    if (show) start(); else st.run?.cancel(), (st.done < st.total && (st.key = ""));
  }
  return { toggle, extreme, isOpen: () => !panel.hidden,
           // ASK LUNI: "place 4 solar panels within 2 km"
           panels(radiusKm, count) { if (panel.hidden) toggle(true); $("panels-form").hidden = false; st.panelCfg = { radiusKm: radiusKm || (st.grid ? st.grid.radiusKm / 2 : 2), count: count || 4 };
             $("panels-radius").value = st.panelCfg.radiusKm; $("panels-count").value = st.panelCfg.count; placePanels(); return { ...st.panelCfg, placed: st.panels ? st.panels.cells.length : 0 }; }, refresh: () => { if (!panel.hidden) start(); },
           // From the MOON MAP: show the scan colored by the mix, with the best point picked by the mix.
           useMix() { st.metric = "mix"; st.rank = "mix";  if (panel.hidden) toggle(true); else start(); } };
}
