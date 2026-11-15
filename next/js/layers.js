// Map layers: what each one shows, where its data comes from, how a value is colored, and whether it is good or bad
// for a lander. One definition, used by the MOON MAP screen, the scan map and the data profile card.
//   elevation, slope            from the reduced LOLA elevation maps LUNI already carries (data/dem), whole Moon
//   sunlight, Earth, shadow     from data/layers (tools/build_layers.py and build_layers_global.py: LOLA skylines against
//                               SPICE positions over 2023 to 2035): fine at both poles, coarse for the whole Moon
//   temperature                 NASA Diviner values, re-gridded (tools/build_temperature*.py)
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
const TEMP_RAMP = [[18, 10, 60], [44, 60, 190], [120, 60, 190], [226, 80, 80], [250, 190, 70], [255, 250, 220]];
const celsius = (k) => { const c = Math.round(k - 273.15); return `${c < 0 ? "−" : "+"}${Math.abs(c)} °C`; };
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
    source: "CALCULATED BY LUNI FROM THE NASA LRO LOLA ELEVATION MAPS, ACROSS TWO MAP PIXELS: 480 M POLEWARD OF 80°, 7.6 KM ON THE WHOLE-MOON MAP." },
  { id: "sun", label: "SUNLIGHT", where: "WHOLE MOON", polar: true, lo: 0, hi: 100,
    color: (v) => goodColor(v / 100), score: (v) => v / 100, text: (v) => `${Math.round(v)}% OF THE TIME`, card: "SUNLIGHT 2023–35", brief: (v) => `${Math.round(v)}%`,
    ends: ["RARELY SUNLIT = BAD", "MOSTLY SUNLIT = GOOD"], scale: ["0%", "100%"],
    meaning: "HOW MUCH OF THE TIME A SOLAR PANEL HERE WOULD HAVE THE SUN, COUNTED OVER ALL OF 2023 TO 2035. AWAY FROM THE POLES IT IS CLOSE TO HALF THE TIME EVERYWHERE; NEAR THE POLES IT RUNS FROM NEVER TO ALMOST ALWAYS. THE BEST-LIT RIDGE TOPS ARE NARROWER THAN A MAP SQUARE, SO THEY READ LOWER HERE THAN ON THE MAIN SCREEN (SHACKLETON RIDGE: 63% HERE, 79% THERE).",
    source: "CALCULATED BY LUNI: THE SUN'S POSITION (NASA NAIF SPICE, DE440) AGAINST THE SKYLINE FROM NASA LRO LOLA ELEVATION, 2023 TO 2035, 2 M ABOVE THE GROUND. POLEWARD OF 80°: 480 M SQUARES FROM THE 240 M MAP, CHECKED EVERY 6 HOURS. ELSEWHERE: QUARTER-DEGREE SQUARES (ABOUT 7.6 KM) FROM THE 1.9 KM MAP, EVERY 12 HOURS." },
  { id: "earth", label: "EARTH LINK", where: "WHOLE MOON", polar: true, lo: 0, hi: 100,
    color: (v) => goodColor(v / 100), score: (v) => v / 100, text: (v) => `${Math.round(v)}% OF THE TIME`, card: "EARTH LINK 2023–35", brief: (v) => `${Math.round(v)}%`,
    ends: ["EARTH RARELY IN VIEW = BAD", "EARTH MOSTLY IN VIEW = GOOD"], scale: ["0%", "100%"],
    meaning: "HOW MUCH OF THE TIME EARTH IS ABOVE THE SKYLINE, SO A LANDER CAN TALK TO IT DIRECTLY, COUNTED OVER ALL OF 2023 TO 2035. THE NEAR SIDE ALWAYS SEES EARTH AND THE FAR SIDE NEVER DOES; IN BETWEEN, AND AT THE POLES, IT COMES AND GOES.",
    source: "CALCULATED BY LUNI: EARTH'S POSITION (NASA NAIF SPICE, DE440) AGAINST THE SKYLINE FROM NASA LRO LOLA ELEVATION, 2023 TO 2035. POLEWARD OF 80°: 480 M SQUARES, EVERY 6 HOURS. ELSEWHERE: QUARTER-DEGREE SQUARES (ABOUT 7.6 KM), EVERY 12 HOURS." },
  { id: "shadow", label: "PERMANENT SHADOW", short: "NEVER SUNLIT", where: "BOTH POLES", polar: true, binary: true, capsOnly: true,
    color: (v) => (v ? SHADOW_RGB : null), score: (v) => (v ? 0 : 1), text: (v) => (v ? "YES: NEVER SUNLIT" : "NO: SUNLIT AT TIMES"), brief: (v) => (v ? "YES, ALWAYS" : "NO"),
    ends: ["", "PURPLE = NEVER SUNLIT, IN ANY YEAR CHECKED"], scale: ["", ""],
    meaning: "PERMANENT MEANS ALWAYS: THE SUN NEVER REACHES THESE PLACES AT ANY TIME FROM 2023 TO 2035. THAT IS NOT THE SAME AS DARK RIGHT NOW (EVERY PLACE IS DARK FOR PART OF EACH MONTH). NO SOLAR POWER HERE, EVER. MISSIONS STILL WANT TO LAND NEARBY, BECAUSE WATER ICE CAN LAST IN SUCH PLACES.",
    source: "CALCULATED BY LUNI: PLACES WHERE NO PART OF THE SUN'S DISC CLEARS THE SKYLINE (NASA LRO LOLA ELEVATION) AT ANY CHECKED MOMENT FROM 2023 TO 2035 (NASA NAIF SPICE). THE MOON'S FULL 18.6-YEAR CYCLE IS NOT COVERED." },
  { id: "temp", label: "TEMPERATURE", where: "WHOLE MOON", polar: true, lo: 30, hi: 280, card: "TEMPERATURE (AVG)",
    color: (v) => ramp(TEMP_RAMP, (v - 30) / 250), score: null, text: (v) => `${celsius(v)} (${Math.round(v)} K)`, brief: (v) => celsius(v),
    ends: ["COLD", "WARM"], scale: ["−243 °C (30 K)", "+7 °C (280 K)"],
    meaning: "THE GROUND'S AVERAGE TEMPERATURE. THE COLDEST PLACES ARE THE PERMANENT SHADOWS AT THE POLES; COLD IS HARD ON A LANDER AND ITS BATTERIES. THE DATA PROFILE ALSO GIVES THE HOTTEST THE GROUND GETS (ABOUT +120 °C AT THE EQUATOR).",
    source: "NASA'S OWN NUMBERS, ONLY RE-GRIDDED BY LUNI, FROM THE LRO DIVINER RADIOMETER (NASA PDS GEOSCIENCES NODE). POLEWARD OF 80°: POLAR RESOURCE PRODUCT V2.0 (PAIGE ET AL., 2018), ANNUAL AVERAGE AND MAXIMUM FROM THERMAL MODELS FITTED TO THE MEASUREMENTS. ELSEWHERE: GLOBAL CUMULATIVE PRODUCTS V1.0 (WILLIAMS ET AL., 2017), MEASURED TEMPERATURES IN HALF-DEGREE SQUARES (ABOUT 15 KM), AVERAGED OVER THE LUNAR DAY (HOURS WITH NO MEASUREMENT ARE FILLED FROM THE HOURS BEFORE AND AFTER)." },
  // YOUR MIX: the layers above blended with weights you choose (see mixScore).
  { id: "mix", label: "YOUR MIX", where: "WHOLE MOON", polar: true, mix: true, lo: 0, hi: 100,
    color: (v) => goodColor(v / 100), score: (v) => v / 100, text: (v) => `${Math.round(v)} OF 100`,
    ends: ["BAD", "GOOD"], scale: ["0", "100"],
    meaning: "ONE SCORE PER PLACE: EACH LAYER'S GOOD / BAD SCORE (0 TO 100) AVERAGED WITH THE WEIGHTS YOU SET BELOW. A WEIGHT OF 0 LEAVES A LAYER OUT.",
    source: "A BLEND MADE BY LUNI FROM THE LAYERS ABOVE (NASA LRO LOLA, NASA NAIF SPICE, NASA LRO DIVINER). THE WEIGHTS ARE YOUR CHOICE, NOT NASA'S." },
];
export const layer = (id) => LAYERS.find((l) => l.id === id);

// ---------- YOUR MIX ----------
// Each part turns its layer's value into a score from 0 (bad) to 1 (good); the mix is their weighted average.
// The scales are scales for the eye, the same ones the layers are colored with:
//   sunlight and Earth link: percent of the time / 100;  flat ground: 1 at 0 degrees, 0 at 20 degrees or more;
//   warmer ground: 0 at 40 K average or colder, 1 at 250 K or warmer (off unless you turn it up).
export const MIX_PARTS = [
  { id: "sun", label: "SUNLIGHT", w: 3, score: (v) => v / 100 },
  { id: "earth", label: "EARTH LINK", w: 2, score: (v) => v / 100 },
  { id: "slope", label: "FLAT GROUND", w: 1, score: (v) => 1 - clamp01(v / 20) },
  { id: "temp", label: "WARMER GROUND", w: 0, score: (v) => clamp01((v - 40) / 210) },
];
const mix = Object.fromEntries(MIX_PARTS.map((p) => [p.id, p.w]));
try { Object.assign(mix, JSON.parse(globalThis.localStorage?.getItem("luno-mix") || "{}")); } catch {}
export const getMix = () => ({ ...mix });
export function setMix(id, w) { mix[id] = Math.max(0, Math.min(5, +w || 0)); try { localStorage.setItem("luno-mix", JSON.stringify(mix)); } catch {} }
// values: { sun, earth (percent), slope (degrees), temp (kelvin) }. Returns 0..100, or null if a weighted part has no value.
export function mixScore(values) {
  let sum = 0, wsum = 0;
  for (const p of MIX_PARTS) {
    const w = mix[p.id]; if (!w) continue;
    const v = values[p.id]; if (v == null || !Number.isFinite(v)) return null;
    sum += w * p.score(v); wsum += w;
  }
  return wsum ? sum / wsum * 100 : null;
}
export const mixText = () => MIX_PARTS.filter((p) => mix[p.id] > 0).map((p) => `${p.label} ×${mix[p.id]}`).join(" + ") || "NOTHING (ALL WEIGHTS ARE 0)";

// ---------- the layer data ----------
// Three sets, all listed in data/layers/index.json:
//   sp, np   the polar caps (poleward of 80 degrees), 480 m squares: sun, earth, shadow, slope, tavg, tmax
//   gl       the whole Moon, coarse: sun, earth (quarter-degree squares), tavg, tmax (half-degree squares)
// A point inside a cap gets the cap's value; anywhere else, the whole-Moon value.
let DATA = null, loading = null;
export function loadLayers(base = "data/layers/") {
  return (loading ||= (async () => {
    const ix = await fetch(base + "index.json").then((r) => r.json()), out = {};
    await Promise.all(["sp", "np", "gl"].filter((k) => ix[k]).map(async (k) => {
      const set = (out[k] = { ...ix[k] });
      await Promise.all(Object.entries(ix[k].files).map(async ([name, f]) => { set[name] = new Uint8Array(await gunzip(await fetchBytes(base + f))); }));
    }));
    return (DATA = out);
  })());
}
export const loadPolar = loadLayers;
export function setLayers(d) { DATA = d; loading = Promise.resolve(d); }      // for tests
export const polarMeta = () => DATA;                       // truthy once the layer data is in memory
const capFor = (lat) => (DATA?.sp && lat <= DATA.sp.min_lat ? DATA.sp : DATA?.np && lat >= DATA.np.min_lat ? DATA.np : null);
function capIndex(P, lat, lon) {
  const r = 2 * R * Math.tan((90 - Math.abs(lat)) * DEG / 2), c = (P.n - 1) / 2, ys = P.y_sign ?? 1;
  const col = Math.round(c + r * Math.sin(lon * DEG) / P.scale_m), row = Math.round(c - ys * r * Math.cos(lon * DEG) / P.scale_m);
  return col < 0 || row < 0 || col >= P.n || row >= P.n ? -1 : row * P.n + col;
}
const glAt = (arr, ppd, lat, lon) => {
  if (!arr) return null;
  const rows = 180 * ppd, cols = 360 * ppd, row = Math.min(rows - 1, Math.max(0, Math.floor((90 - lat) * ppd))), col = Math.floor((((lon + 180) % 360) + 360) % 360 * ppd) % cols;
  const v = arr[row * cols + col];
  return v === 255 ? null : v;
};

// A layer's value at a point: percent for sun / earth, 0 or 1 for shadow (caps only), kelvin for temp / tmax,
// 0..100 for mix (slopeDeg: the ground slope there, needed for the mix outside the caps). null where there is no data.
export function polarValue(id, lat, lon, slopeDeg = null) {
  if (!DATA) return null;
  const P = capFor(lat), i = P ? capIndex(P, lat, lon) : -1;
  if (P && i >= 0 && P.sun[i] !== 255) {
    const g = (k, f) => (P[k] && P[k][i] !== 255 ? P[k][i] * f : null);
    if (id === "mix") return mixScore({ sun: g("sun", 0.5), earth: g("earth", 0.5), temp: g("tavg", 2), slope: g("slope", 0.1) ?? slopeDeg });
    if (id === "shadow") return P.shadow[i];
    return id === "temp" ? g("tavg", 2) : id === "tmax" ? g("tmax", 2) : g(id, id === "slope" ? 0.1 : 0.5);
  }
  const G = DATA.gl;
  if (!G || id === "shadow" || id === "slope") return null;
  const sun = glAt(G.sun, G.ppd, lat, lon), earth = glAt(G.earth, G.ppd, lat, lon), tp = G.temperature?.ppd || 2;
  const half = (v) => (v == null ? null : v / 2), dbl = (v) => (v == null ? null : v * 2);
  if (id === "mix") return mixScore({ sun: half(sun), earth: half(earth), temp: dbl(glAt(G.tavg, tp, lat, lon)), slope: slopeDeg });
  return id === "sun" ? half(sun) : id === "earth" ? half(earth) : id === "temp" ? dbl(glAt(G.tavg, tp, lat, lon)) : id === "tmax" ? dbl(glAt(G.tmax, tp, lat, lon)) : null;
}
// How fine the sunlight / Earth / temperature layers are at a latitude, in words.
export const detailAt = (lat) => (capFor(lat) ? "480 M SQUARES" : "7.6 KM SQUARES (15 KM FOR TEMPERATURE)");
export async function loadPolarSlope() { return null; }      // kept for older callers: slope now comes with the cap data

// ---------- the data profile of one point ----------
// Every layer's value at (lat, lon): [{ id, label, text, score, rgb, note }]. Layers with no data there are listed
// with text = null, so the card can say so instead of leaving a gap.
export async function profileAt(lat, lon) {
  const [near, far] = mapsFor(lat), best = await getGrid(near || far);
  let h = best.height(lat, lon), slope = slopeAt(best, lat, lon);
  if (!Number.isFinite(h)) { const g = await getGrid(far); h = g.height(lat, lon); slope = slopeAt(g, lat, lon); }
  await loadLayers().catch(() => null);
  const base = 2 * best.res;
  const rows = LAYERS.map((L) => {
    const v = L.id === "elev" ? (Number.isFinite(h) ? h : null) : L.id === "slope" ? slope : polarValue(L.id, lat, lon, slope);
    if (v == null) return { id: L.id, label: L.card || L.label, text: null, score: null, rgb: null, note: L.capsOnly ? "POLES ONLY" : "NO DATA" };
    const score = L.score ? L.score(v) : null;
    return { id: L.id, label: L.id === "slope" ? `SLOPE OVER ${base >= 1000 ? (base / 1000).toFixed(1) + " KM" : base + " M"}` : L.card || L.label, value: v, text: (L.brief || L.text)(v), score, rgb: L.id === "shadow" ? (v ? SHADOW_RGB : GOOD_RAMP[2]) : L.color(v),
             share: L.binary ? 1 : clamp01((v - L.lo) / (L.hi - L.lo)), note: "" };
  });
  // the hottest the ground gets in a year, next to the average
  const hot = polarValue("tmax", lat, lon), at = rows.findIndex((r) => r.id === "temp"), T = layer("temp");
  if (hot != null && at >= 0) rows.splice(at + 1, 0, { id: "tmax", label: "TEMPERATURE (MAX)", value: hot, text: T.brief(hot), score: null, rgb: T.color(hot), share: clamp01((hot - T.lo) / (T.hi - T.lo)), note: "" });
  return rows;
}

// One card row for a layer and a value that did not come from the layer's own grid (a site's own long-term numbers).
export function layerRow(id, v, note = "") {
  const L = layer(id);
  return { id, label: L.card || L.label, value: v, text: (L.brief || L.text)(v), score: L.score ? L.score(v) : null, rgb: L.color(v), share: clamp01((v - L.lo) / (L.hi - L.lo)), note };
}

// The card: one row per layer, a bar in the layer's own color, the number, and a GOOD / FAIR / BAD word where the layer has a say.
export const verdictWord = (score) => (score == null ? "" : score >= 0.67 ? "GOOD" : score >= 0.34 ? "FAIR" : "BAD");
export function profileHtml(rows) {
  return `<div class="prof">` + rows.map((r) => r.head ? `<div class="prof-head">${r.head}</div>` : r.text == null
    ? `<div class="prof-row none"><span>${r.label}</span><i></i><b>${r.note}</b><em></em></div>`
    : `<div class="prof-row"><span>${r.label}</span><i><u style="width:${Math.round(r.share * 100)}%;background:rgb(${r.rgb})"></u></i><b>${r.text}${r.note ? ` <small>${r.note}</small>` : ""}</b><em style="color:rgb(${r.score == null ? "150,160,175" : goodColor(r.score)})">${verdictWord(r.score) || "—"}</em></div>`).join("") + `</div>`;
}

// ---------- pictures for the 3D Moon ----------
// Whole Moon, as a flat picture with longitude -180..180 left to right and north at the top. Elevation and slope
// come from the elevation map itself; sunlight, Earth link, temperature and the mix from the whole-Moon layer data.
// Returns null for a layer that only exists at the poles (shadow).
export async function globalCanvas(id) {
  const L = layer(id);
  if (L.capsOnly) return null;
  const g = await getGrid("global"), d = g.data, q = g.quant_m, GW = g.cols, GH = g.rows, pxM = R * DEG / g.ppd;
  const slopeAtCell = (r, c) => {
    const rn = Math.max(0, r - 1), rs = Math.min(GH - 1, r + 1), cosLat = Math.max(0.02, Math.cos((90 - (r + 0.5) / g.ppd) * DEG)), cw = (c + GW - 1) % GW, ce = (c + 1) % GW;
    return Math.atan(Math.hypot((d[r * GW + ce] - d[r * GW + cw]) * q / (2 * pxM * cosLat), (d[rn * GW + c] - d[rs * GW + c]) * q / ((rs - rn) * pxM))) / DEG;
  };
  let W = GW, H = GH, value;
  if (id === "elev") value = (r, c) => d[r * GW + (c + GW / 2) % GW] * q;                // the elevation grid starts at longitude 0; the picture is centered on it
  else if (id === "slope") value = (r, c) => slopeAtCell(r, (c + GW / 2) % GW);
  else {
    const G = (await loadLayers()).gl;
    if (!G) return null;
    const tp = G.temperature?.ppd || 2, f = g.ppd / G.ppd, ft = G.ppd / tp, tW = 360 * tp;
    W = G.cols; H = G.rows;
    const temp = (r, c) => { const v = G.tavg ? G.tavg[Math.floor(r / ft) * tW + Math.floor(c / ft)] : 255; return v === 255 ? null : v * 2; };
    if (id === "sun" || id === "earth") value = (r, c) => { const v = G[id][r * W + c]; return v === 255 ? null : v / 2; };
    else if (id === "temp") value = temp;
    else value = (r, c) => mixScore({ sun: G.sun[r * W + c] / 2, earth: G.earth[r * W + c] / 2, temp: temp(r, c), slope: slopeAtCell(Math.min(GH - 1, Math.floor(r * f)), (Math.floor(c * f) + GW / 2) % GW) });
  }
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(W, H), px = img.data;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const v = value(r, c), rgb = v != null && Number.isFinite(v) ? L.color(v) : null;
    if (!rgb) continue;
    const o = (r * W + c) * 4; px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// One polar cap ("sp" or "np", poleward of 80 degrees), as a north-up polar picture with the pole in the middle.
// Returns null where the cap has nothing finer than the whole-Moon picture (elevation at the north pole).
export async function polarCanvas(id, capKey = "sp") {
  const P = (await loadLayers())[capKey], L = layer(id);
  if (!P) return null;
  const n = P.n, c = (n - 1) / 2;
  let fine = null, pr = 0, pc = 0, k = 1;
  if (id === "elev") {
    if (capKey !== "sp") return null;
    fine = await getGrid("sp_cap"); pr = (fine.rows - 1) / 2; pc = (fine.cols - 1) / 2; k = P.scale_m / fine.scale_m;
  }
  if (id === "slope" && !P.slope) return null;
  const cv = document.createElement("canvas"); cv.width = cv.height = n;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(n, n), px = img.data;
  const g = (arr, i, f) => (arr && arr[i] !== 255 ? arr[i] * f : null);
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
    const i = row * n + col;
    if (P.sun[i] === 255) continue;                        // outside the cap: see-through
    let v;
    if (id === "elev") v = fine.sample(pr + (row - c) * k, pc + (col - c) * k);
    else if (id === "slope") v = g(P.slope, i, 0.1);
    else if (id === "mix") v = mixScore({ sun: P.sun[i] / 2, earth: P.earth[i] / 2, temp: g(P.tavg, i, 2), slope: g(P.slope, i, 0.1) });
    else if (id === "temp") v = g(P.tavg, i, 2);
    else v = id === "shadow" ? P.shadow[i] : P[id][i] / 2;
    const rgb = v != null && Number.isFinite(v) ? L.color(v) : null;
    if (!rgb) continue;
    px[i * 4] = rgb[0]; px[i * 4 + 1] = rgb[1]; px[i * 4 + 2] = rgb[2]; px[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: cv, minLat: P.min_lat, n, scaleM: P.scale_m, ySign: P.y_sign ?? 1 };
}

// The legend strip for a layer, as HTML.
export function legendHtml(L) {
  if (L.binary) return `<div class="lay-legend flat"><b style="background:rgb(${SHADOW_RGB})"></b> ${L.ends[1]}</div>`;
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => `rgb(${L.color(L.lo + (L.hi - L.lo) * t)})`);
  const flip = L.id === "slope";                           // slope reads bad to good from right to left; show it good on the right like the others
  return `<div class="lay-legend"><i style="background:linear-gradient(90deg,${(flip ? stops.reverse() : stops).join(",")})"></i>
    <div class="ends"><span>◀ ${L.scale[0]}<br>${L.ends[0]}</span><span>${L.scale[1]} ▶<br>${L.ends[1]}</span></div></div>`;
}
