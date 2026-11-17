// The six-task user test (set E, the default with #test), done the intended way. The last lines must say 6/6 and errors: [].
const { chromium } = require('playwright');
const BASE = process.env.LUNI_URL || 'http://localhost:8080';
const OUT = require('path').join(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
// Set E done the intended way.
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 150)); });
  await p.goto(BASE + '/#test', { waitUntil: 'networkidle' }); await p.waitForTimeout(900);
  await p.click('#test-start'); await p.waitForTimeout(300); for (let k = 0; k < 5; k++) { if (k === 4) await p.screenshot({ path: OUT + 'tour-card.png' }); await p.click('#test-next'); await p.waitForTimeout(200); }
  const setT0 = async (Y, M, D, H) => { await p.selectOption('#t0-year', String(Y)); await p.selectOption('#t0-month', String(M - 1)); await p.selectOption('#t0-day', String(D)); await p.selectOption('#t0-hour', String(H)); await p.waitForTimeout(300); };
  const word = async () => (await p.textContent('#mission-word')).trim();
  const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const date = async (d, m, y) => { await p.selectOption('#ta-year', String(y)); await p.selectOption('#ta-month', String(m)); await p.selectOption('#ta-day', String(d)); await p.click('#test-submit'); };
  // E1
  await p.click('#tab-history'); await p.waitForTimeout(500); await p.click('.hist-row[data-id="bg1"] [data-load]'); await p.waitForTimeout(600);
  console.log('E1 screen:', await p.textContent('#bar-site'), await p.textContent('#bar-t0'), await word());
  await p.click(`.test-opt[data-v="${await word()}"]`); await p.click('#test-submit');
  // E2: read the warning
  const warn = await p.textContent('#mission-warn'); const m = warn.match(/ECLIPSE ON (\d\d) (\w{3}) (\d{4})/); console.log('E2 warning:', m && m[0]);
  await date(+m[1], MON.indexOf(m[2]) + 1, m[3]);
  // E3
  await p.click('.site-row[data-id="nobile1"]'); await setT0(2026, 11, 14, 20); await p.click('.needs .seg[data-req="days"] button:text-is("10")'); await p.waitForTimeout(300);
  console.log('E3 start:', await word()); await p.click('#side-next'); await p.waitForTimeout(400);
  const t = (await p.textContent('#bar-t0')).match(/(\d\d) (\w{3}) (\d{4})/); await date(+t[1], MON.indexOf(t[2]) + 1, t[3]);
  // E4 + E5
  await p.locator('.site-row[data-id="haworth"]').scrollIntoViewIfNeeded(); await p.click('.site-row[data-id="haworth"]'); await p.click('#tab-moon'); await p.waitForTimeout(2500);
  const rows = await p.evaluate(() => [...document.querySelectorAll('#mm-profile .prof-row')].map(r => r.textContent.replace(/\s+/g, ' '))); console.log('profile:', rows.join(' | '));
  const shadow = await p.evaluate(() => [...document.querySelectorAll('#mm-profile .prof-row')].find(r => r.firstElementChild.textContent.startsWith('PERMANENT SHADOW')).querySelector('b').textContent.trim());
  await p.click(`.test-opt[data-v="${shadow}"]`); await p.click('#test-submit');
  await p.click('.test-opt[data-v="COLDER THAN −200 °C"]'); await p.click('#test-submit');
  // E6
  await p.click('#tab-main'); await p.click('.site-row[data-id="malapert"]'); await setT0(2027, 2, 8, 0); console.log('E6 start:', await word());
  await p.click('#scan-btn'); await p.waitForFunction(() => /POINTS CHECKED/.test(document.getElementById('scan-progress').textContent), null, { timeout: 240000 });
  await p.click('#scan-go-best'); await p.waitForFunction(() => /REDUCED/.test(document.getElementById('data-badge').textContent), null, { timeout: 60000 });
  await p.waitForTimeout(600); await p.click('#test-submit'); await p.waitForTimeout(300);
  await p.click('#rv-ease .test-opt[data-v="5"]'); await p.click('#test-report'); await p.waitForTimeout(200);
  console.log((await p.inputValue('#test-report-text')).split('\n').slice(2, 34).join('\n'));
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})();
