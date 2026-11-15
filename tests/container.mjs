/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Container system through the real editor: an empty container, widgets inside, move in / out, duplicate and copy / paste (container only — the
// editor says so; a PAGE duplicate copies everything), delete takes the children along (one undo restores all), one level of nesting only,
// export / import keep the tree.
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page({ width: 1500, height: 1000 });
await page.waitForTimeout(1500);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const E = (fn, ...a) => page.evaluate(fn, ...a);
const settle = (ms = 300) => page.waitForTimeout(ms);
const items = () => E(() => window.editor.getPage().items.map((i) => ({ id: i.id, type: i.type, parent: i.parent || null })));
await E(() => window.editor.setEditing(true));
await E(() => document.querySelector('.ed-btn--pages').click()); await page.locator('[data-k=pages-add]').first().waitFor(); await page.click('[data-k=pages-add]', { force: true }); await settle(); await page.keyboard.press('Escape'); await settle();
const add = async (type, label) => {
  await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
  await page.locator(`.ecfg-tile[data-type=${type}]`).first().waitFor(); await page.click(`.ecfg-tile[data-type=${type}]`); await settle(200);
  await page.click('.ecfg-foot button:has-text("Next")'); await settle(150); await page.click(`.ecfg-foot button:has-text("Add ${label}")`); await settle(450);
};
await add('container', 'Container');
let it = await items(); const box = it[0].id;
check('an empty container is valid and shows its empty state', it.length === 1 && it[0].type === 'container' && (await E((id) => !!document.querySelector(`[data-grid-id="${id}"]`), box)));
await add('sensor', 'Sensor'); await add('text', 'Text');
it = await items(); const kids = it.filter((i) => i.type !== 'container').map((i) => i.id);
const sel = async (id) => { await E((id) => document.querySelector(`[data-grid-id="${id}"]`).focus(), id); await settle(200); };   // (focusing selects: a click in the middle would hit a child)
const moveIn = async (id, parent) => { await page.click(`[data-grid-id="${id}"]`, { force: true }); await settle(150); await page.locator('[data-k=parent]').first().selectOption(parent); await settle(450); };
for (const k of kids) await moveIn(k, box);
it = await items();
check('two widgets moved into the container', kids.every((k) => it.find((i) => i.id === k).parent === box));
check('the container is rendered with its children inside its own grid', await E(([b, k]) => { const c = document.querySelector(`[data-grid-id="${b}"]`); return k.every((id) => !!c.querySelector(`[data-grid-id="${id}"]`)); }, [box, kids]));
// duplicate / copy-paste: the container only, announced as such (children stay with the original)
await sel(box);
const n0 = (await items()).length;
await page.click('[data-k=duplicate]'); await settle(600);
it = await items();
const copies = it.filter((i) => i.type === 'container' && i.id !== box);
check('duplicating a container adds the container only (an empty one), as the status message says', it.length === n0 + 1 && copies.length === 1 && it.filter((i) => i.parent === copies[0].id).length === 0);
check('the original keeps exactly its own children and ids stay unique', it.filter((i) => i.parent === box).length === 2 && new Set(it.map((i) => i.id)).size === it.length);
check('the status line says the items were not copied', /without its items/i.test(await E(() => [...document.querySelectorAll('.ed-toast, .ed-status')].map((n) => n.textContent).join(' '))));
await page.keyboard.press('Control+z'); await settle(400);
check('one undo removes the duplicate', (await items()).length === n0);
await sel(box); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v'); await settle(600);
it = await items();
check('copy / paste of a container adds the container only', it.length === n0 + 1 && it.every((i) => !i.parent || it.some((p) => p.id === i.parent)));
await page.keyboard.press('Control+z'); await settle(400);
// a widget copied while a container is selected is pasted INTO it
await sel(kids[0]); await page.keyboard.press('Control+c'); await sel(box); await page.keyboard.press('Control+v'); await settle(600);
it = await items();
check('pasting while a container is selected puts the widget inside it', it.length === n0 + 1 && it.filter((i) => i.parent === box).length === 3);
await page.keyboard.press('Control+z'); await settle(400);
// one level only
check('no container is inside another container', !(await items()).some((i) => i.type === 'container' && i.parent));
await sel(box);
const offered = await E(() => [...(document.querySelector('[data-k=parent]')?.options || [])].map((o) => o.value));
check('a container is only offered the dashboard as its place (no nesting of containers)', offered.length === 1 && offered[0] === '', JSON.stringify(offered));
// widgets move back out
await moveIn(kids[1], '');
check('a widget can move back out to the dashboard', (await items()).find((i) => i.id === kids[1]).parent === null);
await moveIn(kids[1], box);
// export → import keeps the tree (model level: the exact text the Export dialog shows)
const tree = await E(() => { const m = window.editor.getModel(); const text = JSON.stringify(m); const r = window.MaisonModel.parse(text, window.MaisonRegistry); return { ok: r.ok, same: r.ok && JSON.stringify(r.model.pages.flatMap((p) => p.items.map((i) => [i.id, i.parent]))) === JSON.stringify(m.pages.flatMap((p) => p.items.map((i) => [i.id, i.parent || null]))) }; });
check('export → import keeps every parent / child relation', tree.ok && tree.same, JSON.stringify(tree));
// delete with children + undo
await sel(box);
await page.click('[data-k=remove]'); await settle(200); if (await page.$('[data-k=remove].is-armed')) await page.click('[data-k=remove]'); await settle(500);
check('deleting the container (confirmed) removes its children too', !(await items()).some((i) => i.id === box || kids.includes(i.id)));
await page.keyboard.press('Control+z'); await settle(500);
it = await items();
check('one undo brings back the container and its children', it.some((i) => i.id === box) && kids.every((k) => it.find((i) => i.id === k)?.parent === box));
check('no page errors', errors.length === 0, errors.join('|'));
await T.close();
console.log('finished');
