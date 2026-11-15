/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Screenshots of THE INIQDASH DEMO in viewing mode (docs/iniqdash-demo/): every page at desktop, tablet and phone size, plus the radial
// menu open, every tab of a room popup, the climate popup, the notification panel and a notification toast. A throwaway server (tests/lib/live.mjs), the shipped
// assets/demo/iniqdash-demo.json added through the API — nothing outside the repository is touched.
//   node tools/iniqdash-demo-screenshots.mjs
import fs from 'node:fs';
import path from 'node:path';
import { live, liveBrowser } from '../tests/lib/live.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'docs', 'iniqdash-demo');
const SIZES = { desktop: [1440, 900], tablet: [834, 1112], mobile: [390, 844] };
const PAGES = ['home', 'lights', 'climate', 'rooms', 'energy', 'security'];
fs.mkdirSync(OUT, { recursive: true });

const L = await live({ configureHa: false }); const c = L.client(); await c.login();
const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'demo', 'iniqdash-demo.json'), 'utf8'));
const r = await (await c.post('/api/dashboards.php', { action: 'create', name: 'INIQDASH demo', dashboard: model })).json();
if (!r.ok) throw new Error(JSON.stringify(r));
const B = await liveBrowser(L, { viewport: { width: 1440, height: 900 } });
const p = B.page, wait = (ms) => p.waitForTimeout(ms);
try {
  for (const [sz, [w, h]] of Object.entries(SIZES)) {
    await p.setViewportSize({ width: w, height: h });
    await p.goto(`${L.base}/?d=${r.entry.id}`); await p.waitForFunction(() => window.editor && window.editor.viewing() && window.IniqHA.simulated(), null, { timeout: 20000 });
    for (const pg of PAGES) {
      await p.evaluate((x) => window.editor.go(x), pg); await wait(3000);
      // the whole page: the window as tall as the page (fixed elements — dock, corner button — stay at the bottom of that window)
      const H = await p.evaluate(() => { const f = document.querySelector('.ed-frame'); return f ? f.scrollHeight : document.documentElement.scrollHeight; });
      if (H > h + 4) { await p.setViewportSize({ width: w, height: Math.min(H, 6000) }); await wait(1200); }
      await p.screenshot({ path: path.join(OUT, `${pg}-${sz}.png`) });
      await p.setViewportSize({ width: w, height: h }); await wait(400);
    }
    // the interactions, in the window's own size
    await p.evaluate(() => window.editor.go('rooms')); await wait(2500);
    await p.click('[data-grid-id="r-living"]'); await wait(2200); await p.screenshot({ path: path.join(OUT, `popup-room-${sz}.png`) });
    for (const t of ['active', 'lights', 'heating', 'media', 'security', 'sensors']) {
      await p.click(`.mpop .mtabs__tab[data-tab="${t}"]`); await wait(1400); await p.screenshot({ path: path.join(OUT, `popup-room-${t}-${sz}.png`) });
    }
    await p.keyboard.press('Escape'); await wait(700);
    await p.evaluate(() => window.editor.go('home')); await wait(2500);
    await p.evaluate(() => window.editor.openPopup('p-climate')); await wait(2200); await p.screenshot({ path: path.join(OUT, `popup-climate-${sz}.png`) });
    await p.keyboard.press('Escape'); await wait(700);
    await p.click('.ed-cornerlayer .rm__centre'); await wait(1200); await p.screenshot({ path: path.join(OUT, `radial-${sz}.png`) });
    await p.keyboard.press('Escape'); await wait(600);
    await p.evaluate(() => window.editor.openPopup('p-notify')); await wait(1200); await p.screenshot({ path: path.join(OUT, `notifications-${sz}.png`) });
    await p.keyboard.press('Escape'); await wait(600);
    // a toast: a demo event on the Security page (simulated motion in the garden), then the demo is reset
    await p.evaluate(() => window.editor.go('security')); await wait(2000);
    await p.click('[data-grid-id="s-ev0"] .aw__trigger');
    await p.waitForFunction(() => [...document.querySelectorAll('.mnote')].some((n) => /Motion in the garden/.test(n.textContent)), null, { timeout: 15000 }); await wait(600);
    await p.screenshot({ path: path.join(OUT, `toast-${sz}.png`) });
    await p.click('[data-grid-id="s-ev2"] .aw__trigger'); await wait(1500);
  }
  console.log(`screenshots in ${path.relative(ROOT, OUT)}; page errors: ${B.errors.length ? B.errors.slice(0, 3).join(' | ') : 'none'}`);
} finally {
  await B.close(); await L.close();
}
