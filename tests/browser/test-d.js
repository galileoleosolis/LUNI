// The six-task user test, set D (#test-d): site list, shortcut, ASK LUNI, scan distance, move. Optional: width height nogpu.
const { chromium } = require('playwright');
const BASE = process.env.LUNI_URL || 'http://localhost:8080';
const OUT = require('path').join(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
// Set D done the intended way: site list, header shortcut, ASK LUNI (typed), scan distance, move to the best point.
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: +process.argv[2] || 1440, height: +process.argv[3] || 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  if (process.argv[4] === 'nogpu') await p.addInitScript(() => { window.LUNO_NO_GPU = true; });
  await p.goto(BASE + '/#test-d', { waitUntil: 'networkidle' }); await p.waitForTimeout(900);
  await p.click('#test-start'); await p.waitForTimeout(300); for (let k = 0; k < 5; k++) { if (k === 4) await p.screenshot({ path: OUT + 'tour-card.png' }); await p.click('#test-next'); await p.waitForTimeout(200); }
  const setT0 = async (Y, M, D, H) => { await p.selectOption('#t0-year', String(Y)); await p.selectOption('#t0-month', String(M - 1)); await p.selectOption('#t0-day', String(D)); await p.selectOption('#t0-hour', String(H)); await p.waitForTimeout(250); };
  const word = async () => (await p.textContent('#mission-word')).trim();
  const luni = async (t) => { await p.click('#talk-btn'); await p.fill('#comms-input', t); await p.press('#comms-input', 'Enter'); await p.waitForTimeout(300); return (await p.textContent('#comms-reply')).trim(); };
  const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  // D1: Apollo 15 is low in the list: scroll it into view like a person would
  await p.locator('.site-row[data-id="apollo15"]').scrollIntoViewIfNeeded(); await p.click('.site-row[data-id="apollo15"]'); await setT0(2027, 3, 10, 0);
  await p.click(`.test-opt[data-v="${await word()}"]`); await p.click('#test-submit');
  // D2: the shortcut in the WHEN header
  await p.click('#side-next'); await p.waitForTimeout(300);
  const m = (await p.textContent('#bar-t0')).match(/(\d\d) (\w{3}) (\d{4})/);
  await p.selectOption('#ta-day', String(+m[1])); await p.selectOption('#ta-month', String(MON.indexOf(m[2]) + 1)); await p.selectOption('#ta-year', m[3]); await p.click('#test-submit');
  // D3 + D4: ASK LUNI, typed
  console.log('LUNI:', (await luni('go to nobile rim 1 and land on 12 january 2027 at 12')).slice(0, 90));
  const sun = await luni('where is the sun'); console.log('LUNI:', sun.slice(0, 110));
  await p.press('#comms-input', 'Escape');
  await p.click(`.test-opt[data-v="${sun.match(/\((\w+)\)/)[1].toUpperCase()}"]`); await p.click('#test-submit');
  console.log('LUNI:', (await luni('the mission should last 28 days')).slice(0, 90)); await p.press('#comms-input', 'Escape');
  await p.click(`.test-opt[data-v="${await word()}"]`); await p.click('#test-submit');
  // D5: scan near Malapert
  await p.click('.needs .seg[data-req="days"] button:text-is("10")'); await p.click('.site-row[data-id="malapert"]'); await setT0(2027, 2, 8, 0);
  console.log('D5 start:', await word());
  await p.click('#scan-btn');
  await p.waitForFunction(() => /POINTS CHECKED/.test(document.getElementById('scan-progress').textContent), null, { timeout: 200000 });
  const best = await p.innerText('#scan-best'); console.log('scan best:', best.replace(/\n/g, ' / ').slice(0, 120), '|', await p.textContent('#scan-engine'));
  await p.fill('#test-answer', best.match(/([\d.]+) KM AWAY/)[1]); await p.click('#test-submit');
  // D6
  await p.click('#scan-go-best'); await p.waitForFunction(() => /REDUCED/.test(document.getElementById('data-badge').textContent), null, { timeout: 60000 });
  await p.waitForTimeout(500); await p.click('#test-submit'); await p.waitForTimeout(300);
  await p.click('#rv-ease .test-opt[data-v="5"]'); await p.click('#test-report'); await p.waitForTimeout(200);
  const rep = await p.inputValue('#test-report-text');
  console.log(rep.split('\n').slice(2, 30).join('\n'));
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})();
