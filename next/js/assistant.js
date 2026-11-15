// LUNI's command assistant (LUNI = Lunar Utility for Navigational Intelligence, the name of the whole unit). It turns a typed or spoken sentence into "tool calls" (the same actions the
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
  { name: "next_good_time", description: "Jump the landing time to the start of the next landing window that meets the mission needs. from_here=true stays put when the landing time on screen is already inside a window.",
    input_schema: { type: "object", properties: { from_here: { type: "boolean" } }, additionalProperties: false } },
  { name: "set_mission_need", description: "Change one mission need. days: mission length. maxDarkH: longest dark spell the mission can sit out, in hours. earthMinPct: least share of the mission with Earth in view. maxSlopeDeg: steepest ground accepted, in degrees (0 = any slope). earthAtLanding: whether Earth must be in view at landing; give it with 'required' (true or false), the others with 'value' (a number). step (+1 or -1) moves days to the next longer or shorter choice instead of giving a value.",
    input_schema: { type: "object", properties: { need: { type: "string", enum: ["days", "maxDarkH", "earthMinPct", "maxSlopeDeg", "earthAtLanding"] }, value: { type: "number" }, required: { type: "boolean" }, step: { type: "integer" } }, required: ["need"], additionalProperties: false } },
  { name: "mission_clock", description: "Move the mission clock (the moment shown for the Sun and Earth). to_hours: hours after landing. by_hours: relative move. play: true starts it running, false pauses it.",
    input_schema: { type: "object", properties: { to_hours: { type: "number" }, by_hours: { type: "number" }, play: { type: "boolean" } }, additionalProperties: false } },
  { name: "open_view", description: "Open a view: 'scan' (map of nearby points, to find a better spot), 'surface' (3D first-person view), 'proof' (how LUNI was checked against NASA and real landings, and its limits), 'history' (real landings since 2023 compared, each loadable into the main screen), 'moon' (the big Moon with data layers; give 'layer': elev, slope, sun, earth, shadow, temp or mix) or 'main' (close them all).",
    input_schema: { type: "object", properties: { view: { type: "string", enum: ["scan", "surface", "proof", "history", "moon", "main"] }, layer: { type: "string", enum: ["elev", "slope", "sun", "earth", "shadow", "ice", "temp", "mix"] } }, required: ["view"], additionalProperties: false } },
  { name: "move_to_extreme", description: "In the Best Site Finder's scanned area, move the landing site to the point with the highest or lowest value of one map choice. what: elev (elevation), slope, sun / earth (sunlight or Earth link during the mission), ysun / yearth (the same over all years), temp (average temperature), ice (depth to stable water ice; lowest = nearest the surface), mix (the user's blended score). Opens the finder and waits for the scan if needed.",
    input_schema: { type: "object", properties: { what: { type: "string", enum: ["elev", "slope", "sun", "earth", "ysun", "yearth", "temp", "ice", "mix"] }, which: { type: "string", enum: ["highest", "lowest"] } }, required: ["what", "which"], additionalProperties: false } },
  { name: "compare_sites", description: "Put two preset sites side by side at the landing time on screen: verdict, sunlight, Earth link, slope and energy for each. Opens the comparison box.",
    input_schema: { type: "object", properties: { a: { type: "string", description: "id of the first site" }, b: { type: "string", description: "id of the second site" } }, required: ["a", "b"] } },
  { name: "place_solar_panels", description: "In the Best Site Finder, place solar panels on the sunniest squares within a distance of the landing site. radius_km: the distance. count: how many panels.",
    input_schema: { type: "object", properties: { radius_km: { type: "number" }, count: { type: "integer" } }, additionalProperties: false } },
  { name: "share_link", description: "Copy a link that opens LUNI on exactly this site, landing time and mission needs.",
    input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "take_option", description: "After a NO-GO, LUNI offers up to three numbered ways to get a GO. Take one (1-3). 'best_point' moves the site to the best point found by the area scan.",
    input_schema: { type: "object", properties: { number: { type: "integer" }, best_point: { type: "boolean" } }, additionalProperties: false } },
  { name: "pin", description: "Pin the current site and landing time to the compare list.",
    input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "report", description: "Read out LUNI's numbers. topic: status (GO / NO-GO and why), options (ways to get a GO), sun, earth, eclipse, site (the current one), sites (the list), time, needs, versus (this site next to a place on Earth), help.",
    input_schema: { type: "object", properties: { topic: { type: "string", enum: ["status", "options", "sun", "earth", "eclipse", "site", "sites", "time", "needs", "versus", "help", "who", "joke"] } }, required: ["topic"], additionalProperties: false } },
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
  bg1: ["blue ghost 1", "blue ghost", "mare crisium", "crisium", "firefly"],
  slim: ["slim", "shioli crater", "shioli", "moon sniper"],
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
  if (/\b(?:joke|make me laugh|something funny)\b/.test(t)) return [{ tool: "report", input: { topic: "joke" } }];
  if (/^ (who|what) are you |^ what(?: is| s| does) (?:your name|luni|luno)(?: stand for| mean)? |^ (?:your )?name /.test(t)) return [{ tool: "report", input: { topic: "who" } }];

  // --- where ---
  if ((m = take(/\b(?:lat(?:itude)?) (minus |-)?(\d+(?:\.\d+)?)(?: degrees?)?(?: (north|south|n|s))?(?: and)? (?:lon(?:g|gitude)?) (minus |-)?(\d+(?:\.\d+)?)(?: degrees?)?(?: (east|west|e|w))?\b/))
      || (m = take(/(?: |^)(minus |-)?(\d+(?:\.\d+)?)(?: degrees?)? (north|south)(?: and)? (minus |-)?(\d+(?:\.\d+)?)(?: degrees?)? (east|west)\b/))) {
    const lat = num(m[2]) * (m[1] || /^s/.test(m[3] || "") ? -1 : 1), lon = num(m[5]) * (m[4] || /^w/.test(m[6] || "") ? -1 : 1);
    call("select_point", { lat, lon });
  } else if ((m = take(/(?: |^)(\d+(?:\.\d+)?) ?(n|s) (?:and |by )?(\d+(?:\.\d+)?) ?(e|w)\b/))) {      // "85.5S 30E"
    call("select_point", { lat: num(m[1]) * (m[2] === "s" ? -1 : 1), lon: num(m[3]) * (m[4] === "w" ? -1 : 1) });
  } else if (/\b(?:compare|comparison|versus|vs|side by side|which is better|better than)\b/.test(t) && (() => {
    // "compare shackleton and malapert": two listed sites in one sentence
    const found = [];
    for (const [alias, id] of aliasList(sites)) { const at = t.indexOf(` ${alias} `); if (at >= 0 && !found.some((f) => f.id === id)) found.push({ id, at, alias }); }
    if (found.length < 2) return false;
    found.sort((x, y) => x.at - y.at);
    for (const f of found.slice(0, 2)) t = t.replace(` ${f.alias} `, "  ");
    take(/\b(?:compare|comparison|versus|vs|side by side|which is better|better than)\b/);
    call("compare_sites", { a: found[0].id, b: found[1].id });
    return true;
  })()) { /* handled */ } else if ((m = take(/\b(?:next|following) (?:site|one)\b/))) call("step_site", { by: 1 });
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
  if (take(/\b(?:any|no|without(?: a)?|remove the|drop the) (?:max(?:imum)? )?slope(?: limit)?\b/)) call("set_mission_need", { need: "maxSlopeDeg", value: 0 });
  else if ((m = take(/\b(?:slopes?|tilt|steep(?:ness|er)?)\b[a-z ]{0,30}?(\d+)(?: ?(?:°|deg|degrees?))?/)) || (m = take(/\b(\d+) ?(?:°|deg|degrees?)[a-z ]{0,12}\b(?:slopes?|tilt)\b/))) call("set_mission_need", { need: "maxSlopeDeg", value: +m[1] });

  // --- when ---
  const wantNext = !!take(/\bnext (?:good |best |open |available |landing )*(?:time|window|chance|opportunity|slot|date)\b|\bwhen (?:can|could|should|do) (?:i|we) land\b|\bfind (?:me )?(?:a |the |the next )?(?:good )?(?:landing )?(?:time|window|date)\b|\b(?:best|good|first) (?:time|date|day|window) to land\b|\bwhen is (?:the )?(?:best|a good|the next)\b[a-z ]{0,12}\bland\b/);
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
  if (Object.keys(when).length) {
    // "the best time to land in 2027": start at the beginning of the period named, then find the first window in it
    if (wantNext) { if (when.month == null) when.month = 1; if (when.day == null) when.day = 1; if (when.hour == null) when.hour = 0; }
    call("set_landing_time", when);
  }
  else if (take(/\b(?:right now|now|today|current time)\b/)) call("set_landing_time", { now: true });
  if (wantNext) call("next_good_time", Object.keys(when).length ? { from_here: true } : {});

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

  // --- solar panels: "place 4 solar panels within 2 km" ---
  if (/\b(?:solar )?panels?\b/.test(t) && /\b(?:place|put|set up|lay out|deploy|add|position)\b/.test(t)) {
    const n = t.match(/\b(\d{1,2}) (?:solar )?panels?\b/), r = t.match(/\b(\d+(?:\.\d+)?) ?(?:km|kilometers?|kilometres?)\b/);
    take(/\b(?:place|put|set up|lay out|deploy|add|position)\b[a-z0-9. ]*\bpanels?\b(?:[a-z ]{0,12}\b\d+(?:\.\d+)? ?(?:km|kilometers?|kilometres?)\b)?(?: of| from| around)?(?: the)?(?: landing)?(?: site| lander)?/);
    call("place_solar_panels", { ...(n ? { count: +n[1] } : {}), ...(r ? { radius_km: +r[1] } : {}) });
  }

  // --- views, options, pin, clock run ---
  if ((m = take(/\b(?:option|choice|number|way)(?: number)? ([123])\b/)) || (m = take(/\b(?:the |do the |take the )([123]) (?:1\b|option\b|choice\b|$)/))) call("take_option", { number: +m[1] });
  // "move to the highest elevation", "go to the coldest spot", "take me to the least sunlight over all years"
  if ((m = take(/\b(?:move|go|jump|switch|head|land|take (?:me|us)|bring (?:me|us))\b[a-z ]{0,16}?\b(?!best (?:point|spot|place|one)\b)(highest|lowest|most|least|best|worst|max(?:imum)?|min(?:imum)?|sunniest|brightest|darkest|coldest|coolest|warmest|hottest|flattest|steepest|shallowest)\b ?(?:amount of |level of |share of )?(elevation|height|altitude|ground|point|spot|place|slope|sun(?:light)?|illumination|earth(?: link)?|communications?|link|temperature|temp|(?:water )?ice|mix|score)?\b ?(all years|over (?:the|all) years|long term)?/))) {
    const adj = m[1], noun = m[2] || "", years = !!m[3];
    const fixed = { sunniest: ["sun", "highest"], brightest: ["sun", "highest"], darkest: ["sun", "lowest"], coldest: ["temp", "lowest"], coolest: ["temp", "lowest"], warmest: ["temp", "highest"], hottest: ["temp", "highest"], flattest: ["slope", "lowest"], steepest: ["slope", "highest"], shallowest: ["ice", "lowest"] }[adj];
    let what = /slope/.test(noun) ? "slope" : /sun|illum/.test(noun) ? "sun" : /earth|comm|link/.test(noun) ? "earth" : /temp/.test(noun) ? "temp" : /ice/.test(noun) ? "ice" : /mix|score/.test(noun) ? "mix" : fixed ? fixed[0] : "elev";
    if (years && (what === "sun" || what === "earth")) what = "y" + what;
    call("move_to_extreme", { what, which: fixed && !/slope|sun|illum|earth|comm|link|temp|ice|mix|score/.test(noun) ? fixed[1] : fixed ? fixed[1] : /^(?:highest|most|best|max)/.test(adj) ? "highest" : "lowest" });
  }
  else if (take(/\b(?:move|go|jump|switch)\b[a-z ]{0,12}\bbest (?:point|spot|place|one)\b|\buse the best (?:point|spot|place)\b/)) call("take_option", { best_point: true });
  else if (take(/\b(?:close|exit|leave|hide)\b[a-z ]{0,10}\b(?:scan|map|surface|3d|view)?\b|\bmain screen\b|^ (?:cancel|go back|back) $/)) call("open_view", { view: "main" });
  else if ((m = take(/\b(elevation|height|slope|sunlight|illumination|solar(?: power)?|earth(?: link)?|communications?|comms|shadows?|psr|temperature|thermal|heat|(?:water )?ice|water|mix|combined|blend(?:ed)?)\b[a-z ]{0,14}\b(?:layer|map)\b/)))
    call("open_view", { view: "moon", layer: /elev|height/.test(m[1]) ? "elev" : /slope/.test(m[1]) ? "slope" : /sun|illum|solar/.test(m[1]) ? "sun" : /earth|comm/.test(m[1]) ? "earth" : /ice|water/.test(m[1]) ? "ice" : /temp|therm|heat/.test(m[1]) ? "temp" : /mix|comb|blend/.test(m[1]) ? "mix" : "shadow" });
  else if (take(/\b(?:moon map|big moon|map layers?|layers)\b/)) call("open_view", { view: "moon" });
  else if (take(/\b(?:mission )?history\b|\b(?:past|previous|earlier|real|old) (?:missions?|landings?)\b/)) call("open_view", { view: "history" });
  else if (take(/\b(?:proof|prove it|how accurate|accuracy|can (?:i|we) trust|how do (?:you|we|i) know)\b/)) call("open_view", { view: "proof" });
  else if (take(/\b(?:better|best|nearby|another|different) (?:spot|place|point|location)\b|\b(?:area )?scan\b|\bsearch (?:the )?(?:area|nearby)\b|\blook nearby\b|\bfind a better\b|\b(?:best )?site finder\b|\bbest site\b/)) call("open_view", { view: "scan" });
  else if (take(/\b(?:surface|3d|3 d|first person|look around|ground view|stand on)\b/)) call("open_view", { view: "surface" });
  if (take(/\b(?:share|copy|send)\b[a-z ]{0,15}\b(?:link|address|url)\b|\bshare (?:this|it)\b/)) call("share_link");
  if (take(/\b(?:pin|bookmark|save this|remember this|keep this)\b/)) call("pin");
  if (take(/\b(?:play|resume|run the clock|start the clock|run time)\b/)) call("mission_clock", { play: true });
  else if (take(/\b(?:pause|stop|freeze|hold)\b/)) call("mission_clock", { play: false });

  calls.leftover = t;      // what no rule used
  if (calls.length) return calls;

  // --- questions ---
  const q = (re) => re.test(t);
  if (q(/\b(?:go to|select|switch to|fly to|land at|take me to|move to)\b/) || q(/\b(?:which|what|list)(?: are)?(?: the)? sites\b/)) call("report", { topic: "sites" });   // a place LUNI does not know, or asking for the list
  else if (q(/\b(?:compared? (?:with|to)|different from|differ from|versus|vs|than|like) (?:on )?(?:the )?earth\b|\bon earth\b|\bwhy is the moon (?:so )?hard\b|\bcompare\b[a-z ]{0,14}\b(?:with|to|and|against)\b[a-z ]{0,6}\bearth\b/)) call("report", { topic: "versus" });
  else if (q(/\bwhy\b[a-z ]{0,40}\b(?:south pole|north pole|poles?|polar)\b|\b(?:south pole|poles?|polar)\b[a-z ]{0,30}\b(?:hard|difficult|tough|tricky|special|dangerous)\b/)) call("report", { topic: "pole" });
  else if (q(/\benergy\b|\bpower budget\b|\bbatter(?:y|ies)\b|\bkilowatts?\b|\bkwh\b|\bwatts?\b|\bhow much power\b|\bsolar panels?\b/)) call("report", { topic: "energy" });
  else if (q(/\btemperatures?\b|\bhow (?:cold|hot|warm)\b|\bcold\b|\bfreezing\b/)) call("report", { topic: "temp" });
  else if (q(/\beclipse/)) call("report", { topic: "eclipse" });
  else if (q(/\bhow (?:do|can|could|would) (?:i|we) (?:get|make|fix|turn)\b|\bwhat (?:can|could|should) (?:i|we) (?:do|change|try)\b|\bways\b|\bfix (?:it|this)\b|\boptions\b|\bsuggest/)) call("report", { topic: "options" });
  else if (q(/\b(?:why|how come|explain)\b/) && t.trim().split(/\s+/).length > 3 && !q(/\b(?:no go|nogo|go|verdict|red|wrong|problem|fail(?:s|ed|ing)?|not|can t|cannot|this|here|it|landing|window|site)\b/)) call("report", { topic: "cant" });      // a general question LUNI has no numbers for
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
      if (v.steep) why.push(`the ground slopes ${s.terrain.slopeDeg.toFixed(1)}° and the limit is ${r.maxSlopeDeg}°`);
      out = `NO-GO for a ${r.days}-day mission: ${why.join(", and ")}. ` + (s.next ? `Next good landing time: ${stamp(s.next)}.` : v.steep ? "The slope is the same on every date, so only another spot or a higher slope limit helps." : "No good landing time in the next 12 months.");
      if (s.options.length) out += ` Say OPTIONS to hear ways to get a GO.`;
    }
    for (const e of s.eclipses) out += ` Warning: eclipse on ${day(e.peak)}, Earth hides ${e.maxCover >= 0.995 ? "all" : Math.round(e.maxCover * 100) + "%"} of the Sun for ${(e.end - e.start) < 5400000 ? "about an hour or less" : "up to " + plural(Math.round((e.end - e.start) / 3600000), "hour")}.`;
    return out;
  }
  const momentHead = (s) => (s.idx ? `${dur(s.idx)} after landing (${stamp(s.cur.t)})` : `At landing (${stamp(s.cur.t)})`);
  function sunText(s = snap(), head = true) {
    const c = s.cur, where = `height ${deg(c.sunEl)}, direction ${Math.round(c.sunAz)}° (${compass(c.sunAz)})`;
    const frac = Math.round(c.sunFrac * 100);
    let out = (head ? `${momentHead(s)}: ` : "") + (c.sunUp ? `the Sun is up${frac < 100 ? `, ${frac}% of its disc usable` : ""}, ${where}${c.sunEl < 0 ? " (below level, but the skyline in that direction dips lower)" : ""}.` : `no usable Sun${frac > 0 ? ` (only ${frac}% of its disc)` : ""}, ${where}.`);
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
    else out += s.terrainBusy ? " The skyline is still being calculated." : " No terrain loaded: flat horizon.";
    return out;
  }
  const needsText = (s = snap()) => `Mission needs: ${s.req.days} days long; can sit ${s.req.maxDarkH} hours in the dark; Earth link at landing ${s.req.earthAtLanding ? "required" : "not required"}; Earth in view for ${s.req.earthMinPct ? `at least ${s.req.earthMinPct}%` : "any share"} of the mission; ground slope ${s.req.maxSlopeDeg ? `at most ${s.req.maxSlopeDeg}°` : "any"}.`;
  function optionsText(s = snap()) {
    if (s.verdict.ok) return "This is already a GO, so nothing needs to change.";
    if (!s.options.length) return "No simple way to a GO from here. Try another site.";
    return "Ways to get a GO: " + s.options.map((o, i) => `${i + 1}: ${o.toLowerCase()}`).join(". ") + `. Say OPTION ${s.options.map((_, i) => i + 1).join(" or ")}.`;
  }
  const cap = (t) => t.charAt(0) + t.slice(1).toLowerCase();
  let jokeAt = 0;
  const JOKES = [
    "I only know true ones. My skyline is real NASA data; my lander is, as the screen admits, illustrative.",
    "A day here lasts about a month. Nobody on the Moon has ever said: see you tomorrow.",
    "I would tell you a joke about the far side, but there is no Earth link to deliver it.",
  ];
  const WHO = "I am LUNI, the Lunar Utility for Navigational Intelligence. I work this unit's controls and read out its numbers.";
  const HELP = "You can say: GO TO SHACKLETON. LAND ON 14 JAN 2027 AT 5. NEXT LANDING WINDOW. MISSION 14 DAYS. ALLOW 24 HOURS OF DARK. STATUS. WHY? OPTIONS. WHERE IS THE SUN? DO WE HAVE A LINK? BEST SITE FINDER. SURFACE VIEW. DAY 5. PLAY. PIN.";

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
        if (input.from_here && s.verdict.ok) return { say: `${stamp(s.t0)} is already inside a landing window.` };
        if (!s.next) return { say: "There is no later good landing time in the 12 months shown. Change a mission need or try another site." };
        api.setT0(s.next);
        return { say: input.from_here ? `The first landing window from there opens ${stamp(s.next)}. That is the first one, not a ranking of the whole period: the MISSION WINDOWS strip shows every good day.` : `Landing moved to the next good time, ${stamp(s.next)}.`, changed: true };
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
        const use = nearest(opts[k], v), unit = { days: "days", maxDarkH: "hours", earthMinPct: "%", maxSlopeDeg: "°" }[k];
        api.setReq(k, use);
        const name = { days: "Mission length", maxDarkH: "Longest dark spell it can sit out", earthMinPct: "Earth link for at least", maxSlopeDeg: "Steepest ground accepted" }[k];
        const val = k === "earthMinPct" ? (use ? `${use}% of the mission` : "any share of the mission") : k === "maxSlopeDeg" ? (use ? `${use}°` : "any slope") : `${use} ${unit}`;
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
        if (input.view === "scan") { api.openScan(true); return { say: "Best Site Finder: scanning the ground around this site. Green squares meet the mission needs. When it finishes, say MOVE TO THE BEST POINT." }; }
        if (input.view === "surface") { api.openSurface(true); return { say: "Opening the 3D view from the surface. Say CLOSE to come back." }; }
        if (input.view === "proof") { api.openProof(true); return { say: "Opening the proof: LUNI against NASA's own calculator, three real landings replayed, and what LUNI does not know. Say CLOSE to come back." }; }
        if (input.view === "moon") { api.openMoonMap(true, input.layer); return { say: input.layer ? "Opening the Moon map with that layer on it. Say CLOSE to come back." : "Opening the Moon map. Pick a layer on the right, or say, for example, SUNLIGHT LAYER. Say CLOSE to come back." }; }
        if (input.view === "history") { api.openHistory(true); return { say: "Opening mission history: six real landings since 2023, side by side. Pick one and press LOAD to put it on the main screen. Say CLOSE to come back." }; }
        api.openScan(false); api.openSurface(false); api.openProof?.(false); api.openHistory?.(false); api.openMoonMap?.(false);
        return { say: "Back to the main screen." };
      }
      case "take_option": {
        if (input.best_point) return api.pickBest() ? { say: "Moved to the best point the scan found.", changed: true, wait: true } : { say: "There is no better point to move to: the scan is still running, has not been opened, or found nothing nearby that meets the mission needs." };
        if (s.verdict.ok) return { say: "This is already a GO, so there are no options to take." };
        const o = s.options[input.number - 1];
        if (!o) return { say: optionsText(s) };
        api.takeOption(input.number - 1);
        return /BEST SITE FINDER|BETTER SPOT/.test(o) ? { say: "Scanning the ground around this site for a better spot." } : { say: `Done: ${o.toLowerCase()}.`, changed: true };
      }
      case "move_to_extreme": {
        const NAME = { elev: "elevation", slope: "slope", sun: "sunlight during the mission", earth: "Earth link during the mission", ysun: "sunlight over all years", yearth: "Earth link over all years", temp: "average temperature", ice: "depth to stable water ice", mix: "mix score" };
        const what = `${input.which} ${NAME[input.what] || input.what}`, r = api.moveToExtreme(input.what, input.which) || { state: "none" };
        if (r.state === "pending") return { say: `Opening the Best Site Finder. I will move to the ${what} in this area as soon as the scan finishes.` };
        if (r.state === "moved") return { say: `Moving to the ${what} in the scanned area: ${r.value}, ${r.km} km to the ${r.dir}.`, changed: true, wait: true };
        if (r.state === "same") return { say: `You are already at the ${what} in the scanned area: ${r.value}.` };
        return { say: `The scanned area has no value for ${NAME[input.what] || input.what} to compare.` };
      }
      case "compare_sites": {
        const sites = api.sites(), A = sites.find((x) => x.id === input.a), B = sites.find((x) => x.id === input.b);
        if (!A || !B || A === B) return { say: "Name two different sites from the list to compare, for example: compare Shackleton and Malapert." };
        const r = api.compareSites(A, B), one = (site, p) => `${site.name.split(" · ")[0]}: ${p.ok ? "GO" : "NO-GO"}, sunlight ${Math.round(p.sunPct)}% of the mission, Earth link ${Math.round(p.earthPct)}%${p.slopeDeg == null ? "" : `, slope ${p.slopeDeg.toFixed(1)} degrees`}.`;
        return { say: `For landing ${stamp(s.t0)} and a ${s.req.days}-day mission. ${one(A, r.A)} ${one(B, r.B)} The two are side by side on screen.` };
      }
      case "place_solar_panels": {
        const r = api.placePanels(input.radius_km, input.count);
        return { say: r.placed ? `Placed ${plural(r.placed, "solar panel")} on the sunniest squares within ${r.radiusKm} km of the landing site. They are numbered on the Best Site Finder map, with the energy each one collects.` : `Opening the Best Site Finder. I will place ${plural(r.count, "solar panel")} within ${r.radiusKm} km as soon as the scan finishes.` };
      }
      case "pin": api.pin(); return { say: "Pinned to the compare list." };
      case "share_link": api.share(); return { say: "Copied a link that opens LUNI on this exact site, landing time and mission needs. Paste it anywhere." };
      case "report":
        return { say: { status: () => `${s.siteName}, landing ${stamp(s.t0)}. ${verdictText(s)}`, options: optionsText, sun: (x) => sunText(x), earth: (x) => earthText(x), site: siteText, needs: needsText, help: () => HELP, who: () => WHO, joke: () => JOKES[jokeAt++ % JOKES.length],
          versus: () => { const v = api.versus(); return `${s.siteName} next to a place on Earth's equator. ` + v.rows.map((r) => `${cap(r[0])}: here ${r[1].toLowerCase()}, on Earth ${r[2].toLowerCase()}.`).join(" "); },
          sites: () => "The sites are: " + api.sites().map((x, i) => `${i + 1}, ${x.name.split(" · ")[0]}`).join("; ") + ". Say GO TO and a name, or SITE and a number.",
          eclipse: () => (s.eclipses.length ? s.eclipses.map((e) => `Eclipse on ${day(e.peak)}: Earth hides ${e.maxCover >= 0.995 ? "all" : Math.round(e.maxCover * 100) + "%"} of the Sun for ${(e.end - e.start) < 5400000 ? "about an hour or less" : "up to " + plural(Math.round((e.end - e.start) / 3600000), "hour")}.`).join(" ") : `No eclipse touches this ${s.req.days}-day mission.`),
          pole: () => { const v = api.versus(); return "Near a pole the Sun never climbs far above the horizon, so one hill can hide it, and the same hills can hide the Earth. Sunlight and the Earth link then depend on the exact spot and the exact day. " + `${s.siteName} next to a place on Earth's equator: ` + v.rows.map((r) => `${cap(r[0])}: here ${r[1].toLowerCase()}, on Earth ${r[2].toLowerCase()}.`).join(" "); },
          energy: () => api.energyText(),
          temp: () => { const k = api.siteTempK(); return k == null ? "The temperature layer is still loading. Ask again in a moment, or open the MOON MAP and pick TEMPERATURE." : `The ground at ${s.siteName} averages ${Math.round(k - 273.15)} °C (${Math.round(k)} kelvin) over the lunar day and night, measured by NASA's LRO Diviner. The MOON MAP shows it as a layer.`; },
          cant: () => "I cannot answer a general question like that. I answer from LUNI's own numbers: ask about this site's Sun, Earth link, eclipses, energy or the verdict, or say HELP for examples.",
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
