/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Smart Grid in the real editor: dragging an item onto another reflows the other deterministically with no overlap; one undo restores
// BOTH items; dropping is snapped to whole grid units; a resize that collides reflows too; mobile editing uses the 4-column grid.
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page({ width: 1500, height: 1000 });
await page.waitForTimeout(1500);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const settle = (ms = 250) => page.waitForTimeout(ms);
const items = () => page.evaluate(() => window.editor.getPage().items.map((i) => ({ id: i.id, ...i.layout.desktop })));
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const anyOverlap = (l) => l.some((a, i) => l.slice(i + 1).some((b) => overlap(a, b)));
await page.evaluate(() => window.editor.setEditing(true));
await page.evaluate(() => document.querySelector('.ed-btn--pages').click()); await page.waitForSelector('[data-k=pages-add]');
await page.click('[data-k=pages-add]', { force: true }); await settle(); await page.keyboard.press('Escape'); await settle();
for (let n = 0; n < 3; n++) {
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
  await page.waitForSelector('.ecfg-tile[data-type=sensor]'); await page.click('.ecfg-tile[data-type=sensor]'); await settle(150);
  await page.click('.ecfg-foot button:has-text("Next")'); await settle(100); await page.click('.ecfg-foot button:has-text("Add Sensor")'); await settle(350);
}
const L0 = await items();
check('three widgets, no overlap after adding', L0.length === 3 && !anyOverlap(L0));
const drag = async (id, toId, hold = 500) => {
  const a = await (await page.$(`[data-grid-id="${id}"]`)).boundingBox(), b = await (await page.$(`[data-grid-id="${toId}"]`)).boundingBox();
  await page.click(`[data-grid-id="${id}"]`, { force: true }); await settle(100);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 }); await page.waitForTimeout(hold);
  await page.mouse.up(); await settle(450);
};
const [A, B, C] = L0.map((i) => i.id);
await drag(A, B);
const L1 = await items();
check('drop onto another item reflows: no overlap', !anyOverlap(L1), JSON.stringify(L1));
check('the dropped item took the target cell (it has priority)', L1.find((i) => i.id === A).x !== L0.find((i) => i.id === A).x || L1.find((i) => i.id === A).y !== L0.find((i) => i.id === A).y);
check('positions are whole grid units', L1.every((i) => Number.isInteger(i.x) && Number.isInteger(i.y) && Number.isInteger(i.w) && Number.isInteger(i.h)));
await page.keyboard.press('Control+z'); await settle(300);
check('ONE undo restores every item after a reflow', JSON.stringify(await items()) === JSON.stringify(L0));
await page.keyboard.press('Control+y'); await settle(300);
check('redo re-applies the same reflow', JSON.stringify(await items()) === JSON.stringify(L1));
// same gesture twice gives the same result (deterministic)
await page.keyboard.press('Control+z'); await settle(300);
await drag(A, B);
check('repeating the same drag gives the same layout', JSON.stringify(await items()) === JSON.stringify(L1));
// keyboard resize into a neighbour reflows without overlap
await page.click(`[data-grid-id="${C}"]`, { force: true }); await settle(100);
for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowUp'); }
await settle(300);
check('growing an item into neighbours leaves no overlap', !anyOverlap(await items()), JSON.stringify(await items()));
// mobile editing: 4 columns, touch-style drag handle visible on a coarse pointer
await page.selectOption('[data-k=pv-device]', '390x844'); await settle(600);
const mob = await page.evaluate(() => { const g = document.querySelector('.ed-frame .mg'); return { cols: g ? getComputedStyle(g).getPropertyValue('--mg-cols') || g.dataset.cols : null, bp: document.querySelector('[data-k=pv-info]').dataset.bp }; });
check('mobile preview uses the mobile breakpoint', mob.bp === 'mobile', JSON.stringify(mob));
const lm = await page.evaluate(() => window.editor.getPage().items.map((i) => i.layout.mobile));
check('mobile layouts are flow items that fit a 4-column grid', lm.every((l) => l && l.w >= 1 && l.w <= 4 && (l.x === undefined || l.x + l.w - 1 <= 4)), JSON.stringify(lm));
check('no page errors', errors.length === 0, errors.join('|'));
await T.close();
console.log('finished');
