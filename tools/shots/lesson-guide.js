// The opening screen and the boxes of its nine parts (out/guide-raw.png, out/guide.json). Then run annotate_guide.py.
const { chromium } = require('playwright');
const BASE = process.env.LUNI_URL || 'http://localhost:8080';
const OUT = require('path').join(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.addInitScript(() => { window.LUNO_NO_COMPARE = true; window.LUNO_SETUP_OPEN = true; });
  await p.goto(BASE + '/');
  await p.waitForTimeout(17000);
  await p.screenshot({ path: OUT + 'guide-raw.png' });
  const info = await p.evaluate(() => {
    const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v)); };
    const txt = (sel) => (document.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      boxes: { tabs: box('.tabs'), s1: box('h3[data-step="1"]'), list: box('.site-list'), s2: box('h3[data-step="2"]'), s3: box('h3[data-step="3"]'), verdict: box('#mission'), side: box('.answer-side'), sky: box('#horizon'), tl: box('#timeline'), keys: box('.keys'), ask: box('#talk-btn'), next: box('#next-window-btn'), scan: box('#scan-btn'), tour: box('#tour-btn') },
      text: { bar: txt('#bar-site') + ' | ' + txt('#bar-t0'), word: txt('#mission-word'), why: txt('#mission-why'), warn: txt('#mission-warn'), side: txt('.answer-side').slice(0, 400) },
    };
  });
  fs.writeFileSync(OUT + 'guide.json', JSON.stringify(info));
  console.log(JSON.stringify(info, null, 1));
  await b.close();
})();
