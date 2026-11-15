// Area-scan controller: a small pool of workers, fed grid points from the center outward.
import { scanGrid, SCAN_AZ_STEP } from "./scan-core.js";
import { computeTerrain, getGrid, mapsFor, MAST_M } from "./terrain.js";

let pool = null, jobSeq = 0;

function getPool() {
  if (pool) return pool;
  const n = Math.min(8, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
  const base = new URL("data/", document.baseURI).href;
  pool = Array.from({ length: n }, () => {
    const w = new Worker(new URL("./scan-worker.js", import.meta.url), { type: "module" });
    w.postMessage({ type: "init", base, b64: !!globalThis.LUNO_B64 });
    return w;
  });
  return pool;
}

// Runs a scan. onCell(point, result, done, total) fires as each point finishes. Returns { grid, cancel }.
export function runScan({ site, radiusKm, n, up = 0, t0, req, onCell, onDone }) {
  const grid = scanGrid(site, radiusKm, n, up), job = ++jobSeq, workers = getPool();
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

// The same scan with the skylines computed on the graphics chip (js/scan-gpu.js) and only the Sun, Earth and
// mission check left to the workers. onFail(reason) fires if the chip cannot be trusted; the caller then
// falls back to runScan. Returns { grid, cancel }.
export const GPU_TOLERANCE_DEG = 0.02;      // largest skyline difference from the processor version that is accepted
export function runScanGpu({ gpu, site, radiusKm, n, up = 0, t0, req, onCell, onDone, onFail, onCheck }) {
  const grid = scanGrid(site, radiusKm, n, up), job = ++jobSeq, workers = getPool(), total = grid.points.length;
  const order = grid.points.map((p, i) => i).sort((a, b) => grid.points[a].dist - grid.points[b].dist);
  let done = 0, canceled = false;
  const started = performance.now();
  for (const w of workers) w.onmessage = (e) => {
    if (e.data.job !== job || canceled) return;
    e.data.ids.forEach((i, j) => { done++; onCell(grid.points[i], e.data.out ? e.data.out[j] : null, done, total); });
    if (done === total) onDone?.(grid, { ms: performance.now() - started });
  };
  (async () => {
    try {
      const [nearName, farName] = mapsFor(site.lat);
      const [near, far] = await Promise.all([nearName ? getGrid(nearName) : null, getGrid(farName)]);
      if (far.kind !== "polar_south" || (near && near.kind !== "polar_south")) throw new Error("this map is not a polar one");
      const { nAz } = gpu.prepare(near, far, SCAN_AZ_STEP);
      // Trust, but check: the chip's skyline for the site itself against the processor's.
      const cpu = (await computeTerrain(site.lat, site.lon, SCAN_AZ_STEP)).horizon, chip = gpu.run([{ lat: site.lat, lon: site.lon }]);
      let diff = 0; for (let i = 0; i < nAz; i++) diff = Math.max(diff, Math.abs(cpu[i] - chip[i]));
      if (canceled) return;
      if (!(diff <= GPU_TOLERANCE_DEG)) throw new Error(`its skyline differs from the processor's by ${diff.toFixed(3)}°`);
      onCheck?.(diff);
      // Batches sized so each takes the chip about 30 ms: the page stays responsive and the chip's watchdog stays calm.
      let next = 0, K = 8, batch = 0;
      while (next < total && !canceled) {
        const pts = order.slice(next, next + K).map((i) => ({ i, lat: grid.points[i].lat, lon: grid.points[i].lon }));
        next += pts.length;
        const t = performance.now(), horizons = gpu.run(pts), dt = performance.now() - t;
        K = Math.max(4, Math.min(512, Math.round(K * 30 / Math.max(dt, 1))));
        workers[batch % workers.length].postMessage({ type: "judge", job, batch: batch++, pts, horizons, nAz, mastM: MAST_M, t0: +t0, req }, [horizons.buffer]);
        await new Promise((r) => setTimeout(r));
      }
    } catch (e) {
      if (!canceled) { canceled = true; onFail?.(e.message || String(e)); }
    }
  })();
  return { grid, cancel() { canceled = true; } };
}
