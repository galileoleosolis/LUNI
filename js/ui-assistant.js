// "ASK LUNO" panel: a command line you can type into or talk to, and LUNO's answer in text and speech.
// Understanding the command is done on the unit (js/assistant.js). Turning speech into text is done by the browser:
// on the device where the browser offers that, otherwise through the browser's online service. The panel says which.

import { forSpeech } from "./assistant.js";

const $ = (id) => document.getElementById(id);
const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
const WAKE = /^\s*(?:hey |ok |okay |yo )?(?:luno|luna|lunar|loono|you know|uno)\b[\s,.:!]*/i;
const TIPS = ["NEXT GOOD TIME", "GO TO SHACKLETON", "MISSION 14 DAYS", "STATUS", "WHERE IS THE SUN?", "DO WE HAVE A LINK?", "BETTER SPOT", "HELP"];
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

export function createAssistantPanel({ assistant }) {
  const panel = $("comms"), input = $("comms-input"), mic = $("comms-mic"), key = $("talk-btn");
  const st = { speak: store.get("luno-speak") !== "off", hands: false, listening: false, rec: null, local: false, armedUntil: 0, speaking: false, micBlocked: false };
  // On the Claude preview page the browser's own microphone is blocked; the page host offers dictation instead.
  let dict = null, phrase = "", phraseTimer = 0;
  const canListen = () => !!dict || (!!SR && !st.micBlocked);
  globalThis.claude?.use?.("dictation").then((d) => {
    if (!d) return;
    dict = d;
    const flush = () => { const text = phrase.trim(); phrase = ""; if (!text) return; if (!st.speaking) heard(text); if (!st.hands) dict.stop().catch(() => {}); };
    d.onPartial(({ text }) => { if (text) { clearTimeout(phraseTimer); $("comms-you").textContent = `HEARING: ${phrase}${text}`; } });
    d.onFinal(({ text }) => { phrase += text; clearTimeout(phraseTimer); phraseTimer = setTimeout(flush, 900); });      // a pause ends the command
    d.onState(({ state, reason }) => {
      setListening(state !== "idle");
      if (state !== "idle") return;
      if (st.hands) { st.hands = false; }
      if (reason === "not_granted" || reason === "unavailable") { st.micBlocked = true; }
      syncOpts(); note();
    });
    syncOpts(); note();
  }).catch(() => {});
  // A press on TALK cuts LUNO off mid-sentence and listens straight away.
  function hush() { globalThis.speechSynthesis?.cancel(); st.speaking = false; }
  function startDictation() { hush(); dict.start({ language: "en" }).catch((e) => { if (e?.code === "not_granted" || e?.code === "unavailable") { st.micBlocked = true; syncOpts(); note(); input.focus(); } }); }

  // ---------- answers ----------
  function say(text) {
    if (!st.speak || !globalThis.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(forSpeech(text));
    u.lang = "en-US"; u.rate = 1.05;
    // In hands-free mode the microphone would hear LUNO's own voice, so it waits until LUNO has finished.
    u.onstart = () => { st.speaking = true; if (st.hands) st.rec?.abort(); };
    u.onend = u.onerror = () => { setTimeout(() => { st.speaking = false; if (st.hands && !st.listening && !dict) listen(); }, 400); };
    speechSynthesis.speak(u);
  }
  function run(text, via) {
    text = text.trim();
    if (!text) return;
    const r = assistant.handle(text);
    $("comms-you").textContent = `${via === "voice" ? "HEARD" : "YOU"}: ${text}`;
    const out = $("comms-reply");
    out.textContent = r.reply; out.classList.toggle("bad", !r.ok);
    $("comms-tips").hidden = r.ok && !r.calls.some((c) => c.input.topic === "help");      // examples show at first, after HELP, and after a miss
    say(r.reply);
    window.dispatchEvent(new CustomEvent("luno:command", { detail: { text, via, ok: r.ok, tools: r.calls.map((c) => c.tool) } }));
    return r;
  }

  // ---------- typing ----------
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { run(input.value, "typed"); input.value = ""; }
    else if (e.key === "Escape") { toggle(false); }
    e.stopPropagation();
  });
  $("comms-send").addEventListener("click", () => { run(input.value, "typed"); input.value = ""; input.focus(); });
  $("comms-tips").replaceChildren(...TIPS.map((t) => { const b = document.createElement("button"); b.textContent = t; b.addEventListener("click", () => run(t, "typed")); return b; }));

  // ---------- talking ----------
  function note() {
    const voice = dict && !st.micBlocked ? "VOICE: ON THIS PREVIEW PAGE, SPEECH IS TURNED INTO TEXT BY THE PAGE HOST'S ONLINE SERVICE."
      : !SR ? "VOICE: THIS BROWSER CANNOT LISTEN. TYPE INSTEAD (CHROME AND EDGE CAN LISTEN)."
      : st.micBlocked ? "VOICE: THE MICROPHONE IS BLOCKED ON THIS PAGE. TYPE INSTEAD, OR ALLOW THE MICROPHONE AND RELOAD."
      : st.local ? "VOICE: SPEECH IS TURNED INTO TEXT ON THIS DEVICE."
      : "VOICE: THIS BROWSER USES ITS ONLINE SERVICE TO TURN SPEECH INTO TEXT.";
    $("comms-note").textContent = `COMMANDS ARE UNDERSTOOD ON THIS UNIT, WITH NO EARTH LINK. ${voice}`;
    $("comms-local").hidden = !st.canInstall;
  }
  // Prefer on-device speech recognition where the browser has it (no internet needed). Asked once, and only when
  // someone first wants to talk: never at page load, and never in an automated browser (a test browser without a
  // speech service can crash on this question).
  async function checkLocal() {
    if (st.askedLocal || !SR || typeof SR.available !== "function" || navigator.webdriver) return;
    st.askedLocal = true;
    try {
      const a = await SR.available({ langs: ["en-US"], processLocally: true });
      st.local = a === "available"; st.canInstall = a === "downloadable";
    } catch {}
    note();
  }
  $("comms-local").addEventListener("click", async () => {
    $("comms-local").textContent = "DOWNLOADING…";
    try { await SR.install({ langs: ["en-US"], processLocally: true }); } catch {}
    $("comms-local").textContent = "MAKE VOICE WORK WITHOUT INTERNET (ONE DOWNLOAD)";
    st.canInstall = false; st.askedLocal = false; await checkLocal();
  });

  function setListening(on) {
    st.listening = on;
    mic.classList.toggle("on", on); key.classList.toggle("on", on || st.hands);
    mic.textContent = on ? (st.hands ? "● LISTENING FOR “LUNO…”" : "● LISTENING… SPEAK NOW") : "● TALK";
  }
  function heard(text) {
    if (!st.hands) return run(text, "voice");
    // Hands-free: only sentences that start with the unit's name are commands.
    const m = text.match(WAKE);
    if (m) { const rest = text.slice(m[0].length); if (rest.trim()) run(rest, "voice"); else { st.armedUntil = Date.now() + 7000; $("comms-reply").textContent = "Yes?"; $("comms-reply").classList.remove("bad"); } }
    else if (Date.now() < st.armedUntil) { st.armedUntil = 0; run(text, "voice"); }
  }
  async function listen() {
    if (dict || !SR || st.listening || st.speaking || st.starting) return;
    st.starting = true; await checkLocal(); st.starting = false;
    if (panel.hidden) return;
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = true; rec.continuous = st.hands; rec.maxAlternatives = 1;
    if (st.local) { try { rec.processLocally = true; } catch {} }
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) heard(text); else $("comms-you").textContent = `HEARING: ${text}`;
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { st.micBlocked = true; st.hands = false; syncOpts(); note(); }
      else if (e.error === "network") { $("comms-reply").textContent = "The browser could not reach its speech service. Type the command instead."; $("comms-reply").classList.add("bad"); st.hands = false; syncOpts(); }
      else if (e.error === "no-speech" && !st.hands) { $("comms-reply").textContent = "I did not hear anything. Press TALK and speak, or type."; $("comms-reply").classList.add("bad"); }
    };
    rec.onend = () => { if (st.rec === rec) st.rec = null; setListening(false); if (st.hands && !st.speaking && !panel.hidden) setTimeout(listen, 250); };
    try { rec.start(); st.rec = rec; setListening(true); } catch { setListening(false); }
  }
  function stopListening() { if (dict) { phrase = ""; clearTimeout(phraseTimer); dict.stop().catch(() => {}); } st.rec?.abort(); setListening(false); }

  mic.addEventListener("click", () => { if (!canListen()) { input.focus(); return; } if (st.listening) stopListening(); else if (dict) startDictation(); else { hush(); listen(); } });

  // ---------- options ----------
  function syncOpts() {
    $("comms-voice").textContent = `SPOKEN ANSWERS ${st.speak ? "ON" : "OFF"}`; $("comms-voice").classList.toggle("on", st.speak);
    $("comms-hands").textContent = `HANDS-FREE ${st.hands ? "ON · SAY “LUNO, …”" : "OFF"}`; $("comms-hands").classList.toggle("on", st.hands);
    $("comms-hands").hidden = !canListen(); mic.classList.toggle("off", !canListen());
    key.classList.toggle("on", st.listening || st.hands);
  }
  $("comms-voice").addEventListener("click", () => { st.speak = !st.speak; store.set("luno-speak", st.speak ? "on" : "off"); if (!st.speak) globalThis.speechSynthesis?.cancel(); syncOpts(); });
  $("comms-hands").addEventListener("click", () => {
    st.hands = !st.hands;
    if (dict) { if (st.hands) { if (!st.listening) startDictation(); } else stopListening(); syncOpts(); setListening(st.listening); return; }
    stopListening(); syncOpts(); if (st.hands) listen();
  });
  $("comms-close").addEventListener("click", () => toggle(false));

  function toggle(show = panel.hidden) {
    panel.hidden = !show;
    if (!show) { st.hands = false; stopListening(); globalThis.speechSynthesis?.cancel(); syncOpts(); input.blur(); }
    else { note(); syncOpts(); }
  }
  // T key / ASK LUNO key: open and listen (or put the cursor in the box when the browser cannot listen).
  function talk() {
    if (panel.hidden) toggle(true);
    if (!canListen()) input.focus();
    else if (!st.listening) { if (dict) startDictation(); else { hush(); listen(); } }
  }
  function type() { if (panel.hidden) toggle(true); input.focus(); }
  key.addEventListener("click", () => { if (st.listening) stopListening(); else talk(); });

  syncOpts(); note();
  return { toggle, talk, type, run, isOpen: () => !panel.hidden };
}
