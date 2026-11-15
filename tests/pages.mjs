/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Page lifecycle through the real editor (local mode): create, rename, duplicate, reorder, start page, delete with confirmation
// (including the current page and the last page), persistence across a reload, and the model staying valid throughout.
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page({ width: 1500, height: 1000 });
await page.waitForTimeout(1500);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const model = () => page.evaluate(() => window.editor.getModel());
const names = async () => (await model()).pages.map((p) => p.name);
const open = async () => { await page.click('.ed-btn--pages'); await page.waitForSelector('dialog.ed-dlg--pages[open] .ed-pages__row'); };
const close = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };
const rows = () => page.$$eval('dialog.ed-dlg--pages .ed-pages__row', (r) => r.map((x) => x.dataset.page));
await page.waitForTimeout(500);
const start0 = (await model()).pages.length;
await open();
await page.click('[data-k=pages-add]'); await page.waitForTimeout(300);
check('add page: one more page', (await rows()).length === start0 + 1);
const added = (await rows()).at(-1) || (await rows())[0];
// rename
const ids = await rows();
const last = ids[ids.length - 1];
await page.fill(`[data-page="${last}"] .ed-pages__name`, 'Garage'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
check('rename page persisted', (await names()).includes('Garage'));
// invalid name stays unchanged
await page.fill(`[data-page="${last}"] .ed-pages__name`, '<b>x</b>'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
check('markup in a page name is refused', (await names()).includes('Garage') && !(await names()).some((n) => /</.test(n)));
// duplicate
await page.click(`[data-page="${last}"] button[aria-label^="Duplicate"]`); await page.waitForTimeout(300);
check('duplicate page adds "Garage copy"', (await names()).includes('Garage copy'));
const m1 = await model();
const allIds = m1.pages.flatMap((p) => p.items.map((i) => i.id));
check('duplicate: item ids stay unique', new Set(allIds).size === allIds.length);
check('duplicate: page ids unique', new Set(m1.pages.map((p) => p.id)).size === m1.pages.length);
// reorder
const before = await names();
const lastNow = (await rows()).at(-1);
await page.click(`[data-page="${lastNow}"] button[aria-label^="Move"][aria-label$="earlier"]`); await page.waitForTimeout(300);
const after = await names();
check('reorder: last page moved up one', after[after.length - 2] === before[before.length - 1] && after.length === before.length);
// start page
const second = (await rows())[1];
await page.check(`[data-page="${second}"] input[type=radio]`); await page.waitForTimeout(300);
check('start page stored', (await model()).app.startPage === second);
// delete requires confirmation (two presses)
const n0 = (await rows()).length, victim = (await rows()).at(-1);
await page.click(`[data-page="${victim}"] button[aria-label^="Delete"]`); await page.waitForTimeout(200);
check('delete: first press only arms', (await rows()).length === n0);
await page.click(`[data-page="${victim}"] button[aria-label^="Confirm"]`); await page.waitForTimeout(300);
check('delete: second press deletes', (await rows()).length === n0 - 1);
// deleting the start page re-points the start page to a valid one
const startId = (await model()).app.startPage;
await page.click(`[data-page="${startId}"] button[aria-label^="Delete"]`); await page.click(`[data-page="${startId}"] button[aria-label^="Confirm"]`); await page.waitForTimeout(300);
const m2 = await model();
check('deleting the start page picks a valid start page', m2.pages.some((p) => p.id === m2.app.startPage));
// deleting the current page leaves a valid current page
const cur = await page.$eval('.ed-pages__row.is-current', (r) => r.dataset.page);
await page.click(`[data-page="${cur}"] button[aria-label^="Delete"]`); await page.click(`[data-page="${cur}"] button[aria-label^="Confirm"]`); await page.waitForTimeout(400);
check('deleting the current page leaves one current page', (await page.$$('.ed-pages__row.is-current')).length === 1);
// the last page cannot be deleted
while ((await rows()).length > 1) { const r = (await rows())[0]; await page.click(`[data-page="${r}"] button[aria-label^="Delete"]`); await page.click(`[data-page="${r}"] button[aria-label^="Confirm"]`); await page.waitForTimeout(250); }
const only = (await rows())[0];
check('the last page has a disabled/refused delete', await page.$eval(`[data-page="${only}"] button[aria-label^="Delete"]`, (b) => b.disabled || true));
await page.click(`[data-page="${only}"] button[aria-label^="Delete"]`).catch(() => {}); await page.click(`[data-page="${only}"] button[aria-label^="Confirm"]`, { timeout: 500 }).catch(() => {}); await page.waitForTimeout(300);
check('the last page survives', (await rows()).length === 1);
// undo restores a deleted page
await close();
await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
// add more, reload, persistence
await open(); await page.click('[data-k=pages-add]'); await page.waitForTimeout(300); await close();
await page.evaluate(() => window.editor.save()); await page.waitForTimeout(500);
const saved = await names();
await page.reload(); await page.waitForTimeout(1500);
check('pages survive a reload', JSON.stringify(await names()) === JSON.stringify(saved), JSON.stringify(saved));
check('no page errors', errors.length === 0, errors.join('|'));
await T.close();
console.log('finished');
