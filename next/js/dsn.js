// Which NASA Deep Space Network sites have the Moon in their sky at a given moment, and how high.
// data/dsn.bin (tools/build_dsn.py, NASA NAIF SPICE): every 6 hours, the point on Earth under the Moon and the
// Moon's distance, in the Earth-fixed ITRF93 frame. Station positions come from NAIF's station kernel (data/dsn.json).
// This is geometry only: a line of sight between the station and the Moon. It knows nothing about station schedules.
import { fetchBytes } from "./bin.js";

const DEG = Math.PI / 180;
let D = null, loading = null;

export function initDsn(buffer, meta) {
  D = { t0: Date.parse(meta.start_utc), step: meta.step_hours * 3600000, n: meta.count, v: new DataView(buffer), stations: meta.stations, meta };
  return D;
}
export function loadDsn(base = "data/") {
  return (loading ||= Promise.all([fetch(base + "dsn.json").then((r) => r.json()), fetchBytes(base + "dsn.bin")]).then(([meta, buf]) => initDsn(buf, meta)));
}
export const dsnReady = () => !!D;

// The Moon's position in the Earth-fixed frame at time t (ms), km. null outside the table.
function moonOverEarth(t) {
  const f = (t - D.t0) / D.step, i = Math.floor(f), u = f - i;
  if (!(i >= 0 && i + 1 < D.n)) return null;
  const at = (k) => ({ lat: D.v.getInt16(k * 6, true) / 1000, lon: D.v.getUint16(k * 6 + 2, true) * 360 / 65536, r: D.v.getUint16(k * 6 + 4, true) * 2 + 340000 });
  const a = at(i), b = at(i + 1), dLon = ((b.lon - a.lon + 540) % 360) - 180;      // the short way round (about -87 degrees in 6 hours)
  const lat = (a.lat + (b.lat - a.lat) * u) * DEG, lon = (a.lon + dLon * u) * DEG, r = a.r + (b.r - a.r) * u;
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)];
}

// Every station with its Moon height in degrees, highest first: [{ id, name, where, el }]. null if not loaded or out of range.
export function dsnAt(t) {
  if (!D) return null;
  const m = moonOverEarth(+t); if (!m) return null;
  return D.stations.map((s) => {
    const d = [m[0] - s.xyz_km[0], m[1] - s.xyz_km[1], m[2] - s.xyz_km[2]], len = Math.hypot(...d);
    return { id: s.id, name: s.name, where: s.where, el: Math.asin((d[0] * s.up[0] + d[1] * s.up[1] + d[2] * s.up[2]) / len) / DEG };
  }).sort((p, q) => q.el - p.el);
}
