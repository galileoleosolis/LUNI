// The guided tutorial. It brings in one part of the screen at a time: everything else is dimmed, and a card says
// WHAT IT IS, WHY IT MATTERS and HOW TO USE IT in everyday words. Every card has EXPLAIN IT ANOTHER WAY (a second,
// simpler telling), some ask the reader to try the control, and two ask a quick question to check understanding.
// Shown once per browser (remembered under "luno-tour-v2"), never to automated browsers unless forced, and it can
// be skipped at any card. The ? TUTORIAL button at the top of the unit starts it again.
const KEY = "luno-tour-v2";

const STEPS = [
  { title: "WELCOME TO LUNI", go: "START THE 2-MINUTE TUTORIAL ▸", skip: "SKIP, I WILL EXPLORE",
    text: "A lander on the Moon needs two things to keep working: <b>sunlight</b> to make electricity, and a <b>clear line to Earth</b> to talk to its team. Whether it gets them depends on <b>where</b> it lands and <b>when</b>. LUNI checks both with NASA data and gives you one answer: <b>GO</b> or <b>NO-GO</b>.",
    alt: "Think of a solar-powered phone. In the shade its battery runs down. Behind a mountain it has no signal. LUNI tells you whether a spot on the Moon has both sun and signal for your whole trip." },
  { at: ['h3[data-step="1"]', "#site-list"], title: "1 · WHERE: THE LANDING SITE",
    what: "A list of places to land. Some are real landings from the last few years. Others are places NASA is studying for astronauts.",
    why: "Hills and crater walls can block the Sun and Earth. Two spots only a few kilometers apart can get very different answers.",
    how: "Click a name in the list. Scroll the list to see more.",
    doIt: { on: "click", sel: ".site-row", say: "CLICK ANY SITE IN THE LIST" },
    alt: "It is like picking a campsite. One is on a sunny hilltop, another is down in a shady valley. Same park, very different trip." },
  { at: ['h3[data-step="2"]', ".t0"], title: "2 · WHEN: THE LANDING TIME",
    what: "The date and hour the lander touches down.",
    why: "On most of the Moon, one day lasts about a month: about two weeks of daylight, then two weeks of night. Land late in the daylight and the Sun sets before the work is done.",
    how: "Choose the day, month, year and hour from the four boxes. Times are in UTC, the clock the whole world shares.",
    doIt: { on: "change", sel: ".t0 select", say: "CHANGE THE DAY IN THE FIRST BOX" },
    alt: "Imagine a place where the Sun stays up for two weeks and is then gone for two weeks. You would want to arrive at the start of the bright part. These boxes are how you choose your arrival." },
  { at: ['h3[data-step="3"]', ".needs", "#needs-more"], title: "3 · MISSION NEEDS",
    what: "How long the mission has to keep working after it lands.",
    why: "A short visit is easier. A long stay has to get through more hours without sunlight.",
    how: "Click a number of days. Other needs (time in the dark, Earth link, ground slope) are folded under 4 MORE MISSION NEEDS for when you want them.",
    doIt: { on: "click", sel: ".needs .seg button", say: "CLICK A DIFFERENT NUMBER OF DAYS" },
    alt: "It is like packing for a trip. A weekend needs little planning. A month needs much more. Here you tell LUNI how long the trip is." },
  { at: ['h3[data-step="4"]', "#mission"], title: "4 · THE ANSWER: GO OR NO-GO",
    what: "LUNI's verdict for the site, time and mission you chose. GO means the plan works. NO-GO means it does not, and the lines beside it say why.",
    why: "This is the point of LUNI: one clear answer in place of pages of numbers.",
    how: "Read the big word first, then the reason. On a NO-GO, blue buttons appear with ways to fix the plan. Each fix is one click.",
    check: { q: "QUICK CHECK: WHAT DOES NO-GO MEAN?", options: [
      ["The lander crashed", false, "Not quite. Nothing has flown yet. LUNI is a planning tool, so NO-GO is a warning before anyone launches."],
      ["This plan would not work, and LUNI says why", true, "Right. And LUNI then offers ways to fix the plan."],
      ["LUNI is broken", false, "No. NO-GO is a real answer: this site, time and mission do not fit together."]] },
    alt: "Like a weather app saying: do not plan the picnic for Saturday, it will rain. NO-GO is LUNI saying: not here, not then. It then suggests a better day or a better place." },
  { at: [".answer-side"], title: "POWER AND EARTH LINK",
    what: "Two gauges for the moment on the mission clock. POWER: is the Sun up? EARTH LINK: can the lander see Earth?",
    why: "No Sun means the batteries run down. No view of Earth means no radio contact with the team.",
    how: "A green icon means yes. Red with a slash means no. The large number on the right counts down to the next change, such as sunset.",
    alt: "Think of the two bars on a phone: battery and signal. POWER is the battery bar. EARTH LINK is the signal bar." },
  { at: ["#hz-head", "#horizon"], title: "VIEW FROM THE SITE",
    what: "The view if you stood at the landing site and turned in a full circle. The gray shape is the ground: hills, ridges and crater rims.",
    why: "Near the Moon's poles the Sun never climbs high. It skims along the skyline, so one hill can hide it. Earth can be hidden the same way.",
    how: "Find the yellow Sun and the blue Earth. Above the gray means in view. Behind the gray means blocked. The dotted trails show where they go over the next 3 days.",
    alt: "Picture a sunset behind a mountain. The Sun is still shining, but the mountain blocks it for you. This picture shows which hills are in the way at your landing site." },
  { at: [".plan-head", "#timeline"], title: "MISSION PLAN: THE 30 DAYS AFTER LANDING",
    what: "Three bars. Green: the Sun is up. Teal: Earth is in view. White: both at once.",
    why: "You see the whole mission at a glance: when the lander can work, and when the dark begins.",
    how: "Drag the yellow SLIDER handle left and right. The answer, the gauges and the skyline all move to that moment.",
    doIt: { on: "pointerdown", sel: "#timeline", say: "DRAG THE SLIDER HANDLE" },
    alt: "It is a movie timeline. The bars are the story of the mission and the slider is the playhead. Drag it to watch any part." },
  { at: ["#next-window-btn"], title: "NEXT LANDING WINDOW",
    what: "A landing window is a stretch of time when landing at this site works. This key jumps to the next one.",
    why: "Trying dates one at a time is slow. LUNI has already checked the next 12 months.",
    how: "Press it whenever you see NO-GO. The landing time moves to the next GO.",
    alt: "Like asking a ticket site for the next available flight, in place of checking every day yourself." },
  { at: ["#scan-btn"], title: "BEST SITE FINDER",
    what: "A search of the ground around your site. LUNI checks hundreds of nearby points and draws them as a map.",
    why: "On the Moon, moving a short distance, such as up onto a ridge, can turn a NO-GO into a GO.",
    how: "Press it and wait a few seconds. Green squares work. The star marks the best one. Click a square to move your landing site there.",
    alt: "If a pole blocks the view from your seat, you look around for a better seat nearby. The scan does that looking for you and marks the best seat with a star." },
  { at: ["#talk-btn"], title: "ASK LUNI",
    what: "A box where you type, or say, what you want in everyday words.",
    why: "You do not have to remember where every button is.",
    how: "Press it and try: go to Shackleton. Or: next landing window. Or: why is it a no-go?",
    alt: "It works like a help desk: say what you need, and LUNI presses the right buttons for you." },
  { at: [".tabs"], title: "TWO MORE SCREENS",
    what: "MOON MAP paints NASA data onto the whole Moon: sunlight, Earth link, temperature and more. MISSION HISTORY replays six real landings since 2023.",
    why: "The map helps you look for good regions. The history lets you compare LUNI's answers with what happened to real landers.",
    how: "Click a tab to open it. MAIN SCREEN brings you back here.",
    alt: "The main screen is for one site. MOON MAP is the big picture of the whole Moon. MISSION HISTORY is the record book of real landings." },
  { title: "YOU ARE READY", go: "START USING LUNI ▸",
    text: "That is the whole idea: choose <b>WHERE</b> and <b>WHEN</b>, read <b>THE ANSWER</b>, and fix a NO-GO with one click. The <b>ALL TOOLS</b> key at the bottom right shows the extra controls when you want them. The <b>? TUTORIAL</b> button at the top brings this tour back.",
    check: { q: "LAST CHECK: THE ANSWER SAYS NO-GO. WHAT IS THE QUICKEST FIX?", options: [
      ["Reload the page", false, "That only starts over. The plan itself has to change: another time or another spot."],
      ["Press NEXT LANDING WINDOW or BEST SITE FINDER", true, "Right. One finds a better time, the other finds a better place."],
      ["Wait for it to change by itself", false, "It will not change by itself. Press NEXT LANDING WINDOW for a better time, or BEST SITE FINDER for a better place."]] },
    alt: "Three moves cover almost everything: pick a place, pick a time, read GO or NO-GO. If it is NO-GO, press one of the blue buttons LUNI offers." },
];

export function seenGuide() { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } }

let active = null;
// prepare(): asked of the app before each card, so the part being explained is on screen (main screen, panels shut).
export function startGuide({ force = false, prepare = () => {} } = {}) {
  if (active) return active;
  if (!force && (navigator.webdriver || seenGuide())) return null;
  const mk = (cls) => { const d = document.createElement("div"); d.className = cls; document.body.appendChild(d); return d; };
  const dims = [0, 1, 2, 3].map(() => mk("tour-dim")), ring = mk("tour-ring"), card = mk("tour-card");
  card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Tutorial");
  let i = 0, targets = [], tried = false, off = null;
  const flow = () => document.documentElement.classList.contains("flow");

  function hole() {                                   // the lit area: the smallest box around this card's parts
    const rs = targets.map((t) => t.getBoundingClientRect()).filter((r) => r.width && r.height);
    if (!rs.length) return null;
    const pad = 6, l = Math.min(...rs.map((r) => r.left)) - pad, t = Math.min(...rs.map((r) => r.top)) - pad, r = Math.max(...rs.map((x) => x.right)) + pad, b = Math.max(...rs.map((x) => x.bottom)) + pad;
    return { l: Math.max(0, l), t: Math.max(0, t), r: Math.min(innerWidth, r), b: Math.min(innerHeight, b) };
  }
  const box = (d, l, t, w, h) => { d.style.left = l + "px"; d.style.top = t + "px"; d.style.width = Math.max(0, w) + "px"; d.style.height = Math.max(0, h) + "px"; };
  function place() {
    const W = innerWidth, H = innerHeight, h = hole();
    card.classList.toggle("sheet", flow());
    card.classList.toggle("up", flow() && !!h && (h.t + h.b) / 2 > H * 0.52);      // phones: the sheet moves out of the lit part's way
    if (!h) {                                         // no part to point at: dim everything, card in the middle
      box(dims[0], 0, 0, W, H); for (const d of dims.slice(1)) box(d, 0, 0, 0, 0); ring.style.display = "none";
      if (!flow()) { card.style.left = Math.max(8, (W - card.offsetWidth) / 2) + "px"; card.style.top = Math.max(8, (H - card.offsetHeight) / 2) + "px"; }
      return;
    }
    box(dims[0], 0, 0, W, h.t); box(dims[1], 0, h.b, W, H - h.b); box(dims[2], 0, h.t, h.l, h.b - h.t); box(dims[3], h.r, h.t, W - h.r, h.b - h.t);
    ring.style.display = ""; box(ring, h.l, h.t, h.r - h.l, h.b - h.t);
    if (flow()) return;                               // phones: the card is a sheet along the bottom (CSS)
    const cw = card.offsetWidth, ch = card.offsetHeight, gap = 14;
    // Try the four sides; take the first that leaves the lit part fully clear, else the one that covers least of it.
    const clampX = (x) => Math.max(8, Math.min(W - cw - 8, x)), clampY = (y) => Math.max(8, Math.min(H - ch - 8, y));
    const spots = [[h.r + gap, (h.t + h.b) / 2 - ch / 2], [h.l - gap - cw, (h.t + h.b) / 2 - ch / 2], [(h.l + h.r) / 2 - cw / 2, h.b + gap], [(h.l + h.r) / 2 - cw / 2, h.t - gap - ch]]
      .map(([x, y]) => { x = clampX(x); y = clampY(y); return { x, y, cover: Math.max(0, Math.min(x + cw, h.r) - Math.max(x, h.l)) * Math.max(0, Math.min(y + ch, h.b) - Math.max(y, h.t)) }; });
    const best = spots.find((q) => q.cover === 0) || spots.reduce((m, q) => (q.cover < m.cover ? q : m));
    const x = best.x, y = best.y;
    card.style.left = Math.max(8, Math.min(W - cw - 8, x)) + "px"; card.style.top = Math.max(8, Math.min(H - ch - 8, y)) + "px";
  }

  function done() {
    try { localStorage.setItem(KEY, "1"); } catch {}
    off?.(); clearInterval(tick); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); window.removeEventListener("keydown", onKey, true);
    for (const d of [...dims, ring, card]) d.remove();
    active = null;
  }
  function show() {
    off?.(); off = null; tried = false;
    const s = STEPS[i], last = i === STEPS.length - 1;
    prepare();
    targets = (s.at || []).map((q) => document.querySelector(q)).filter(Boolean);
    const body = s.text ? `<p class="tour-text">${s.text}</p>`
      : `<dl><dt class="w1">WHAT IT IS</dt><dd>${s.what}</dd><dt class="w2">WHY IT MATTERS</dt><dd>${s.why}</dd><dt class="w3">HOW TO USE IT</dt><dd>${s.how}</dd></dl>`;
    card.innerHTML = `<div class="tour-top"><span>${i ? `STEP ${i} OF ${STEPS.length - 1}` : "TUTORIAL"}</span><i class="tour-bar"><b style="width:${Math.round(i / (STEPS.length - 1) * 100)}%"></b></i><button class="tour-skip">${s.skip || "SKIP ✕"}</button></div>
      <h2>${s.title}</h2>${body}
      ${s.doIt ? `<div class="tour-try">▸ TRY IT NOW: ${s.doIt.say}</div>` : ""}
      ${s.check ? `<div class="tour-check"><b>${s.check.q}</b>${s.check.options.map(([t], k) => `<button data-k="${k}">${t}</button>`).join("")}<p class="tour-fb" hidden></p></div>` : ""}
      <div class="tour-alt" hidden><b>ANOTHER WAY TO SAY IT</b>${s.alt}</div>
      <div class="tour-btns">${i ? `<button class="tour-back">◂ BACK</button>` : ""}<button class="tour-more">NOT SURE? EXPLAIN IT ANOTHER WAY</button><button class="tour-next">${s.go || (last ? "FINISH ▸" : "GOT IT ▸")}</button></div>`;
    card.querySelector(".tour-skip").addEventListener("click", done);
    card.querySelector(".tour-back")?.addEventListener("click", () => { i--; show(); });
    card.querySelector(".tour-next").addEventListener("click", () => { if (++i < STEPS.length) show(); else done(); });
    card.querySelector(".tour-more").addEventListener("click", (e) => { card.querySelector(".tour-alt").hidden = false; e.currentTarget.hidden = true; place(); });
    for (const b of card.querySelectorAll(".tour-check button")) b.addEventListener("click", () => {
      const [, ok, why] = s.check.options[+b.dataset.k], fb = card.querySelector(".tour-fb");
      card.querySelectorAll(".tour-check button").forEach((x) => x.classList.remove("yes", "no")); b.classList.add(ok ? "yes" : "no");
      fb.hidden = false; fb.className = "tour-fb " + (ok ? "yes" : "no"); fb.textContent = (ok ? "✓ " : "✗ ") + why; place();
    });
    if (s.doIt) {                                     // the reader uses the real control through the lit area
      const on = (e) => { if (tried || !e.target.closest?.(s.doIt.sel)) return; tried = true;
        const t = card.querySelector(".tour-try"); t.textContent = "✓ YOU DID IT. THAT IS ALL THERE IS TO IT."; t.classList.add("ok"); card.querySelector(".tour-next").classList.add("pulse"); };
      document.addEventListener(s.doIt.on, on, true); off = () => document.removeEventListener(s.doIt.on, on, true);
    }
    targets[0]?.scrollIntoView({ block: flow() ? "start" : "nearest" });      // a part can sit below the fold on short windows
    place(); requestAnimationFrame(place);
  }
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(); } };
  window.addEventListener("resize", place); window.addEventListener("scroll", place, true); window.addEventListener("keydown", onKey, true);
  const tick = setInterval(place, 250);               // the screen under the card can move (a panel opens, the list scrolls)
  show();
  return (active = { close: done });
}
