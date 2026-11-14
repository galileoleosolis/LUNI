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
      uv[q] = east / 9; uv[q + 1] = north / 9;
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

function noiseTexture() {            // fine-grained bump so the nearest ground is not glass-smooth (illustrative only)
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d"), img = x.createImageData(256, 256);
  let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < img.data.length; i += 4) { const v = 110 + rnd() * 60; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

function earthTexture() {            // stylized Earth: this is a marker for where Earth is, not a real image
  const c = document.createElement("canvas"); c.width = 512; c.height = 256;
  const x = c.getContext("2d"); x.fillStyle = "#1d4f9c"; x.fillRect(0, 0, 512, 256);
  let s = 777; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 26; i++) { x.fillStyle = i % 3 ? "#3f7a48" : "#8a7a52"; x.beginPath(); x.ellipse(rnd() * 512, 40 + rnd() * 176, 14 + rnd() * 46, 8 + rnd() * 26, rnd() * 3, 0, 7); x.fill(); }
  for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.45})`; x.beginPath(); x.ellipse(rnd() * 512, rnd() * 256, 10 + rnd() * 60, 3 + rnd() * 9, rnd() * 0.6 - 0.3, 0, 7); x.fill(); }
  x.fillStyle = "#fff"; x.fillRect(0, 0, 512, 14); x.fillRect(0, 242, 512, 14);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function glowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d"), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,250,235,1)"); g.addColorStop(0.08, "rgba(255,245,220,.9)"); g.addColorStop(0.3, "rgba(255,225,170,.18)"); g.addColorStop(1, "rgba(255,220,160,0)");
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
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
  if (near) sheets.push({ half: 60e3, n: Q.mid, sample: chain(near, far) });
  else sheets.push({ half: 80e3, n: Math.min(Q.mid, 240), sample: chain(far) });
  sheets.push({ half: 260e3, n: Q.far, sample: chain(far) });
  if (patch && patch.scale_m > 100) sheets.shift(), sheets.unshift({ half: 60e3, n: Q.mid, sample: best }), sheets.splice(1, 1);   // a 240 m patch replaces the middle sheet

  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === "low" ? 1 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.5;
  container.replaceChildren(renderer.domElement);
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;cursor:grab;touch-action:none";

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(60, 1, 1, 720e3);
  const bump = noiseTexture();
  const ground = new THREE.MeshStandardMaterial({ color: 0x9c978f, roughness: 1, metalness: 0, bumpMap: bump, bumpScale: 0.12 });
  const groundFar = new THREE.MeshStandardMaterial({ color: 0x9c978f, roughness: 1, metalness: 0 });
  sheets.forEach((s, k) => {
    const m = new THREE.Mesh(buildSheet(site, h0, s.half, s.n, k ? sheets[k - 1].half : 0, s.sample), k ? groundFar : ground);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  });

  scene.add(new THREE.AmbientLight(0xffffff, 0.035));           // faint fill so shadowed ground is not pure black
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
  sunGlow.scale.setScalar(650e3 * Math.tan(4 * DEG) * 2);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 1, metalness: 0 }));
  scene.add(sunDisc, sunGlow, earth);

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
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  onStatus("");

  return {
    info: { heightM: h0, detailM: patch ? patch.scale_m : (near || far).res, quality: Q.label, triangles: sheets.reduce((a, s) => a + 2 * (s.n - 1) ** 2, 0) },
    // Sun and Earth as azimuth/elevation (deg) seen from the site; eclipse = share of the Sun hidden by Earth.
    setTime({ sunAz, sunEl, earthAz, earthEl, earthRadDeg = 0.95, eclipse = 0 }) {
      const s = dirOf(sunAz, sunEl), e = dirOf(earthAz, earthEl);
      sun.intensity = 3.2 * (1 - eclipse);
      sun.position.copy(s).multiplyScalar(320e3); sun.target.position.set(0, 0, 0);
      const c = sun.shadow.camera, b = Q.box * 1.45;
      c.left = -b; c.right = b; c.top = b * Math.abs(Math.sin(sunEl * DEG)) + 9000; c.bottom = -c.top; c.near = 1000; c.far = 640e3; c.updateProjectionMatrix();
      sun.shadow.bias = -2e-5; sun.shadow.normalBias = (2 * b / Q.shadow) * 1.6;
      sunDisc.position.copy(s).multiplyScalar(650e3); sunDisc.lookAt(0, 0, 0);
      sunGlow.position.copy(s).multiplyScalar(649e3); sunGlow.material.opacity = 1 - eclipse;
      earth.position.copy(e).multiplyScalar(SKY); earth.scale.setScalar(SKY * Math.tan(earthRadDeg * DEG));
      earth.rotation.y = -0.6;
      dirty = true;
    },
    // LUNO's computed skyline (elevation per azimuth, deg) drawn as a line in the sky, or null to hide it.
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
