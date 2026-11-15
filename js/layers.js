// Map layers: what each one shows, where its data comes from, how a value is colored, and whether it is good or bad
// for a lander. One definition, used by the MOON MAP screen, the scan map and the data profile card.
//   elevation, slope            from the reduced LOLA elevation maps LUNI already carries (data/dem), whole Moon
//   sunlight, Earth, shadow     from data/layers (tools/build_layers.py: LOLA skylines against SPICE positions,
//                               every 6 hours over 2023 to 2035), south of 80S only
import { getGrid, mapsFor, slopeAt } from "./terrain.js";
import { fetchBytes, gunzip } from "./bin.js";

const DEG = Math.PI / 180, R = 1737400;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
function ramp(stops, t) {
  const f = clamp01(t) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), k = f - i;
  return [0, 1, 2].map((c) => Math.round(stops[i][c] + (stops[i + 1][c] - stops[i][c]) * k));
}
export const GOOD_RAMP = [[176, 22, 36], [242, 196, 40], [34, 208, 112]];      // bad, fair, good
const ELEV_RAMP = [[24, 34, 120], [36, 132, 176], [110, 170, 120], [214, 180, 110], [252, 246, 236]];
export const goodColor = (score) => ramp(GOOD_RAMP, score);
export const elevColor = (t) => ramp(ELEV_RAMP, t);         // t = 0 (lowest) .. 1 (highest)
export const SHADOW_COLOR = [140, 84, 255];
const SHADOW_RGB = [140, 84, 255];
const num = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v)).toLocaleString("en-US")}`;

// score(v): 0 (bad for a solar-powered lander that talks straight to Earth) to 1 (good); null = neither.
export const LAYERS = [
  { id: "elev", label: "ELEVATION", where: "WHOLE MOON", polar: false, lo: -8000, hi: 8000,
    color: (v) => ramp(ELEV_RAMP, (v + 8000) / 16000), score: null, text: (v) => `${num(v)} M`,
    ends: ["LOW GROUND", "HIGH GROUND"], scale: ["−8,000 M", "+8,000 M"],
    meaning: "NEITHER GOOD NOR BAD BY ITSELF. HIGH GROUND USUALLY SEES MORE OF THE SUN AND OF EARTH.",
    source: "NASA LRO LOLA LASER ALTIMETER: GRIDDED ELEVATION MAPS FROM THE NASA PDS GEOSCIENCES NODE. HEIGHTS ARE ABOVE A SPHERE OF 1,737.4 KM." },
  { id: "slope", label: "SLOPE", where: "WHOLE MOON", polar: false, lo: 0, hi: 20,
    color: (v) => goodColor(1 - v / 20), score: (v) => 1 - clamp01(v / 20), text: (v) => `${v.toFixed(1)}°`,
    ends: ["STEEP = BAD", "FLAT = GOOD"], scale: ["20° OR MORE", "0°"],
    meaning: "FLAT GROUND IS SAFER TO LAND ON. THE COLORS RUN FROM 0° (GREEN) TO 20° AND MORE (RED): A SCALE FOR THE EYE, NOT A SAFETY LIMIT.",
    source: "WORKED OUT BY LUNI FROM THE NASA LRO LOLA ELEVATION MAPS, ACROSS TWO MAP PIXELS: 480 M NEAR THE SOUTH POLE, 7.6 KM ON THE WHOLE-MOON MAP." },
  { id: "sun", label: "SUNLIGHT", where: "SOUTH POLE", polar: true, lo: 0, hi: 100,
    color: (v) => goodColor(v / 100), score: (v) => v / 100, text: (v) => `${Math.round(v)}% OF THE TIME`, card: "SUNLIGHT 2023–35", brief: (v) => `${Math.round(v)}%`,
    ends: ["RARELY SUNLIT = BAD", "MOSTLY SUNLIT = GOOD"], scale: ["0%", "100%"],
    meaning: "HOW MUCH OF THE TIME A SOLAR PANEL HERE WOULD HAVE THE SUN, COUNTED OVER ALL OF 2023 TO 2035. ONE MAP SQUARE IS 480 M: THE BEST-LIT RIDGE TOPS ARE NARROWER, SO THEY READ LOWER HERE THAN ON THE MAIN SCREEN (SHACKLETON RIDGE: 63% HERE, 79% THERE).",
    source: "WORKED OUT BY LUNI: THE SUN'S POSITION (NASA NAIF SPICE, DE440) AGAINST THE SKYLINE FROM NASA LRO LOLA ELEVATION, EVERY 6 HOURS FROM 2023 TO 2035, 2 M ABOVE THE GROUND." },
  { id: "earth", label: "EARTH LINK", where: "SOUTH POLE", polar: true, lo: 0, hi: 100,
    color: (v) => goodColor(v / 100), score: (v) => v / 100, text: (v) => `${Math.round(v)}% OF THE TIME`, card: "EARTH LINK 2023–35", brief: (v) => `${Math.round(v)}%`,
    ends: ["EARTH RARELY IN VIEW = BAD", "EARTH MOSTLY IN VIEW = GOOD"], scale: ["0%", "100%"],
    meaning: "HOW MUCH OF THE TIME EARTH IS ABOVE THE SKYLINE, SO A LANDER CAN TALK TO IT DIRECTLY, COUNTED OVER ALL OF 2023 TO 2035.",
    source: "WORKED OUT BY LUNI: EARTH'S POSITION (NASA NAIF SPICE, DE440) AGAINST THE SKYLINE FROM NASA LRO LOLA ELEVATION, EVERY 6 HOURS FROM 2023 TO 2035." },
  { id: "shadow", label: "PERMANENT SHADOW", short: "SHADOW", where: "SOUTH POLE", polar: true, binary: true,
    color: (v) => (v ? SHADOW_RGB : null), score: (v) => (v ? 0 : 1), text: (v) => (v ? "YES: NEVER SUNLIT" : "NO: SUNLIT AT TIMES"), brief: (v) => (v ? "YES" : "NO"),
    ends: ["", "PURPLE = NEVER ANY SUNLIGHT"], scale: ["", ""],
    meaning: "NO SOLAR POWER HERE AT ANY TIME. MISSIONS STILL WANT TO LAND NEAR THESE PLACES, BECAUSE WATER ICE CAN LAST IN THEM.",
    source: "WORKED OUT BY LUNI: PLACES WHERE NO PART OF THE SUN'S DISC CLEARS THE SKYLINE (NASA LRO LOLA ELEVATION) AT ANY CHECKED MOMENT FROM 2023 TO 2035 (NASA NAIF SPICE). THE MOON'S FULL 18.6-YEAR CYCLE IS NOT COVERED." },
];
export const layer = (id) => LAYERS.find((l) => l.id === id);

// ---------- the south polar layers ----------
let polar = null, polarLoading = null;
export function loadPolar(base = "data/layers/") {
  return (polarLoading ||= (async () => {
    const meta = (await fetch(base + "index.json").then((r) => r.json())).sp, out = { ...meta };
    await Promise.all(Object.entries(meta.files).map(async ([k, f]) => { out[k] = new Uint8Array(await gunzip(await fetchBytes(base + f))); }));
    return (polar = out);
  })());
}
export function setPolar(p) { polar = p; polarLoading = Promise.resolve(p); }      // for tests
export const polarMeta = () => polar;

// Value of a south polar layer at a point: percent for sun / earth, 0 or 1 for shadow; null outside the region.
export function polarValue(id, lat, lon) {
  if (!polar || lat > polar.min_lat) return null;
  const r = 2 * R * Math.tan((90 + lat) * DEG / 2), c = (polar.n - 1) / 2;
  const col = Math.round(c + r * Math.sin(lon * DEG) / polar.scale_m), row = Math.round(c - r * Math.cos(lon * DEG) / polar.scale_m);
  if (col < 0 || row < 0 || col >= polar.n || row >= polar.n) return null;
  const v = polar[id][row * polar.n + col];
  return v === 255 ? null : id === "shadow" ? v : v / 2;
}

// ---------- the data profile of one point ----------
// Every layer's value at (lat, lon): [{ id, label, text, score, rgb, note }]. Layers with no data there are listed
// with text = null, so the card can say so instead of leaving a gap.
export async function profileAt(lat, lon) {
  const [near, far] = mapsFor(lat), best = await getGrid(near || far);
  let h = best.height(lat, lon), slope = slopeAt(best, lat, lon);
  if (!Number.isFinite(h)) { const g = await getGrid(far); h = g.height(lat, lon); slope = slopeAt(g, lat, lon); }
  if (lat <= -79.5) await loadPolar().catch(() => null);
  const base = 2 * best.res;
  return LAYERS.map((L) => {
    const v = L.id === "elev" ? (Number.isFinite(h) ? h : null) : L.id === "slope" ? slope : polarValue(L.id, lat, lon);
    if (v == null) return { id: L.id, label: L.card || L.label, text: null, score: null, rgb: null, note: L.polar ? "SOUTH OF 80°S ONLY" : "NO DATA" };
    const score = L.score ? L.score(v) : null;
    return { id: L.id, label: L.id === "slope" ? `SLOPE OVER ${base >= 1000 ? (base / 1000).toFixed(1) + " KM" : base + " M"}` : L.card || L.label, value: v, text: (L.brief || L.text)(v), score, rgb: L.id === "shadow" ? (v ? SHADOW_RGB : GOOD_RAMP[2]) : L.color(v),
             share: L.binary ? 1 : clamp01((v - L.lo) / (L.hi - L.lo)), note: "" };
  });
}

// The card: one row per layer, a bar in the layer's own color, the number, and a GOOD / FAIR / BAD word where the layer has a say.
export const verdictWord = (score) => (score == null ? "" : score >= 0.67 ? "GOOD" : score >= 0.34 ? "FAIR" : "BAD");
export function profileHtml(rows) {
  return `<div class="prof">` + rows.map((r) => r.text == null
    ? `<div class="prof-row none"><span>${r.label}</span><i></i><b>${r.note}</b><em></em></div>`
    : `<div class="prof-row"><span>${r.label}</span><i><u style="width:${Math.round(r.share * 100)}%;background:rgb(${r.rgb})"></u></i><b>${r.text}${r.note ? ` <small>${r.note}</small>` : ""}</b><em style="color:rgb(${r.score == null ? "150,160,175" : goodColor(r.score)})">${verdictWord(r.score) || "—"}</em></div>`).join("") + `</div>`;
}

// ---------- pictures for the 3D Moon ----------
// Whole Moon, as a flat picture with longitude -180..180 left to right and north at the top (elevation or slope).
export async function globalCanvas(id) {
  const g = await getGrid("global"), W = g.cols, H = g.rows, L = layer(id), cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(W, H), px = img.data, d = g.data, q = g.quant_m, pxM = R * DEG / g.ppd;
  for (let r = 0; r < H; r++) {
    const rn = Math.max(0, r - 1), rs = Math.min(H - 1, r + 1), cosLat = Math.max(0.02, Math.cos((90 - (r + 0.5) / g.ppd) * DEG));
    for (let c = 0; c < W; c++) {
      let v;
      if (id === "elev") v = d[r * W + c] * q;
      else {
        const cw = (c + W - 1) % W, ce = (c + 1) % W;
        v = Math.atan(Math.hypot((d[r * W + ce] - d[r * W + cw]) * q / (2 * pxM * cosLat), (d[rn * W + c] - d[rs * W + c]) * q / ((rs - rn) * pxM))) / DEG;
      }
      const rgb = L.color(v), o = (r * W + (c + W / 2) % W) * 4;      // the grid starts at longitude 0; the picture is centered on it
      px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// South polar region (south of 80S), north-up polar picture with the pole in the middle: any layer.
export async function polarCanvas(id) {
  const P = await loadPolar(), n = P.n, L = layer(id), cv = document.createElement("canvas");
  cv.width = cv.height = n;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(n, n), px = img.data, c = (n - 1) / 2;
  let fine = null, pr = 0, pc = 0, k = 1;
  if (!L.polar) { fine = await getGrid("sp_cap"); pr = (fine.rows - 1) / 2; pc = (fine.cols - 1) / 2; k = P.scale_m / fine.scale_m; }
  const hAt = (row, col) => fine.sample(pr + (row - c) * k, pc + (col - c) * k);
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
    const i = row * n + col;
    if (P.sun[i] === 255) continue;                        // outside the region: see-through
    let v;
    if (id === "elev") v = hAt(row, col);
    else if (id === "slope") v = Math.atan(Math.hypot(hAt(row, col + 0.5) - hAt(row, col - 0.5), hAt(row - 0.5, col) - hAt(row + 0.5, col)) / P.scale_m) / DEG;
    else v = id === "shadow" ? P.shadow[i] : P[id][i] / 2;
    const rgb = Number.isFinite(v) ? L.color(v) : null;
    if (!rgb) continue;
    px[i * 4] = rgb[0]; px[i * 4 + 1] = rgb[1]; px[i * 4 + 2] = rgb[2]; px[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: cv, minLat: P.min_lat, n, scaleM: P.scale_m };
}

// The legend strip for a layer, as HTML.
export function legendHtml(L) {
  if (L.binary) return `<div class="lay-legend flat"><b style="background:rgb(${SHADOW_RGB})"></b> ${L.ends[1]}</div>`;
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => `rgb(${L.color(L.lo + (L.hi - L.lo) * t)})`);
  const flip = L.id === "slope";                           // slope reads bad to good from right to left; show it good on the right like the others
  return `<div class="lay-legend"><i style="background:linear-gradient(90deg,${(flip ? stops.reverse() : stops).join(",")})"></i>
    <div class="ends"><span>◀ ${L.scale[0]}<br>${L.ends[0]}</span><span>${L.scale[1]} ▶<br>${L.ends[1]}</span></div></div>`;
}
