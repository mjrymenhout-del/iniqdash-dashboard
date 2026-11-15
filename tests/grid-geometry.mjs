/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// GRID GEOMETRY — every widget draws inside ITS OWN grid cell and the selection is drawn on the selected cell, through real editing:
// Duplicate, keyboard move / resize, pointer drag / handle resize, save + reload — three Person widgets (the reported case), then a Light,
// a Climate and a Sensor. Real editor, real PHP server, FAKE Home Assistant (tests/lib/live.mjs — not a real Home Assistant).
//   ROOT CAUSE (selection): a keyboard / inspector move animates the item from its old cell (FLIP: a transient translate); the selection
//   was measured in that first frame — drawn on the cell it came from, labelled with the cell it went to — and never redrawn.
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
let L, B;
try {
  L = await live();
  L.setEntity('person.robin', 'home', { name: 'Robin' });
  L.setEntity('light.desk', 'on', { name: 'Desk', f: 0, br: 180, cm: 'brightness', scm: ['brightness'] });
  L.setEntity('climate.salon', 'heat', { name: 'Salon', f: 1, cur: 21, target: 22, min: 7, max: 30, step: 0.5, modes: ['heat', 'off'] });
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1000 } }); const page = B.page;
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  await E(() => window.editor.setEditing(true)); await wait(300);
  const Lx = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y, w: 4, h }, mobile: { w: 4, h } });
  await E((one) => { const m = window.editor.getModel(); m.pages[0].items = [{ id: 'robin', type: 'person', parent: null, config: { name: 'Robin', entity: 'person.robin' }, layout: one }]; window.editor.setModel(m); }, Lx(1, 1, 3, 4));
  await wait(800);
  /** every leaf grid item: is all of its content inside its cell? is the selection on the selected cell? */
  const geo = () => E(() => {
    const cells = [...document.querySelectorAll('.ed-canvas [data-grid-id]')].filter((g) => !g.querySelector('[data-grid-id]'));
    const sc = window.editor.preview().scale || 1;
    const out = cells.map((g) => { const r0 = g.getBoundingClientRect(), t = getComputedStyle(g).transform, mx = t && t !== 'none' ? new DOMMatrixReadOnly(t) : null;
      // where the cell RESTS (a move animation translates it for 190 ms): the selection belongs there
      const r = mx ? { left: r0.left - mx.m41 * sc, top: r0.top - mx.m42 * sc, right: r0.right - mx.m41 * sc, bottom: r0.bottom - mx.m42 * sc, width: r0.width, height: r0.height } : r0;
      // drawn outside the cell = outside it AND not clipped by an ancestor inside the cell (a widget's own clipped glow is not "outside")
      const clipped = (k) => { for (let a = k.parentElement; a && a !== g; a = a.parentElement) { const o = getComputedStyle(a); if (/hidden|clip/.test(o.overflow + o.overflowX + o.overflowY) || o.clipPath !== 'none' || o.contain.includes('paint')) return true; } return false; };
      const escaped = [...g.querySelectorAll('*')].filter((k) => { const q = k.getBoundingClientRect(); return q.width > 0 && q.height > 0 && (q.left < r.left - 2 || q.right > r.right + 2 || q.top < r.top - 2 || q.bottom > r.bottom + 2) && !clipped(k); }).map((k) => String(k.className.baseVal ?? k.className).split(' ')[0]);
      return { id: g.dataset.gridId, l: r.left, t: r.top, w: r.width, h: r.height, escaped: escaped.slice(0, 4) }; });
    const s = document.querySelector('.ed-sel:not([hidden])'), sr = s && s.getBoundingClientRect(), tag = document.querySelector('.ed-sel__tag')?.textContent || '';
    return { cells: out, sel: sr && { l: sr.left, t: sr.top, w: sr.width, h: sr.height }, tag };
  });
  const findings = [];
  /** the state after an operation, immediately (the move animation is still running) and once it has settled */
  const verify = async (what, selId) => {
    for (const when of [30, 600]) {
      await wait(when === 30 ? 30 : 570);
      const g = await geo(), c = g.cells.find((x) => x.id === selId);
      const selOk = !selId || (g.sel && c && Math.abs(g.sel.l - c.l) <= 1.5 && Math.abs(g.sel.t - c.t) <= 1.5 && Math.abs(g.sel.w - c.w) <= 1.5 && Math.abs(g.sel.h - c.h) <= 1.5);
      // the cell itself may still be gliding in at +30 ms (its content travels with it): content-inside-cell is checked once settled
      const inside = when === 30 || g.cells.every((x) => !x.escaped.length);
      if (!selOk || !inside) findings.push({ what, when, sel: g.sel && [g.sel.l, g.sel.w].map(Math.round), cell: c && [c.l, c.w].map(Math.round), tag: g.tag, escaped: g.cells.filter((x) => x.escaped.length).map((x) => [x.id, x.escaped]) });
    }
  };
  const select = async (id) => { await page.click(`.ed-canvas [data-grid-id="${id}"]`, { position: { x: 20, y: 20 }, force: true }); await wait(250); };

  // ---------------------------------------------------------------- the reported case: three Person widgets for Robin
  await select('robin'); await page.click('[data-k=duplicate]'); await wait(300); await verify('duplicate 1', 'robin-2');
  await page.click('[data-k=duplicate]'); await wait(300); await verify('duplicate 2', 'robin-3');
  await page.keyboard.press('ArrowRight'); await verify('keyboard move → x8', 'robin-3');
  await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowRight'); await verify('keyboard resize → w5', 'robin-3');
  const tag = (await geo()).tag;
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'a2-person-x8-w5.png') });
  check('PERSON ×3 (the reported case): the third at x8 y1 w5 h4 — the selection labelled "x8 y1 · w5 h4" is drawn on ITS cell, at once and after the move animation; every Person draws inside its own cell',
    /x8 y1 · w5 h4/.test(tag) && findings.length === 0, JSON.stringify({ tag, findings }));
  findings.length = 0;
  // pointer: drag the second one down a row, resize it by its south-east handle; keyboard back up
  await select('robin-2');
  const b0 = await (await page.$('.ed-canvas [data-grid-id="robin-2"]')).boundingBox();
  await page.mouse.move(b0.x + 30, b0.y + 30); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(b0.x + 30, b0.y + 30 + i * 21); await wait(16); }
  await page.mouse.up(); await verify('pointer drag down', 'robin-2');
  const hb = await (await page.$('.ed-sel__h--se')).boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(hb.x + hb.width / 2 + i * 9, hb.y + hb.height / 2 + i * 5); await wait(16); }
  await page.mouse.up(); await verify('pointer resize (south-east)', 'robin-2');
  await page.keyboard.press('ArrowUp'); await verify('keyboard move up (peers reflow)', 'robin-2');
  check('PERSON: pointer drag, handle resize and a keyboard move that pushes the others aside — selection on the cell and content inside every cell at each step', findings.length === 0, JSON.stringify(findings));
  findings.length = 0;

  // ---------------------------------------------------------------- the shared editor: other widgets
  await E((ls) => { const m = window.editor.getModel(); m.pages[0].items.push(
    { id: 'desk', type: 'light', parent: null, config: { name: 'Desk', entity: 'light.desk' }, layout: ls[0] },
    { id: 'salon', type: 'climate', parent: null, config: { name: 'Salon', entity: 'climate.salon' }, layout: ls[1] },
    { id: 'temp', type: 'sensor', parent: null, config: { name: 'Temperature' }, layout: ls[2] }); window.editor.setModel(m); }, [Lx(1, 12, 3, 4), Lx(4, 12, 5, 8), Lx(9, 12, 2, 3)]);
  await wait(900);
  for (const id of ['desk', 'salon', 'temp']) {
    const ids0 = await E(() => window.editor.getModel().pages[0].items.map((i) => i.id));
    await select(id); await page.click('[data-k=duplicate]'); await wait(300);
    const copy = await E((ids0) => window.editor.getModel().pages[0].items.map((i) => i.id).find((x) => !ids0.includes(x)), ids0);
    await verify(`${id}: duplicate`, null);
    await page.keyboard.press('ArrowRight'); await verify(`${id}: keyboard move`, copy);
    await page.keyboard.press('Shift+ArrowDown'); await verify(`${id}: keyboard resize`, copy);
  }
  check('LIGHT · CLIMATE · SENSOR: duplicate, keyboard move and resize — selection on the cell, content inside every cell (the shared editor)', findings.length === 0, JSON.stringify(findings));
  findings.length = 0;

  // ---------------------------------------------------------------- save + reload
  check('SAVE', await E(() => window.editor.save()));
  const before = await E(() => window.editor.getModel().pages[0].items.map((i) => [i.id, i.layout.desktop]));
  await page.reload(); await page.waitForFunction(() => window.editor); await wait(1200);
  await E(() => window.editor.setEditing(true)); await wait(400);
  await select('robin-3'); await verify('after reload', 'robin-3');
  const afterIds = await E(() => window.editor.getModel().pages[0].items.map((i) => [i.id, i.layout.desktop]));
  check('RELOAD: the same layout, and every widget (the three Persons included) still inside its own cell with the selection on it', JSON.stringify(before) === JSON.stringify(afterIds) && findings.length === 0, JSON.stringify(findings));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
