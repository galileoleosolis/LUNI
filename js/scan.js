// Area-scan controller: a small pool of workers, fed grid points from the center outward.
import { scanGrid } from "./scan-core.js";

let pool = null, jobSeq = 0;

function getPool() {
  if (pool) return pool;
  const n = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
  const base = new URL("data/", document.baseURI).href;
  pool = Array.from({ length: n }, () => {
    const w = new Worker(new URL("./scan-worker.js", import.meta.url), { type: "module" });
    w.postMessage({ type: "init", base, b64: !!globalThis.LUNO_B64 });
    return w;
  });
  return pool;
}

// Runs a scan. onCell(point, result, done, total) fires as each point finishes. Returns { grid, cancel }.
export function runScan({ site, radiusKm, n, t0, req, onCell, onDone }) {
  const grid = scanGrid(site, radiusKm, n), job = ++jobSeq, workers = getPool();
  const order = grid.points.map((p, i) => i).sort((a, b) => grid.points[a].dist - grid.points[b].dist);
  let next = 0, done = 0, canceled = false;
  const feed = (w) => {
    if (canceled || next >= order.length) return;
    const i = order[next++], p = grid.points[i];
    w.postMessage({ type: "point", job, i, lat: p.lat, lon: p.lon, t0: +t0, req });
  };
  for (const w of workers) {
    w.onmessage = (e) => {
      if (e.data.job !== job || canceled) return;
      done++;
      onCell(grid.points[e.data.i], e.data.res || null, done, order.length);
      if (done === order.length) onDone?.(grid); else feed(w);
    };
    feed(w);
  }
  return { grid, cancel() { canceled = true; } };
}
