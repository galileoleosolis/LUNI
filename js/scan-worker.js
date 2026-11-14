// Web Worker for the area scan: loads its own copy of the ephemeris and LOLA maps, then evaluates points on request.
import { loadEphemeris } from "./ephem.js";
import { setIndex } from "./terrain.js";
import { evaluatePoint } from "./scan-core.js";

let ready = null;
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "init") {
    setIndex(null, m.base + "dem/");
    ready = loadEphemeris(m.base);
    return;
  }
  if (m.type === "point") {
    try {
      await ready;
      const res = await evaluatePoint(m.lat, m.lon, new Date(m.t0), m.req);
      self.postMessage({ job: m.job, i: m.i, res });
    } catch (err) {
      self.postMessage({ job: m.job, i: m.i, error: String(err) });
    }
  }
};
