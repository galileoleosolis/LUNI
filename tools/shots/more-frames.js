// Eight screens for the 'more features' recording, into out/more. Then run make_gifs.py.
const { chromium } = require('playwright');
const BASE = process.env.LUNI_URL || 'http://localhost:8080';
const OUT = require('path').join(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true }); require('fs').mkdirSync(OUT + 'more', { recursive: true });
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.addInitScript(() => { window.LUNO_NO_COMPARE = true; });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const snap = (n) => p.screenshot({ path: OUT + 'more/' + n + '.png' });
  const step = async (n, f) => { try { await f(); await snap(n); console.log('ok', n); } catch (e) { console.log('FAIL', n, e.message.slice(0, 80)); } };
  await p.goto(BASE + '/#site=nobile1&t=2026-11-15T20&days=10'); await p.reload(); await p.waitForTimeout(9500);
  await step('6-windows', async () => { await p.click('#tab-days'); await p.waitForTimeout(700); });
  await step('7-ops', async () => { await p.click('#tab-ops'); await p.waitForTimeout(700); });
  await step('4-surface', async () => { await p.click('#surface-btn'); await p.waitForTimeout(9500); });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await step('5-ask', async () => { await p.click('#talk-btn'); await p.waitForTimeout(300); await p.fill('#comms-input', 'why is the south pole hard for landers?'); await p.press('#comms-input', 'Enter'); await p.waitForTimeout(1500); });
  await p.click('#comms-close').catch(() => {});
  await step('3-history', async () => { await p.click('#tab-history'); await p.waitForTimeout(9500); });
  await step('1-moon-sun', async () => { await p.click('#tab-moon'); await p.waitForTimeout(2500); await p.click('#mm-layers [data-id="sun"]'); await p.waitForTimeout(9500); });
  await step('2-moon-ice', async () => { await p.click('#mm-layers [data-id="ice"]'); await p.waitForTimeout(9500); });
  const q = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await q.addInitScript(() => { window.LUNO_GUIDE = true; });
  try { await q.goto(BASE + '/'); await q.waitForTimeout(3500); await q.screenshot({ path: OUT + 'more/8-tutorial.png' }); console.log('ok 8-tutorial'); } catch (e) { console.log('FAIL tutorial'); }
  console.log('errors', errs); await b.close();
})();
