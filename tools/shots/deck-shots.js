// The still pictures used on the slides (NO-GO, GO, ENERGY, before and after), into out/.
const { chromium } = require('playwright');
const BASE = process.env.LUNI_URL || 'http://localhost:8080';
const OUT = require('path').join(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/#site=nobile1&t=2026-11-14T20&days=10'); await p.reload(); await p.waitForTimeout(16500);
  await p.screenshot({ path: OUT + 'nogo.png' });
  await p.click('#energy-btn'); await p.waitForTimeout(16500);
  await (await p.$('.en-out')).screenshot({ path: OUT + 'energy.png' });
  await p.click('#energy-close');
  await p.click('#next-window-btn'); await p.waitForTimeout(3000);
  await (await p.$('.cmp-card')).screenshot({ path: OUT + 'compare.png' });
  await p.click('.cmp-btns button.primary'); await p.waitForTimeout(16500);
  await p.screenshot({ path: OUT + 'go.png' });
  const q = await ctx.newPage(); await q.addInitScript(() => { window.LUNO_GUIDE = true; });
  await q.goto(BASE + '/'); await q.waitForTimeout(4000); await q.screenshot({ path: OUT + 'tutorial-0.png' });
  for (let i = 1; i <= 3; i++) { await q.evaluate(() => { const n = document.querySelector('.tour-next') || [...document.querySelectorAll('button')].find(x => /START|NEXT|GOT IT|UNDERSTAND/i.test(x.textContent) && x.offsetParent); n && n.click(); }); await q.waitForTimeout(1500); await q.screenshot({ path: OUT + 'tutorial-' + i + '.png' }); }
  console.log('errors', errs); await b.close();
})();
