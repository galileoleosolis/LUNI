// The web slides (/slides/): every slide at three window sizes, pictures loaded, the recording really moving, the link to one slide.
const { chromium } = require('playwright');
const BASE = process.env.LUNI_URL || 'http://localhost:8080';
const OUT = require('path').join(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const errs = [], bad = [];
  for (const [w, h] of [[1440, 900], [1280, 631], [390, 844]]) {
    const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('requestfailed', (r) => { if (!r.url().includes('fonts.g')) bad.push(r.url()); });
    p.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
    await p.goto(BASE + '/slides/');
    await p.waitForTimeout(1500);
    const out = [];
    for (let i = 1; i <= 7; i++) {
      const r = await p.evaluate(() => {
        const s = [...document.querySelectorAll('#stage > section')].filter((x) => !x.hidden);
        const q = s[0].getBoundingClientRect();
        const imgs = [...s[0].querySelectorAll('img')];
        return { shown: s.length, id: s[0].id, x: Math.round(q.left), y: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height),
          imgs: imgs.length, loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length, count: document.getElementById('count').textContent, hash: location.hash };
      });
      out.push(`${r.id} ${r.count} ${r.hash} box ${r.x},${r.y} ${r.w}x${r.h} pictures ${r.loaded}/${r.imgs}${r.shown !== 1 ? ' !! ' + r.shown + ' slides shown' : ''}`);
      if (w === 1440 && (i === 1 || i === 4 || i === 7)) await p.screenshot({ path: OUT + `slides-${i}.png` });
      if (w === 390 && i === 2) await p.screenshot({ path: OUT + 'slides-phone.png' });
      await p.keyboard.press('ArrowRight');
      await p.waitForTimeout(900);
    }
    console.log(`--- ${w}x${h}\n` + out.join('\n'));
    // the moving picture really moves: two frames of slide 4's finder recording differ
    if (w === 1440) {
      await p.goto(BASE + '/slides/#4');
      await p.waitForTimeout(1200);
      const im = p.locator('#stage > section:not([hidden]) img').first();
      const a = await im.screenshot(); await p.waitForTimeout(2500); const c = await im.screenshot();
      console.log('opened on slide from the link (#4):', await p.evaluate(() => document.getElementById('count').textContent), '| recording moves:', !a.equals(c));
      await p.click('#prev'); await p.waitForTimeout(300);
      console.log('BACK button ->', await p.evaluate(() => document.getElementById('count').textContent));
    }
    await p.close();
  }
  console.log('page errors:', errs.length, errs.slice(0, 3), '| failed files:', bad.length, bad.slice(0, 5));
  await b.close();
})();
