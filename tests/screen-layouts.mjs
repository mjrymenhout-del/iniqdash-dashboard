/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// SCREEN LAYOUTS (real editor, real server): each screen size keeps its own layout —
//   1  a change on Tablet leaves Desktop untouched; switching Desktop → Tablet → Desktop → Tablet loses nothing
//   2  "Copy from Desktop" on Tablet: every item converted to the tablet's columns (places and sizes kept as closely as the grid allows,
//      no overlap); Desktop unchanged; one undo step
//   3  "Copy from Desktop" on Mobile: widths become half / full, the phone's order follows the desktop's reading order
//   4  "Make automatic" removes the screen's own layout (Undo brings it back); saved and reloaded, each screen's layout is exact
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const t = (id, d) => ({ id, type: 'text', parent: null, config: { variant: 'text', primary: id.toUpperCase() }, layout: { desktop: d } });
const dash = { version: 3, app: { id: 's', startPage: 'p', navigation: {} }, pages: [{ id: 'p', name: 'P', nav: true, items: [
  t('a', { x: 1, y: 1, w: 6, h: 3 }), t('b', { x: 7, y: 1, w: 6, h: 3 }), t('c', { x: 1, y: 4, w: 3, h: 2 }), t('d', { x: 4, y: 4, w: 9, h: 2 })] },
  { id: 'q', name: 'Hallway', nav: true, items: [] },
  { id: 'tall', name: 'Tall', nav: true, items: [t('top', { x: 1, y: 1, w: 12, h: 4 }), t('bottom', { x: 1, y: 40, w: 12, h: 4 })] }] };
const overlaps = (ls) => ls.some((a, i) => ls.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));

let L, B;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const id = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Screens', dashboard: dash })).json()).entry.id;
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1000 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${L.base}/editor.html?d=${id}`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(800);
  await E(() => window.editor.setEditing(true)); await wait(500);
  const lay = (bp) => E((bp) => Object.fromEntries(window.editor.getPage().items.map((i) => [i.id, i.layout[bp] || null])), bp);
  const bp = async (k) => { await E((k) => { window.editor.select(null); window.editor.setBreakpoint(k); }, k); await wait(700); };
  const desk0 = JSON.stringify(await lay('desktop'));

  // ---- 2 · Tablet: copy from Desktop
  await bp('tablet');
  const st0 = await E(() => document.querySelector('[data-k=screen-state]')?.textContent);
  const h0 = await E(() => window.editor.history());
  await p.click('[data-k=screen-copy-desktop]'); await wait(200);
  await p.click('[data-k=screen-copy-desktop]'); await wait(800);        // the confirm step: press again
  const tab = await lay('tablet');
  const h1 = await E(() => window.editor.history());
  check('2 · Tablet "Copy from Desktop": every item gets a tablet layout converted to 8 columns (halves stay halves), no overlap; one undo step; Desktop unchanged',
    /automatic/.test(st0) && tab.a.w === 4 && tab.b.x === 5 && tab.b.w === 4 && tab.d.x + tab.d.w - 1 === 8 && !overlaps(Object.values(tab)) && JSON.stringify(await lay('desktop')) === desk0 && JSON.stringify(h1) !== JSON.stringify(h0),
    JSON.stringify({ st0, tab }));

  // ---- 1 · change Tablet only, switch around: nothing lost
  await E(() => window.editor.select('c', true)); await wait(300);
  await p.keyboard.press('Shift+ArrowRight'); await wait(500);         // widen c on Tablet
  const tab1 = await lay('tablet');
  await bp('desktop'); const desk1 = JSON.stringify(await lay('desktop'));
  await bp('tablet'); const tab2 = await lay('tablet');
  check('1 · a change on Tablet stays on Tablet; Desktop is untouched; switching screens back and forth loses nothing', tab1.c.w === tab.c.w + 1 && desk1 === desk0 && JSON.stringify(tab2) === JSON.stringify(tab1), JSON.stringify({ c: tab1.c, desk1 }));

  // ---- 3 · Mobile: copy from Desktop
  await bp('mobile');
  await p.click('[data-k=screen-copy-desktop]'); await wait(200); await p.click('[data-k=screen-copy-desktop]'); await wait(800);
  const mob = await lay('mobile');
  const order = await E(() => window.editor.getPage().items.map((i) => i.id).join());
  check('3 · Mobile "Copy from Desktop": half-width items become half (2 of 4), wide ones full; the phone order is the desktop reading order', mob.a.w === 2 && mob.b.w === 2 && mob.c.w === 2 && mob.d.w === 4 && order === 'a,b,c,d', JSON.stringify({ mob, order }));

  // ---- 4 · Make automatic (Tablet), undo, save + reload
  await bp('tablet');
  await p.click('[data-k=screen-auto]'); await wait(200); await p.click('[data-k=screen-auto]'); await wait(700);
  const auto = await lay('tablet');
  const st1 = await E(() => document.querySelector('[data-k=screen-state]')?.textContent);
  await p.keyboard.press('Control+z'); await wait(700);
  const back = await lay('tablet');
  const saved = await E(() => window.editor.save());
  await p.reload(); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(700);
  const after = { d: JSON.stringify(await lay('desktop')), t: JSON.stringify(await lay('tablet')), m: JSON.stringify(await lay('mobile')) };
  check('4 · "Make automatic" removes the tablet layout (Undo restores it); saved and reloaded, every screen\'s layout is exactly what was designed',
    Object.values(auto).every((x) => x === null) && /automatic/.test(st1) && JSON.stringify(back) === JSON.stringify(tab1) && saved && after.d === desk0 && after.t === JSON.stringify(tab1) && after.m === JSON.stringify(mob),
    JSON.stringify({ auto, st1, after }));
  // ---- 5 · URL options for a wall tablet: ?page=<name> opens that page, ?noedit hides every way into the editor
  await p.goto(`${L.base}/?d=${id}&page=hallway&noedit`); await p.waitForFunction(() => window.editor && window.editor.viewing(), null, { timeout: 20000 }); await wait(800);
  await p.mouse.move(1595, 4); await wait(2600); await p.keyboard.press('Shift+E'); await wait(300);
  const u = await E(() => ({ page: window.editor.navigation().current, mode: document.querySelector('.iqea')?.dataset.mode, visible: getComputedStyle(document.querySelector('.iqea')).display !== 'none' }));
  check('5 · URL options: ?page=hallway opens that page; ?noedit hides the Edit control (no corner, no Shift + E)', u.page === 'q' && u.mode === 'locked' && !u.visible, JSON.stringify(u));
  // ---- 6 · ?fit=screen: a page taller than the screen is shown whole (no scrolling), its last item on screen
  await p.goto(`${L.base}/?d=${id}&page=tall&fit=screen`); await p.waitForFunction(() => window.editor && window.editor.viewing(), null, { timeout: 20000 }); await wait(1500);
  const f = await E(() => { const fr = document.querySelector('.ed-frame'), b = document.querySelector('.ed-canvas [data-grid-id="bottom"]').getBoundingClientRect(); return { sh: fr.scrollHeight, ch: fr.clientHeight, bottom: Math.round(b.bottom), vh: innerHeight, zoom: document.querySelector('.ed-canvas').style.zoom }; });
  check('6 · ?fit=screen shows a tall page whole: no scrolling, its last item inside the screen (scaled down)', f.sh <= f.ch + 1 && f.bottom <= f.vh && Number(f.zoom) < 1, JSON.stringify(f));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('screen-layouts test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
