// The project page (/about/). 'node about.js check' checks the order of its sections and the viewer; 'node about.js cover' retakes about/img/demo-cover.jpg from slide 1.
const { chromium } = require('playwright');
const BASE = process.env.LUNI_URL || 'http://localhost:8080';
const OUT = require('path').join(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true });
const mode = process.argv[2];
(async () => {
  const b = await chromium.launch();
  if (mode === 'cover') {
    const p = await (await b.newContext({ viewport: { width: 1600, height: 946 }, deviceScaleFactor: 1 })).newPage();
    await p.goto(BASE + '/slides/');
    await p.waitForTimeout(2500);
    await p.screenshot({ path: require('path').join(__dirname, '../../about/img/demo-cover.jpg'), type: 'jpeg', quality: 86, clip: { x: 0, y: 0, width: 1600, height: 900 } });
    console.log('cover saved');
  } else {
    const errs = [], bad = [];
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
      p.on('pageerror', (e) => errs.push(e.message));
      p.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
      await p.goto(BASE + '/about/');
      await p.waitForTimeout(1200);
      const order = await p.evaluate(() => [...document.querySelectorAll('header.hero, body > section')].map((s) => (s.id || 'top') + '@' + Math.round(s.getBoundingClientRect().top + scrollY)));
      console.log(`--- ${w}x${h}`, order.join('  '), '| wider than window:', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
      if (w === 1440) {
        await p.screenshot({ path: OUT + 'front-top.png' });
        await p.evaluate(() => document.getElementById('demo').scrollIntoView()); await p.waitForTimeout(300);
        await p.screenshot({ path: OUT + 'front-demo.png' });
        await p.evaluate(() => document.getElementById('timeline').scrollIntoView()); await p.waitForTimeout(300);
        await p.screenshot({ path: OUT + 'front-timeline.png' });
        // the viewer still works in its new place, and the list's buttons still reach it
        const t0 = await p.textContent('#v-tag'); await p.click('#prev'); const t1 = await p.textContent('#v-tag');
        console.log('viewer steps:', t0, '->', t1, '| steps:', await p.locator('#steps button').count(), '| weekend items:', await p.locator('#weekend .tl > li').count(), '| list buttons:', await p.locator('#weekend .tl button').count());
        const lb = p.locator('#weekend .tl button').first();
        if (await lb.count()) { await lb.click(); await p.waitForTimeout(900); console.log('after a list button, viewer top is at', Math.round(await p.evaluate(() => document.querySelector('.viewer').getBoundingClientRect().top)), 'tag', await p.textContent('#v-tag')); }
        console.log('demo links:', await p.evaluate(() => [...document.querySelectorAll('a[href="../slides/"]')].length));
      } else {
        await p.screenshot({ path: OUT + 'front-phone.png' });
      }
      await p.close();
    }
    console.log('page errors:', errs.length, errs.slice(0, 3), '| failed files:', bad.length, bad.slice(0, 4));
  }
  await b.close();
})();
