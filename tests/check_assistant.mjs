// Command assistant: sentences -> tool calls, and answers built only from the numbers it is given.
// Run: node tests/check_assistant.mjs
import { readFileSync } from "node:fs";
import { parse, createAssistant, normalize, forSpeech, dur, TOOLS } from "../js/assistant.js";

const sites = JSON.parse(readFileSync(new URL("../data/sites.json", import.meta.url))).sites;
let fail = 0, n = 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function expect(text, want) {
  n++;
  const got = parse(text, sites).map((c) => [c.tool, c.input]);
  if (!same(got, want)) { fail++; console.log(`FAIL "${text}"\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); }
}
const site = (id) => ["select_site", { id }], need = (k, value) => ["set_mission_need", { need: k, value }], rep = (topic) => ["report", { topic }];

// where
expect("go to Shackleton", [site("shackleton")]);
expect("Hey LUNI, select the Malapert Massif please.", [site("malapert")]);
expect("Luni, go to Haworth", [site("haworth")]);
expect("looney next good time", [["next_good_time", {}]]);
expect("who are you", [rep("who")]);
expect("what does LUNI stand for", [rep("who")]);
expect("show me malapert a", [site("im1")]);
expect("im-2", [site("im2")]);
expect("Chang'e 6", [site("ce6")]);
expect("apollo eleven", [site("apollo11")]);
expect("take me to Von Kármán", [site("ce4")]);
expect("site number three", [["select_site", { number: 3 }]]);
expect("next site", [["step_site", { by: 1 }]]);
expect("previous site", [["step_site", { by: -1 }]]);
expect("go to 85.3 south 37 east", [["select_point", { lat: -85.3, lon: 37 }]]);
expect("latitude -89.45 longitude -137.31", [["select_point", { lat: -89.45, lon: -137.31 }]]);
expect("go to tycho", [rep("sites")]);
// when
expect("land on 14 January 2027 at 5", [["set_landing_time", { day: 14, month: 1, year: 2027, hour: 5 }]]);
expect("landing March 3rd 2026", [["set_landing_time", { month: 3, day: 3, year: 2026 }]]);
expect("2027-01-14 01:00 UTC", [["set_landing_time", { day: 14, month: 1, year: 2027, hour: 1 }]]);
expect("set the date to the twenty first of december", [["set_landing_time", { day: 21, month: 12 }]]);
expect("at fourteen hundred", [["set_landing_time", { hour: 14 }]]);
expect("at 5 pm", [["set_landing_time", { hour: 17 }]]);
expect("in 2028", [["set_landing_time", { year: 2028 }]]);
expect("next good time", [["next_good_time", {}]]);
expect("when can we land?", [["next_good_time", {}]]);
expect("one day later", [["shift_landing_time", { hours: 24 }]]);
expect("go back a week", [["shift_landing_time", { hours: -168 }]]);
expect("forward 3 days", [["shift_landing_time", { hours: 72 }]]);
expect("move the landing 6 hours earlier", [["shift_landing_time", { hours: -6 }]]);
// mission needs
expect("mission 14 days", [need("days", 14)]);
expect("make it a seven day mission", [need("days", 7)]);
expect("shorten the mission to 3 days", [need("days", 3)]);
expect("shorter mission", [["set_mission_need", { need: "days", step: -1 }]]);
expect("allow 24 hours of dark", [need("maxDarkH", 24)]);
expect("let it sit 48 h in the dark", [need("maxDarkH", 48)]);
expect("no darkness", [need("maxDarkH", 0)]);
expect("earth link at least 50 percent", [need("earthMinPct", 50)]);
expect("land without an earth link", [need("earthAtLanding", false)]);
expect("we need earth at landing", [need("earthAtLanding", true)]);
// mission clock
expect("day 5", [["mission_clock", { to_hours: 120 }]]);
expect("12 hours after landing", [["mission_clock", { to_hours: 12 }]]);
expect("forward 6 hours", [["mission_clock", { by_hours: 6 }]]);
expect("back to landing", [["mission_clock", { to_hours: 0 }]]);
expect("play", [["mission_clock", { play: true }]]);
expect("pause", [["mission_clock", { play: false }]]);
// views and options
expect("find a better spot", [["open_view", { view: "scan" }]]);
expect("open the 3D surface view", [["open_view", { view: "surface" }]]);
expect("close", [["open_view", { view: "main" }]]);
expect("move to the best point", [["take_option", { best_point: true }]]);
expect("option two", [["take_option", { number: 2 }]]);
expect("do the first one", [["take_option", { number: 1 }]]);
expect("pin this", [["pin", {}]]);
expect("show me the proof", [["open_view", { view: "proof" }]]);
expect("how accurate is this", [["open_view", { view: "proof" }]]);
expect("copy a link to this", [["share_link", {}]]);
expect("slope at most 10 degrees", [need("maxSlopeDeg", 10)]);
expect("the lander can take a 15 degree slope", [need("maxSlopeDeg", 15)]);
expect("any slope", [need("maxSlopeDeg", 0)]);
expect("go to blue ghost", [site("bg1")]);
expect("how is this different from earth", [rep("versus")]);
// several things in one sentence
expect("go to Shackleton and land on 3 March 2027 with a 14 day mission", [site("shackleton"), need("days", 14), ["set_landing_time", { day: 3, month: 3, year: 2027 }]]);
// questions
expect("status", [rep("status")]);
expect("are we go?", [rep("status")]);
expect("why is it a no-go", [rep("status")]);
expect("how do I get a go", [rep("options")]);
expect("where is the sun", [rep("sun")]);
expect("when does it get dark", [rep("sun")]);
expect("do we have a link to ground control", [rep("earth")]);
expect("is there an eclipse", [rep("eclipse")]);
expect("where are we", [rep("site")]);
expect("what time is it", [rep("time")]);
expect("what are the mission needs", [rep("needs")]);
expect("help", [rep("help")]);
expect("blah blah", []);

// Answers: a fake unit, so every number in the reply can be traced.
const T0 = new Date(Date.UTC(2026, 10, 15, 7));
const fake = {
  site: sites[3], t0: T0, idx: 0, req: { days: 10, maxDarkH: 12, earthAtLanding: true, earthMinPct: 0 }, log: [],
  verdict: { ok: false, earthPct: 40, sunHeldHours: 50, marginHours: -190, marginOpen: false },
};
const api = {
  sites: () => sites, needOptions: () => ({ days: [3, 7, 10, 14, 28], maxDarkH: [0, 12, 24, 48], earthMinPct: [0, 25, 50, 75], maxSlopeDeg: [0, 5, 10, 15] }),
  snapshot: () => ({
    site: fake.site, siteName: fake.site.name.replace(/ · /g, ", "), t0: fake.t0, idx: fake.idx, maxIdx: 719, req: fake.req,
    landing: { sunUp: true, earthUp: false }, cur: { t: new Date(+fake.t0 + fake.idx * 3600000), sunUp: true, sunFrac: 0.62, sunTerrain: 0.62, eclipse: 0, sunEl: 2.3, sunAz: 81.9, earthUp: false, earthEl: -1.2, earthAz: 327.8 },
    sunLeft: 50, earthLeft: null, sunNextIsEclipse: false, verdict: fake.verdict, next: new Date(Date.UTC(2026, 11, 15, 5)),
    options: ["LAND ON 15 DEC 2026 INSTEAD", "FIND A BETTER SPOT NEARBY", "LAND WITHOUT AN EARTH LINK"], eclipses: [],
    terrain: { real: true, heightM: 1200, slopeDeg: 4.2 }, coverage: { start: new Date(Date.UTC(2023, 0, 1)), last: new Date(Date.UTC(2034, 9, 1)) },
  }),
  selectSite: (s) => { fake.site = s; fake.log.push("site " + s.id); }, selectPoint: (lat, lon) => fake.log.push(`point ${lat} ${lon}`), stepSite: (by) => fake.log.push("step " + by),
  setT0: (d) => { fake.t0 = d; fake.log.push("t0 " + d.toISOString()); }, setReq: (k, v) => { fake.req = { ...fake.req, [k]: v }; fake.log.push(`req ${k}=${v}`); },
  setIdx: (h) => { fake.idx = h; fake.log.push("idx " + h); }, play: (on) => fake.log.push("play " + on), openScan: (x) => fake.log.push("scan " + x), openSurface: (x) => fake.log.push("surface " + x),
  pickBest: () => false, takeOption: (i) => fake.log.push("option " + i), pin: () => fake.log.push("pin"),
};
const A = createAssistant(api);
function check(name, ok, detail = "") { n++; if (!ok) { fail++; console.log(`FAIL ${name} ${detail}`); } }

let r = A.handle("status");
check("status names the reasons", /NO-GO for a 10-day mission: sunlight is lost after 2 days 2 hours, and Earth is not in view at landing\. Next good landing time: 15 DEC 2026 05:00 UTC\./.test(r.reply), r.reply);
r = A.handle("land on 14 jan 2027 at 5");
check("landing time set", fake.log.at(-1) === "t0 2027-01-14T05:00:00.000Z" && /Landing set to 14 JAN 2027 05:00 UTC\./.test(r.reply), r.reply);
r = A.handle("land on 31 february");
check("impossible date refused", /has no day 31/.test(r.reply) && fake.log.at(-1) === "t0 2027-01-14T05:00:00.000Z", r.reply);
r = A.handle("mission 12 days");
check("need snaps to a real choice", fake.req.days === 10 || fake.req.days === 14, String(fake.req.days));
check("snap is said out loud", /closest is (10|14)/.test(r.reply), r.reply);
r = A.handle("option 3");
check("option taken", fake.log.at(-1) === "option 2", fake.log.at(-1));
r = A.handle("where is the sun");
check("sun answer", /the Sun is up, 62% of its disc usable, height 2\.3°, direction 82° \(east\)\. Sunset in 2 days 2 hours/.test(r.reply), r.reply);
r = A.handle("do we have a link");
check("earth answer", /Earth is behind the skyline, so there is no link/.test(r.reply), r.reply);
r = A.handle("day 3");
check("clock moved", fake.idx === 72 && /3 days after landing/.test(r.reply), r.reply);
r = A.handle("site 99");
check("unknown site number", /no such site/.test(r.reply), r.reply);
r = A.handle("slope at most 9 degrees");
check("slope need snaps and is said", fake.req.maxSlopeDeg === 10 && /closest is 10\. Steepest ground accepted: 10°\./.test(r.reply), r.reply);
fake.verdict = { ok: false, earthPct: 100, sunHeldHours: 400, marginHours: 160, marginOpen: false, steep: true };
r = A.handle("why");
check("steep ground is a reason", /the ground slopes 4\.2° and the limit is 10°/.test(r.reply), r.reply);
fake.verdict = { ok: false, earthPct: 40, sunHeldHours: 50, marginHours: -190, marginOpen: false };
r = A.handle("xyzzy");
check("not understood is said plainly", r.ok === false && /did not find a command/.test(r.reply), r.reply);
fake.verdict = { ok: true, earthPct: 100, sunHeldHours: 373, marginHours: 133, marginOpen: false };
r = A.handle("go to malapert massif");
check("site change answers GO", fake.site.id === "malapert" && /GO for a 10-day mission\. Sunlight lasts 5 days 13 hours longer/.test(r.reply), r.reply);

check("speech text", forSpeech("NO-GO. Landing 14 JAN 2027 05:00 UTC, height −1.2°") === "no go. Landing 14 January 2027 5 hundred U T C, height minus 1.2°", forSpeech("NO-GO. Landing 14 JAN 2027 05:00 UTC, height −1.2°"));
check("durations", dur(133) === "5 days 13 hours" && dur(24) === "1 day" && dur(1) === "1 hour");
check("normalize", normalize("Okay LUNI, twenty-five days!") === "25 days", normalize("Okay LUNI, twenty-five days!"));
check("every tool has a schema", TOOLS.every((t) => t.name && t.description && t.input_schema?.type === "object"));

console.log(fail ? `${fail} of ${n} checks FAILED` : `All ${n} assistant checks passed`);
process.exit(fail ? 1 : 0);
