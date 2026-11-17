// Layout check: the main screen (NO-GO and GO), ENERGY and the Best Site Finder at six window sizes. Prints one line a size; anything but 'ok' and 'errors none' is a problem.
const { chromium } = require('playwright');
const BASE = process.env.LUNI_URL || 'http://localhost:8080';
const OUT = require('path').join(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1000, 480], [1100, 700], [1366, 650], [1440, 900], [1920, 950], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 80)); });
    await p.goto(BASE + '/#site=nobile1&t=2026-11-14T20&days=10'); await p.reload(); await p.waitForTimeout(2200);
    // anything in the middle column that runs past its own box, or the page scrolling sideways
    const over = async () => p.evaluate(() => {
      const out = []; const doc = document.documentElement; if (doc.scrollWidth > doc.clientWidth + 2) out.push('page scrolls sideways by ' + (doc.scrollWidth - doc.clientWidth));
      const col = document.querySelector('.col-main'), cr = col.getBoundingClientRect();
      for (const e of col.querySelectorAll('.hero, .hero-warn, .readouts, .ro, #horizon, .plan-tabs, #timeline, .tiles-head')) { if (!e.offsetParent) continue; const r = e.getBoundingClientRect(); if (r.right > cr.right + 3 || r.left < cr.left - 3) out.push((e.id || e.className).toString().slice(0, 20) + ' sticks out ' + Math.round(r.right - cr.right)); if (e.scrollWidth > e.clientWidth + 3 && e.tagName !== 'svg') out.push((e.id || e.className).toString().slice(0, 20) + ' clips ' + (e.scrollWidth - e.clientWidth)); }
      return out; });
    const a = await over();
    // GO with an eclipse warning (opening screen), the energy panel, the finder
    await p.goto(BASE + '/#site=im2&t=2025-03-06T17&days=10'); await p.reload(); await p.waitForTimeout(2200);
    const c = await over();
    await p.click('#energy-btn'); await p.waitForTimeout(500);
    const en = await p.evaluate(() => { const e = document.getElementById('energy'); return e.hidden ? 'energy did not open' : (document.querySelector('.en-chart') ? '' : 'no chart'); });
    await p.click('#energy-close');
    await p.click('#scan-btn'); await p.waitForTimeout(2500);
    const fin = await p.evaluate(() => { const cv = document.getElementById('scan-canvas').getBoundingClientRect(), row = document.getElementById('scan-row').getBoundingClientRect(), n = document.querySelectorAll('#scan-metric button').length, on = document.querySelectorAll('#scan-metric button.on, #scan-radius button.on').length; return `map ${Math.round(cv.width)}px, ${n} choices, ${on} lit` + (cv.right > row.right + 3 ? ' MAP STICKS OUT' : ''); });
    console.log(`${w}x${h}: NO-GO ${a.length ? a.join('; ') : 'ok'} | GO+warning ${c.length ? c.join('; ') : 'ok'} | ${en || 'energy ok'} | finder ${fin} | errors ${errs.length ? errs.join(' / ') : 'none'}`);
    if (w === 1440) { await p.screenshot({ path: OUT + 'rel-finder.png' }); }
    await p.close();
  }
  await b.close();
})();
