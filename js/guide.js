// First-visit guide: three short cards, each pointing at one part of the screen. Shown once per browser
// (remembered under "luno-guide-v1"), never to automated browsers, and it can be skipped at any card.
const KEY = "luno-guide-v1";
const STEPS = [
  { at: ".col-site", side: "right", head: "1 · PICK WHERE AND WHEN",
    text: "Choose a landing site from the list (or click any spot on the Moon), then the landing time and what the mission needs. LUNI opens on a real landing: IM-2 Athena, 6 March 2025." },
  { at: "#mission", side: "below", head: "2 · READ THE ANSWER",
    text: "GO or NO-GO for that site, time and mission, with the reason. A NO-GO comes with buttons that get you to a GO: another date, a better spot nearby, or a need to relax." },
  { at: "#timeline", side: "above", head: "3 · WATCH IT CHANGE",
    text: "Drag the slider, or press PLAY, to move through the mission and see the Sun and Earth move against the skyline. Stuck? Press ASK LUNI and type what you want in plain words." },
];

export function seenGuide() { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } }

export function startGuide({ zoomOf, force = false } = {}) {
  if (!force && (navigator.webdriver || seenGuide())) return null;
  const screen = document.querySelector(".screen"), card = document.createElement("div");
  card.className = "guide"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Quick tour");
  screen.appendChild(card);
  let i = 0, hot = null;
  const done = () => { try { localStorage.setItem(KEY, "1"); } catch {} hot?.classList.remove("guide-hot"); card.remove(); window.removeEventListener("resize", place); window.removeEventListener("keydown", onKey, true); };
  function place() {
    const flow = document.documentElement.classList.contains("flow");
    card.classList.toggle("flowing", flow);
    if (flow) { card.style.left = card.style.top = ""; hot.scrollIntoView({ block: "center" }); return; }
    const z = zoomOf(screen), S = screen.getBoundingClientRect(), r = hot.getBoundingClientRect(), side = STEPS[i].side;
    const x0 = (r.left - S.left) / z, y0 = (r.top - S.top) / z, w = r.width / z, h = r.height / z, cw = card.offsetWidth, ch = card.offsetHeight, W = screen.clientWidth, H = screen.clientHeight;
    let x = side === "right" ? x0 + w + 14 : x0 + Math.min(40, w / 6), y = side === "right" ? y0 + 60 : side === "below" ? y0 + h + 14 : y0 - ch - 14;
    card.style.left = Math.max(8, Math.min(W - cw - 8, x)) + "px"; card.style.top = Math.max(8, Math.min(H - ch - 8, y)) + "px";
    card.dataset.side = side;
  }
  function show() {
    hot?.classList.remove("guide-hot");
    const s = STEPS[i]; hot = document.querySelector(s.at); hot.classList.add("guide-hot");
    card.innerHTML = `<div class="guide-head"><b>${s.head}</b><span>QUICK TOUR ${i + 1} OF ${STEPS.length}</span></div><p>${s.text}</p>
      <div class="guide-btns"><button class="guide-skip">SKIP THE TOUR</button><button class="guide-next">${i < STEPS.length - 1 ? "NEXT ▸" : "START USING LUNI ▸"}</button></div>`;
    card.querySelector(".guide-skip").addEventListener("click", done);
    card.querySelector(".guide-next").addEventListener("click", () => { if (++i < STEPS.length) show(); else done(); });
    place();
  }
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(); } };
  window.addEventListener("resize", place); window.addEventListener("keydown", onKey, true);
  show();
  return { close: done };
}
