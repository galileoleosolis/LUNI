// LUNI's command assistant (LUNI = Lunar Utility Navigational Intelligence, the name of the whole unit). It turns a typed or spoken sentence into "tool calls" (the same actions the
// keys and buttons do) and writes a short answer from LUNI's own numbers. It is a fixed set of rules, not a
// language model: it runs on the unit with no Earth link, and it never states anything LUNI did not compute.
//
// The tool list (TOOLS + runTool) is also the hand-over point for a language model: a model that can call these
// tools can drive LUNI the same way.

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const monthIndex = (w) => MONTHS.indexOf(w.slice(0, 3).toUpperCase());
const pad = (n) => String(n).padStart(2, "0");
const stamp = (d) => `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:00 UTC`;
const day = (d) => `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
// "5 days 13 hours"
export function dur(hours) {
  const h = Math.max(0, Math.round(hours)), d = Math.floor(h / 24), r = h % 24;
  return d && r ? `${plural(d, "day")} ${plural(r, "hour")}` : d ? plural(d, "day") : plural(r, "hour");
}
const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
const compass = (az) => COMPASS[Math.round((((az % 360) + 360) % 360) / 45) % 8];
const deg = (v) => `${v <= -0.05 ? "−" : ""}${Math.abs(v).toFixed(1)}°`;

// What a language model (or anything else) can ask LUNI to do.
export const TOOLS = [
  { name: "select_site", description: "Select one of LUNI's preset landing sites by id, or by its number in the site list (1 = first).",
    input_schema: { type: "object", properties: { id: { type: "string" }, number: { type: "integer" } }, additionalProperties: false } },
  { name: "select_point", description: "Select a custom point on the Moon. Latitude in degrees (south negative), longitude in degrees east (west negative).",
    input_schema: { type: "object", properties: { lat: { type: "number" }, lon: { type: "number" } }, required: ["lat", "lon"], additionalProperties: false } },
  { name: "step_site", description: "Move to the next (+1) or previous (-1) preset site.",
    input_schema: { type: "object", properties: { by: { type: "integer", enum: [1, -1] } }, required: ["by"], additionalProperties: false } },
  { name: "set_landing_time", description: "Set the landing time (UTC). Any part left out keeps its current value. month is 1-12, hour is 0-23. now=true sets the current time.",
    input_schema: { type: "object", properties: { year: { type: "integer" }, month: { type: "integer" }, day: { type: "integer" }, hour: { type: "integer" }, now: { type: "boolean" } }, additionalProperties: false } },
  { name: "shift_landing_time", description: "Move the landing time later (positive) or earlier (negative) by a number of hours.",
    input_schema: { type: "object", properties: { hours: { type: "number" } }, required: ["hours"], additionalProperties: false } },
  { name: "next_good_time", description: "Jump the landing time to the start of the next landing window that meets the mission needs.",
    input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "set_mission_need", description: "Change one mission need. days: mission length. maxDarkH: longest dark spell the mission can sit out, in hours. earthMinPct: least share of the mission with Earth in view. earthAtLanding: whether Earth must be in view at landing; give it with 'required' (true or false), the others with 'value' (a number). step (+1 or -1) moves days to the next longer or shorter choice instead of giving a value.",
    input_schema: { type: "object", properties: { need: { type: "string", enum: ["days", "maxDarkH", "earthMinPct", "earthAtLanding"] }, value: { type: "number" }, required: { type: "boolean" }, step: { type: "integer" } }, required: ["need"], additionalProperties: false } },
  { name: "mission_clock", description: "Move the mission clock (the moment shown for the Sun and Earth). to_hours: hours after landing. by_hours: relative move. play: true starts it running, false pauses it.",
    input_schema: { type: "object", properties: { to_hours: { type: "number" }, by_hours: { type: "number" }, play: { type: "boolean" } }, additionalProperties: false } },
  { name: "open_view", description: "Open a view: 'scan' (map of nearby points, to find a better spot), 'surface' (3D first-person view) or 'main' (close both).",
    input_schema: { type: "object", properties: { view: { type: "string", enum: ["scan", "surface", "main"] } }, required: ["view"], additionalProperties: false } },
  { name: "take_option", description: "After a NO-GO, LUNI offers up to three numbered ways to get a GO. Take one (1-3). 'best_point' moves the site to the best point found by the area scan.",
    input_schema: { type: "object", properties: { number: { type: "integer" }, best_point: { type: "boolean" } }, additionalProperties: false } },
  { name: "pin", description: "Pin the current site and landing time to the compare list.",
    input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "report", description: "Read out LUNI's numbers. topic: status (GO / NO-GO and why), options (ways to get a GO), sun, earth, eclipse, site (the current one), sites (the list), time, needs, help.",
    input_schema: { type: "object", properties: { topic: { type: "string", enum: ["status", "options", "sun", "earth", "eclipse", "site", "sites", "time", "needs", "help", "who"] } }, required: ["topic"], additionalProperties: false } },
];

// ---------- understanding a sentence ----------
const ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, twentieth: 20, thirtieth: 30 };

// Lower case, no accents or punctuation, number words as digits.
export function normalize(text) {
  let t = String(text).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  t = t.replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (m, y, mo, d) => (+mo >= 1 && +mo <= 12 ? `${+d} ${MONTH_FULL[+mo - 1].toLowerCase()} ${y}` : m));
  t = t.replace(/[’'`]/g, " ").replace(/(\d),(\d{3})\b/g, "$1$2").replace(/(\w)-(?=\w)/g, "$1 ").replace(/\.(?!\d)/g, " ").replace(/[^a-z0-9.:%\- ]/g, " ");
  const out = [];
  for (const w of t.split(/\s+/).filter(Boolean)) {
    const prev = out[out.length - 1];
    if (w in ONES) {
      if (prev && prev.tens) { prev.v += ONES[w]; prev.tens = false; } else out.push({ v: ONES[w] });
    } else if (w in TENS) out.push({ v: TENS[w], tens: true });
    else out.push(w);
  }
  t = out.map((x) => (typeof x === "string" ? x : String(x.v))).join(" ");
  t = t.replace(/\b20 (\d{2})\b/g, "20$1").replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1").replace(/\b(\d{1,2}) hundred(?: hours)?\b/g, "$1:00").replace(/\b(an?) (day|week|hour|month)\b/g, "1 $2");
  t = t.replace(/^(?:(?:hey|ok|okay|yo) )?(?:luni|lunie|luny|looney|loony|loonie|luno|luna|lunar)\b/, "").replace(/\b(?:please|thanks|thank you)\b/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

// Ways people (and speech recognizers) say the preset names.
const ALIASES = {
  nobile1: ["nobile rim 1", "nobile rim", "nobile", "noble rim 1", "noble rim", "no bill rim"],
  malapert: ["malapert massif", "malapert", "mala pert", "malaperte", "malapert mountain"],
  haworth: ["haworth crater floor", "haworth crater", "haworth", "hayworth", "crater floor", "shadowed crater"],
  shackleton: ["shackleton connecting ridge", "shackleton ridge", "shackleton", "shackelton", "connecting ridge"],
  im2: ["im 2 athena", "im 2", "im2", "i m 2", "athena", "mons mouton", "intuitive machines 2"],
  im1: ["im 1 odysseus", "im 1", "im1", "i m 1", "odysseus", "malapert a", "intuitive machines 1"],
  ch3: ["chandrayaan 3", "chandrayaan", "chandrayan 3", "chandrayan", "shiv shakti"],
  ce6: ["chang e 6", "change 6", "chang 6", "chang e six", "apollo basin"],
  ce4: ["chang e 4", "change 4", "chang 4", "von karman"],
  apollo11: ["apollo 11", "tranquility base", "tranquility"],
  apollo15: ["apollo 15", "hadley"],
  apollo17: ["apollo 17", "taurus littrow", "taurus"],
};
function aliasList(sites) {
  const list = [];
  for (const s of sites) {
    const names = new Set([normalize(s.name), ...s.name.split("·").map(normalize), ...(ALIASES[s.id] || [])]);
    for (const a of names) if (a.length > 2) list.push([a, s.id]);
  }
  return list.sort((a, b) => b[0].length - a[0].length);
}

const num = (s) => parseFloat(s);
const LATER = /^(later|forward|forwards|ahead|after|advance|skip|plus|add|delay|slip|push)$/;

// A sentence -> list of { tool, input }. Empty list = not understood.
export function parse(text, sites = []) {
  let t = " " + normalize(text) + " ";
  const calls = [], call = (tool, input = {}) => calls.push({ tool, input });
  // match, and blank out what was understood so a later rule cannot read it a second time
  const take = (re) => { const m = t.match(re); if (m) t = t.slice(0, m.index) + " " + t.slice(m.index + m[0].length); return m; };
  let m;

  if (/^ (help|commands|examples|what can (i|you|we) (say|do|ask)|what do you (do|understand)) /.test(t)) return [{ tool: "report", input: { topic: "help" } }];
  if (/^ (who|what) are you |^ what(?: is| s| does) (?:your name|luni|luno)(?: stand for| mean)? |^ (?:your )?name /.test(t)) return [{ tool: "report", input: { topic: "who" } }];

  // --- where ---
  if ((m = take(/\b(?:lat(?:itude)?) (minus |-)?(\d+(?:\.\d+)?)(?: degrees?)?(?: (north|south|n|s))?(?: and)? (?:lon(?:g|gitude)?) (minus |-)?(\d+(?:\.\d+)?)(?: degrees?)?(?: (east|west|e|w))?\b/))
      || (m = take(/(?: |^)(minus |-)?(\d+(?:\.\d+)?)(?: degrees?)? (north|south)(?: and)? (minus |-)?(\d+(?:\.\d+)?)(?: degrees?)? (east|west)\b/))) {
    const lat = num(m[2]) * (m[1] || /^s/.test(m[3] || "") ? -1 : 1), lon = num(m[5]) * (m[4] || /^w/.test(m[6] || "") ? -1 : 1);
    call("select_point", { lat, lon });
  } else if ((m = take(/\b(?:next|following) (?:site|one)\b/))) call("step_site", { by: 1 });
  else if ((m = take(/\b(?:previous|prior|last) site\b|\bsite before\b/))) call("step_site", { by: -1 });
  else if ((m = take(/\b(?:site|preset)(?: number| no)? (\d{1,2})\b/))) call("select_site", { number: +m[1] });
  else {
    for (const [alias, id] of aliasList(sites)) {
      const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (take(re)) { call("select_site", { id }); break; }
    }
  }

  // --- mission needs ---
  if ((m = take(/\b(\d+) days? (?:long )?(?:mission|stay)\b/)) || (m = take(/\b(?:mission|stay)(?: length| duration| time)?(?: of| to| is| for| lasts| lasting)? (\d+)(?: days?)?\b/))
      || (m = take(/\b(?:stay|staying|last|lasting)(?: for)? (\d+) days?\b/))) call("set_mission_need", { need: "days", value: +m[1] });
  else if ((m = take(/\b(?:shorter|shorten|longer|lengthen|extend)\b[a-z ]{0,14}\b(?:mission|stay)\b(?:[a-z ]{0,6}\b(\d+)(?: days?)?)?/))
      || (m = take(/\b(?:mission|stay) (?:shorter|longer)\b/))) {
    if (m[1]) call("set_mission_need", { need: "days", value: +m[1] });
    else call("set_mission_need", { need: "days", step: /short/.test(m[0]) ? -1 : 1 });
  }
  if ((m = take(/\b(\d+) ?(?:h|hrs?|hours?) (?:of |in |in the |of the )?(?:dark|darkness|night|shadow)\b/))
      || (m = take(/\b(?:dark|darkness|night|shadow)(?: gap| limit| time| spell| period)?(?: of| to| up to| at most| max| maximum| is)? (\d+)(?: ?(?:h|hrs?|hours?))?\b/))) call("set_mission_need", { need: "maxDarkH", value: +m[1] });
  else if (take(/\bno (?:dark|darkness)\b|\b(?:always|constant|continuous) (?:sun|sunlight|power)\b/)) call("set_mission_need", { need: "maxDarkH", value: 0 });
  if (take(/\b(?:without|no|not need|don t need|do not need|skip|drop)\b[a-z ]{0,25}\bearth\b[a-z ]{0,20}\blanding\b/) || take(/\bland(?:ing)? without (?:an? |the )?earth(?: link| contact)?\b/)
      || take(/\bearth\b[a-z ]{0,20}\blanding\b[a-z ]{0,10}\b(?:off|no|not required|not needed|optional)\b/)) call("set_mission_need", { need: "earthAtLanding", value: false });
  else if (take(/\b(?:need|require|want|with)\b[a-z ]{0,20}\bearth\b[a-z ]{0,20}\blanding\b/) || take(/\bearth\b[a-z ]{0,20}\blanding\b[a-z ]{0,10}\b(?:on|yes|required|needed)\b/))
    call("set_mission_need", { need: "earthAtLanding", value: true });
  if ((m = take(/\bearth\b[a-z ]*?(\d+) ?(?:%|percent)/)) || (m = take(/\b(\d+) ?(?:%|percent)[a-z ]*\bearth(?: link| contact| time| coverage)?\b/))) call("set_mission_need", { need: "earthMinPct", value: +m[1] });
  else if (take(/\bany (?:amount of )?earth(?: link| contact| time| coverage)?\b/)) call("set_mission_need", { need: "earthMinPct", value: 0 });

  // --- when ---
  if (take(/\bnext (?:good |best |open |available |landing )*(?:time|window|chance|opportunity|slot|date)\b|\bwhen (?:can|could|should|do) (?:i|we) land\b|\bfind (?:me )?(?:a |the |the next )?(?:good )?(?:landing )?(?:time|window|date)\b|\bbest time to land\b/))
    call("next_good_time");
  const when = {};
  if ((m = take(new RegExp(`\\b(\\d{1,2}) (?:of )?${MONTH_RE}\\b(?: (\\d{4}))?`)))) { when.day = +m[1]; when.month = monthIndex(m[2]) + 1; if (m[3]) when.year = +m[3]; }
  else if ((m = take(new RegExp(`\\b${MONTH_RE} (\\d{1,2})\\b(?: (\\d{4}))?`)))) { when.month = monthIndex(m[1]) + 1; when.day = +m[2]; if (m[3]) when.year = +m[3]; }
  else if ((m = take(new RegExp(`\\b${MONTH_RE} (\\d{4})\\b`)))) { when.month = monthIndex(m[1]) + 1; when.year = +m[2]; }
  else if ((m = take(new RegExp(`\\bin ${MONTH_RE}\\b`)))) when.month = monthIndex(m[1]) + 1;
  if (when.year == null && (m = take(/\b(?:in|year) (20\d{2})\b/))) when.year = +m[1];
  const hour = (h, ap) => (ap === "pm" && h < 12 ? h + 12 : ap === "am" && h === 12 ? 0 : h);
  if ((m = take(/\b(\d{1,2}):(\d{2})(?: ?(am|pm))?(?: utc| hours)?\b/)) || (m = take(/\b(\d{1,2}) ?(?:o clock|oclock)() ?(am|pm)?\b/)) || (m = take(/\b(\d{1,2})() ?(am|pm)\b/))
      || (m = take(/\b(\d{1,2})()() utc\b/)) || (m = take(/\b(?:at|hour) (\d{1,2})()()\b/))) when.hour = hour(+m[1], m[3]);
  else if (take(/\b(?:noon|midday)\b/)) when.hour = 12;
  else if (take(/\bmidnight\b/)) when.hour = 0;
  if (Object.keys(when).length) call("set_landing_time", when);
  else if (take(/\b(?:right now|now|today|current time)\b/)) call("set_landing_time", { now: true });

  // --- mission clock (hours after landing) ---
  if ((m = take(/\b(?:mission )?day (\d+)\b/)) || (m = take(/\b(\d+) days? (?:in|into|after landing|after touchdown)\b/))) call("mission_clock", { to_hours: +m[1] * 24 });
  else if ((m = take(/\b(\d+) hours? (?:in|into|after landing|after touchdown)\b/))) call("mission_clock", { to_hours: +m[1] });
  else if (take(/\b(?:back to|return to|reset to|at) (?:the )?(?:landing|touchdown)\b|\breset (?:the )?clock\b|\bstart of (?:the )?mission\b/)) call("mission_clock", { to_hours: 0 });
  else if (take(/\bend of (?:the )?mission\b/)) call("mission_clock", { to_hours: -1 });

  // --- relative moves: days and weeks move the landing time, hours move the mission clock ---
  const rel = (n, unit, dirWord) => {
    const sign = LATER.test(dirWord) ? 1 : -1, landing = /\bland(?:ing)?\b/.test(t);
    if (/^hour/.test(unit)) landing ? call("shift_landing_time", { hours: sign * n }) : call("mission_clock", { by_hours: sign * n });
    else call("shift_landing_time", { hours: sign * n * (/^week/.test(unit) ? 168 : /^month/.test(unit) ? 720 : 24) });
  };
  const DIR = "later|forward|forwards|ahead|after|advance|skip|plus|add|delay|slip|push|earlier|back|backward|backwards|before|sooner|minus|rewind|subtract|pull";
  if ((m = take(new RegExp(`\\b(\\d+) (days?|weeks?|hours?|months?) (${DIR})\\b`)))) rel(+m[1], m[2], m[3]);
  else if ((m = take(new RegExp(`\\b(${DIR})\\b[a-z ]{0,12}?\\b(\\d+) (days?|weeks?|hours?|months?)\\b`)))) rel(+m[2], m[3], m[1]);
  else if (take(/\b(?:tomorrow|next day)\b/)) call("shift_landing_time", { hours: 24 });
  else if (take(/\b(?:yesterday|previous day|day before)\b/)) call("shift_landing_time", { hours: -24 });
  else if (take(/\bnext week\b/)) call("shift_landing_time", { hours: 168 });
  else if (take(/\b(?:last|previous) week\b/)) call("shift_landing_time", { hours: -168 });

  // --- views, options, pin, clock run ---
  if ((m = take(/\b(?:option|choice|number|way)(?: number)? ([123])\b/)) || (m = take(/\b(?:the |do the |take the )([123]) (?:1\b|option\b|choice\b|$)/))) call("take_option", { number: +m[1] });
  if (take(/\b(?:move|go|jump|switch)\b[a-z ]{0,12}\bbest (?:point|spot|place|one)\b|\buse the best (?:point|spot|place)\b/)) call("take_option", { best_point: true });
  else if (take(/\b(?:close|exit|leave|hide)\b[a-z ]{0,10}\b(?:scan|map|surface|3d|view)?\b|\bmain screen\b|^ (?:cancel|go back|back) $/)) call("open_view", { view: "main" });
  else if (take(/\b(?:better|best|nearby|another|different) (?:spot|place|point|location)\b|\b(?:area )?scan\b|\bsearch (?:the )?(?:area|nearby)\b|\blook nearby\b|\bfind a better\b/)) call("open_view", { view: "scan" });
  else if (take(/\b(?:surface|3d|3 d|first person|look around|ground view|stand on)\b/)) call("open_view", { view: "surface" });
  if (take(/\b(?:pin|bookmark|save this|remember this|keep this)\b/)) call("pin");
  if (take(/\b(?:play|resume|run the clock|start the clock|run time)\b/)) call("mission_clock", { play: true });
  else if (take(/\b(?:pause|stop|freeze|hold)\b/)) call("mission_clock", { play: false });

  calls.leftover = t;      // what no rule used
  if (calls.length) return calls;

  // --- questions ---
  const q = (re) => re.test(t);
  if (q(/\b(?:go to|select|switch to|fly to|land at|take me to|move to)\b/) || q(/\b(?:which|what|list)(?: are)?(?: the)? sites\b/)) call("report", { topic: "sites" });   // a place LUNI does not know, or asking for the list
  else if (q(/\beclipse/)) call("report", { topic: "eclipse" });
  else if (q(/\bhow (?:do|can|could|would) (?:i|we) (?:get|make|fix|turn)\b|\bwhat (?:can|could|should) (?:i|we) (?:do|change|try)\b|\bways\b|\bfix (?:it|this)\b|\boptions\b|\bsuggest/)) call("report", { topic: "options" });
  else if (q(/\bwhy\b|\bwhat s wrong\b|\bwhat is wrong\b|\breasons?\b|\bproblem\b/)) call("report", { topic: "status" });
  else if (q(/\bsun\b|\bsunset\b|\bsunrise\b|\bsunlight\b|\bsunlit\b|\bpower\b|\bdaylight\b|\bdark\b|\bnight\b|\bsolar\b/)) call("report", { topic: "sun" });
  else if (q(/\bearth(?:rise|set)?\b|\blink\b|\bcomms?\b|\bcommunications?\b|\bcontact\b|\bsignal\b|\bground control\b|\bhouston\b|\bradio\b/)) call("report", { topic: "earth" });
  else if (q(/\bwhere (?:am i|are we)\b|\b(?:what|which) (?:site|place|spot)\b|\bcoordinates?\b|\bhow (?:high|steep)\b|\belevation\b|\bslope\b|\bheight\b|\bterrain\b/)) call("report", { topic: "site" });
  else if (q(/\bwhat (?:time|date|day)\b|\bwhen (?:are|do|is) (?:we|i|the) land|\blanding time\b|\bclock\b/)) call("report", { topic: "time" });
  else if (q(/\bneeds?\b|\bsettings?\b|\brequirements?\b|\bhow long is the mission\b/)) call("report", { topic: "needs" });
  else if (q(/\bstatus\b|\breport\b|\bgo\b|\bverdict\b|\banswer\b|\bsummary\b|\bhow (?:does|is) it look|\bcan (?:i|we) land\b|\bsafe\b|\bok\b|\bokay\b|\bgood\b/)) call("report", { topic: "status" });
  return calls;
}

// True when a sentence asks for more than the rules did with it: a comparison, a recommendation, a second site.
// Such sentences are better handed to a language model, when one is connected.
const OPEN = /\b(?:best|better|worse|worst|compare|comparison|which|recommend|versus|vs|safest|longest|shortest|most|least|instead of|rather|difference|explain|tell me about|what if|how many|how much|how long)\b/;
export function isOpenQuestion(calls, sites = []) {
  const rest = calls.leftover || "";
  return OPEN.test(rest) || aliasList(sites).some(([alias]) => rest.includes(` ${alias} `));
}

// ---------- doing it, and answering ----------
// `api` is the bridge to the running app (see assistantApi in app.js).
export function createAssistant(api) {
  const snap = () => api.snapshot();

  function verdictText(s = snap()) {
    const v = s.verdict, r = s.req;
    let out;
    if (v.ok) {
      out = `GO for a ${r.days}-day mission. Sunlight lasts ${v.marginOpen ? "more than " : ""}${dur(v.marginHours)} longer than the mission needs. Earth is in view for ${Math.round(v.earthPct)}% of the mission.`;
    } else {
      const why = [];
      if (!s.landing.sunUp) why.push("there is no usable Sun at landing");
      else if (v.sunHeldHours < r.days * 24) why.push(`sunlight is lost after ${dur(v.sunHeldHours)}`);
      if (r.earthAtLanding && !s.landing.earthUp) why.push("Earth is not in view at landing");
      if (v.earthPct < r.earthMinPct) why.push(`Earth is in view for only ${Math.round(v.earthPct)}% of the mission and the need is ${r.earthMinPct}%`);
      out = `NO-GO for a ${r.days}-day mission: ${why.join(", and ")}. ` + (s.next ? `Next good landing time: ${stamp(s.next)}.` : "No good landing time in the next 12 months.");
      if (s.options.length) out += ` Say OPTIONS to hear ways to get a GO.`;
    }
    for (const e of s.eclipses) out += ` Warning: eclipse on ${day(e.peak)}, Earth hides ${e.maxCover >= 0.995 ? "all" : Math.round(e.maxCover * 100) + "%"} of the Sun for up to ${plural(Math.round((e.end - e.start) / 3600000), "hour")}.`;
    return out;
  }
  const momentHead = (s) => (s.idx ? `${dur(s.idx)} after landing (${stamp(s.cur.t)})` : `At landing (${stamp(s.cur.t)})`);
  function sunText(s = snap(), head = true) {
    const c = s.cur, where = `height ${deg(c.sunEl)}, direction ${Math.round(c.sunAz)}° (${compass(c.sunAz)})`;
    const frac = Math.round(c.sunFrac * 100);
    let out = (head ? `${momentHead(s)}: ` : "") + (c.sunUp ? `the Sun is up${frac < 100 ? `, ${frac}% of its disc usable` : ""}, ${where}.` : `no usable Sun${frac > 0 ? ` (only ${frac}% of its disc)` : ""}, ${where}.`);
    if (c.eclipse > 0.01 && c.sunTerrain > 0) out += ` Eclipse: Earth hides ${Math.round(c.eclipse * 100)}% of the Sun.`;
    if (s.sunLeft == null) out += c.sunUp ? " It stays up for the rest of the 30 days shown." : " It stays down for the rest of the 30 days shown.";
    else out += ` ${c.sunUp ? (s.sunNextIsEclipse ? "An eclipse cuts the sunlight" : "Sunset") : "Sunrise"} in ${dur(s.sunLeft)}, on ${stamp(new Date(+c.t + s.sunLeft * 3600000))}.`;
    return out;
  }
  function earthText(s = snap(), head = true) {
    const c = s.cur, where = `height ${deg(c.earthEl)}, direction ${Math.round(c.earthAz)}° (${compass(c.earthAz)})`;
    let out = (head ? `${momentHead(s)}: ` : "") + (c.earthUp ? `Earth is in view, so there is a link: ${where}.` : `Earth is behind the skyline, so there is no link: ${where}.`);
    if (s.earthLeft == null) out += c.earthUp ? " It stays in view for the rest of the 30 days shown." : " It stays out of view for the rest of the 30 days shown.";
    else out += ` ${c.earthUp ? "Link lost" : "Link back"} in ${dur(s.earthLeft)}, on ${stamp(new Date(+c.t + s.earthLeft * 3600000))}.`;
    return out;
  }
  const fmtLat = (v) => `${Math.abs(v).toFixed(2)}° ${v < 0 ? "south" : "north"}`;
  const fmtLon = (v) => { const l = ((v + 180) % 360 + 360) % 360 - 180; return `${Math.abs(l).toFixed(2)}° ${l < 0 ? "west" : "east"}`; };
  function siteText(s = snap()) {
    let out = `${s.siteName}, at ${fmtLat(s.site.lat)}, ${fmtLon(s.site.lon)}.`;
    const tr = s.terrain;
    if (tr.real) out += ` Ground height ${tr.heightM < 0 ? "−" : "+"}${Math.abs(Math.round(tr.heightM))} m, slope ${tr.slopeDeg.toFixed(1)}°, from NASA's LOLA elevation maps${tr.reduced ? " (reduced detail)" : ""}.`;
    else out += s.terrainBusy ? " The skyline is still being worked out." : " No terrain loaded: flat horizon.";
    return out;
  }
  const needsText = (s = snap()) => `Mission needs: ${s.req.days} days long; can sit ${s.req.maxDarkH} hours in the dark; Earth link at landing ${s.req.earthAtLanding ? "required" : "not required"}; Earth in view for ${s.req.earthMinPct ? `at least ${s.req.earthMinPct}%` : "any share"} of the mission.`;
  function optionsText(s = snap()) {
    if (s.verdict.ok) return "This is already a GO, so nothing needs to change.";
    if (!s.options.length) return "No simple way to a GO from here. Try another site.";
    return "Ways to get a GO: " + s.options.map((o, i) => `${i + 1}: ${o.toLowerCase()}`).join(". ") + `. Say OPTION ${s.options.map((_, i) => i + 1).join(" or ")}.`;
  }
  const WHO = "I am LUNI, the Lunar Utility Navigational Intelligence. I work this unit's controls and read out its numbers.";
  const HELP = "You can say: GO TO SHACKLETON. LAND ON 14 JAN 2027 AT 5. NEXT GOOD TIME. MISSION 14 DAYS. ALLOW 24 HOURS OF DARK. STATUS. WHY? OPTIONS. WHERE IS THE SUN? DO WE HAVE A LINK? BETTER SPOT. SURFACE VIEW. DAY 5. PLAY. PIN.";

  const nearest = (list, v) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

  // Run one tool. Returns { say, changed } where changed = the answer to "can we land?" may have moved.
  function runTool(tool, input = {}) {
    const s = snap();
    switch (tool) {
      case "select_site": {
        const sites = api.sites(), site = input.id ? sites.find((x) => x.id === input.id) : sites[(input.number | 0) - 1];
        if (!site) return { say: `There is no such site. The list has ${sites.length} sites; say SITE and a number from 1 to ${sites.length}, or a name.` };
        api.selectSite(site);
        return { say: `Site: ${site.name.replace(/ · /g, ", ")}.`, changed: true };
      }
      case "select_point": {
        if (!(Math.abs(input.lat) <= 90) || !Number.isFinite(input.lon)) return { say: "That is not a point on the Moon. Latitude runs from 90 south to 90 north." };
        api.selectPoint(input.lat, input.lon);
        return { say: `Custom point at ${fmtLat(input.lat)}, ${fmtLon(input.lon)}. The skyline comes from the reduced-detail maps and takes a moment.`, changed: true, wait: true };
      }
      case "step_site": { api.stepSite(input.by); return { say: `Site: ${snap().siteName}.`, changed: true }; }
      case "set_landing_time": {
        const t = new Date(input.now ? Date.now() : +s.t0);
        if (!input.now) {
          const y = input.year ?? t.getUTCFullYear(), mo = (input.month ?? t.getUTCMonth() + 1) - 1;
          const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
          if (input.day != null && (input.day < 1 || input.day > last)) return { say: `${MONTH_FULL[mo]} ${y} has no day ${input.day}.` };
          if (input.hour != null && (input.hour < 0 || input.hour > 23)) return { say: "Hours run from 0 to 23, in UTC." };
          t.setTime(Date.UTC(y, mo, Math.min(input.day ?? t.getUTCDate(), last), input.hour ?? t.getUTCHours()));
        }
        t.setUTCMinutes(0, 0, 0);
        api.setT0(t);
        const got = snap().t0;
        return { say: +got === +t ? `Landing set to ${stamp(got)}.` : `The Sun and Earth data on this unit runs from ${day(s.coverage.start)} to ${day(s.coverage.last)}. Landing set to ${stamp(got)}.`, changed: true };
      }
      case "shift_landing_time": {
        api.setT0(new Date(+s.t0 + input.hours * 3600000));
        return { say: `Landing moved ${dur(Math.abs(input.hours))} ${input.hours < 0 ? "earlier" : "later"}, to ${stamp(snap().t0)}.`, changed: true };
      }
      case "next_good_time": {
        if (!s.next) return { say: "There is no later good landing time in the 12 months shown. Relax a mission need or try another site." };
        api.setT0(s.next);
        return { say: `Landing moved to the next good time, ${stamp(s.next)}.`, changed: true };
      }
      case "set_mission_need": {
        const k = input.need, opts = api.needOptions();
        if (k === "earthAtLanding") { const on = input.required ?? !!input.value; api.setReq(k, on); return { say: `Earth link at landing: ${on ? "required" : "not required"}.`, changed: true }; }
        if (!opts[k]) return { say: "There is no such mission need." };
        let v = input.value;
        if (input.step) {
          const i = opts[k].indexOf(s.req[k]) + Math.sign(input.step);
          if (i < 0 || i >= opts[k].length) return { say: `The mission is already at the ${input.step < 0 ? "shortest" : "longest"} choice, ${s.req[k]} days.` };
          v = opts[k][i];
        }
        if (!Number.isFinite(v)) return { say: "Say a number for that need." };
        const use = nearest(opts[k], v), unit = { days: "days", maxDarkH: "hours", earthMinPct: "%" }[k];
        api.setReq(k, use);
        const name = { days: "Mission length", maxDarkH: "Longest dark spell it can sit out", earthMinPct: "Earth link for at least" }[k];
        const val = k === "earthMinPct" ? (use ? `${use}% of the mission` : "any share of the mission") : `${use} ${unit}`;
        return { say: (use === v ? "" : `The choices are ${opts[k].join(", ")}; the closest is ${use}. `) + `${name}: ${val}.`, changed: true };
      }
      case "mission_clock": {
        if (input.play != null) { api.play(!!input.play); return { say: input.play ? "Mission clock running. Say PAUSE to stop it." : "Mission clock paused.", clock: !input.play }; }
        const to = input.to_hours === -1 ? s.req.days * 24 : input.to_hours != null ? input.to_hours : s.idx + input.by_hours;
        if (to < 0 || to > s.maxIdx) { api.setIdx(Math.max(0, Math.min(s.maxIdx, to))); return { say: `The mission clock covers the first 30 days after landing.`, clock: true }; }
        api.setIdx(to);
        return { say: "", clock: true };
      }
      case "open_view": {
        if (input.view === "scan") { api.openScan(true); return { say: "Scanning the ground around this site for a better spot. Bright cells are better. When it finishes, say MOVE TO THE BEST POINT." }; }
        if (input.view === "surface") { api.openSurface(true); return { say: "Opening the 3D view from the surface. Say CLOSE to come back." }; }
        api.openScan(false); api.openSurface(false);
        return { say: "Back to the main screen." };
      }
      case "take_option": {
        if (input.best_point) return api.pickBest() ? { say: "Moved to the best point the scan found.", changed: true, wait: true } : { say: "The scan has no best point yet. Say BETTER SPOT and wait for it to finish." };
        if (s.verdict.ok) return { say: "This is already a GO, so there are no options to take." };
        const o = s.options[input.number - 1];
        if (!o) return { say: optionsText(s) };
        api.takeOption(input.number - 1);
        return /BETTER SPOT/.test(o) ? { say: "Scanning the ground around this site for a better spot." } : { say: `Done: ${o.toLowerCase()}.`, changed: true };
      }
      case "pin": api.pin(); return { say: "Pinned to the compare list." };
      case "report":
        return { say: { status: () => `${s.siteName}, landing ${stamp(s.t0)}. ${verdictText(s)}`, options: optionsText, sun: (x) => sunText(x), earth: (x) => earthText(x), site: siteText, needs: needsText, help: () => HELP, who: () => WHO,
          sites: () => "The sites are: " + api.sites().map((x, i) => `${i + 1}, ${x.name.split(" · ")[0]}`).join("; ") + ". Say GO TO and a name, or SITE and a number.",
          eclipse: () => (s.eclipses.length ? s.eclipses.map((e) => `Eclipse on ${day(e.peak)}: Earth hides ${e.maxCover >= 0.995 ? "all" : Math.round(e.maxCover * 100) + "%"} of the Sun for up to ${plural(Math.round((e.end - e.start) / 3600000), "hour")}.`).join(" ") : `No eclipse touches this ${s.req.days}-day mission.`),
          time: () => `Landing time ${stamp(s.t0)}. The mission clock shows ${s.idx ? dur(s.idx) + " after landing, " + stamp(s.cur.t) : "the landing time"}.` }[input.topic]?.(s) ?? HELP };
      default: return { say: `There is no tool called ${tool}.` };
    }
  }

  // A sentence in, an answer out.
  // deferOpen: do nothing and say so when the sentence is an open question (the caller will ask a language model).
  function handle(text, { deferOpen = false } = {}) {
    const calls = parse(text, api.sites());
    if (deferOpen && calls.length && isOpenQuestion(calls, api.sites())) return { ok: false, defer: true, calls: [], reply: "" };
    if (!calls.length) return { ok: false, calls, reply: `I did not find a command in "${String(text).trim().slice(0, 60)}". Say HELP for examples.` };
    const parts = []; let changed = false, clock = false, wait = false;
    for (const c of calls) { const r = runTool(c.tool, c.input); if (r.say) parts.push(r.say); changed ||= !!r.changed; clock ||= !!r.clock; wait ||= !!r.wait; }
    if (changed && !wait) parts.push(verdictText());
    else if (clock) parts.push(sunText(), earthText(snap(), false));
    return { ok: true, calls, reply: parts.join(" ") };
  }

  // For a language model: run a tool by name with loosely typed input, and return everything it needs to read as text.
  function callTool(name, input) {
    const def = TOOLS.find((t) => t.name === name);
    if (!def) return `ERROR: there is no tool called ${name}. The tools are: ${TOOLS.map((t) => t.name).join(", ")}.`;
    if (!input || typeof input !== "object" || Array.isArray(input)) input = {};
    const props = def.input_schema.properties, args = {};
    for (const [k, v] of Object.entries(input)) {
      if (!(k in props) || v == null) continue;
      const type = props[k].type;
      args[k] = type === "integer" || type === "number" ? Number(v) : type === "boolean" ? v === true || v === "true" : v;
      if ((type === "integer" || type === "number") && !Number.isFinite(args[k])) return `ERROR: ${k} must be a number.`;
    }
    for (const k of def.input_schema.required || []) if (!(k in args)) return `ERROR: ${name} needs "${k}".`;
    const r = runTool(name, args);
    let out = r.say || "Done.";
    if (r.wait) out += " The verdict for this point is not ready yet; call report with topic status to read it.";
    else if (r.changed) out += " " + verdictText();
    else if (r.clock) out += " " + sunText() + " " + earthText(snap(), false);
    return out;
  }

  return { handle, runTool, callTool, tools: TOOLS, verdictText };
}

// Text for the speech voice: full month names, no symbols it would stumble on.
export function forSpeech(text) {
  return text.replace(/\b(\d{1,2}) (JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) (\d{4})\b/gi, (m, d, mo, y) => `${+d} ${MONTH_FULL[MONTHS.indexOf(mo.toUpperCase())]} ${y}`)
    .replace(/\bNO-GO\b/g, "no go").replace(/−/g, "minus ").replace(/\b(\d+) h\b/g, "$1 hours").replace(/\b(\d+) m\b/g, "$1 meters").replace(/(\d{2}):00 UTC/g, (m, h) => (+h ? `${+h} hundred U T C` : "midnight U T C")).replace(/[“”"]/g, "");
}
