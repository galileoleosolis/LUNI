// MOON MAP screen: the 3D Moon made big, with NASA data as layers on it and a data profile for any point.
// The Moon itself is the same one as on the main screen (it moves in here while this screen is open), so a click
// still picks a landing site.
import { showData } from "./sources.js";
import { LAYERS, layer, globalCanvas, polarCanvas, legendHtml, profileAt, profileHtml, layerRow, mixScore, MIX_PARTS, getMix, setMix, mixText } from "./layers.js";

export function createMoonMap({ globe, getSite, getNow, getSiteYears, fmt, onClose, onUseMix }) {
  const $ = (id) => document.getElementById(id), box = $("moonmap");
  const wrap = document.querySelector(".globe-wrap"), home = wrap.parentElement, homeNext = wrap.nextElementSibling;
  let current = "none", strength = 0.8, job = 0, hover = null, profJob = 0;
  const cache = {};                                        // layer id -> { global, polar } pictures, built once

  async function pictures(id) {
    if (cache[id]) return cache[id];
    const out = {}, quiet = (what) => (e) => { console.warn(what + " unavailable:", e); return null; };
    out.global = await globalCanvas(id).catch(quiet("whole-Moon layer"));
    out.polar = [await polarCanvas(id, "sp").catch(quiet("south polar layer")), await polarCanvas(id, "np").catch(quiet("north polar layer"))];
    return (cache[id] = out);
  }

  async function setLayer(id) {
    current = id; const mine = ++job;
    [...$("mm-layers").children].forEach((b) => b.classList.toggle("on", b.dataset.id === id));
    const L = layer(id);
    $("mm-legend").innerHTML = L ? legendHtml(L) : "";
    // which NASA data this layer is made of: a line here, and the NASA DATA USED band at the top of the screen
    const SHORT = { elev: "NASA LRO LOLA", slope: "NASA LRO LOLA", sun: "NASA SPICE + LRO LOLA", earth: "NASA SPICE + LRO LOLA", shadow: "NASA SPICE + LRO LOLA", temp: "NASA LRO DIVINER", ice: "NASA LRO DIVINER", mix: "NASA DATA · YOUR WEIGHTS" };
    $("mm-src").textContent = L ? SHORT[L.id] || "NASA DATA" : "NASA LRO PHOTO";
    if (!box.hidden) showData("layer:" + (L ? L.id : "none"));
    $("mm-meaning").textContent = L ? L.meaning : "THE MOON AS A CAMERA SEES IT: NASA LRO WIDE-ANGLE CAMERA MOSAIC. PICK A LAYER TO PUT DATA ON IT.";
    $("mm-mix").hidden = !L?.mix;
    $("mm-source").textContent = L ? L.source : "PICTURE: NASA / GSFC / ARIZONA STATE UNIVERSITY (LRO WAC MOSAIC).";
    if (!L) { globe?.setOverlay(null); return; }
    $("mm-status").hidden = false; $("mm-status").textContent = "DRAWING THE LAYER…";
    await new Promise((r) => setTimeout(r, 30));           // let the message show before the heavy part
    try {
      const pics = await pictures(id);
      if (mine !== job) return;
      globe?.setOverlay(pics, strength);
      $("mm-status").hidden = true;
      if (!pics.global && !pics.polar.some(Boolean)) { $("mm-status").hidden = false; $("mm-status").textContent = "THIS LAYER'S DATA DID NOT LOAD."; }
      else if (L.capsOnly) globe?.lookAt(-86, 0, 1.75);      // a layer that only exists at the poles: go and look at one
    } catch (e) { console.error(e); if (mine === job) $("mm-status").textContent = "THIS LAYER COULD NOT BE DRAWN."; }
  }

  // The profile card: the point under the pointer while it is over the Moon, otherwise the chosen landing site.
  async function drawProfile() {
    const mine = ++profJob, site = getSite(), p = hover || site;
    try {
      const rows = await profileAt(p.lat, p.lon);
      if (mine !== profJob) return;
      $("mm-prof-where").innerHTML = hover ? `UNDER THE POINTER · ${fmt.lat(p.lat)} ${fmt.lon(p.lon)} · <b class="h-do">CLICK TO LAND THERE</b>` : `THE LANDING SITE · ${fmt.site(site)} · ${fmt.lat(p.lat)} ${fmt.lon(p.lon)}`;
      // For the landing site: the moment on the mission clock first, then the long-term values, so "dark right now"
      // and "permanent shadow" cannot be mixed up (a tester could not tell them apart).
      const now = hover ? null : getNow?.(), on = (ok, yes, no) => ({ text: ok ? yes : no, score: ok ? 1 : 0, share: 1, rgb: ok ? [34, 208, 112] : [176, 22, 36], note: "" });
      const first = now ? [{ head: `RIGHT NOW · ${fmt.stamp(now.t)}` }, { label: "SUN RIGHT NOW", ...on(now.sunUp, "UP", "DOWN") }, { label: "EARTH RIGHT NOW", ...on(now.earthUp, "IN VIEW", "HIDDEN") }] : [];
      // The landing site has its own detailed skyline: its sunlight and Earth link come from that, not from the
      // coarser map layer (which reads low on narrow ridges). The layer's values are named beside them.
      const own = hover ? null : getSiteYears?.();
      let foot = "";
      if (own) {
        const was = {};
        for (const [id, v] of [["sun", own.sun], ["earth", own.earth]]) {
          const at = rows.findIndex((r) => r.id === id); if (at < 0) continue;
          was[id] = rows[at].text; rows[at] = layerRow(id, v);
        }
        const val = (id) => rows.find((r) => r.id === id)?.value, m = mixScore({ sun: own.sun, earth: own.earth, slope: val("slope"), temp: val("temp") }), mixAt = rows.findIndex((r) => r.id === "mix");
        if (m != null && mixAt >= 0) rows[mixAt] = layerRow("mix", m);
        foot = `<div class="prof-note">SUNLIGHT AND EARTH LINK: FROM THIS SITE'S OWN DETAILED SKYLINE${was.sun != null ? ` (THE COARSER MAP LAYER READS ${was.sun} AND ${was.earth})` : ""}.</div>`;
      }
      $("mm-profile").innerHTML = profileHtml([...first, { head: "ALL YEARS, 2023 TO 2035 (NOT THIS MOMENT)" }, ...rows]) + foot;
    } catch (e) { console.error(e); }
  }
  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (!box.hidden) drawProfile(); }); };

  // build the controls
  for (const [id, label, where] of [["none", "NONE", "PHOTO ONLY"], ...LAYERS.map((L) => [L.id, L.short || L.label, L.where])]) {
    const b = document.createElement("button"); b.dataset.id = id; b.innerHTML = `<b>${label}</b><small>${where}</small>`;
    b.addEventListener("click", () => setLayer(id)); $("mm-layers").appendChild(b);
  }
  for (const [label, go] of [["THE SITE", () => { const s = getSite(); globe?.lookAt(s.lat, s.lon, 2.4); }], ["SOUTH POLE", () => globe?.lookAt(-86, 0, 1.75)], ["NORTH POLE", () => globe?.lookAt(86, 0, 1.75)],
                             ["NEAR SIDE", () => globe?.lookAt(0, 0, 4.4)], ["FAR SIDE", () => globe?.lookAt(0, 180, 4.4)]]) {
    const b = document.createElement("button"); b.textContent = label; b.addEventListener("click", go); $("mm-view").appendChild(b);
  }
  // YOUR MIX: one slider per part (0 = left out, 5 = counts most); the map is redrawn when a slider is let go.
  for (const part of MIX_PARTS) {
    const row = document.createElement("label"), w = getMix()[part.id];
    row.innerHTML = `<span>${part.label}</span><input type="range" min="0" max="5" step="1" value="${w}" aria-label="Weight of ${part.label}"><b>${w ? "×" + w : "OFF"}</b>`;
    const inp = row.querySelector("input"), out = row.querySelector("b");
    inp.addEventListener("input", () => { setMix(part.id, +inp.value); out.textContent = +inp.value ? "×" + inp.value : "OFF"; schedule(); });
    inp.addEventListener("change", () => { delete cache.mix; if (current === "mix") setLayer("mix"); });
    $("mm-mix-rows").appendChild(row);
  }
  $("mm-mix-use").addEventListener("click", () => onUseMix?.());
  $("mm-strength").addEventListener("input", (e) => { strength = +e.target.value / 100; globe?.setOverlayOpacity(strength); });
  $("mm-close").addEventListener("click", () => onClose());
  window.addEventListener("luno:state", schedule);
  window.addEventListener("luno:clock", schedule);

  function toggle(show = box.hidden) {
    if (show === !box.hidden) return;
    box.hidden = !show;
    if (show) { $("mm-globe").appendChild(wrap); wrap.classList.add("big"); setLayer(current); schedule(); }
    else { home.insertBefore(wrap, homeNext); wrap.classList.remove("big"); globe?.setOverlay(null); hover = null; }
  }
  return { toggle, isOpen: () => !box.hidden, setLayer, layer: () => current,
           hoverPoint(p) { if (box.hidden) return; hover = p; schedule(); } };
}
