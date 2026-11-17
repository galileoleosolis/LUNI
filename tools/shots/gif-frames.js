// Frames for two recordings (the Best Site Finder and 25 days of skyline) into out/scan and out/sky. Then run make_gifs.py.
const { chromium } = require('playwright');
const BASE = process.env.LUNI_URL || 'http://localhost:8080';
const OUT = require('path').join(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true }); require('fs').mkdirSync(OUT + 'scan', { recursive: true }); require('fs').mkdirSync(OUT + 'sky', { recursive: true });
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.addInitScript(() => { window.LUNO_NO_COMPARE = true; });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const done = () => p.evaluate(() => /MOVE MY SITE|YOU ARE AT|NO SPOT/.test(document.getElementById('scan-go-best').textContent));
  const clip = { x: 58, y: 135, width: 1320, height: 656 };
  let n = 0; const log = [];
  const shot = async (tag) => { const f = String(n++).padStart(3, '0'); await p.screenshot({ path: OUT + 'scan/' + f + '.png', clip }); log.push(f + ' ' + tag); };
  await p.goto(BASE + '/#site=nobile1&t=2026-11-14T20&days=10'); await p.reload(); await p.waitForTimeout(3000);
  await p.click('#scan-btn'); await p.waitForTimeout(150);
  for (let i = 0; i < 200 && !(await done()); i++) { await shot('fill'); await p.waitForTimeout(300); }
  await p.waitForTimeout(400); await shot('found'); 
  await p.click('#scan-go-best');
  const t0 = Date.now();
  while (Date.now() - t0 < 3400) { await shot('move'); await p.waitForTimeout(40); }
  for (let i = 0; i < 60 && !(await done()); i++) { await shot('fill2'); await p.waitForTimeout(300); }
  await p.waitForTimeout(500); await shot('end');
  require('fs').writeFileSync(OUT + 'scan/log.txt', log.join('\n'));
  console.log('scan frames', n);
  // the skyline: the Sun and the Earth over 30 days, a frame every 6 hours
  await p.click('#scan-btn'); await p.waitForTimeout(400);
  await p.goto(BASE + '/#site=nobile1&t=2026-11-15T20&days=10'); await p.reload(); await p.waitForTimeout(3000);
  await p.evaluate(() => document.body.focus());
  const sky = await p.$('#horizon'); let m = 0;
  for (let f = 0; f < 100; f++) { await sky.screenshot({ path: OUT + 'sky/' + String(m++).padStart(3, '0') + '.png' }); for (let k = 0; k < 6; k++) await p.keyboard.press('ArrowRight'); await p.waitForTimeout(30); }
  console.log('sky frames', m, 'clock', await p.textContent('#bar-now'));
  console.log('errors', errs);
  await b.close();
})();
