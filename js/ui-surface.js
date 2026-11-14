// Panel for the 3D surface view: opens over the three columns, follows the app's site and mission clock.
import { createSurfaceView, QUALITY } from "./surface.js";

const $ = (id) => document.getElementById(id);
const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function createSurfacePanel({ getContext, fmt }) {
  const panel = $("surface");
  let view = null, key = "", building = 0;
  const st = { quality: "medium", eye: 2, skyline: true };
  try { st.quality = localStorage.getItem("luno-surface-quality") || st.quality; } catch {}

  function seg(el, items, get, set) {
    el.replaceChildren();
    for (const [val, label] of items) {
      const b = document.createElement("button");
      b.textContent = label; b.classList.toggle("on", get() === val);
      b.addEventListener("click", () => { set(val); [...el.children].forEach((x) => x.classList.toggle("on", x === b)); });
      el.appendChild(b);
    }
  }
  seg($("sv-quality"), Object.entries(QUALITY).map(([k, q]) => [k, q.label]), () => st.quality, (v) => { st.quality = v; try { localStorage.setItem("luno-surface-quality", v); } catch {} rebuild(true); });
  seg($("sv-eye"), [[2, "2 M"], [10, "10 M"], [200, "200 M"], [2000, "2 KM"]], () => st.eye, (v) => { st.eye = v; view?.setEye(v); applySkyline(); });
  seg($("sv-skyline"), [[true, "ON"], [false, "OFF"]], () => st.skyline, (v) => { st.skyline = v; applySkyline(); });
  $("sv-sun").addEventListener("click", () => { const c = getContext(); view?.lookAt(c.cur.sunAz, Math.max(1, c.cur.sunEl)); });
  $("sv-earth").addEventListener("click", () => { const c = getContext(); view?.lookAt(c.cur.earthAz, Math.max(1, c.cur.earthEl)); });
  $("sv-close").addEventListener("click", () => toggle(false));
  $("sv-full").addEventListener("click", () => { (document.fullscreenElement ? document.exitFullscreen() : panel.requestFullscreen?.())?.catch?.(() => {}); });
  $("sv-save").addEventListener("click", () => {
    if (!view) return;
    const a = document.createElement("a"), c = getContext();
    a.href = view.image(); a.download = `luno-surface-${c.site.id}-${c.cur.t.toISOString().slice(0, 13)}.png`; a.click();
  });

  // LUNI computes the skyline for an observer 2 m above the ground, so it is only drawn at that eye height.
  const applySkyline = () => {
    const show = st.skyline && st.eye === 2;
    view?.setSkyline(show ? getContext().horizon : null);
    $("sv-keytext").textContent = show ? "LUNI'S CALCULATED SKYLINE (FOR AN OBSERVER 2 M UP)" : st.skyline ? "SKYLINE HIDDEN: IT IS CALCULATED FOR 2 M EYE HEIGHT" : "SKYLINE OFF";
  };

  async function rebuild(force) {
    const c = getContext(), k = `${c.site.id},${c.site.lat},${c.site.lon},${st.quality}`;
    if (!force && k === key && view) return update();
    key = k;
    const job = ++building;
    view?.dispose(); view = null;
    $("sv-title").textContent = `SURFACE VIEW · ${fmt.site(c.site)}`;
    try {
      const v = await createSurfaceView($("sv-canvas"), { site: c.site, quality: st.quality, eyeM: st.eye, onStatus: (s) => { $("sv-status").textContent = s; $("sv-status").hidden = !s; } });
      if (job !== building) return v.dispose();
      view = v;
      view.onView(({ az, el, fov }) => { $("sv-look").textContent = `LOOKING ${Math.round(az)}° ${DIRS[Math.round(az / 45) % 8]} · ${el >= 0 ? "UP" : "DOWN"} ${Math.abs(el).toFixed(1)}° · FIELD OF VIEW ${Math.round(fov)}° (SCROLL TO ZOOM)`; });
      $("sv-info").textContent = `TERRAIN: NASA LOLA ELEVATION, ${view.info.detailM < 1000 ? Math.round(view.info.detailM) + " M" : (view.info.detailM / 1000).toFixed(1) + " KM"} DETAIL NEAR THE SITE · ${Math.round(view.info.triangles / 1000).toLocaleString("en-US")}K TRIANGLES · ROCKS, SMALL CRATERS, THE LANDER AND THE EARTH'S FACE ARE ILLUSTRATIVE`;
      update(); applySkyline();
      const cur = getContext().cur;
      view.lookAt(cur.sunEl > -3 ? cur.sunAz : cur.earthAz, 2);
    } catch (e) {
      console.error(e);
      $("sv-status").hidden = false; $("sv-status").textContent = "3D VIEW COULD NOT START (WEBGL NOT AVAILABLE?)";
    }
  }

  function update() {
    if (!view || panel.hidden) return;
    const c = getContext(), cur = c.cur;
    view.setTime(cur);
    $("sv-time").textContent = `${fmt.stamp(cur.t)} · SUN ${cur.sunEl >= 0 ? "+" : "−"}${Math.abs(cur.sunEl).toFixed(1)}° ${cur.sunUp ? "" : "(NOT IN VIEW) "}· EARTH ${cur.earthEl >= 0 ? "+" : "−"}${Math.abs(cur.earthEl).toFixed(1)}°${cur.earthUp ? "" : " (NOT IN VIEW)"}`;
  }

  function toggle(show = panel.hidden) {
    panel.hidden = !show;
    if (show) rebuild(false); else { building++; view?.dispose(); view = null; key = ""; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  }
  return { toggle, isOpen: () => !panel.hidden, refresh: () => { if (!panel.hidden) rebuild(false).then?.(applySkyline); }, update, get view() { return view; } };
}
