/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// EXPANDABLE LIST — the shared behaviour (components/expandlist) on the Entity List, in a page's grid and in a popup. Real editor UI,
// real PHP server, FAKE Home Assistant (tests/lib/live.mjs — not a real Home Assistant; the rows are the widget's labelled demo rows).
//   The first rows, a control for the rest; expanding never resizes the widget, its grid cell or its neighbours (the rows scroll inside);
//   keyboard + aria-expanded; no control when the rows fit; absent setting = the list as it always was.
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1400, height: 900 } }); const page = B.page;
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const rows = Array.from({ length: 8 }, (_, i) => ({ name: `Row ${i + 1}`, text: i % 2 ? 'Off' : 'On' }));
  const lay = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y: y * 3 + x, w: 4, h }, mobile: { w: 4, h } });
  await E(({ rows, ls }) => { const m = window.editor.getModel(); m.pages[0].items = [
    { id: 'plain', type: 'entitylist', parent: null, config: { name: 'Plain', demoRows: rows }, layout: ls[0] },
    { id: 'ex', type: 'entitylist', parent: null, config: { name: 'Expandable', demoRows: rows, list: { mode: 'expand' } }, layout: ls[1] },
    { id: 'next', type: 'sensor', parent: null, config: { name: 'Neighbour' }, layout: ls[2] },
    { id: 'few', type: 'entitylist', parent: null, config: { name: 'Few', demoRows: rows.slice(0, 3), list: { mode: 'expand' } }, layout: ls[3] }];
    m.popups.push({ id: 'pp', name: 'List popup', config: {}, items: [{ id: 'pex', type: 'entitylist', parent: null, config: { name: 'In a popup', demoRows: rows, list: { mode: 'expand', count: 2, control: 'text' } }, layout: { desktop: { x: 1, y: 1, w: 6, h: 7 }, tablet: { x: 1, y: 1, w: 6, h: 7 }, mobile: { w: 4, h: 7 } } }] });
    const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join('; ')); }, { rows, ls: [lay(1, 1, 4, 7), lay(5, 1, 4, 7), lay(5, 8, 4, 3), lay(9, 1, 4, 7)] });
  await wait(900);
  const st = (id) => E((id) => { const g = document.querySelector(`.ed-canvas [data-grid-id="${id}"]`), r = g.getBoundingClientRect(), list = g.querySelector('.iq-elist__list'), b = g.querySelector('[data-k=list-expand]');
    if (!list) return { cell: [r.left, r.top, r.width, r.height].map(Math.round) };
    return { cell: [r.left, r.top, r.width, r.height].map(Math.round), visible: [...list.children].filter((li) => !li.hidden).length, total: list.children.length, btn: b && { text: b.textContent, expanded: b.getAttribute('aria-expanded'), controls: b.getAttribute('aria-controls') === list.id },
      scrolls: list.scrollHeight > list.clientHeight + 1, inside: [...g.querySelectorAll('*')].every((k) => { const q = k.getBoundingClientRect(); return !q.width || (q.bottom <= r.bottom + 2 && q.top >= r.top - 2); }) || getComputedStyle(g.firstElementChild).overflow !== 'visible' }; }, id);

  const plain = await st('plain');
  check('DEFAULT (no setting): the Entity List is what it always was — every row, no Show more control', plain.visible === 8 && !plain.btn, JSON.stringify(plain));
  const c0 = await st('ex'), n0 = await st('next');
  check('EXPANDABLE: the first 3 rows and a "Show 5 more" button tied to the list (aria-controls, aria-expanded false)', c0.visible === 3 && c0.btn && /Show 5 more/.test(c0.btn.text) && c0.btn.expanded === 'false' && c0.btn.controls, JSON.stringify(c0));
  if (SHOTS) await (await page.$('.ed-canvas [data-grid-id="ex"]')).screenshot({ path: path.join(SHOTS, 'b2-collapsed.png') });
  await page.click('.ed-canvas [data-grid-id="ex"] [data-k=list-expand]'); await wait(300);
  const c1 = await st('ex'), n1 = await st('next');
  if (SHOTS) await (await page.$('.ed-canvas [data-grid-id="ex"]')).screenshot({ path: path.join(SHOTS, 'b2-expanded.png') });
  check('SHOW MORE: all 8 rows, "Show less"; the widget\'s grid cell and its neighbour did not move or grow — the rows scroll inside the widget',
    c1.visible === 8 && /Show less/.test(c1.btn.text) && c1.btn.expanded === 'true' && JSON.stringify(c1.cell) === JSON.stringify(c0.cell) && JSON.stringify(n1.cell) === JSON.stringify(n0.cell) && c1.scrolls, JSON.stringify({ c1, n0: n0.cell, n1: n1.cell }));
  await page.focus('.ed-canvas [data-grid-id="ex"] [data-k=list-expand]'); await page.keyboard.press('Enter'); await wait(250);
  check('KEYBOARD: Enter on the control collapses it again (3 rows)', (await st('ex')).visible === 3);
  await page.keyboard.press('Space'); await wait(250);
  await E(() => document.querySelector('.ed-canvas [data-grid-id="ex"] .iq-elist').entitylist.setState({ subtitle: 'updated' })); await wait(200);
  check('A re-render of the widget (new state) keeps it expanded', (await st('ex')).visible === 8);
  const few = await st('few');
  check('FEW ROWS (3, collapsed count 3): everything shown, no control', few.visible === 3 && !few.btn, JSON.stringify(few));

  // ---------------------------------------------------------------- configured through the widget's real configuration
  await E(() => window.editor.setEditing(true)); await wait(300);
  await page.click('.ed-canvas [data-grid-id="plain"]', { position: { x: 12, y: 12 }, force: true }); await wait(200);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector('dialog[open] .ef'); await wait(300);
  await E(() => document.querySelectorAll('dialog[open] details.ef-group--acc').forEach((d) => { d.open = true; }));
  await page.selectOption('dialog[open] .ef-field[data-key="list.mode"] select', 'expand'); await wait(200);
  await page.fill('dialog[open] .ef-field[data-key="list.count"] input.ef-range__n', '4'); await page.press('dialog[open] .ef-field[data-key="list.count"] input.ef-range__n', 'Enter'); await wait(200);
  await page.selectOption('dialog[open] .ef-field[data-key="list.control"] select', 'arrow'); await wait(300);
  const pvRows = await E(() => { const pv = document.querySelector('dialog[open] .ecfg-pv'); const l = pv && pv.querySelector('.iq-elist__list'); return l && [...l.children].filter((li) => !li.hidden).length; });
  await page.click('dialog[open] .ecfg-foot button:has-text("Apply")'); await wait(600);
  const cfg = await E(() => window.editor.getModel().pages[0].items.find((i) => i.id === 'plain').config.list);
  await E(() => window.editor.setEditing(false)); await wait(500);
  const pl = await st('plain');
  check('CONFIGURE (the widget\'s own dialog): Expandable · 4 rows · Arrow — the Live preview shows 4 rows at once; stored only what differs; on the dashboard: 4 rows and an arrow control',
    pvRows === 4 && JSON.stringify(cfg) === JSON.stringify({ mode: 'expand', count: 4, control: 'arrow' }) && pl.visible === 4 && pl.btn && pl.btn.text === '', JSON.stringify({ pvRows, cfg, pl }));

  // ---------------------------------------------------------------- in a popup
  await E(() => window.editor.openPopup('pp')); await wait(800);
  const pp0 = await E(() => { const l = document.querySelector('.mscr [data-grid-id="pex"] .iq-elist__list') || document.querySelector('[data-grid-id="pex"] .iq-elist__list'); return l && [...l.children].filter((li) => !li.hidden).length; });
  await page.click('[data-grid-id="pex"] [data-k=list-expand]'); await wait(300);
  const pp1 = await E(() => { const l = document.querySelector('[data-grid-id="pex"] .iq-elist__list'); return { n: [...l.children].filter((li) => !li.hidden).length, t: document.querySelector('[data-grid-id="pex"] [data-k=list-expand]').textContent }; });
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'b2-popup.png') });
  check('IN A POPUP: 2 rows and a text control; it reveals all 8 ("Show less")', pp0 === 2 && pp1.n === 8 && /Show less/.test(pp1.t), JSON.stringify({ pp0, pp1 }));
  await E(() => window.editor.closePopup()); await wait(300);

  // ---------------------------------------------------------------- save + reload
  check('SAVE', await E(() => window.editor.save()));
  await page.reload(); await page.waitForFunction(() => window.editor); await wait(1200);
  const re = await st('ex');
  check('RELOAD: the setting is kept; the list starts collapsed again (its expanded state is not stored unless "Start expanded")', re.visible === 3 && re.btn && re.btn.expanded === 'false', JSON.stringify(re));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
