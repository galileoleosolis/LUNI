// Optional: a language model running on this computer, for questions the built-in commands do not cover.
// LUNI talks to a local model server (Ollama, LM Studio, Lemonade, llama.cpp, OpenVINO model server: they all
// speak the same "chat completions with tools" protocol). The model never gets to make up numbers on its own
// authority: it can only call LUNI's tools (js/assistant.js) and is told to answer from what they return.
// Nothing here runs unless the user has set an address and a model in the ASK LUNI panel.

import { TOOLS } from "./assistant.js";

export const PRESETS = [["OLLAMA", "http://localhost:11434/v1"], ["LM STUDIO", "http://localhost:1234/v1"], ["LEMONADE", "http://localhost:8000/api/v1"]];
const KEY = "luno-llm", MAX_ROUNDS = 12, TIMEOUT_MS = 90000;

const SYSTEM = (sites, needs) => `You are LUNI (Lunar Utility for Navigational Intelligence), a lunar landing planning unit with a built-in assistant. You control LUNI only through the tools you are given.
Rules:
- Every number, date and GO / NO-GO you state must come from a tool result in this conversation. If the tools did not give it, say you do not have it. Never estimate.
- To answer a question about a site, a time or the mission needs, set them with the tools first, then read the result. The "report" tool reads the current screen without changing it.
- When comparing several sites or dates, try each one with the tools and report what LUNI returned for each. Leave the screen on the option you recommend.
- Answer in at most three short sentences, plain words, American spelling. Write dates like 14 JAN 2027 01:00 UTC.
- If the request has nothing to do with choosing a landing site or time on the Moon, say that LUNI cannot help with it.
Preset sites (id: name): ${sites.map((s) => `${s.id}: ${s.name}`).join("; ")}.
Mission need choices: days ${needs.days.join("/")}; maxDarkH ${needs.maxDarkH.join("/")}; earthMinPct ${needs.earthMinPct.join("/")}; earthAtLanding true/false.`;

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const clean = (s) => String(s || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();

export function createModelLink({ assistant, sites, needOptions }) {
  let cfg = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} };
  const base = () => String(cfg.base || "").replace(/\/+$/, "");

  async function call(path, body, signal) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    signal?.addEventListener("abort", () => ctl.abort());
    try {
      const r = await fetch(base() + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal } : { signal: ctl.signal });
      if (!r.ok) throw new Error(`the model server answered with error ${r.status}`);
      return await r.json();
    } catch (e) {
      if (e.name === "AbortError") throw new Error(signal?.aborted ? "stopped" : "the model took too long");
      if (e instanceof TypeError) throw new Error(`no model server answered at ${base()} (is it running, and does it allow this page to connect?)`);
      throw e;
    } finally { clearTimeout(timer); }
  }

  // Models the server offers.
  async function listModels(address) {
    if (address != null) { cfg.base = address.trim(); save(); }
    const j = await call("/models");
    return (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean);
  }

  // One question: let the model call LUNI's tools until it has an answer.
  async function ask(text, { onStep, signal } = {}) {
    const tools = TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    const messages = [{ role: "system", content: SYSTEM(sites(), needOptions()) }, { role: "user", content: text }];
    const used = [];
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const j = await call("/chat/completions", { model: cfg.model, messages, tools, tool_choice: "auto", temperature: 0.2, stream: false }, signal);
      const msg = j.choices?.[0]?.message;
      if (!msg) throw new Error("the model sent an empty answer");
      const calls = msg.tool_calls || [];
      if (!calls.length) {
        const reply = clean(msg.content);
        if (!reply) throw new Error("the model sent an empty answer");
        return { reply, tools: used };
      }
      messages.push({ role: "assistant", content: msg.content || "", tool_calls: calls });
      for (const c of calls) {
        let args = c.function?.arguments, result;
        try { if (typeof args === "string") args = args.trim() ? JSON.parse(args) : {}; result = assistant.callTool(c.function?.name, args); }
        catch { result = "ERROR: the tool input was not valid JSON."; }
        used.push(c.function?.name); onStep?.(c.function?.name, used.length);
        messages.push({ role: "tool", tool_call_id: c.id, content: result });
      }
    }
    throw new Error("the model kept working without reaching an answer");
  }

  return {
    ask, listModels,
    get config() { return { ...cfg }; },
    get ready() { return !!(cfg.on && cfg.base && cfg.model); },
    set(change) { cfg = { ...cfg, ...change }; save(); },
  };
}
