// Area-scan panel: a north-up heat map of the ground around the site for the current landing time and needs.
import { runScan } from "./scan.js";
import { scanOptions, bestCell } from "./scan-core.js";
import { mapResFor } from "./terrain.js";

const $ = (id) => document.getElementById(id);
const METRICS = {
  sun:   { label: "SUNLIGHT", unit: "% OF MISSION IN SUNLIGHT", value: (c) => c.sunPct, ramp: [[18, 12, 2], [255, 176, 0], [255, 244, 200]] },
  earth: { label: "EARTH LINK", unit: "% OF MISSION WITH EARTH IN VIEW", value: (c) => c.earthPct, ramp: [[4, 14, 22], [40, 130, 190], [190, 235, 255]] },
  needs: { label: "MEETS NEEDS", unit: "", value: (c) => (c.ok ? 100 : 0), ramp: null },
};
const lerp = (a, b, t) => a + (b - a) * t;
function rampColor(ramp, v) {            // v in 0..100
  const t = Math.max(0, Math.min(1, v / 100)), k = t < 0.5 ? 0 : 1, f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  return ramp[k].map((x, i) => Math.round(lerp(x, ramp[k + 1][i], f)));
}

export function createScanPanel({ getContext, onPick, fmt }) {
  const panel = $("scan"), canvas = $("scan-canvas"), ctx = canvas.getContext("2d");
  let st = { metric: "sun", opt: 1, cells: [], grid: null, run: null, key: "", done: 0, total: 0, hover: null };

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
    const c = getContext(), opts = scanOptions(c.site.lat), o = opts[st.opt];
    const key = `${c.site.lat},${c.site.lon},${+c.t0},${JSON.stringify(c.req)},${o.radiusKm}`;
    buildSeg($("scan-radius"), opts.map((x, i) => [i, `${x.radiusKm} KM`]), () => st.opt, (v) => { st.opt = v; start(); });
    $("scan-title").textContent = `AREA SCAN · ${fmt.site(c.site)} · LAND ${fmt.stamp(c.t0)} · ${c.req.days}D MISSION`;
    const res = mapResFor(c.site.lat);
    $("scan-note").textContent = `SCAN USES THE ${res >= 1000 ? (res / 1000).toFixed(1) + " KM" : res + " M"} LOLA MAP, ONE CHECK EVERY ${fmtStep(2 * o.radiusKm * 1000 / (o.n - 1))}. PRESET SITES USE FINER MAPS, SO THEIR NUMBERS CAN DIFFER A LITTLE.`;
    if (key === st.key) return draw();
    st.run?.cancel();
    st.key = key; st.cells = new Array(o.n * o.n).fill(null); st.done = 0; st.total = o.n * o.n; st.hover = null;
    st.run = runScan({ site: c.site, radiusKm: o.radiusKm, n: o.n, t0: c.t0, req: c.req,
      onCell: (p, r, done, total) => { if (r) st.cells[p.r * o.n + p.k] = { ...p, ...r }; st.done = done; st.total = total; schedule(); },
      onDone: () => draw() });
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

    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) {
      const c = st.cells[r * n + k]; if (!c) continue;
      let rgb = m.ramp ? rampColor(m.ramp, m.value(c)) : c.ok ? [33, 224, 122] : [70, 14, 14];
      // light hill shading from the neighbors' heights, so ridges and crater walls show through the colors
      const w = H(r, k - 1) ?? c.heightM, e = H(r, k + 1) ?? c.heightM, no = H(r - 1, k) ?? c.heightM, so = H(r + 1, k) ?? c.heightM;
      const shade = Math.max(0.72, Math.min(1.18, 1 + ((w - e) + (no - so)) / (st.grid.stepM * 1.6)));
      ctx.fillStyle = `rgb(${rgb.map((x) => Math.min(255, Math.round(x * shade))).join(",")})`;
      ctx.fillRect(k * cw, r * cw, cw + 0.5, cw + 0.5);
    }
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1;
    for (let i = 1; i < n; i++) { ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, size); ctx.moveTo(0, i * cw); ctx.lineTo(size, i * cw); ctx.stroke(); }

    const mark = (c, color, star) => {
      const x = (c.k + 0.5) * cw, y = (c.r + 0.5) * cw;
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      if (star) { ctx.strokeRect(c.k * cw + 1, c.r * cw + 1, cw - 2, cw - 2); ctx.fillStyle = color; ctx.font = `700 ${Math.max(10, cw * 0.7)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("★", x, y + 1); }
      else { ctx.beginPath(); ctx.moveTo(x - cw * 0.8, y); ctx.lineTo(x + cw * 0.8, y); ctx.moveTo(x, y - cw * 0.8); ctx.lineTo(x, y + cw * 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, cw * 0.45, 0, 7); ctx.stroke(); }
    };
    const center = { r: (n - 1) / 2, k: (n - 1) / 2 }, best = bestCell(st.cells);
    if (best && st.done === st.total) mark(best, "#000", true), mark(best, "#fff", true);
    mark(center, "#fff", false);
    if (st.hover) { ctx.strokeStyle = "#5ac8ff"; ctx.lineWidth = 2; ctx.strokeRect(st.hover.k * cw + 1, st.hover.r * cw + 1, cw - 2, cw - 2); }

    // side readouts
    const finished = st.done === st.total;
    $("scan-progress").textContent = finished ? `${st.total} POINTS CHECKED` : `SCANNING ${st.done}/${st.total}`;
    $("scan-progress").className = finished ? "ok" : "";
    $("scan-scale").textContent = `${st.grid.radiusKm * 2} KM ACROSS · NORTH UP · ✛ = CURRENT SITE · ★ = BEST`;
    $("scan-legend").classList.toggle("flat", !m.ramp);
    $("scan-legend").innerHTML = m.ramp
      ? `<i style="background:linear-gradient(90deg,${[0, 50, 100].map((v) => `rgb(${rampColor(m.ramp, v)})`).join(",")})"></i><span>0%</span><span>${m.unit}</span><span>100%</span>`
      : `<b style="background:#21e07a"></b> MEETS THE MISSION NEEDS &nbsp; <b style="background:#460e0e"></b> DOES NOT`;
    const cellText = (c) => `${c.eastKm >= 0 ? "E" : "W"} ${Math.abs(c.eastKm).toFixed(2)} KM · ${c.northKm >= 0 ? "N" : "S"} ${Math.abs(c.northKm).toFixed(2)} KM<br>${fmt.lat(c.lat)} ${fmt.lon(c.lon)} · ELEV ${Math.round(c.heightM).toLocaleString("en-US")} M<br>SUN ${Math.round(c.sunPct)}% · EARTH ${Math.round(c.earthPct)}% · <span class="${c.ok ? "ok" : "bad"}">${c.ok ? "GO" : "NO-GO"}</span>${c.ok ? "" : "<br>" + c.reason}`;
    const cur = st.cells[center.r * n + center.k];
    $("scan-here").innerHTML = cur ? cellText(cur) : "…";
    $("scan-best").innerHTML = finished && best ? cellText(best) : "…";
    $("scan-go-best").disabled = !(finished && best && !(best.r === center.r && best.k === center.k));
    $("scan-hover").innerHTML = st.hover ? cellText(st.hover) + "<br>CLICK TO MOVE THE SITE HERE" : "MOVE OVER THE MAP TO INSPECT A POINT. CLICK TO MOVE THE SITE THERE.";
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
  $("scan-go-best").addEventListener("click", () => { const b = bestCell(st.cells); if (b) pick(b); });
  $("scan-close").addEventListener("click", () => toggle(false));
  buildSeg($("scan-metric"), Object.entries(METRICS).map(([k, v]) => [k, v.label]), () => st.metric, (v) => { st.metric = v; draw(); });
  new ResizeObserver(() => schedule()).observe(canvas.parentElement);

  function pick(c) { toggle(false); onPick(+c.lat.toFixed(4), +c.lon.toFixed(4)); }
  function toggle(show = panel.hidden) {
    panel.hidden = !show;
    $("scan-btn").classList.toggle("on", show);
    if (show) start(); else st.run?.cancel(), (st.done < st.total && (st.key = ""));
  }
  return { toggle, isOpen: () => !panel.hidden, refresh: () => { if (!panel.hidden) start(); } };
}
