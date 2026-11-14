// Optional link to OpenSpace (openspaceproject.com) running on the same computer: OpenSpace follows LUNI's site
// and time, so its rendered Moon, Sun and Earth show the moment LUNI is judging. LUNI only sends; it reads nothing
// back, and OpenSpace's picture is a companion view, not a check of LUNI's numbers.
//
// Protocol (same as OpenSpace's own openspace-api-js 1.0.2): a WebSocket on port 4682, an "apiHandshake" message,
// then { topic, type: "luascript", payload: { script } } messages. Nothing here runs until the user presses the button.

const PORT = 4682, HANDSHAKE = { type: "apiHandshake", apiVersion: { major: 1, minor: 0, patch: 0 } };
export const OS_VIEWS = [["FAR", 400000], ["NEAR", 40000], ["LOW", 4000]];      // camera height above the site, meters

export function createOpenSpaceLink({ onStatus }) {
  let ws = null, topic = 0, sent = { site: "", time: "", alt: 0 }, altM = OS_VIEWS[1][1], timer = 0, pending = null;
  const status = (state, text) => onStatus?.(state, text);
  const lua = (script) => ws?.readyState === 1 && ws.send(JSON.stringify({ topic: topic++, type: "luascript", payload: { script, return: false, shouldBeSynchronized: true } }));

  // Newer OpenSpace listens at the bare address, older versions at /websocket: try both.
  function connect(paths = ["", "/websocket"]) {
    disconnect(true);
    status("connecting", "LOOKING FOR OPENSPACE ON THIS COMPUTER…");
    let s;
    try { s = new WebSocket(`ws://localhost:${PORT}${paths[0]}`); }
    catch { return status("off", "THIS PAGE IS NOT ALLOWED TO REACH PROGRAMS ON THIS COMPUTER. OPEN LUNI FROM THIS COMPUTER INSTEAD."); }
    let opened = false;
    s.onopen = () => {
      opened = true; ws = s; sent = { site: "", time: "", alt: 0 };
      s.send(JSON.stringify(HANDSHAKE));
      status("on", "CONNECTED. OPENSPACE FOLLOWS THE SITE AND THE MISSION CLOCK.");
      if (pending) flush();
    };
    s.onclose = () => {
      if (ws === s) { ws = null; status("off", "OPENSPACE CLOSED THE CONNECTION."); }
      else if (!opened && paths.length > 1) connect(paths.slice(1));
      else if (!opened) status("off", "NO ANSWER. START OPENSPACE ON THIS COMPUTER (ANY PROFILE WITH THE MOON), THEN PRESS AGAIN.");
    };
    s.onerror = () => {};
  }
  function disconnect(quiet) { const s = ws; ws = null; try { s?.close(); } catch {} if (!quiet) status("off", "OFF."); }

  // What LUNI is showing now: { site: { lat, lon }, t: Date }. Sent at most 8 times a second (PLAY moves the clock fast).
  function update(state) { pending = state; if (ws && !timer) timer = setTimeout(() => { timer = 0; flush(); }, 120); }
  function flush() {
    if (!ws || ws.readyState !== 1 || !pending) return;
    const { site, t } = pending, time = t.toISOString().slice(0, 19), where = `${site.lat.toFixed(5)},${site.lon.toFixed(5)}`;
    let script = "";
    if (time !== sent.time) script += `openspace.time.setPause(true) openspace.time.setTime("${time}") `;
    if (where !== sent.site || altM !== sent.alt) {
      // flyToGeo moved from the globebrowsing library to the navigation library between OpenSpace versions.
      script += `local nav = openspace.navigation local fly = (nav and nav.flyToGeo) or (openspace.globebrowsing and openspace.globebrowsing.flyToGeo) `
        + `if fly then fly("Moon", ${site.lat.toFixed(5)}, ${site.lon.toFixed(5)}, ${altM}, ${sent.site ? 4 : 6}) end `;
    }
    if (script) lua(script);
    sent = { site: where, time, alt: altM };
  }

  return {
    connect, disconnect, update,
    setView(m) { altM = m; if (pending) flush(); },
    get view() { return altM; },
    get connected() { return !!ws && ws.readyState === 1; },
  };
}
