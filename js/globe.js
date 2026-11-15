// 3D Moon for site selection.
// Texture: LRO WAC global mosaic (NASA/GSFC/ASU), fetched from NASA Moon Trek tiles.
import * as THREE from "../vendor/three.module.min.js";
import { OrbitControls } from "../vendor/OrbitControls.js";

const DEG = Math.PI / 180;
// marker and grid color follows the page palette
const AMBER = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue("--amb").trim() || "#ffb000");

// lat/lon (deg, east positive) -> position on a sphere of radius r.
// Matches three.js SphereGeometry UVs with a texture centered on lon 0.
export function llToVec(lat, lon, r = 1) {
  const la = lat * DEG, lo = lon * DEG;
  return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
}
function vecToLL(v) {
  const n = v.clone().normalize();
  return { lat: Math.asin(n.y) / DEG, lon: Math.atan2(-n.z, n.x) / DEG };
}

function graticule() {
  const pts = [];
  const R = 1.002, seg = 96;
  for (let lat = -60; lat <= 60; lat += 30)
    for (let i = 0; i < seg; i++) pts.push(llToVec(lat, i * 360 / seg, R), llToVec(lat, (i + 1) * 360 / seg, R));
  for (let lon = 0; lon < 360; lon += 30)
    for (let i = 0; i < seg / 2; i++) pts.push(llToVec(-90 + i * 360 / seg, lon, R), llToVec(-90 + (i + 1) * 360 / seg, lon, R));
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.16 }));
}

function pin(color) {
  const g = new THREE.Group();
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(1.0, 0, 0), new THREE.Vector3(1.13, 0, 0)]),
    new THREE.LineBasicMaterial({ color }));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color }));
  tip.position.set(1.13, 0, 0);
  g.add(line, tip);
  g.point = (lat, lon) => g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), llToVec(lat, lon).normalize());
  return g;
}

// A cap of the sphere around a pole (the pole to minLat; minLat < 0 for the south cap, > 0 for the north cap), with
// texture coordinates laid out like the LOLA polar maps: pole in the middle, longitude 90E toward the right, and
// longitude 0 toward the top on the south map (ySign 1) or toward the bottom on the north map (ySign -1).
function polarCap(minLat, radius, fill, ySign = 1) {
  const rings = 40, segs = 160, pos = [], uv = [], idx = [], pole = Math.sign(minLat) * 90, edge = Math.tan((90 - Math.abs(minLat)) * DEG / 2);
  for (let i = 0; i <= rings; i++) {
    const lat = pole + (minLat - pole) * i / rings, rr = Math.tan((90 - Math.abs(lat)) * DEG / 2) / edge * 0.5 * fill;
    for (let j = 0; j <= segs; j++) {
      const lon = j * 360 / segs, v = llToVec(lat, lon, radius);
      pos.push(v.x, v.y, v.z); uv.push(0.5 + rr * Math.sin(lon * DEG), 0.5 + ySign * rr * Math.cos(lon * DEG));
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = i * (segs + 1) + j, b = a + segs + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

export function createGlobe(container, { sites, labels, onPickSite, onPickCoord, onHover, onHoverPoint }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    container.classList.add("no-webgl");
    container.textContent = "3D VIEW UNAVAILABLE (NO WEBGL) — USE THE LIST BELOW";
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(4.4, 0, 0);

  const tex = new THREE.TextureLoader().load("assets/moon_wac_4k.jpg");
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }));
  scene.add(moon, graticule());

  // Map layers: a see-through skin over the whole Moon, and a finer one over the south polar cap.
  const skinMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
  const skin = new THREE.Mesh(new THREE.SphereGeometry(1.0012, 96, 64), skinMat); skin.visible = false; scene.add(skin);
  let caps = [], overlayOpacity = 0.8;                     // one mesh per polar cap picture
  const texOf = (canvas) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; return t; };

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.6);
  scene.add(sunLight);

  const sunPin = pin(0xffd23c), earthPin = pin(0x5ac8ff);
  scene.add(sunPin, earthPin);

  // --- markers ---
  const markers = new THREE.Group(); scene.add(markers);
  const hitGeo = new THREE.SphereGeometry(0.045, 8, 6);
  const dotGeo = new THREE.SphereGeometry(0.013, 12, 8);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  function addMarker(site, color = AMBER, clickable = true) {
    const p = llToVec(site.lat, site.lon, 1.004);
    const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color }));
    dot.position.copy(p);
    markers.add(dot);
    if (clickable) {
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.copy(p); hit.userData.site = site;
      markers.add(hit);
    }
    return dot;
  }
  const dots = new Map();
  for (const s of sites) dots.set(s.id, addMarker(s));
  let customDot = null;

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.034, 0.042, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.060, 0.064, 40), new THREE.MeshBasicMaterial({ color: AMBER, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
  scene.add(ring, ring2);

  // --- controls ---
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.minDistance = 1.35; controls.maxDistance = 7; controls.rotateSpeed = 0.6; controls.zoomSpeed = 1.9;

  let tween = null;
  function flyTo(lat, lon, dist) {
    const from = camera.position.clone().normalize();
    const to = llToVec(lat, lon).normalize();
    tween = { from, to, d0: camera.position.length(), d1: dist ?? camera.position.length(), t0: performance.now(), ms: 900 };
  }

  // --- picking ---
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  const setNdc = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  const frontHit = (objs) => {
    const hits = ray.intersectObjects(objs, false);
    if (!hits.length) return null;
    const moonHit = ray.intersectObject(moon, false)[0];
    return (!moonHit || hits[0].distance <= moonHit.distance + 0.06) ? hits[0] : null;
  };
  const hitMeshes = () => markers.children.filter((m) => m.userData.site);
  renderer.domElement.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; tween = null; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    setNdc(e);
    const m = frontHit(hitMeshes());
    if (m) { onPickSite?.(m.object.userData.site); return; }
    const h = ray.intersectObject(moon, false)[0];
    if (h) { const ll = vecToLL(h.point); onPickCoord?.(+ll.lat.toFixed(3), +ll.lon.toFixed(3)); }
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    setNdc(e);
    const m = frontHit(hitMeshes());
    renderer.domElement.style.cursor = m ? "pointer" : "grab";
    onHover?.(m ? m.object.userData.site : null, e);
    if (onHoverPoint) { const h = ray.intersectObject(moon, false)[0]; onHoverPoint(h ? vecToLL(h.point) : null); }
  });
  renderer.domElement.addEventListener("pointerleave", () => { onHover?.(null); onHoverPoint?.(null); });

  // --- sizing + loop ---
  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight || w;
    if (!w) return;                                    // hidden (the left side is popped in): keep the last size
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
    camera.aspect = w / h; camera.fov = w >= h ? 30 : 2 * Math.atan(Math.tan(15 * DEG) * h / w) / DEG; camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container); resize();

  // Number tags beside the site dots (same numbers as the list). Tags that would overlap are left out until you zoom in.
  const tags = labels ? sites.map((s, i) => {
    const el = document.createElement("span");
    el.textContent = String(i + 1).padStart(2, "0");
    labels.appendChild(el);
    return { site: s, el, pos: llToVec(s.lat, s.lon, 1.004), num: el.textContent };
  }) : [];
  let selId = null;
  const v = new THREE.Vector3();
  function placeTags() {
    const w = container.clientWidth, h = container.clientHeight, cam = camera.position.clone().normalize(), placed = [];
    const order = [...tags].sort((a, b) => (b.site.id === selId) - (a.site.id === selId));
    for (const t of order) {
      const sel = t.site.id === selId, front = t.pos.clone().normalize().dot(cam) > 0.25;
      v.copy(t.pos).project(camera);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h, tw = sel ? 26 + t.site.name.length * 6.2 : 20;
      const clash = placed.some((p) => Math.abs(p.y - y) < 14 && x < p.x + p.w && p.x < x + tw);
      const show = front && x > 0 && x < w - 16 && y > 22 && y < h - 24 && (sel || !clash);
      t.el.style.display = show ? "" : "none";
      if (!show) continue;
      placed.push({ x, y, w: tw });
      t.el.style.left = x + "px"; t.el.style.top = y + "px";
      t.el.className = sel ? "sel" : "";
      const text = sel ? `${t.num} ${t.site.name.split(" · ")[0].toUpperCase()}` : t.num;
      if (t.el.textContent !== text) t.el.textContent = text;
    }
  }

  let selPos = llToVec(0, 0);
  function frame(now) {
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const dir = tween.from.clone().lerp(tween.to, e);
      if (dir.lengthSq() < 1e-4) dir.set(0.01, 1, 0.01);
      camera.position.copy(dir.normalize().multiplyScalar(tween.d0 + (tween.d1 - tween.d0) * e));
      if (k >= 1) tween = null;
    }
    controls.update();
    // Site marks keep about the same size on screen: they shrink as the camera comes close, so they do not hide the map.
    const near = Math.max(0.1, Math.min(1, (camera.position.length() - 1) / 3.4));
    for (const m of markers.children) m.scale.setScalar(near);
    ring.scale.setScalar(near);
    const pulse = 1 + 0.25 * Math.sin(now / 350);
    ring2.scale.setScalar(pulse * near);
    renderer.render(scene, camera);
    if (tags.length) placeTags();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    // Highlight a site; fly the camera there unless `fly` is false.
    select(site, { fly = true } = {}) {
      selId = site.id;
      for (const [id, d] of dots) d.material.color.set(id === site.id ? 0xffffff : AMBER);
      if (customDot) { markers.remove(customDot); customDot = null; }
      if (!dots.has(site.id)) customDot = addMarker(site, 0xffffff, false);
      selPos = llToVec(site.lat, site.lon, 1.006);
      for (const r of [ring, ring2]) { r.position.copy(selPos); r.lookAt(selPos.clone().multiplyScalar(2)); }
      if (fly) flyTo(site.lat, site.lon);
    },
    // Show a map layer: { global: canvas (whole Moon, longitude -180..180) and / or polar: { canvas, minLat, n, scaleM } }, or null for none.
    setOverlay(o, opacity = 0.8) {
      overlayOpacity = opacity;
      skinMat.map?.dispose(); skinMat.map = null; skinMat.opacity = opacity; skinMat.needsUpdate = true;
      skin.visible = !!o?.global;
      if (o?.global) skinMat.map = texOf(o.global);
      for (const c of caps) { scene.remove(c); c.geometry.dispose(); c.material.map?.dispose(); c.material.dispose(); }
      caps = [];
      for (const p of (o?.polar || []).filter(Boolean)) {
        const edge = 2 * 1737400 * Math.tan((90 - Math.abs(p.minLat)) * DEG / 2);      // meters from the pole to the cap's rim on the map
        const mat = new THREE.MeshBasicMaterial({ map: texOf(p.canvas), transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(polarCap(p.minLat, 1.0022, edge / (p.n * p.scaleM / 2), p.ySign ?? 1), mat);
        // the cap's own picture replaces the whole-Moon one underneath it, so the two do not mix colors
        mesh.renderOrder = 2; caps.push(mesh); scene.add(mesh);
      }
    },
    setOverlayOpacity(v) { overlayOpacity = v; skinMat.opacity = v; for (const c of caps) c.material.opacity = v; },
    // Turn the camera to look straight down at a point; dist = how far out (1 = the surface).
    lookAt(lat, lon, dist) { flyTo(lat, lon, dist); },
    // Light the globe from the Sun and point the Sun/Earth pins.
    setBodies(sun, earth) {
      sunLight.position.copy(llToVec(sun.lat, sun.lon, 10));
      sunPin.point(sun.lat, sun.lon); earthPin.point(earth.lat, earth.lon);
    },
  };
}
