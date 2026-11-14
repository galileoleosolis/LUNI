// Web Worker for the area scan: loads its own copy of the ephemeris and LOLA maps, then evaluates points on request.
import { loadEphemeris } from "./ephem.js";
import { setIndex } from "./terrain.js";
import { evaluatePoint, judgePoint } from "./scan-core.js";

let ready = null;
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "init") {
    globalThis.LUNO_B64 = m.b64;
    setIndex(null, m.base + "dem/");
    ready = loadEphemeris(m.base);
    return;
  }
  if (m.type === "judge") {      // skylines already computed (on the graphics chip): only the Sun, Earth and mission check
    try {
      await ready;
      const nAz = m.nAz, out = [];
      for (let j = 0; j < m.pts.length; j++) {
        const p = m.pts[j];
        out.push(judgePoint(p.lat, p.lon, { horizon: m.horizons.subarray(j * nAz, (j + 1) * nAz), heightM: p.heightM, mastM: m.mastM, slopeDeg: p.slopeDeg }, new Date(m.t0), m.req));
      }
      self.postMessage({ job: m.job, batch: m.batch, ids: m.pts.map((p) => p.i), out });
    } catch (err) {
      self.postMessage({ job: m.job, batch: m.batch, ids: m.pts.map((p) => p.i), error: String(err) });
    }
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
