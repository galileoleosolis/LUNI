// First-visit guide: three short cards, each pointing at one part of the screen. Shown once per browser
// (remembered under "luno-guide-v1"), never to automated browsers, and it can be skipped at any card.
const KEY = "luno-guide-v1";
const STEPS = [
  { at: null, head: "WHAT LUNI DOES", next: "SHOW ME HOW ▸",
    text: "LUNI answers one question for a Moon mission: if we land at this spot, at this time, will the lander have sunlight for power and a clear line to Earth for as long as the mission lasts? The answer is a GO or a NO-GO, worked out from NASA data." },
  { at: ".col-site", side: "right", head: "1 · CHOOSE YOUR SITE AND TIME",
    text: "Choose a landing site from the list (or click any spot on the Moon), then the landing time and what the mission needs. LUNI opens on a real landing: IM-2 Athena, 6 March 2025." },
  { at: "#mission", side: "below", head: "2 · GET THE VERDICT",
    text: "GO or NO-GO for that site, time and mission, with the reason. A NO-GO comes with buttons that lead to a GO: land on another date, move to a better spot nearby, or change one mission need." },
  { at: "#timeline", side: "above", head: "3 · MOVE THROUGH THE MISSION",
    text: "Drag the blinking SLIDER handle along the bar, or press PLAY, to step through the mission. The Sun and Earth move against the skyline as you go. Stuck? Press ASK LUNI and type what you want in plain words." },
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
    if (flow) { card.style.left = card.style.top = ""; hot?.scrollIntoView({ block: "center" }); return; }
    if (!hot) { card.style.left = (screen.clientWidth - card.offsetWidth) / 2 + "px"; card.style.top = (screen.clientHeight - card.offsetHeight) / 2 + "px"; card.dataset.side = "center"; return; }
    const z = zoomOf(screen), S = screen.getBoundingClientRect(), r = hot.getBoundingClientRect(), side = STEPS[i].side;
    const x0 = (r.left - S.left) / z, y0 = (r.top - S.top) / z, w = r.width / z, h = r.height / z, cw = card.offsetWidth, ch = card.offsetHeight, W = screen.clientWidth, H = screen.clientHeight;
    let x = side === "right" ? x0 + w + 14 : x0 + Math.min(40, w / 6), y = side === "right" ? y0 + 60 : side === "below" ? y0 + h + 14 : y0 - ch - 14;
    card.style.left = Math.max(8, Math.min(W - cw - 8, x)) + "px"; card.style.top = Math.max(8, Math.min(H - ch - 8, y)) + "px";
    card.dataset.side = side;
  }
  function show() {
    hot?.classList.remove("guide-hot");
    const s = STEPS[i]; hot = s.at ? document.querySelector(s.at) : null; hot?.classList.add("guide-hot"); card.classList.toggle("intro", !hot);
    card.innerHTML = `<div class="guide-head"><b>${s.head}</b><span>QUICK TOUR ${i + 1} OF ${STEPS.length}</span></div><p>${s.text}</p>
      <div class="guide-btns"><button class="guide-skip">SKIP THE TOUR</button><button class="guide-next">${s.next || (i < STEPS.length - 1 ? "NEXT ▸" : "START USING LUNI ▸")}</button></div>`;
    card.querySelector(".guide-skip").addEventListener("click", done);
    card.querySelector(".guide-next").addEventListener("click", () => { if (++i < STEPS.length) show(); else done(); });
    place();
  }
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(); } };
  window.addEventListener("resize", place); window.addEventListener("keydown", onKey, true);
  show();
  return { close: done };
}
