// Source bubbles: a small pill beside each result that names the NASA data it was worked out from. Pointing at it
// (or tapping it) opens the full sentence; every bubble on screen pulses when LUNI recalculates.
// A bubble is any element with class "src" and either data-src="<key below>" or its own data-long text.
const SOURCES = {
  verdict: "GO / NO-GO IS CALCULATED BY LUNI FROM NASA DATA: WHERE THE SUN AND EARTH ARE (NASA NAIF SPICE, THE DE440 EPHEMERIS) AGAINST THE SKYLINE AT THE SITE (NASA LRO LOLA LASER ELEVATION MAPS).",
  positions: "SUN AND EARTH HEIGHT AND DIRECTION: NASA NAIF SPICE (DE440), CHECKED AGAINST NASA JPL HORIZONS TO 0.0007°. THE COUNTDOWNS ADD THE SKYLINE FROM NASA LRO LOLA. THE DEEP SPACE NETWORK LINE USES NASA NAIF STATION POSITIONS AND EARTH ORIENTATION.",
  skyline: "THE GRAY SKYLINE IS BUILT FROM NASA LRO LOLA LASER ELEVATION MAPS. THE SUN, THE EARTH AND THEIR PATHS COME FROM NASA NAIF SPICE (DE440).",
  photo: "THE MOON PICTURE IS THE LRO WIDE ANGLE CAMERA MOSAIC (NASA / GSFC / ARIZONA STATE UNIVERSITY), FROM NASA MOON TREK. THE SUN AND EARTH MARKS COME FROM NASA NAIF SPICE.",
  finder: "EVERY SQUARE IS CALCULATED BY LUNI THE SAME WAY AS THE MAIN ANSWER: A SKYLINE FROM NASA LRO LOLA ELEVATION (REDUCED MAPS, 240 M TO 3.8 KM PER PIXEL) AGAINST SUN AND EARTH POSITIONS FROM NASA NAIF SPICE.",
  history: "THE LANDINGS' DATES AND OUTCOMES COME FROM THE SOURCES LISTED FOR EACH MISSION. LUNI'S NUMBERS AND BARS ARE CALCULATED FROM NASA NAIF SPICE AND NASA LRO LOLA ELEVATION.",
};
let pop = null, shown = null;

function place(el) {
  const r = el.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, W = innerWidth, H = innerHeight;
  const below = r.bottom + 8 + h <= H - 6;
  pop.style.left = Math.max(6, Math.min(W - w - 6, r.left + r.width / 2 - w / 2)) + "px";
  pop.style.top = (below ? r.bottom + 8 : Math.max(6, r.top - 8 - h)) + "px";
}
function show(el) {
  const text = el.dataset.long || SOURCES[el.dataset.src]; if (!text) return;
  shown = el; pop.innerHTML = `<b>WHERE THIS COMES FROM</b>${text}`; pop.hidden = false; place(el);
}
function hide() { shown = null; if (pop) pop.hidden = true; }

export function initSources() {
  pop = document.createElement("div"); pop.className = "src-pop"; pop.hidden = true; pop.setAttribute("role", "tooltip"); document.body.appendChild(pop);
  document.addEventListener("pointerover", (e) => { const el = e.target.closest?.(".src"); if (el) show(el); else if (shown && e.pointerType === "mouse") hide(); });
  document.addEventListener("focusin", (e) => { const el = e.target.closest?.(".src"); if (el) show(el); });
  document.addEventListener("focusout", (e) => { if (e.target.closest?.(".src")) hide(); });
  document.addEventListener("click", (e) => { const el = e.target.closest?.(".src"); if (el) { e.stopPropagation(); if (shown === el && e.pointerType !== "mouse") hide(); else show(el); } else hide(); });
  window.addEventListener("scroll", hide, true); window.addEventListener("resize", hide);
}
// Called after LUNI recalculates: the bubbles in view light up for a moment.
export function pulseSources(root = document) {
  for (const el of root.querySelectorAll(".src")) { el.classList.remove("fresh"); void el.offsetWidth; el.classList.add("fresh"); }
}
