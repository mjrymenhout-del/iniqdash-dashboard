/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// NESTED GRIDS on a custom page grid, viewing mode, real server:
//   G1  a container wider than 12 columns: its children are placed on ITS span (a child at column 13 of 16 is not clamped onto 9–12)
//   G2  a narrow container on a desktop page uses its children's DESKTOP layout (it follows the page breakpoint, not its own width)
//   G3  on a phone a container GROWS to hold its reflowed children (no child outside it, no overlap with the next item)
import { live } from './lib/live.mjs';
import { check, playwright } from './lib/harness.mjs';

const lay = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y, w: Math.min(8, w), h }, mobile: { w: 4, h: 2 } });
const txt = (id, parent, d, t) => ({ id, type: 'text', parent, config: { variant: 'heading', primary: id }, layout: { desktop: d, tablet: t, mobile: { w: 4, h: 2 } } });
const dash = { version: 3, app: { id: 'g', startPage: 'p', navigation: {}, grid: { desktop: { cols: 24, row: 8, gap: 20 }, tablet: { cols: 8, row: 40, gap: 16 }, mobile: { cols: 4, row: 40, gap: 12 } } },
  pages: [{ id: 'p', name: 'P', nav: true, items: [
    { id: 'wide', type: 'container', parent: null, config: { title: 'Wide' }, layout: lay(1, 1, 16, 12) },
    txt('a', 'wide', { x: 1, y: 1, w: 4, h: 2 }, { x: 1, y: 1, w: 4, h: 2 }),
    txt('b', 'wide', { x: 13, y: 1, w: 4, h: 2 }, { x: 5, y: 1, w: 4, h: 2 }),
    txt('c', 'wide', { x: 9, y: 1, w: 4, h: 2 }, { x: 1, y: 3, w: 4, h: 2 }),
    { id: 'narrow', type: 'container', parent: null, config: { title: 'Narrow' }, layout: lay(17, 1, 5, 12) },
    txt('d', 'narrow', { x: 1, y: 1, w: 2, h: 2 }, { x: 1, y: 1, w: 4, h: 2 }),
    txt('e', 'narrow', { x: 3, y: 1, w: 3, h: 2 }, { x: 1, y: 3, w: 4, h: 2 }),
  ] }] };

let L, browser;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const id = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Nested', dashboard: dash })).json()).entry.id;
  browser = await playwright().chromium.launch();
  const rects = async (vw) => {
    const p = await (await browser.newContext({ viewport: { width: vw, height: 900 }, extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' } })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${L.base}/login.php`); await p.fill('input[name=user]', 'admin'); await p.fill('input[name=password]', 'correct horse battery staple');
    await Promise.all([p.waitForNavigation(), p.click('button[type=submit]')]);
    await p.goto(`${L.base}/?d=${id}`); await p.waitForFunction(() => window.editor && window.editor.viewing, null, { timeout: 20000 }); await p.waitForTimeout(1500);
    const r = await p.evaluate(() => Object.fromEntries(['wide', 'a', 'b', 'c', 'narrow', 'd', 'e'].map((k) => { const b = document.querySelector(`[data-grid-id="${k}"]`).getBoundingClientRect(); return [k, { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }]; })));
    await p.context().close();
    return { r, errs };
  };
  const D = await rects(1906), M = await rects(390);
  const overlap = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;
  const inside = (c, k) => k.y >= c.y - 1 && k.b <= c.b + 1 && k.x >= c.x - 1 && k.r <= c.r + 1;
  const col = (D.r.wide.w + 20) / 16;                           // one column pitch of the 16-column container (its grid gap is ~20 or less)
  check('G1: a child at column 13 of a 16-column container stays at column 13 (to the right of the child at column 9, no overlap)', !overlap(D.r.b, D.r.c) && D.r.b.x > D.r.c.r && Math.abs((D.r.b.x - D.r.a.x) - 12 * col) < col, JSON.stringify(D.r));
  check('G2: a 5-column container on a desktop page uses its children\'s DESKTOP layout (2 + 3 columns side by side)', Math.abs(D.r.d.y - D.r.e.y) < 2 && D.r.e.x > D.r.d.r && D.r.d.w < D.r.e.w, JSON.stringify(D.r));
  check('G3: on a phone the containers grow to hold their reflowed children (each child inside its container)', ['a', 'b', 'c'].every((k) => inside(M.r.wide, M.r[k])) && ['d', 'e'].every((k) => inside(M.r.narrow, M.r[k])), JSON.stringify(M.r));
  check('G3: …and the next container starts below (no overlap between containers or their children)', !overlap(M.r.wide, M.r.narrow) && ['d', 'e'].every((k) => !overlap(M.r.wide, M.r[k])), JSON.stringify(M.r));
  check('G3: desktop heights are untouched (the growth is mobile only)', Math.abs(D.r.wide.h - D.r.narrow.h) < 1 && D.r.wide.h < 400, JSON.stringify(D.r.wide));
  check('no page error', D.errs.length + M.errs.length === 0, [...D.errs, ...M.errs].slice(0, 3).join(' | '));
} catch (e) {
  check('grid-nested test ran', false, e.stack);
} finally {
  if (browser) await browser.close();
  if (L) await L.close();
}
console.log('finished');
