// Preset landing sites live in data/sites.json (single source of truth, also read by tools/build_horizons.py).
export const CUSTOM_ID = "custom";
export let SITES = [];
export async function loadSites(base = "data/") {
  SITES = (await fetch(base + "sites.json").then((r) => r.json())).sites;
  return SITES;
}
