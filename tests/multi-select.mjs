/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// MULTI-SELECTION in the editor (real editor, real server): Shift / Ctrl + click selects several items of one grid; the inspector
// aligns, distributes and sizes them; arrow keys move them together; a change that would overlap or leave the grid is refused;
// each operation is ONE undo step; Remove takes them all; Ctrl + A selects the whole grid; Esc deselects.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const G = { desktop: { cols: 24, row: 10, gap: 16 }, tablet: { cols: 16, row: 10, gap: 16 }, mobile: { cols: 4, row: 10, gap: 12 }, nested: 'page' };
const t = (id, x, y, w, h) => ({ id, type: 'text', parent: null, config: { variant: 'text', primary: id.toUpperCase() }, layout: { desktop: { x, y, w, h }, tablet: { x: 1, y, w: Math.min(w, 16), h }, mobile: { w: 4, h } } });
const dash = { version: 3, app: { id: 'm', startPage: 'p', navigation: {}, grid: G }, pages: [{ id: 'p', name: 'P', nav: true, items: [
  t('a', 1, 1, 4, 4), t('b', 7, 3, 3, 5), t('c', 15, 2, 5, 4), t('d', 1, 20, 4, 4)] }] };

let L, B;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const id = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Multi', dashboard: dash })).json()).entry.id;
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1000 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${L.base}/editor.html?d=${id}`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(800);
  await E(() => { window.editor.setBreakpoint('desktop'); window.editor.setEditing(true); }); await wait(1000);
  const L0 = (k) => E((k) => window.editor.getPage().items.find((i) => i.id === k).layout.desktop, k);
  const click = async (k, mod) => { const r = await E((k) => { const b = document.querySelector(`.ed-canvas [data-grid-id="${k}"]`).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, k);
    if (mod) await p.keyboard.down(mod); await p.mouse.click(r[0], r[1]); if (mod) await p.keyboard.up(mod); await wait(250); };
  const hist = () => E(() => window.editor.history());
  const btn = (k) => p.click(`[data-k="msel-${k}"]`).then(() => wait(500));

  // ---- select a, then Shift b, Ctrl c
  await click('a'); await click('b', 'Shift'); await click('c', 'Control');
  const s1 = await E(() => ({ n: document.querySelectorAll('.ed-canvas .mg__item.is-msel').length, title: document.querySelector('[data-k=msel-panel] h3')?.textContent }));
  check('1 · Shift / Ctrl + click selects several items: they are outlined and the inspector shows the group actions', s1.n === 3 && s1.title === '3 items selected', JSON.stringify(s1));

  // ---- align top: one undo step
  const h0 = await hist();
  await btn('top');
  const top = [await L0('a'), await L0('b'), await L0('c')].map((l) => l.y);
  const h1 = await hist();
  check('2 · Align top: every selected item starts on the topmost row — one undo step', top.every((y) => y === 1) && JSON.stringify(h1) !== JSON.stringify(h0), JSON.stringify({ top, h0, h1 }));

  // ---- same height (reference: the first selected, a = 4 rows) and distribute across
  await btn('height');
  const hs = [await L0('a'), await L0('b'), await L0('c')].map((l) => l.h);
  await btn('hspace');
  const xs = [await L0('a'), await L0('b'), await L0('c')];
  const gap1 = xs[1].x - (xs[0].x + xs[0].w), gap2 = xs[2].x - (xs[1].x + xs[1].w);
  check('3 · Same height (as the first selected) and Distribute across: equal gaps between the items, the outer edges kept', hs.every((h) => h === 4) && Math.abs(gap1 - gap2) <= 1 && xs[0].x === 1 && xs[2].x + xs[2].w === 20, JSON.stringify({ hs, xs }));

  // ---- arrow keys move the group; a move past the top edge is refused (nothing changes)
  await p.keyboard.press('ArrowDown'); await wait(400);
  const down = [await L0('a'), await L0('b'), await L0('c')].map((l) => l.y);
  await p.keyboard.press('ArrowUp'); await wait(300); await p.keyboard.press('ArrowUp'); await wait(400);
  const up = [await L0('a'), await L0('b'), await L0('c')].map((l) => l.y);
  const msg = await E(() => document.querySelector('.ed-toast, [role=status].ed-say, .ed-status-msg')?.textContent || [...document.querySelectorAll('[role=status]')].map((n) => n.textContent).join(' | '));
  check('4 · arrow keys move the selected items together; a move off the grid is refused and nothing changes', down.every((y) => y === 2) && up.every((y) => y === 1) && /leave the grid/.test(msg), JSON.stringify({ down, up, msg: msg.slice(0, 200) }));

  // ---- align left would stack them on one another: refused
  const before = JSON.stringify([await L0('a'), await L0('b'), await L0('c')]);
  await btn('left');
  const after = JSON.stringify([await L0('a'), await L0('b'), await L0('c')]);
  check('5 · an alignment that would make items overlap is refused (nothing changes)', before === after, after);

  // ---- undo restores the previous step
  await p.keyboard.press('Control+z'); await wait(600);
  const un = (await L0('a')).y;
  check('6 · Undo reverts the last group operation in one step', un === 2, String(un));

  // ---- Ctrl + A selects the whole grid; Esc deselects; Remove takes them all (one undo)
  await click('d'); await p.keyboard.press('Control+a'); await wait(300);
  const all = await E(() => document.querySelectorAll('.ed-canvas .mg__item.is-msel').length);
  await p.keyboard.press('Escape'); await wait(300);
  const none = await E(() => document.querySelectorAll('.ed-canvas .mg__item.is-msel').length);
  await click('a'); await click('d', 'Shift');
  p.once('dialog', (d) => d.accept());
  await p.click('[data-k="msel-remove"]'); await wait(600);
  const left = await E(() => window.editor.getPage().items.map((i) => i.id).sort().join());
  await p.keyboard.press('Control+z'); await wait(600);
  const back = await E(() => window.editor.getPage().items.map((i) => i.id).sort().join());
  check('7 · Ctrl + A selects every item of the grid; Esc deselects; Remove deletes the selected items in one step (Undo brings them back)',
    all === 4 && none === 0 && left === 'b,c' && back === 'a,b,c,d', JSON.stringify({ all, none, left, back }));

  // ---- the save keeps the result
  const saved = await E(() => window.editor.save());
  const srv = (await (await me.send('GET', `/api/dashboards.php?id=${id}`)).json()).dashboard.pages[0].items.find((i) => i.id === 'b').layout.desktop;
  check('8 · saved: the arranged layout is what the server has', saved && srv.h === 4, JSON.stringify(srv));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('multi-select test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
