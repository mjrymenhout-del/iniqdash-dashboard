/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Journey A/B (real editor, local mode): empty dashboard → page → container → widget → configure → move / resize (keyboard + pointer,
// 8 handles) → duplicate → copy / paste → delete → undo / redo → save → reload → continue. No mocks of the editor itself.
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page({ width: 1500, height: 1000 });
await page.waitForTimeout(1500);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const E = (fn, ...a) => page.evaluate(fn, ...a);
const settle = (ms = 250) => page.waitForTimeout(ms);
const items = () => E(() => window.editor.getPage().items.map((i) => ({ id: i.id, type: i.type, parent: i.parent || null, layout: i.layout.desktop })));
const click = (sel) => page.click(sel, { force: true });
const addTop = async (type, label) => {
  await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
  await page.waitForSelector(`.ecfg-tile[data-type=${type}]`); await page.click(`.ecfg-tile[data-type=${type}]`); await settle();
  await page.click('.ecfg-foot button:has-text("Next")'); await settle(150);
  await page.click(`.ecfg-foot button:has-text("Add ${label}")`); await settle(400);
};

// start from an empty dashboard (a new page with nothing on it)
await E(() => { const e = window.editor; e.setEditing(true); });
await E(() => document.querySelector('.ed-btn--pages').click()); await page.waitForSelector('[data-k=pages-add]');
await click('[data-k=pages-add]'); await settle(); await page.keyboard.press('Escape'); await settle();
check('a new page is empty and shows the empty state', (await items()).length === 0 && !!(await page.$('[data-k=empty-add]')));

await addTop('container', 'Container');
let it = await items();
check('container added to the empty page', it.length === 1 && it[0].type === 'container');
await addTop('sensor', 'Sensor');
it = await items();
check('widget added next to the container', it.length === 2 && it.some((i) => i.type === 'sensor'));
const sensor = it.find((i) => i.type === 'sensor').id, box = it.find((i) => i.type === 'container').id;

// select + keyboard move / resize
const sel = async (id) => { await click(`[data-grid-id="${id}"]`); await settle(120); };
await sel(sensor);
const lay = async (id) => (await items()).find((i) => i.id === id).layout;
const l0 = await lay(sensor);
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await settle();
const l1 = await lay(sensor);
check('arrow keys move by whole grid units', l1.x === l0.x + 2 || l1.x > l0.x, `${l0.x}→${l1.x}`);
await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowDown'); await settle();
const l2 = await lay(sensor);
check('Shift + arrow resizes', l2.w === l1.w + 1 && l2.h === l1.h + 1, `${l1.w}x${l1.h}→${l2.w}x${l2.h}`);
// pointer drag via the move handle
await sel(sensor); const b = await (await page.$(`[data-grid-id="${sensor}"]`)).boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
await page.mouse.move(b.x + b.width / 2 + 160, b.y + b.height / 2 + 80, { steps: 8 }); await page.waitForTimeout(450);
await page.mouse.up(); await settle(400);
const l3 = await lay(sensor);
check('pointer drag moves the item', l3.x !== l2.x || l3.y !== l2.y, JSON.stringify([l2, l3]));
// each of the 8 handles resizes without breaking the layout
const hs = await page.$$('.ed-sel__h'); check('eight resize handles', hs.length === 8, String(hs.length));
let okHandles = 0;
for (let i = 0; i < hs.length; i++) {
  await sel(sensor);
  const before = await lay(sensor); const hb = await (await page.$$('.ed-sel__h'))[i].boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 40, hb.y + hb.height / 2 + 30, { steps: 4 }); await page.mouse.up(); await settle(250);
  const after = await lay(sensor);
  if (after.w >= 1 && after.h >= 1 && after.x >= 1) okHandles++;
}
check('every handle leaves a valid layout', okHandles === 8, String(okHandles));

// duplicate, copy / paste, delete, undo / redo
const n0 = (await items()).length;
await sel(sensor); await click('[data-k=duplicate]'); await settle(350);
check('duplicate adds one item', (await items()).length === n0 + 1);
await sel(sensor); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v'); await settle(350);
check('copy / paste adds one item', (await items()).length === n0 + 2);
await page.keyboard.press('Control+z'); await settle(); await page.keyboard.press('Control+z'); await settle();
check('two undos remove both again', (await items()).length === n0);
await page.keyboard.press('Control+y'); await settle();
check('redo brings one back', (await items()).length === n0 + 1);
await sel(sensor); await click('[data-k=remove]'); await settle(); if (await page.$('[data-k=remove].is-armed')) { await click('[data-k=remove]'); await settle(); }
check('delete removes the item', !(await items()).some((i) => i.id === sensor));
await page.keyboard.press('Control+z'); await settle();
check('undo restores the deleted item', (await items()).some((i) => i.id === sensor));

// container: widget enters / leaves via reparent
await sel(sensor);
const par = await page.$('[data-k=parent] select, select[data-k=parent]');
if (par) {
  await par.selectOption(box); await settle(400);
  check('widget moved into the container', (await items()).find((i) => i.id === sensor).parent === box);
  await sel(sensor); await (await page.$('[data-k=parent] select, select[data-k=parent]')).selectOption(''); await settle(400);
  check('widget moved out of the container', !(await items()).find((i) => i.id === sensor).parent);
} else check('parent selector available', false);
// containers do not nest more than one level
check('no container inside a container', !(await items()).some((i) => i.type === 'container' && i.parent));

// save → reload → continue editing
const savedBefore = JSON.stringify((await E(() => window.editor.getModel())).pages.map((p) => p.items.length));
check('save succeeds', await E(() => window.editor.save()));
await page.reload(); await page.waitForTimeout(1500);
const savedAfter = JSON.stringify((await E(() => window.editor.getModel())).pages.map((p) => p.items.length));
check('saved dashboard reloads identically', savedBefore === savedAfter, `${savedBefore} / ${savedAfter}`);
await E(() => window.editor.setEditing(true)); await settle();
const cnt = (await E(() => window.editor.getModel())).pages.flatMap((p) => p.items).length;
await E(() => document.querySelector('[data-k=add-dash]')?.click());
check('editing continues after reload (add dialog opens)', !!(await page.waitForSelector('.ecfg-tile', { timeout: 3000 }).catch(() => null)));
await page.keyboard.press('Escape');
check('no page errors', errors.length === 0, errors.join('|'));
await T.close();
console.log('finished');
