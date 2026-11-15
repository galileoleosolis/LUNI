// MOON MAP screen: the 3D Moon made big, with NASA data as layers on it and a data profile for any point.
// The Moon itself is the same one as on the main screen (it moves in here while this screen is open), so a click
// still picks a landing site.
import { LAYERS, layer, globalCanvas, polarCanvas, legendHtml, profileAt, profileHtml } from "./layers.js";

export function createMoonMap({ globe, getSite, fmt, onClose }) {
  const $ = (id) => document.getElementById(id), box = $("moonmap");
  const wrap = document.querySelector(".globe-wrap"), home = wrap.parentElement, homeNext = wrap.nextElementSibling;
  let current = "none", strength = 0.8, job = 0, hover = null, profJob = 0;
  const cache = {};                                        // layer id -> { global, polar } pictures, built once

  async function pictures(id) {
    if (cache[id]) return cache[id];
    const L = layer(id), out = {};
    if (!L.polar) out.global = await globalCanvas(id);
    out.polar = await polarCanvas(id).catch((e) => { console.warn("south polar layer unavailable:", e); return null; });
    return (cache[id] = out);
  }

  async function setLayer(id) {
    current = id; const mine = ++job;
    [...$("mm-layers").children].forEach((b) => b.classList.toggle("on", b.dataset.id === id));
    const L = layer(id);
    $("mm-legend").innerHTML = L ? legendHtml(L) : "";
    $("mm-meaning").textContent = L ? L.meaning : "THE MOON AS A CAMERA SEES IT: NASA LRO WIDE-ANGLE CAMERA MOSAIC. PICK A LAYER TO PUT DATA ON IT.";
    $("mm-source").textContent = L ? L.source : "PICTURE: NASA / GSFC / ARIZONA STATE UNIVERSITY (LRO WAC MOSAIC).";
    if (!L) { globe?.setOverlay(null); return; }
    $("mm-status").hidden = false; $("mm-status").textContent = "DRAWING THE LAYER…";
    await new Promise((r) => setTimeout(r, 30));           // let the message show before the heavy part
    try {
      const pics = await pictures(id);
      if (mine !== job) return;
      globe?.setOverlay(pics, strength);
      $("mm-status").hidden = true;
      if (L.polar) { if (!pics.polar) { $("mm-status").hidden = false; $("mm-status").textContent = "THIS LAYER'S DATA DID NOT LOAD."; } else globe?.lookAt(-86, 0, 1.75); }
    } catch (e) { console.error(e); if (mine === job) $("mm-status").textContent = "THIS LAYER COULD NOT BE DRAWN."; }
  }

  // The profile card: the point under the pointer while it is over the Moon, otherwise the chosen landing site.
  async function drawProfile() {
    const mine = ++profJob, site = getSite(), p = hover || site;
    try {
      const rows = await profileAt(p.lat, p.lon);
      if (mine !== profJob) return;
      $("mm-prof-where").innerHTML = hover ? `UNDER THE POINTER · ${fmt.lat(p.lat)} ${fmt.lon(p.lon)} · <b class="h-do">CLICK TO LAND THERE</b>` : `THE LANDING SITE · ${fmt.site(site)} · ${fmt.lat(p.lat)} ${fmt.lon(p.lon)}`;
      $("mm-profile").innerHTML = profileHtml(rows);
    } catch (e) { console.error(e); }
  }
  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (!box.hidden) drawProfile(); }); };

  // build the controls
  for (const [id, label, where] of [["none", "NONE", "PHOTO ONLY"], ...LAYERS.map((L) => [L.id, L.short || L.label, L.where])]) {
    const b = document.createElement("button"); b.dataset.id = id; b.innerHTML = `<b>${label}</b><small>${where}</small>`;
    b.addEventListener("click", () => setLayer(id)); $("mm-layers").appendChild(b);
  }
  for (const [label, go] of [["THE SITE", () => { const s = getSite(); globe?.lookAt(s.lat, s.lon, 2.4); }], ["SOUTH POLE", () => globe?.lookAt(-86, 0, 1.75)],
                             ["NEAR SIDE", () => globe?.lookAt(0, 0, 4.4)], ["FAR SIDE", () => globe?.lookAt(0, 180, 4.4)]]) {
    const b = document.createElement("button"); b.textContent = label; b.addEventListener("click", go); $("mm-view").appendChild(b);
  }
  $("mm-strength").addEventListener("input", (e) => { strength = +e.target.value / 100; globe?.setOverlayOpacity(strength); });
  $("mm-close").addEventListener("click", () => onClose());
  window.addEventListener("luno:state", schedule);

  function toggle(show = box.hidden) {
    if (show === !box.hidden) return;
    box.hidden = !show;
    if (show) { $("mm-globe").appendChild(wrap); wrap.classList.add("big"); setLayer(current); schedule(); }
    else { home.insertBefore(wrap, homeNext); wrap.classList.remove("big"); globe?.setOverlay(null); hover = null; }
  }
  return { toggle, isOpen: () => !box.hidden, setLayer, layer: () => current,
           hoverPoint(p) { if (box.hidden) return; hover = p; schedule(); } };
}
