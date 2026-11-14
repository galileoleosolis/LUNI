// 3D Moon for site selection.
// Texture: LRO WAC global mosaic (NASA/GSFC/ASU), fetched from NASA Moon Trek tiles.
import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";

const DEG = Math.PI / 180;
const AMBER = 0xffb000;

// lat/lon (deg, east positive) -> position on a sphere of radius r.
// Matches three.js SphereGeometry UVs with a texture centred on lon 0.
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

export function createGlobe(container, { sites, onPickSite, onPickCoord, onHover }) {
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
  controls.minDistance = 1.35; controls.maxDistance = 7; controls.rotateSpeed = 0.6;

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
  });
  renderer.domElement.addEventListener("pointerleave", () => onHover?.(null));

  // --- sizing + loop ---
  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight || w;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
    camera.aspect = w / h; camera.fov = w >= h ? 30 : 2 * Math.atan(Math.tan(15 * DEG) * h / w) / DEG; camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container); resize();

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
    const pulse = 1 + 0.25 * Math.sin(now / 350);
    ring2.scale.setScalar(pulse);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    // Highlight a site; fly the camera there unless `fly` is false.
    select(site, { fly = true } = {}) {
      for (const [id, d] of dots) d.material.color.set(id === site.id ? 0xffffff : AMBER);
      if (customDot) { markers.remove(customDot); customDot = null; }
      if (!dots.has(site.id)) customDot = addMarker(site, 0xffffff, false);
      selPos = llToVec(site.lat, site.lon, 1.006);
      for (const r of [ring, ring2]) { r.position.copy(selPos); r.lookAt(selPos.clone().multiplyScalar(2)); }
      if (fly) flyTo(site.lat, site.lon);
    },
    // Light the globe from the Sun and point the Sun/Earth pins.
    setBodies(sun, earth) {
      sunLight.position.copy(llToVec(sun.lat, sun.lon, 10));
      sunPin.point(sun.lat, sun.lon); earthPin.point(earth.lat, earth.lon);
    },
  };
}
