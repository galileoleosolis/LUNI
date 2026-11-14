// Skylines on the graphics chip (WebGL2), for the area scan at south-polar sites.
// Same method as computeTerrain in js/terrain.js: from each point, look out along each direction, step by step, read
// the ground height from the LOLA map and keep the highest angle. The chip does every direction of many points at once.
//
// Graphics chips calculate with about 7 digits, so nothing here subtracts two large, nearly equal numbers:
//   - map position is worked out as an offset from the point's own map pixel (exact whole pixel + small fraction);
//   - the angle uses height differences and 1 - cos(d/R), never the two radii themselves.
// The scan still checks one point of every run against the processor version before trusting the chip.

import { NEAR_LIMIT_M, RADIUS_M, MAST_M, skylineSteps, slopeAt } from "./terrain.js";

const DEG = Math.PI / 180, R = RADIUS_M;

const VERT = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float; precision highp int; precision highp isampler2D; precision highp sampler2D;
uniform isampler2D uNear, uFar;      // heights, whole numbers; meters = value * quant
uniform sampler2D uSteps;            // per step: x = sin(d/R), y = 1 - cos(d/R)
uniform sampler2D uPts;              // per point, 5 texels: up+height, north, east, near pixel, far pixel
uniform sampler2D uAz;               // per direction: x = cos, y = sin (worked out on the processor: a chip's own sine can be loose)
uniform int uStepCount, uNearSteps;
uniform bool uHasNear;
uniform vec4 uNearP, uFarP;          // 2R/scale, quant, rows, cols
uniform float uNearMaxUz, uR;
out vec4 o;

// Height at (whole pixel + fraction), row/col order, bilinear; ok = false outside the map.
float heightAt(isampler2D t, ivec2 base, vec2 f, vec4 P, out bool ok) {
  vec2 fl = floor(f), w = f - fl; ivec2 rc = base + ivec2(fl);
  ok = rc.x >= 0 && rc.y >= 0 && rc.x < int(P.z) - 1 && rc.y < int(P.w) - 1;
  if (!ok) return 0.0;
  float a = float(texelFetch(t, ivec2(rc.y, rc.x), 0).r), b = float(texelFetch(t, ivec2(rc.y + 1, rc.x), 0).r);
  float c = float(texelFetch(t, ivec2(rc.y, rc.x + 1), 0).r), d = float(texelFetch(t, ivec2(rc.y + 1, rc.x + 1), 0).r);
  return (a * (1.0 - w.x) * (1.0 - w.y) + b * (1.0 - w.x) * w.y + c * w.x * (1.0 - w.y) + d * w.x * w.y) * P.y;
}

void main() {
  int az = int(gl_FragCoord.x), pt = int(gl_FragCoord.y);
  vec4 p0 = texelFetch(uPts, ivec2(0, pt), 0), p3 = texelFetch(uPts, ivec2(3, pt), 0), p4 = texelFetch(uPts, ivec2(4, pt), 0);
  vec3 up = p0.xyz, north = texelFetch(uPts, ivec2(1, pt), 0).xyz, east = texelFetch(uPts, ivec2(2, pt), 0).xyz;
  float eye = p0.w, rp = uR + eye, omz = 1.0 - up.z, best = -2.0;
  vec2 cs = texelFetch(uAz, ivec2(az, 0), 0).xy;
  vec3 T = north * cs.x + east * cs.y;
  for (int k = 0; k < uStepCount; k++) {
    vec2 s = texelFetch(uSteps, ivec2(k, 0), 0).xy;
    vec3 dl = T * s.x - up * s.y;                              // unit vector to the target, minus "up"
    float den = (omz - dl.z) * omz;
    vec2 g = vec2(-(dl.x * omz + up.x * dl.z), dl.y * omz + up.y * dl.z) / den;      // map offset (row, col) in units of 2R
    bool ok = false; float h = 0.0;
    if (uHasNear && k < uNearSteps && up.z + dl.z <= uNearMaxUz) h = heightAt(uNear, ivec2(p3.xy), p3.zw + g * uNearP.x, uNearP, ok);
    if (!ok) h = heightAt(uFar, ivec2(p4.xy), p4.zw + g * uFarP.x, uFarP, ok);
    if (!ok) continue;
    float dh = h - eye, rq = uR + h;
    best = max(best, (dh - rq * s.y) / sqrt(dh * dh + 2.0 * rq * rp * s.y));        // sine of the angle above level
  }
  o = vec4(best, 0.0, 0.0, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
  return s;
}

// Returns null when this browser or computer cannot do it (the scan then uses the processor).
export function createGpuSkyline() {
  let gl, canvas;
  try {
    canvas = document.createElement("canvas");
    gl = canvas.getContext("webgl2", { powerPreference: "high-performance", antialias: false, depth: false, stencil: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl || !gl.getExtension("EXT_color_buffer_float") || gl.getParameter(gl.MAX_TEXTURE_SIZE) < 4096) return null;
  } catch { return null; }

  let lost = false;
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; });

  let prog, U = {}, vao, fbo, outTex, outW = 0, outH = 0, ptsTex, stepsTex, azTex, setup = null;
  const mapTex = new Map();      // grid -> texture
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
    for (const n of ["uNear", "uFar", "uSteps", "uPts", "uStepCount", "uNearSteps", "uHasNear", "uNearP", "uFarP", "uNearMaxUz", "uAz", "uR"]) U[n] = gl.getUniformLocation(prog, n);
    vao = gl.createVertexArray(); fbo = gl.createFramebuffer();
  } catch (e) { console.warn("GPU scan unavailable:", e.message); return null; }

  const tex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t; };
  function heightTexture(grid, unit) {
    let t = mapTex.get(grid);
    if (!t) {
      t = tex(unit); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16I, grid.cols, grid.rows, 0, gl.RED_INTEGER, gl.SHORT, grid.data);
      mapTex.set(grid, t);
    }
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  }
  const pix = (grid, up) => {      // the point's own map pixel: whole part and fraction, row then col
    const k = 2 * R / grid.scale_m / (1 - up[2]);
    const row = (grid.pole_row ?? (grid.rows - 1) / 2) - k * up[0], col = (grid.pole_col ?? (grid.cols - 1) / 2) + k * up[1];
    return [Math.floor(row), Math.floor(col), row - Math.floor(row), col - Math.floor(col)];
  };

  // Choose the maps (near may be null) and the number of directions. Both maps must be south-polar.
  function prepare(near, far, azStep) {
    const best = near || far, dist = skylineSteps(best.res), nAz = Math.round(360 / azStep);
    if (dist.length > gl.getParameter(gl.MAX_TEXTURE_SIZE)) throw new Error("too many steps");
    gl.useProgram(prog); gl.bindVertexArray(vao);
    heightTexture(far, 1); if (near) heightTexture(near, 0); else heightTexture(far, 0);
    const steps = new Float32Array(dist.length * 2);
    dist.forEach((d, k) => { const h = Math.sin(d / R / 2); steps[2 * k] = Math.sin(d / R); steps[2 * k + 1] = 2 * h * h; });
    if (stepsTex) gl.deleteTexture(stepsTex);
    stepsTex = tex(2); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, dist.length, 1, 0, gl.RG, gl.FLOAT, steps);
    const azs = new Float32Array(nAz * 2);
    for (let i = 0; i < nAz; i++) { azs[2 * i] = Math.cos(i * azStep * DEG); azs[2 * i + 1] = Math.sin(i * azStep * DEG); }
    if (azTex) gl.deleteTexture(azTex);
    azTex = tex(5); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, nAz, 1, 0, gl.RG, gl.FLOAT, azs);
    if (!ptsTex) ptsTex = tex(3);
    gl.uniform1i(U.uNear, 0); gl.uniform1i(U.uFar, 1); gl.uniform1i(U.uSteps, 2); gl.uniform1i(U.uPts, 3); gl.uniform1i(U.uAz, 5);
    gl.uniform1i(U.uStepCount, dist.length); gl.uniform1i(U.uNearSteps, near ? dist.filter((d) => d <= NEAR_LIMIT_M).length : 0);
    gl.uniform1i(U.uHasNear, near ? 1 : 0);
    const P = (g) => [2 * R / g.scale_m, g.quant_m, g.rows, g.cols];
    gl.uniform4fv(U.uNearP, P(near || far)); gl.uniform4fv(U.uFarP, P(far));
    gl.uniform1f(U.uNearMaxUz, near ? Math.sin(near.min_lat * DEG) : -2); gl.uniform1f(U.uR, R);
    setup = { near, far, best, nAz };
    return { nAz, steps: dist.length };
  }

  // Skylines for a batch of points [{ lat, lon }]. Fills heightM and slopeDeg on each point and returns the
  // skyline angles in degrees, nAz per point. Blocks until the chip has finished.
  function run(points) {
    if (lost) throw new Error("the graphics chip stopped answering");
    const { near, far, best, nAz } = setup, K = points.length, data = new Float32Array(K * 20);
    points.forEach((p, j) => {
      const la = p.lat * DEG, lo = p.lon * DEG, sl = Math.sin(la), cl = Math.cos(la), cn = Math.cos(lo), sn = Math.sin(lo);
      const up = [cl * cn, cl * sn, sl];
      let h0 = best.height(p.lat, p.lon); if (!Number.isFinite(h0)) h0 = far.height(p.lat, p.lon);
      p.heightM = h0; p.slopeDeg = slopeAt(best, p.lat, p.lon);
      data.set([...up, h0 + MAST_M, -sl * cn, -sl * sn, cl, 0, -sn, cn, 0, 0, ...pix(near || far, up), ...pix(far, up)], j * 20);
    });
    gl.useProgram(prog); gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, ptsTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 5, K, 0, gl.RGBA, gl.FLOAT, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    if (outW !== nAz || outH < K) {
      if (outTex) gl.deleteTexture(outTex);
      outTex = tex(4); outW = nAz; outH = Math.max(K, 64);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, outW, outH, 0, gl.RGBA, gl.FLOAT, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outTex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("the graphics chip cannot write decimal numbers");
    }
    gl.viewport(0, 0, nAz, K);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Float32Array(nAz * K * 4);
    gl.readPixels(0, 0, nAz, K, gl.RGBA, gl.FLOAT, px);
    if (lost || gl.getError() !== gl.NO_ERROR) throw new Error("the graphics chip reported an error");
    const out = new Float32Array(nAz * K);
    for (let i = 0; i < out.length; i++) { const s = px[4 * i]; out[i] = s < -1 ? -90 : Math.asin(Math.min(1, s)) / DEG; }
    return out;
  }

  const info = () => { try { const e = gl.getExtension("WEBGL_debug_renderer_info"); return String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch { return ""; } };
  return { prepare, run, info, get lost() { return lost; } };
}
