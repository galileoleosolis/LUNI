// "ASK LUNI" panel (LUNI = Lunar Utility Navigational Intelligence):
// a command line you can type into or talk to, and LUNI's answer in text and speech.
// Understanding the command is done on the unit (js/assistant.js). Turning speech into text is done by the browser:
// on the device where the browser offers that, otherwise through the browser's online service. The panel says which.

import { forSpeech } from "./assistant.js";
import { PRESETS } from "./assistant-llm.js";

const $ = (id) => document.getElementById(id);
const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
const WAKE = /^\s*(?:hey |ok |okay |yo )?(?:luni|lunie|luny|lunee|looney|loony|loonie|loonee|lunny|luno|luna|lunar|loono|you know|uno)\b[\s,.:!]*/i;      // LUNI, and what recognizers hear instead
const TIPS = ["NEXT GOOD TIME", "GO TO SHACKLETON", "MISSION 14 DAYS", "STATUS", "WHERE IS THE SUN?", "DO WE HAVE A LINK?", "BETTER SPOT", "HELP"];
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

export function createAssistantPanel({ assistant, model }) {
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
      if (reason === "not_granted" || reason === "unavailable") return noMic();
      syncOpts(); note();
    });
    syncOpts(); note();
  }).catch(() => {});
  // A press on TALK cuts LUNI off mid-sentence and listens straight away.
  // The microphone turned out to be unusable here: say so in the answer line (not only in the small print) and move to typing.
  function noMic() {
    st.micBlocked = true; st.hands = false; syncOpts(); note(); setListening(false);
    const out = $("comms-reply"); out.textContent = "The microphone cannot be used on this page. Type what you want in the box and press Enter."; out.classList.add("bad");
    input.focus();
  }
  function hush() { globalThis.speechSynthesis?.cancel(); st.speaking = false; }
  function startDictation() { hush(); dict.start({ language: "en" }).catch((e) => { if (e?.code === "not_granted" || e?.code === "unavailable") noMic(); }); }

  // ---------- answers ----------
  function say(text) {
    if (!st.speak || !globalThis.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(forSpeech(text));
    u.lang = "en-US"; u.rate = 1.05;
    // In hands-free mode the microphone would hear LUNI's own voice, so it waits until LUNI has finished.
    u.onstart = () => { st.speaking = true; if (st.hands) st.rec?.abort(); };
    u.onend = u.onerror = () => { setTimeout(() => { st.speaking = false; if (st.hands && !st.listening && !dict) listen(); }, 400); };
    speechSynthesis.speak(u);
  }
  let thinking = null;      // the question the local model is working on, if any
  function show(text, r, via, who) {
    const out = $("comms-reply");
    out.textContent = r.reply; out.classList.toggle("bad", !r.ok);
    if (who) { const tag = document.createElement("span"); tag.className = "who"; tag.textContent = who; out.prepend(tag); }
    $("comms-tips").hidden = r.ok && !r.calls.some((c) => c.input?.topic === "help");      // examples show at first, after HELP, and after a miss
    say(r.reply);
    window.dispatchEvent(new CustomEvent("luno:command", { detail: { text, via: who ? via + "+model" : via, ok: r.ok, tools: r.calls.map((c) => c.tool || c) } }));
  }
  function run(text, via) {
    text = text.trim();
    if (!text) return;
    thinking?.abort(); thinking = null;
    const r = assistant.handle(text, { deferOpen: !!model?.ready });
    $("comms-you").textContent = `${via === "voice" ? "HEARD" : "YOU"}: ${text}`;
    // The built-in commands go first: they are instant and exact. Open questions, and what they do not cover, go to the local model.
    if (r.ok || !model?.ready) { show(text, r, via); return r; }
    const ctl = thinking = new AbortController(), out = $("comms-reply"), name = model.config.model;
    out.classList.remove("bad"); out.textContent = "Asking the AI model on this computer…"; $("comms-tips").hidden = true;
    model.ask(text, { signal: ctl.signal, onStep: (tool, n) => { if (thinking === ctl) out.textContent = `Asking the AI model on this computer… step ${n}: ${tool.replace(/_/g, " ")}`; } })
      .then((a) => { if (thinking === ctl) show(text, { ok: true, reply: a.reply, calls: a.tools }, via, `ANSWER FROM THE AI MODEL ON THIS COMPUTER (${name}) · ` + (a.tools.length ? `IT WORKED LUNI'S CONTROLS ${a.tools.length} TIME${a.tools.length === 1 ? "" : "S"} · THE SCREEN HAS THE EXACT NUMBERS` : "IT DID NOT USE LUNI'S CONTROLS, SO THIS IS NOT FROM LUNI'S DATA")); })
      .catch((e) => {      // no answer from the model: the built-in commands do what they can with the sentence
        if (thinking !== ctl || e.message === "stopped") return;
        const b = assistant.handle(text);
        show(text, { ...b, ok: false, reply: `${b.reply} (The AI model on this computer did not answer: ${e.message}.)` }, via);
      })
      .finally(() => { if (thinking === ctl) thinking = null; });
    return r;
  }

  // ---------- optional: a language model on this computer ----------
  if (model && !globalThis.LUNO_B64) {      // the preview page cannot reach other addresses, so the option is not offered there
    const row = $("comms-ai-row"), btn = $("comms-ai"), baseIn = $("ai-base"), preset = $("ai-preset"), pick = $("ai-model"), status = $("ai-status");
    preset.replaceChildren(...PRESETS.map(([label, url]) => new Option(label, url)), new Option("OTHER", ""));
    const sync = () => {
      const c = model.config;
      btn.textContent = model.ready ? `LOCAL AI MODEL: ON · ${c.model}` : "LOCAL AI MODEL: OFF"; btn.classList.toggle("on", model.ready);
      $("ai-off").hidden = !model.ready; pick.hidden = !pick.options.length;
    };
    baseIn.value = model.config.base || PRESETS[0][1]; preset.value = PRESETS.some((p) => p[1] === baseIn.value) ? baseIn.value : "";
    preset.addEventListener("change", () => { if (preset.value) baseIn.value = preset.value; });
    baseIn.addEventListener("keydown", (e) => e.stopPropagation());
    btn.addEventListener("click", () => { row.hidden = !row.hidden; });
    $("ai-connect").addEventListener("click", async () => {
      status.textContent = "LOOKING FOR THE MODEL SERVER…";
      try {
        const list = await model.listModels(baseIn.value);
        if (!list.length) throw new Error("the server is running but has no model loaded");
        pick.replaceChildren(...list.map((m) => new Option(m, m)));
        pick.value = list.includes(model.config.model) ? model.config.model : list[0];
        model.set({ on: true, model: pick.value });
        status.textContent = `CONNECTED. ${list.length} MODEL${list.length === 1 ? "" : "S"} FOUND. NOTHING LEAVES THIS COMPUTER.`;
      } catch (e) { model.set({ on: false }); status.textContent = `NOT CONNECTED: ${e.message}`; }
      sync();
    });
    pick.addEventListener("change", () => { model.set({ model: pick.value }); sync(); });
    $("ai-off").addEventListener("click", () => { model.set({ on: false }); status.textContent = "TURNED OFF. THE BUILT-IN COMMANDS STILL WORK."; sync(); });
    sync();
  } else $("comms-ai").hidden = true;

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
    $("comms-note").textContent = `LUNI = LUNAR UTILITY NAVIGATIONAL INTELLIGENCE. IT UNDERSTANDS COMMANDS ON THIS UNIT, WITH NO EARTH LINK. ${voice}`;
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
    mic.textContent = on ? (st.hands ? "● LISTENING FOR “LUNI…”" : "● LISTENING… SPEAK NOW") : canListen() ? "● TALK" : "NO MICROPHONE · TYPE";
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
      if (e.error === "not-allowed" || e.error === "service-not-allowed") noMic();
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
    $("comms-hands").textContent = `HANDS-FREE ${st.hands ? "ON · SAY “LUNI, …”" : "OFF"}`; $("comms-hands").classList.toggle("on", st.hands);
    $("comms-hands").hidden = !canListen(); mic.classList.toggle("off", !canListen());
    key.classList.toggle("on", st.listening || st.hands);
    if (!st.listening) mic.textContent = canListen() ? "● TALK" : "NO MICROPHONE · TYPE";
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
    if (!show) { thinking?.abort(); thinking = null; st.hands = false; stopListening(); globalThis.speechSynthesis?.cancel(); syncOpts(); input.blur(); }
    else { note(); syncOpts(); }
  }
  // T key / ASK LUNI key: open and listen (or put the cursor in the box when the browser cannot listen).
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
