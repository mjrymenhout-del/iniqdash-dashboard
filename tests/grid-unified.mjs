/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ONE GRID for a page and its containers (app.grid.nested = 'page'), real editor, real server:
//   1  an older dashboard (container items in the containers' own 40px rows) is converted ONCE on opening: same height on screen
//   2  a container's nested grid shares the page's row height and gap
//   3  a widget DRAGGED into a container keeps its height (it no longer grows to the container's coarse rows)
//   4  grid settings with "keep sizes": a new row height / column count converts every layout — same place and size on screen
//   5  editing aids: the column ruler, the "end of the first screen" line, the corner radial outside the first widget
//   6  a component minimum in legacy rows is met within a few px (no extra row): a 2-row heading stays 2 rows on a 10px grid
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const G = { desktop: { cols: 24, row: 10, gap: 18 }, tablet: { cols: 16, row: 10, gap: 16 }, mobile: { cols: 4, row: 10, gap: 12 } };
const lay = (d, t = { x: 1, y: d.y, w: Math.min(16, d.w), h: d.h }) => ({ desktop: d, tablet: t, mobile: { w: 4, h: d.h } });
// an OLDER dashboard: app.grid without nested — the container's items are in 40px rows (h 3 = 3·40 + 2·12 = 144px)
const old = { version: 3, app: { id: 'u', startPage: 'p', navigation: {}, grid: structuredClone(G) },
  pages: [{ id: 'p', name: 'P', nav: true, items: [
    { id: 'box', type: 'container', parent: null, config: { title: 'Box' }, layout: lay({ x: 1, y: 1, w: 12, h: 20 }) },
    { id: 'inner', type: 'sensor', parent: 'box', config: { name: 'Inner', entity: 'sensor.x' }, layout: { desktop: { x: 1, y: 1, w: 6, h: 3 }, tablet: { x: 1, y: 1, w: 6, h: 3 }, mobile: { w: 4, h: 3 } } },
    { id: 'free', type: 'sensor', parent: null, config: { name: 'Free', entity: 'sensor.y' }, layout: lay({ x: 14, y: 1, w: 6, h: 5 }) },
    { id: 'head', type: 'text', parent: null, config: { variant: 'text', primary: 'Heading', surface: false }, layout: lay({ x: 14, y: 8, w: 6, h: 2 }) },
    { id: 'rad', type: 'radial', parent: null, config: { float: true, corner: 'bottom-right', actions: [] }, layout: lay({ x: 1, y: 300, w: 2, h: 4 }) },
  ] }] };

let L, B;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const id = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Unified', dashboard: old })).json()).entry.id;
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1100 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${L.base}/editor.html?d=${id}`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(1200);
  await E(() => window.editor.setEditing(true)); await wait(1200);
  const it = (id) => E((id) => window.editor.getPage().items.find((i) => i.id === id), id);
  const rect = (id) => E((id) => { const r = document.querySelector(`.ed-canvas [data-grid-id="${id}"]`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, id);
  const scale = await E(() => window.editor.preview().scale);

  // ---- 1 · 2
  const app = await E(() => window.editor.getModel().app.grid);
  const inner = await it('inner'), ir = await rect('inner');
  check('1 · an older dashboard is converted once: app.grid.nested = "page"; the container item 3 × 40px rows (144px) → 6 page rows (150px, the nearest)',
    app.nested === 'page' && inner.layout.desktop.h === 6 && Math.abs(ir.h / scale - 144) <= 10, JSON.stringify({ nested: app.nested, h: inner.layout.desktop.h, px: ir.h / scale }));
  const geo = await E(() => [...document.querySelectorAll('.ed-canvas .mg')].map((g) => { const cs = getComputedStyle(g.firstElementChild); return { nested: g.classList.contains('mg--nested'), row: cs.gridAutoRows, gap: cs.rowGap }; }));
  const page = geo.find((g) => !g.nested), nest = geo.find((g) => g.nested);
  check('2 · the container\'s grid shares the page\'s rows and gap (10px rows, 18px gap)', page && nest && nest.row === page.row && nest.gap === page.gap && page.row === '10px', JSON.stringify(geo));

  // ---- 3 · drag "free" into the container: its height on screen is kept
  await E(() => window.scrollTo(0, 0)); await wait(300);
  const a = await rect('free'), b = await rect('box');
  await p.mouse.move(a.x + 30, a.y + 30); await p.mouse.down(); await p.mouse.move(a.x + 60, a.y + 60, { steps: 5 });
  await p.mouse.move(b.x + 60, b.y + b.h - 60, { steps: 15 }); await wait(400); await p.mouse.up(); await wait(1000);
  const moved = await it('free'), a2 = await rect('free');
  check('3 · a widget dragged into a container keeps its height (same rows, same px)', moved.parent === 'box' && moved.layout.desktop.h === 5 && Math.abs(a2.h - a.h) <= 2, JSON.stringify({ parent: moved.parent, h: moved.layout.desktop.h, before: a.h, after: a2.h }));
  await p.keyboard.press('Control+z'); await wait(800);

  // ---- 6 · a 2-row heading on the 10px grid stays 2 rows (40px minimum met within a few px)
  const headRows = await E(() => getComputedStyle(document.querySelector('.ed-canvas [data-grid-id="head"]')).getPropertyValue('--d-h').trim());
  check('6 · a component minimum (1 row of 40px) is met within a few px: a 2-row heading stays 2 rows (38px), not 3', headRows === '2', headRows);

  // ---- 5 · editing aids
  const aids = await E(() => ({ ruler: document.querySelectorAll('.ed-ruler > i').length, first: document.querySelector('.ed-ruler > i')?.textContent,
    screen: [...document.querySelectorAll('.ed-screen-end span')].map((s) => s.textContent),
    radial: (() => { const r = document.querySelector('.ed-floatlayer [data-grid-id="rad"]')?.getBoundingClientRect(), s = document.querySelector('.ed-canvas [data-grid-id="box"]').getBoundingClientRect(); return r ? { right: r.right, bottom: r.bottom, overBox: r.left < s.right && r.top < s.bottom && r.right > s.left && r.bottom > s.top } : null; })(),
    frame: document.querySelector('.ed-frame').getBoundingClientRect().right }));
  check('5 · editing aids: a ruler with one cell per column (24, numbered from 1), the line where the first screen ends, the corner radial in its corner (not over the first widget)',
    aids.ruler === 24 && aids.first === '1' && aids.screen.length >= 1 && /first screen/.test(aids.screen[0]) && aids.radial && !aids.radial.overBox && aids.radial.right > aids.frame - 160, JSON.stringify(aids));

  // ---- 4 · grid settings: 20px rows, 12 columns, keep sizes → same place / size on screen
  const before = { box: await rect('box'), head: await rect('head') };
  await E(() => document.querySelector('[aria-label="Dashboard settings"]').click()); await wait(500);
  await E(() => document.querySelector('[data-k=settings-tab-grid]').click()); await wait(200);
  await p.selectOption('[data-k=grid-density]', 'normal'); await p.selectOption('[data-k=grid-cdensity]', 'standard'); await wait(200);
  const note = await E(() => document.querySelector('[data-k=grid-note]').textContent);
  const cell = await E(() => document.querySelector('[data-k=grid-desktop-cell]').textContent);
  await E(() => [...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent.trim() === 'Apply').click()); await wait(1200);
  const after = { box: await rect('box'), head: await rect('head') }, g2 = await E(() => window.editor.getModel().app.grid);
  const near = (u, v, t) => Math.abs(u - v) <= t;
  check('4 · grid settings (12 columns, 20px rows, keep sizes): every widget keeps its place and size on screen (within one grid step)',
    g2.desktop.cols === 12 && g2.desktop.row === 20 && g2.nested === 'page' && /keeps its place and size/.test(note) && /px/.test(cell)
    && ['box', 'head'].every((k) => near(before[k].x, after[k].x, 50) && near(before[k].w, after[k].w, 60) && near(before[k].y, after[k].y, 40) && near(before[k].h, after[k].h, 40)),
    JSON.stringify({ g2: g2.desktop, before, after, cell }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('grid-unified test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
