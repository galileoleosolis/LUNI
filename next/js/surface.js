// 3D surface view: stand at the landing site and look around.
// The ground is built from LRO LOLA elevation data (a detailed patch near the site, coarser maps out to 260 km,
// with the Moon's curvature), lit from the Sun's real direction with cast shadows; the Earth sits where it really is.
// Detail finer than the elevation data (40 m at best) is not real: the fine surface texture is illustrative.
import * as THREE from "../vendor/three.module.min.js";
import { getGrid, loadPatch, mapsFor } from "./terrain.js";

const DEG = Math.PI / 180, R = 1737400, SKY = 600e3;
export const QUALITY = {
  low:    { near: 128, mid: 160, far: 160, shadow: 1024, box: 12e3, label: "LOW" },
  medium: { near: 256, mid: 320, far: 300, shadow: 2048, box: 20e3, label: "MEDIUM" },
  high:   { near: 512, mid: 520, far: 440, shadow: 4096, box: 30e3, label: "HIGH" },
  ultra:  { near: 512, mid: 900, far: 640, shadow: 8192, box: 45e3, label: "ULTRA" },
};

// Unit vector (three.js axes: x east, y up, z south) for a sky direction given as azimuth/elevation in degrees.
const dirOf = (az, el) => new THREE.Vector3(Math.cos(el * DEG) * Math.sin(az * DEG), Math.sin(el * DEG), -Math.cos(el * DEG) * Math.cos(az * DEG));

// One square sheet of terrain centered on the site: n x n points spanning +/- half meters, minus a square hole.
function buildSheet(site, h0, half, n, hole, sample) {
  const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
  const la = site.lat * DEG, lo = site.lon * DEG, sl = Math.sin(la), cl = Math.cos(la), step = (2 * half) / (n - 1);
  for (let i = 0, p = 0, q = 0; i < n; i++) {
    const north = half - i * step;
    for (let j = 0; j < n; j++, p += 3, q += 2) {
      const east = -half + j * step, d = Math.hypot(east, north), a = Math.atan2(east, north), ang = d / R;
      const s2 = Math.max(-1, Math.min(1, sl * Math.cos(ang) + cl * Math.sin(ang) * Math.cos(a)));
      const lat2 = Math.asin(s2) / DEG, lon2 = (lo + Math.atan2(Math.sin(a) * Math.sin(ang) * cl, Math.cos(ang) - sl * s2)) / DEG;
      let h = sample(lat2, lon2); if (!Number.isFinite(h)) h = h0;
      const rr = R + h, hz = rr * Math.sin(ang);
      pos[p] = hz * Math.sin(a); pos[p + 1] = rr * Math.cos(ang) - (R + h0); pos[p + 2] = -hz * Math.cos(a);
      uv[q] = east / GROUND_TILE_M; uv[q + 1] = north / GROUND_TILE_M;
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) {
    const e0 = -half + j * step, n0 = half - i * step;
    if (hole && Math.abs(e0) < hole - step && Math.abs(e0 + step) < hole - step && Math.abs(n0) < hole - step && Math.abs(n0 - step) < hole - step) continue;
    const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  g.computeVertexNormals();
  return g;
}

// Small repeatable random numbers and smooth noise for the illustrative detail (the same every time).
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function valueNoise(size, cells, seed) {            // tileable smooth noise in 0..1, as a Float32Array size*size
  const r = rng(seed), g = new Float32Array(cells * cells).map(() => r()), out = new Float32Array(size * size), k = cells / size;
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x * k, fy = y * k, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
    const a = g[(y0 % cells) * cells + (x0 % cells)], b = g[(y0 % cells) * cells + ((x0 + 1) % cells)], c = g[((y0 + 1) % cells) * cells + (x0 % cells)], d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
    out[y * size + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  return out;
}

// Ground relief for the near field: rolling soil with small craters, as a height picture that tiles every GROUND_TILE_M
// meters. Illustrative only: the elevation data is no finer than 40 m, so everything smaller than that is made up.
const GROUND_TILE_M = 140;
function groundTexture() {
  const N = 1024, h = new Float32Array(N * N), r = rng(4242);
  for (const [cells, amp, seed] of [[6, 0.9, 1], [14, 0.5, 2], [36, 0.28, 3], [90, 0.16, 4], [220, 0.1, 5]]) { const n = valueNoise(N, cells, seed); for (let i = 0; i < h.length; i++) h[i] += (n[i] - 0.5) * amp; }
  for (let c = 0; c < 340; c++) {                    // craters: many small, a few large; bowl inside, raised rim
    const cx = r() * N, cy = r() * N, rad = 3 + Math.pow(r(), 3.2) * 70, depth = 0.55 + r() * 0.5, R2 = rad * 1.35;
    for (let y = Math.floor(cy - R2); y <= cy + R2; y++) for (let x = Math.floor(cx - R2); x <= cx + R2; x++) {
      const d = Math.hypot(x - cx, y - cy) / rad; if (d > 1.35) continue;
      const v = d < 1 ? -depth * (1 - d * d) + 0.22 * depth * d * d * d : 0.22 * depth * Math.pow(1 - (d - 1) / 0.35, 2);
      h[(((y % N) + N) % N) * N + (((x % N) + N) % N)] += v * Math.min(1, rad / 14);
    }
  }
  const c = document.createElement("canvas"); c.width = c.height = N;
  const x = c.getContext("2d"), img = x.createImageData(N, N);
  for (let i = 0; i < h.length; i++) { const v = Math.max(0, Math.min(255, 128 + h[i] * 90)); img.data[4 * i] = img.data[4 * i + 1] = img.data[4 * i + 2] = v; img.data[4 * i + 3] = 255; }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 2;      // low: at a grazing view, sharper sampling turns far relief into speckle
  return t;
}

function earthTexture() {            // a plausible Earth (oceans, land, ice, cloud), not a real image: it marks where Earth is
  const W = 1024, H = 512, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d"), img = x.createImageData(W, H);
  const land = [valueNoise(W, 5, 11), valueNoise(W, 11, 12), valueNoise(W, 27, 13)], cloud = [valueNoise(W, 7, 21), valueNoise(W, 19, 22), valueNoise(W, 48, 23)];
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const i = (y * 2) * W + xx, lat = Math.abs(y / H - 0.5) * 2;                    // 0 at the equator, 1 at a pole
    const l = land[0][i] * 0.6 + land[1][i] * 0.28 + land[2][i] * 0.12, cl = cloud[0][i] * 0.5 + cloud[1][i] * 0.32 + cloud[2][i] * 0.18;
    let r = 16, g = 62, b = 130;                                                     // ocean
    if (l > 0.53) { const t = Math.min(1, (l - 0.53) * 9); r = 60 + 70 * t * (1 - lat); g = 105 - 20 * t; b = 50 + 10 * t; }
    if (lat > 0.86) { const t = Math.min(1, (lat - 0.86) * 9); r += (240 - r) * t; g += (245 - g) * t; b += (250 - b) * t; }
    const k = Math.max(0, Math.min(1, (cl - 0.5) * 5.5)) * 0.92; r += (250 - r) * k; g += (250 - g) * k; b += (252 - b) * k;
    const o = (y * W + xx) * 4; img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function glowTexture(color = "255,244,220", spikes = true) {      // soft halo, with thin rays for the Sun
  const N = 512, c = document.createElement("canvas"); c.width = c.height = N;
  const x = c.getContext("2d"), g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0, `rgba(${color},1)`); g.addColorStop(0.05, `rgba(${color},.95)`); g.addColorStop(0.16, `rgba(${color},.3)`); g.addColorStop(0.45, `rgba(${color},.07)`); g.addColorStop(1, `rgba(${color},0)`);
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  if (spikes) {
    x.globalCompositeOperation = "lighter"; x.translate(N / 2, N / 2);
    for (let k = 0; k < 6; k++) {
      const len = k % 3 === 0 ? N * 0.5 : N * 0.3, lg = x.createLinearGradient(-len, 0, len, 0);
      lg.addColorStop(0, `rgba(${color},0)`); lg.addColorStop(0.5, `rgba(${color},.55)`); lg.addColorStop(1, `rgba(${color},0)`);
      x.fillStyle = lg; x.rotate(Math.PI / 6); x.fillRect(-len, -1.2, 2 * len, 2.4);
    }
  }
  return new THREE.CanvasTexture(c);
}

// An illustrative lander (not a model of any real vehicle): body, legs, two solar panels and a dish.
function buildLander() {
  const g = new THREE.Group(), M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o });
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.receiveShadow = true; parent.add(m); return m; };
  const foil = M(0xcf9f3c, { roughness: 0.5, emissive: 0x2a1c05 }), white = M(0xe9e9e6), dark = M(0x23262d), blue = M(0x16337a, { roughness: 0.35, emissive: 0x050c22 });
  add(new THREE.CylinderGeometry(1.45, 1.65, 1.5, 8), foil, 0, 1.85, 0);
  add(new THREE.CylinderGeometry(1.0, 1.45, 0.55, 8), white, 0, 2.88, 0);
  add(new THREE.ConeGeometry(0.62, 0.8, 16, 1, true), dark, 0, 0.82, 0);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, leg = add(new THREE.CylinderGeometry(0.055, 0.055, 2.5, 6), white, Math.cos(a) * 1.95, 0.95, Math.sin(a) * 1.95);
    leg.rotation.z = -Math.cos(a) * 0.62; leg.rotation.x = Math.sin(a) * 0.62;
    add(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 12), white, Math.cos(a) * 2.7, 0.04, Math.sin(a) * 2.7);
  }
  const panels = new THREE.Group(); panels.position.y = 2.1; g.add(panels);                 // turns to face the Sun
  for (const sx of [-1, 1]) { add(new THREE.BoxGeometry(2.3, 1.25, 0.05), blue, sx * 2.75, 0, 0, panels); add(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 6), white, sx * 1.6, 0, 0, panels).rotation.z = Math.PI / 2; }
  const mast = add(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), white, 0.45, 3.65, 0.3);
  const dish = new THREE.Group(); dish.position.set(0.45, 4.25, 0.3); g.add(dish);          // points at the Earth
  const bowl = add(new THREE.SphereGeometry(0.55, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3.2), white, 0, 0, -0.42, dish); bowl.rotation.x = Math.PI / 2; bowl.material = M(0xf2f2ee, { side: THREE.DoubleSide });
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), white, 0, 0, 0.14, dish).rotation.x = Math.PI / 2;
  return { group: g, panels, dish, mast };
}

export async function createSurfaceView(container, { site, quality = "medium", eyeM = 2, onStatus = () => {} }) {
  const Q = QUALITY[quality] || QUALITY.medium;
  onStatus("LOADING ELEVATION DATA…");
  const [nearName, farName] = mapsFor(site.lat);
  const [patch, near, far] = await Promise.all([site.id && site.id !== "custom" ? loadPatch(site.id) : null, nearName ? getGrid(nearName) : null, getGrid(farName)]);
  const chain = (...gs) => (lat, lon) => { for (const g of gs) { if (!g) continue; const h = g.height(lat, lon); if (Number.isFinite(h)) return h; } return NaN; };
  const best = chain(patch, near, far);
  const h0 = best(site.lat, site.lon);

  onStatus("BUILDING THE TERRAIN…");
  await new Promise((r) => setTimeout(r, 30));
  // nested sheets, finest in the middle; each coarser sheet has a hole where the finer one sits
  const sheets = [];
  if (patch) sheets.push({ half: patch.rows * patch.scale_m / 2 * 0.98, n: Math.min(Q.near, patch.rows), sample: best });
  else if (near) sheets.push({ half: 9e3, n: Q.near, sample: chain(near, far) });
  else sheets.push({ half: 9e3, n: Q.near, sample: chain(far) });      // only coarse data here: still give the near ground a fine, smooth mesh
  if (near) sheets.push({ half: 60e3, n: Q.mid, sample: chain(near, far) });
  else sheets.push({ half: 80e3, n: Math.min(Q.mid, 320), sample: chain(far) });
  sheets.push({ half: 260e3, n: Q.far, sample: chain(far) });
  if (patch && patch.scale_m > 100) sheets.shift(), sheets.unshift({ half: 60e3, n: Q.mid, sample: best }), sheets.splice(1, 1);   // a 240 m patch replaces the middle sheet
  // An odd point count puts one mesh point exactly under the camera, so the eye can never start below the surface.
  for (const s of sheets) s.n |= 1;

  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === "low" ? 1 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
  container.replaceChildren(renderer.domElement);
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;cursor:grab;touch-action:none";

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(60, 1, 1, 720e3);
  const bump = groundTexture();
  const ground = new THREE.MeshStandardMaterial({ color: 0x8f8a82, roughness: 1, metalness: 0, bumpMap: bump, bumpScale: 9, side: THREE.DoubleSide });
  const groundFar = new THREE.MeshStandardMaterial({ color: 0x8f8a82, roughness: 1, metalness: 0, side: THREE.DoubleSide });      // both sides: the ground always hides the sky behind it
  let nearGeo = null;
  sheets.forEach((s, k) => {
    const geo = buildSheet(site, h0, s.half, s.n, k ? sheets[k - 1].half : 0, s.sample);
    if (!k) nearGeo = { pos: geo.attributes.position.array, n: s.n, half: s.half };
    const m = new THREE.Mesh(geo, k ? groundFar : ground);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  });
  // Height (y) and upward normal of the nearest sheet at a point given in meters east and north of the site.
  const groundAt = (east, north) => {
    const { pos, n, half } = nearGeo, step = 2 * half / (n - 1), fj = Math.max(0, Math.min(n - 1.001, (east + half) / step)), fi = Math.max(0, Math.min(n - 1.001, (half - north) / step));
    const j = Math.floor(fj), i = Math.floor(fi), u = fj - j, v = fi - i, P = (ii, jj) => { const o = (ii * n + jj) * 3; return new THREE.Vector3(pos[o], pos[o + 1], pos[o + 2]); };
    const a = P(i, j), b = P(i, j + 1), c = P(i + 1, j), d = P(i + 1, j + 1);
    const [p0, p1, p2, w1, w2] = u + v <= 1 ? [a, b, c, u, v] : [d, c, b, 1 - u, 1 - v];      // the two triangles of the cell, as the mesh draws them
    const y = p0.y + (p1.y - p0.y) * w1 + (p2.y - p0.y) * w2, nrm = new THREE.Vector3().crossVectors(p2.clone().sub(p0), p1.clone().sub(p0)).normalize();
    if (nrm.y < 0) nrm.negate();
    return { y, normal: nrm };
  };

  // Rocks around the viewer and a lander, each with a long shadow drawn on the ground (the shadow map is far too coarse
  // for things this small). Illustrative: no data says where rocks are. The shadow lengths follow the real Sun height.
  const rocks = [], rr = rng(2027), ROCKS = quality === "low" ? 260 : 520;
  const rockMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x8a857c, roughness: 1, flatShading: true }), ROCKS);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);      // unit strip lying flat, starting at the origin and running along -z
  const rockShadows = new THREE.InstancedMesh(shadowGeo, shadowMat, ROCKS + 1);
  { const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let k = 0; k < ROCKS; k++) {
      const dist = 6 + Math.pow(rr(), 1.7) * 230, ang = rr() * Math.PI * 2, east = Math.sin(ang) * dist, north = Math.cos(ang) * dist;
      const size = (0.05 + Math.pow(rr(), 7) * 0.75) * (1 + dist / 220) * (0.4 + 0.6 * Math.min(1, dist / 70)), g = groundAt(east, north);
      const sc = new THREE.Vector3(size * (0.8 + rr() * 0.7), size * (0.5 + rr() * 0.5), size * (0.8 + rr() * 0.7));
      e.set(rr() * 3, rr() * 6, rr() * 3); q.setFromEuler(e);
      const p = new THREE.Vector3(east, g.y + sc.y * 0.35, -north);
      rockMesh.setMatrixAt(k, m4.compose(p, q, sc));
      rocks.push({ base: new THREE.Vector3(east, g.y, -north), normal: g.normal, height: sc.y * 1.2, width: Math.max(sc.x, sc.z) * 1.7 });
    }
  }
  rockMesh.receiveShadow = true; rockShadows.frustumCulled = false; rockShadows.renderOrder = 2;
  const lander = buildLander(), LAND = { east: -13, north: 11 }, lg = groundAt(LAND.east, LAND.north);
  lander.group.position.set(LAND.east, lg.y, -LAND.north);
  rocks.push({ base: lander.group.position.clone(), normal: lg.normal, height: 4.4, width: 5.2 });      // the lander's own shadow uses the same strip
  scene.add(rockMesh, rockShadows, lander.group);

  scene.add(new THREE.AmbientLight(0xffffff, 0.022));           // faint fill so shadowed ground is not pure black
  const sun = new THREE.DirectionalLight(0xfff4e6, 3.2);
  sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  scene.add(sun, sun.target);

  const stars = (() => {
    const n = 1400, p = new Float32Array(n * 3); let s = 99; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1, t = rnd() * 6.283, r = Math.sqrt(1 - u * u); p.set([r * Math.cos(t) * 690e3, u * 690e3, r * Math.sin(t) * 690e3], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.7 }));
  })();
  scene.add(stars);

  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(650e3 * Math.tan(0.2666 * DEG), 48), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sunGlow.scale.setScalar(650e3 * Math.tan(11 * DEG) * 2);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.9, metalness: 0, emissive: 0x0a1626 }));
  const earthGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("120,180,255", false), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.55 }));
  scene.add(sunDisc, sunGlow, earthGlow, earth);
  // Name tags that follow the Sun and the Earth across the picture.
  const tags = ["sun", "earth"].map((k) => { const d = document.createElement("div"); d.className = "sv-tag sv-tag-" + k; container.appendChild(d); return d; });
  let bodies = null;

  let skyline = null;
  const skyMat = new THREE.LineBasicMaterial({ color: 0x35d6c4, depthTest: false, transparent: true, opacity: 0.95 });

  // ----- looking around -----
  let yaw = 0, pitch = 2 * DEG, eye = eyeM, drag = null, dirty = true, disposed = false;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; el.setPointerCapture(e.pointerId); el.style.cursor = "grabbing"; });
  el.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const k = camera.fov * DEG / el.clientHeight;
    yaw = drag.yaw - (e.clientX - drag.x) * k; pitch = Math.max(-80 * DEG, Math.min(85 * DEG, drag.pitch + (e.clientY - drag.y) * k)); dirty = true;
  });
  el.addEventListener("pointerup", () => { drag = null; el.style.cursor = "grab"; });
  el.addEventListener("wheel", (e) => { e.preventDefault(); camera.fov = Math.max(4, Math.min(80, camera.fov * (e.deltaY > 0 ? 1.12 : 0.89))); camera.updateProjectionMatrix(); dirty = true; }, { passive: false });

  const resize = () => {
    const w = container.clientWidth || 800, h = container.clientHeight || 450;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  let onView = () => {};
  function frame() {
    if (disposed) return;
    if (dirty) {
      dirty = false;
      camera.position.set(0, eye, 0);
      camera.lookAt(Math.sin(yaw) * Math.cos(pitch) * 1000, eye + Math.sin(pitch) * 1000, -Math.cos(yaw) * Math.cos(pitch) * 1000);
      renderer.render(scene, camera);
      onView({ az: ((yaw / DEG) % 360 + 360) % 360, el: pitch / DEG, fov: camera.fov });
      if (bodies) bodies.forEach((bd, k) => {            // keep each name tag just under its body, hidden when it is behind the viewer
        const v = bd.dir.clone().multiplyScalar(SKY).project(camera), t = tags[k], on = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
        t.hidden = !on; if (!on) return;
        t.textContent = bd.text; t.classList.toggle("off", !bd.up);
        t.style.left = ((v.x + 1) / 2 * 100).toFixed(2) + "%"; t.style.top = ((1 - v.y) / 2 * 100).toFixed(2) + "%";
      });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  onStatus("");

  return {
    info: { heightM: h0, detailM: patch ? patch.scale_m : (near || far).res, quality: Q.label, triangles: sheets.reduce((a, s) => a + 2 * (s.n - 1) ** 2, 0) },
    // Sun and Earth as azimuth/elevation (deg) seen from the site; eclipse = share of the Sun hidden by Earth.
    setTime({ sunAz, sunEl, earthAz, earthEl, earthRadDeg = 0.95, eclipse = 0, sunUp = sunEl > 0, earthUp = earthEl > 0, sunFrac = 1 }) {
      const s = dirOf(sunAz, sunEl), e = dirOf(earthAz, earthEl);
      bodies = [{ dir: s, up: sunUp, text: sunUp ? `SUN · ${sunFrac < 0.995 ? Math.round(sunFrac * 100) + "% IN VIEW" : "POWER"}` : "SUN · BLOCKED BY THE GROUND" },
                { dir: e, up: earthUp, text: earthUp ? "EARTH · LINK" : "EARTH · BLOCKED, NO LINK" }];
      // long shadows: each strip starts at its rock, lies on the local slope and runs away from the Sun
      const lit = sunUp && sunEl > 0.25, m4 = new THREE.Matrix4(), away = new THREE.Vector3(-s.x, 0, -s.z).normalize(), X = new THREE.Vector3(), Z = new THREE.Vector3();
      rocks.forEach((rk, k) => {
        if (!lit) return rockShadows.setMatrixAt(k, m4.makeScale(0, 0, 0));
        const len = Math.min(rk.height / Math.tan(Math.max(sunEl, 0.6) * DEG), 220);
        Z.copy(away).addScaledVector(rk.normal, -away.dot(rk.normal)).normalize().negate();      // strip runs along -Z
        X.crossVectors(rk.normal, Z).normalize();
        m4.makeBasis(X.clone().multiplyScalar(rk.width), rk.normal, Z.clone().multiplyScalar(len)).setPosition(rk.base.x + rk.normal.x * 0.04, rk.base.y + 0.04, rk.base.z + rk.normal.z * 0.04);
        rockShadows.setMatrixAt(k, m4);
      });
      rockShadows.instanceMatrix.needsUpdate = true; rockShadows.material.opacity = 0.9 * (1 - eclipse);
      lander.panels.rotation.y = Math.atan2(s.x, s.z);                                   // panels face the Sun's direction
      lander.dish.lookAt(lander.group.position.clone().add(new THREE.Vector3(0.45, 4.25, 0.3)).add(e.clone().multiplyScalar(1000)));
      sun.intensity = 3.2 * (1 - eclipse);
      sun.position.copy(s).multiplyScalar(320e3); sun.target.position.set(0, 0, 0);
      const c = sun.shadow.camera, b = Q.box * 1.45;
      c.left = -b; c.right = b; c.top = b * Math.abs(Math.sin(sunEl * DEG)) + 9000; c.bottom = -c.top; c.near = 1000; c.far = 640e3; c.updateProjectionMatrix();
      sun.shadow.bias = -2e-5; sun.shadow.normalBias = (2 * b / Q.shadow) * 1.6;
      sunDisc.position.copy(s).multiplyScalar(650e3); sunDisc.lookAt(0, 0, 0);
      sunGlow.position.copy(s).multiplyScalar(649e3); sunGlow.material.opacity = 1 - eclipse;
      earth.position.copy(e).multiplyScalar(SKY); earth.scale.setScalar(SKY * Math.tan(earthRadDeg * DEG));
      earth.rotation.y = -0.6;
      earthGlow.position.copy(e).multiplyScalar(SKY * 1.002); earthGlow.scale.setScalar(SKY * Math.tan(earthRadDeg * DEG) * 7);
      dirty = true;
    },
    // LUNI's computed skyline (elevation per azimuth, deg) drawn as a line in the sky, or null to hide it.
    setSkyline(horizon) {
      if (skyline) { scene.remove(skyline); skyline.geometry.dispose(); skyline = null; }
      if (horizon) {
        const n = horizon.length, pts = [];
        for (let i = 0; i <= n; i++) pts.push(dirOf(i * 360 / n, horizon[i % n]).multiplyScalar(500e3));
        skyline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), skyMat); skyline.renderOrder = 10; skyline.frustumCulled = false;
        scene.add(skyline);
      }
      dirty = true;
    },
    setEye(m) { eye = m; dirty = true; },
    setExposure(x) { renderer.toneMappingExposure = x; dirty = true; },
    lookAt(az, elv = 2) { yaw = az * DEG; pitch = elv * DEG; dirty = true; },
    setFov(f) { camera.fov = f; camera.updateProjectionMatrix(); dirty = true; },
    onView(fn) { onView = fn; dirty = true; },
    render() { dirty = true; },
    image() { renderer.render(scene, camera); return renderer.domElement.toDataURL("image/png"); },
    dispose() { disposed = true; ro.disconnect(); renderer.dispose(); scene.traverse((o) => { o.geometry?.dispose?.(); }); container.replaceChildren(); },
  };
}
