// Area-scan panel: a north-up heat map of the ground around the site for the current landing time and needs.
import { runScan, runScanGpu } from "./scan.js";
import { createGpuSkyline } from "./scan-gpu.js";
import { scanOptions, bestCell } from "./scan-core.js";
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
  shadow: { label: "SHADOW", lay: "shadow", polar: true, rgb: (c) => { const v = polarValue("shadow", c.lat, c.lon); return v == null ? null : v ? SHADOW_COLOR : [58, 62, 70]; } },
};
const GROUPS = [["THIS MISSION", ["needs", "sun", "earth"]], ["THE GROUND", ["slope", "elev"]], ["ALL YEARS, 2023 TO 2035", ["ysun", "yearth", "shadow", "temp"]], ["BLENDED WITH YOUR WEIGHTS", ["mix"]]];
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

export function createScanPanel({ getContext, onPick, fmt }) {
  const panel = $("scan"), canvas = $("scan-canvas"), ctx = canvas.getContext("2d");
  const tile = document.createElement("canvas"), tctx = tile.getContext("2d");
  // BIG MAP: the panel moves from the middle column to the whole screen area, and back.
  const home = panel.parentElement, wide = document.querySelector(".cols");
  const setBig = (on) => {
    (on ? wide : home).appendChild(panel); panel.classList.toggle("big", on);
    $("scan-big").textContent = on ? "⤡ SMALL MAP" : "⤢ BIG MAP"; $("scan-big").classList.toggle("on", on);
    try { localStorage.setItem("luno-scan-big", on ? "1" : ""); } catch {}
    schedule();
  };
  let st = { metric: "sun", opt: 1, cells: [], grid: null, run: null, key: "", done: 0, total: 0, hover: null, engine: "" };
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
    const key = `${c.site.lat},${c.site.lon},${+c.t0},${JSON.stringify(c.req)},${o.radiusKm},${o.n}`;
    buildSeg($("scan-radius"), opts.map((x, i) => [i, `${x.radiusKm} KM`]), () => st.opt, (v) => { st.opt = v; start(); });
    const polarOk = c.site.lat <= -79.5;                   // the all-years layers exist for the south polar region only
    if (polarOk && !polarMeta()) loadPolar().then(() => schedule()).catch(() => {});
    if (!polarOk && METRICS[st.metric].polar) st.metric = "needs";
    buildMetrics(polarOk);
    $("scan-title").textContent = `AREA SCAN · ${fmt.site(c.site)} · LAND ${fmt.stamp(c.t0)} · ${c.req.days}D MISSION`;
    const res = mapResFor(c.site.lat);
    // Slope depends on the distance it is measured over: the scan's map is coarser than a listed site's own map.
    const slopeNote = () => { const t = c.terrain; return `SLOPES IN THE SCAN ARE MEASURED OVER ${fmtStep(2 * res)}${t?.real && !t.reduced && t.slopeBaseM < 2 * res ? `; THIS SITE'S OWN FIGURE, ${t.slopeDeg.toFixed(1)}° OVER ${fmtStep(t.slopeBaseM)}, COMES FROM A FINER MAP` : ""}. `; };
    const note = () => { $("scan-note").textContent = `SCAN USES THE ${res >= 1000 ? (res / 1000).toFixed(1) + " KM" : res + " M"} LOLA MAP, ONE CHECK EVERY ${fmtStep(2 * o.radiusKm * 1000 / (o.n - 1))}. PRESET SITES USE FINER MAPS, SO THEIR NUMBERS CAN DIFFER A LITTLE. ${slopeNote()}${st.engine}`; };
    note();
    if (key === st.key) return draw();
    st.run?.cancel();
    if (!st.moving) st.under = null;                       // a backdrop only makes sense right after a move
    st.moving = false;
    st.key = key; st.cells = new Array(o.n * o.n).fill(null); st.done = 0; st.total = o.n * o.n; st.hover = null; st.took = ""; st.onChip = !!chip;
    const t00 = performance.now(), secs = () => ((performance.now() - t00) / 1000).toFixed(1);
    const common = { site: c.site, radiusKm: o.radiusKm, n: o.n, t0: c.t0, req: c.req,
      onCell: (p, r, done, total) => { if (r) st.cells[p.r * o.n + p.k] = { ...p, ...r }; st.done = done; st.total = total; schedule(); } };
    if (chip) {
      let check = "";
      st.engine = "SKYLINES: ON THE GRAPHICS CHIP.";
      st.run = runScanGpu({ ...common, gpu: chip,
        onCheck: (diff) => { check = ` CHECKED AGAINST THE PROCESSOR AT THE SITE: SAME SKYLINE WITHIN ${diff < 0.001 ? "0.001" : diff.toFixed(3)}°.`; st.engine = `SKYLINES: ON THE GRAPHICS CHIP.${check}`; note(); },
        onDone: () => { st.took = secs(); st.under = null; note(); draw(); },
        onFail: (why) => { console.warn("GPU scan dropped:", why); gpu = null; st.key = ""; st.engine = ""; start(); } });      // back to the processor, for good
    } else {
      st.engine = "SKYLINES: ON THE PROCESSOR.";
      st.run = runScan({ ...common, onDone: () => { st.took = secs(); st.under = null; draw(); } });
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
    const n = st.grid.n, box = canvas.parentElement;
    const size = Math.max(160, Math.floor(Math.min(box.clientWidth, box.clientHeight))), dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.width = canvas.style.height = size + "px";
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
    if (st.hover && !A) { const m = Math.max(cw, 9); ctx.strokeStyle = "#5ac8ff"; ctx.lineWidth = 2; ctx.strokeRect((st.hover.k + 0.5) * cw - m / 2 + 1, (st.hover.r + 0.5) * cw - m / 2 + 1, m - 2, m - 2); }

    // side readouts
    const finished = st.done === st.total;
    $("scan-progress").textContent = finished ? `${st.total.toLocaleString("en-US")} POINTS CHECKED${st.took ? " IN " + st.took + " S" : ""}` : `SCANNING ${st.done.toLocaleString("en-US")} / ${st.total.toLocaleString("en-US")}`;
    $("scan-engine").textContent = st.onChip ? `COMPUTED ON THE GRAPHICS CHIP (GPU)${chipName() ? ": " + chipName() : ""}` : "COMPUTED ON THE PROCESSOR";
    $("scan-progress").className = finished ? "ok" : "";
    const sq = st.grid.stepM / 1000, sqTxt = `${+sq.toFixed(2)} KM`;
    $("scan-scale").innerHTML = `<b>EACH SQUARE = ${sqTxt} × ${sqTxt} OF GROUND</b><br>MAP IS ${st.grid.radiusKm * 2} KM ACROSS · NORTH UP · ${LANDER_SVG} = WHERE YOU ARE NOW · ★ = BEST POINT`;
    $("scan-legend").classList.toggle("flat", !m.ramp);
    $("scan-legend").classList.toggle("lay", !!m.rgb);
    $("scan-legend").innerHTML = m.lay ? legendHtml(layer(m.lay)) + `<div class="scan-src">${m.lay === "mix" ? "YOUR MIX = " + mixText() + ". CHANGE THE WEIGHTS ON THE MOON MAP SCREEN. " : ""}${layer(m.lay).source}</div>`
      : m.rgb ? `<div class="lay-legend"><i style="background:linear-gradient(90deg,${[0, 0.25, 0.5, 0.75, 1].map((t) => `rgb(${elevColor(t)})`).join(",")})"></i><div class="ends"><span>◀ ${Math.round(span.lo).toLocaleString("en-US")} M<br>LOWEST HERE</span><span>${Math.round(span.hi).toLocaleString("en-US")} M ▶<br>HIGHEST HERE</span></div></div><div class="scan-src">${layer("elev").source}</div>`
      : m.ramp
      ? `<i style="background:linear-gradient(90deg,${[0, 50, 100].map((v) => `rgb(${rampColor(m.ramp, v)})`).join(",")})"></i><span>0%</span><span>${m.unit}</span><span>100%</span><div class="ends"><span>◀ ${m.ends[0]}</span><span>${m.ends[1]} ▶</span></div>`
      : `<b style="background:#21e07a"></b> MEETS THE MISSION NEEDS &nbsp; <b style="background:#460e0e"></b> DOES NOT`;
    const cellText = (c) => `${c.eastKm >= 0 ? "E" : "W"} ${Math.abs(c.eastKm).toFixed(2)} KM · ${c.northKm >= 0 ? "N" : "S"} ${Math.abs(c.northKm).toFixed(2)} KM<br>${fmt.lat(c.lat)} ${fmt.lon(c.lon)} · ELEV ${Math.round(c.heightM).toLocaleString("en-US")} M${c.slopeDeg == null ? "" : ` · SLOPE ${c.slopeDeg.toFixed(0)}°`}<br>SUN ${Math.round(c.sunPct)}% · EARTH ${Math.round(c.earthPct)}% · <span class="${c.ok ? "ok" : "bad"}">${c.ok ? "GO" : "NO-GO"}</span>${c.ok ? `<br>SUNLIGHT TO SPARE: ${c.marginHours >= 72 ? "3 DAYS OR MORE" : Math.max(0, Math.round(c.marginHours)) + " H"}` : "<br>" + c.reason}`;
    const cur = st.cells[center.r * n + center.k];
    $("scan-here").innerHTML = cur ? cellText(cur) : "…";
    const far = best && away(best);
    $("scan-best").innerHTML = !finished ? "…" : !best ? `<b class="dist bad">NO POINT IN THIS AREA MEETS THE MISSION NEEDS AT THIS LANDING TIME</b><br><b class="h-do">TRY A BIGGER SCAN SIZE</b>, OR CLOSE THE SCAN AND PRESS <b class="h-do">NEXT GOOD TIME</b>` : (best.r === center.r && best.k === center.k ? `<b class="dist">YOU ARE ALREADY AT THE BEST POINT IN THIS AREA</b><br>` : `<b class="dist">${far[0]} KM AWAY, TO THE ${far[1]}</b><br>`) + cellText(best);
    if (finished && best && st.rank === "mix" && polarOkNow) { const v = cellMix(best); if (v != null) $("scan-best").insertAdjacentHTML("beforeend", `<br><b class="h-do">PICKED BY YOUR MIX</b>: ${Math.round(v)} OF 100 (${mixText()})`); }
    const canMove = finished && best && !(best.r === center.r && best.k === center.k);
    $("scan-go-best").disabled = !canMove;
    // Data profile: every layer at one point (the point under the pointer, else where you are now), each marked good or bad.
    const pc = st.hover || cur;
    $("scan-prof-of").textContent = st.hover ? "THE POINT UNDER THE POINTER" : "WHERE YOU ARE NOW";
    $("scan-hover").innerHTML = !pc ? "…" : (st.hover ? `${away(pc)[0]} KM FROM WHERE YOU ARE · ` : "") + `${fmt.lat(pc.lat)} ${fmt.lon(pc.lon)}` + profileHtml(cellProfile(pc, span, polarOkNow))
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
  function cellProfile(c, span, polarOk) {
    const row = (label, text, score, share, rgb, note = "") => ({ label, text, score, share: Math.max(0, Math.min(1, share)), rgb: rgb || goodColor(score ?? 0.5), note });
    const rows = [
      row("MEETS THE NEEDS", c.ok ? "YES" : "NO", c.ok ? 1 : 0, 1),
      row("MISSION SUNLIGHT", `${Math.round(c.sunPct)}%`, c.sunPct / 100, c.sunPct / 100),
      row("MISSION EARTH LINK", `${Math.round(c.earthPct)}%`, c.earthPct / 100, c.earthPct / 100),
      c.slopeDeg == null ? { label: "SLOPE", text: null, note: "NO DATA" } : row("SLOPE", `${c.slopeDeg.toFixed(1)}°`, 1 - Math.min(1, c.slopeDeg / 20), c.slopeDeg / 20),
      row("ELEVATION", `${Math.round(c.heightM).toLocaleString("en-US")} M`, null, (c.heightM - span.lo) / Math.max(1, span.hi - span.lo), elevColor((c.heightM - span.lo) / Math.max(1, span.hi - span.lo))),
    ];
    if (polarOk && polarMeta()) {
      const s = polarValue("sun", c.lat, c.lon), e = polarValue("earth", c.lat, c.lon), sh = polarValue("shadow", c.lat, c.lon);
      rows.push(s == null ? { label: "SUNLIGHT 2023–35", text: null, note: "OUTSIDE 80°S" } : row("SUNLIGHT 2023–35", `${Math.round(s)}%`, s / 100, s / 100),
                e == null ? { label: "EARTH LINK 2023–35", text: null, note: "OUTSIDE 80°S" } : row("EARTH LINK 2023–35", `${Math.round(e)}%`, e / 100, e / 100),
                sh == null ? { label: "PERMANENT SHADOW", text: null, note: "OUTSIDE 80°S" } : row("PERMANENT SHADOW", sh ? "YES" : "NO", sh ? 0 : 1, 1, sh ? SHADOW_COLOR : null));
      const t = polarValue("temp", c.lat, c.lon), mx = cellMix(c), T = layer("temp");
      if (t != null) rows.push(row("TEMPERATURE, AVERAGE", T.text(t), null, (t - T.lo) / (T.hi - T.lo), T.color(t)));
      if (mx != null) rows.push(row("YOUR MIX", `${Math.round(mx)} OF 100`, mx / 100, mx / 100));
    }
    return rows;
  }
  // SHOW buttons, in three groups; the all-years group only where its data exists.
  function buildMetrics(polarOk) {
    polarOkNow = polarOk;
    const box = $("scan-metric"); box.replaceChildren();
    for (const [title, ids] of GROUPS) {
      if (METRICS[ids[0]].polar && !polarOk) continue;
      const g = document.createElement("div"); g.className = "scan-mgroup"; g.innerHTML = `<span>${title}</span><div class="seg"></div>`;
      for (const id of ids) {
        const b = document.createElement("button"); b.textContent = METRICS[id].label; b.dataset.m = id; b.classList.toggle("on", st.metric === id);
        b.addEventListener("click", () => { st.metric = id; box.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.m === id)); draw(); });
        g.lastChild.appendChild(b);
      }
      box.appendChild(g);
    }
    if (polarOk) {      // who picks the best point
      const g = document.createElement("div"); g.className = "scan-mgroup"; g.innerHTML = `<span>★ BEST POINT IS PICKED BY</span><div class="seg"></div>`;
      for (const [id, label] of [["luni", "SUNLIGHT TO SPARE"], ["mix", "YOUR MIX"]]) {
        const b = document.createElement("button"); b.textContent = label; b.classList.toggle("on", (st.rank || "luni") === id);
        b.addEventListener("click", () => { st.rank = id; [...g.lastChild.children].forEach((x) => x.classList.toggle("on", x === b)); draw(); });
        g.lastChild.appendChild(b);
      }
      box.appendChild(g);
    }
  }

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
  $("scan-big").addEventListener("click", () => setBig(!panel.classList.contains("big")));
  try { if (localStorage.getItem("luno-scan-big")) setBig(true); } catch {}
  new ResizeObserver(() => schedule()).observe(canvas.parentElement);

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
      onPick(+c.lat.toFixed(4), +c.lon.toFixed(4));
    };
    requestAnimationFrame(step);
  }
  function toggle(show = panel.hidden) {
    panel.hidden = !show;
    $("scan-btn").classList.toggle("on", show);
    if (!show) { st.anim = null; st.under = null; }
    if (show) start(); else st.run?.cancel(), (st.done < st.total && (st.key = ""));
  }
  return { toggle, isOpen: () => !panel.hidden, refresh: () => { if (!panel.hidden) start(); },
           // From the MOON MAP: show the scan colored by the mix, with the best point picked by the mix.
           useMix() { st.metric = "mix"; st.rank = "mix"; if (panel.hidden) toggle(true); else start(); } };
}
