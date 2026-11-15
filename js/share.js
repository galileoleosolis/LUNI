// Share link: the site, landing time and mission needs written into the part of the address after "#", so a link
// opens LUNI on exactly the same question. Example:  #site=im2&t=2025-03-06T17&days=10&dark=12&earth=0&link=1&slope=0
// A custom point is written as  at=-85.300,37.000  instead of site=...
import { DEFAULT_REQ, REQ_OPTIONS } from "./mission.js";

const KEYS = { days: "days", maxDarkH: "dark", earthMinPct: "earth", maxSlopeDeg: "slope" };

export function encodeShare({ site, t0, req, custom }) {
  const p = new URLSearchParams();
  if (custom) p.set("at", `${site.lat.toFixed(4)},${site.lon.toFixed(4)}`); else p.set("site", site.id);
  p.set("t", t0.toISOString().slice(0, 13));
  for (const [k, short] of Object.entries(KEYS)) p.set(short, req[k]);
  p.set("link", req.earthAtLanding ? 1 : 0);
  return "#" + p.toString().replace(/%2C/g, ",");
}

// Returns { siteId | lat, lon, t0, req } for a share link, or null for anything else (no hash, "#test", nonsense).
export function decodeShare(hash, sites) {
  if (!/^#(?:site|at)=/.test(hash || "")) return null;
  const p = new URLSearchParams(hash.slice(1)), out = { req: { ...DEFAULT_REQ } };
  if (p.has("site")) { if (!sites.some((s) => s.id === p.get("site"))) return null; out.siteId = p.get("site"); }
  else {
    const [lat, lon] = p.get("at").split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 360) return null;
    out.lat = lat; out.lon = lon;
  }
  const t = new Date((p.get("t") || "") + ":00:00Z");
  if (Number.isFinite(+t)) out.t0 = t;
  for (const [k, short] of Object.entries(KEYS)) { const v = Number(p.get(short)); if (p.has(short) && REQ_OPTIONS[k].includes(v)) out.req[k] = v; }
  if (p.has("link")) out.req.earthAtLanding = p.get("link") !== "0";
  return out;
}

// Put text on the clipboard. Resolves true if it worked (some embedded pages are not allowed to).
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}
