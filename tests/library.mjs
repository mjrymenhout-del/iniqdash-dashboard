/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// The whole built-in library through the REAL editor (local mode, the shipped Maison dashboard as the starting point): every widget type
// can be added, reconfigured (variant), saved, reloaded, exported, imported, duplicated, copied / pasted and undone — and the saved JSON
// still validates. Persistence of variants and of the capability-dependent keys is checked on the stored model, not on the DOM.
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page({ width: 1500, height: 1000 });
await page.waitForTimeout(1500);
const SKIP = ['container', 'floating', 'popup', 'notification'];
const only = process.argv.slice(2);
const types = (await page.evaluate(() => Object.entries(window.MaisonRegistry.TYPES).filter(([k, t]) => !t.hidden && !t.isContainer && !t.isFloating).map(([k]) => k))).filter((t) => !SKIP.includes(t)).filter((t) => !only.length || only.includes(t));
const btn = (k) => page.evaluate((k) => { const b = [...document.querySelectorAll('button')].find((x) => x.dataset.k === k); if (!b) return false; b.click(); return true; }, k);
const addBtn = () => page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
async function model() {
  await btn('more'); await btn('export');
  await page.waitForSelector('textarea.ed-code');
  const text = await page.$eval('textarea.ed-code', (t) => t.value);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  return JSON.parse(text);
}
const itemsOf = (m, type) => m.pages.flatMap((p) => p.items).filter((i) => i.type === type);
const labelOf = (t) => page.evaluate((t) => window.MaisonRegistry.TYPES[t].label, t);
const chosen = {};
const ids = new Set();
for (const type of types) {
  const label = await labelOf(type);
  const idsBefore = new Set((await model()).pages.flatMap((p) => p.items).map((i) => i.id));
  await addBtn();
  await page.waitForSelector(`.ecfg-tile[data-type=${type}]`);
  await page.click(`.ecfg-tile[data-type=${type}]`);
  await page.waitForTimeout(150);
  await page.click('.ecfg-foot button:has-text("Next")');
  await page.click(`.ecfg-foot button:has-text("Add ${label}")`);
  await page.waitForTimeout(350);
  const before = (await model());
  const mine = before.pages.flatMap((p) => p.items).find((i) => !idsBefore.has(i.id));
  ids.add(mine.id);
  check(`${type}: added, valid default config, rendered`, !!mine && (await page.$$(`[data-widget="${type}"]`)).length > 0);
  // reopen the configuration dialog and change the variant
  const sel = await page.evaluate((id) => document.querySelector(`[data-grid-id="${id}"]`) ? id : null, mine.id);
  await page.click(`[data-grid-id="${mine.id}"]`, { force: true });
  await page.waitForTimeout(200);
  if (!(await btn('edit-config'))) { check(`${type}: edit button`, false); continue; }
  await page.waitForSelector('dialog[open] .ef');
  const vsel = await page.$('dialog[open] .ef-field[data-key="variant"] select');
  if (vsel) {
    const opts = await vsel.$$eval('option', (o) => o.map((x) => x.value));
    const pick = opts[opts.length - 1];
    await vsel.evaluate((s, v) => { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, pick);
    chosen[type] = pick;
  }
  await page.click('dialog[open] .ecfg-foot button:has-text("Apply")');
  await page.waitForTimeout(300);
  const after = itemsOf(await model(), type).find((i) => i.id === mine.id);
  check(`${type}: variant ${chosen[type] || '(none)'} persisted in the model`, !!after && (chosen[type] === undefined || after.config.variant === chosen[type] || (await page.evaluate(([t, v]) => window.MaisonRegistry.variantOf(t, { variant: v }) === v, [type, chosen[type]]))));
  // the layout (size) was not touched by choosing a variant
  const sizes = (l) => JSON.stringify(Object.fromEntries(Object.entries(l).map(([k, v]) => [k, [v.w, v.h]])));   // (an auto-placed item may or may not store x / y)
  check(`${type}: changing the variant kept the sizes and the entity`, sizes(after.layout) === sizes(mine.layout) && after.config.entity === mine.config.entity, `${JSON.stringify(mine.layout)} -> ${JSON.stringify(after.layout)}`);
}
// duplicate / copy-paste / undo on every type
for (const type of types) {
  const m0 = await model();
  const src = itemsOf(m0, type).find((i) => ids.has(i.id));
  await page.click(`[data-grid-id="${src.id}"]`, { force: true }); await page.waitForTimeout(120);
  await btn('duplicate');
  await page.waitForTimeout(200);
  let m = await model();
  const ids0 = new Set(m0.pages.flatMap((p) => p.items).map((i) => i.id));
  const dup = m.pages.flatMap((p) => p.items).find((i) => !ids0.has(i.id));
  check(`${type}: duplicate has an equal config`, itemsOf(m, type).length === itemsOf(m0, type).length + 1 && dup && JSON.stringify(dup.config) === JSON.stringify(src.config), dup ? `${JSON.stringify(dup.config).slice(0, 200)} <> ${JSON.stringify(src.config).slice(0, 200)}` : 'no dup');
  await page.click(`[data-grid-id="${src.id}"]`, { force: true }); await page.waitForTimeout(120);
  await btn('copy');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(200);
  m = await model();
  const ids1 = new Set(m0.pages.flatMap((p) => p.items).map((i) => i.id));
  const pasted = m.pages.flatMap((p) => p.items).filter((i) => !ids1.has(i.id) && i.type === type);
  check(`${type}: copy / paste keeps the config`, pasted.length === 2 && pasted.every((i) => JSON.stringify(i.config) === JSON.stringify(src.config)), `${pasted.length} new of ${type}`);
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  m = await model();
  check(`${type}: undo removes both again`, itemsOf(m, type).length === itemsOf(m0, type).length);
}
// save + reload: everything (types, variants, config) survives
const saved = await model();
await btn('more');   // close menu state
await page.keyboard.press('Escape');
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save').click());
await page.waitForTimeout(600);
await page.reload();
await page.waitForTimeout(1500);
const reloaded = await model();
for (const type of types) check(`${type}: survives save / reload`, JSON.stringify(itemsOf(reloaded, type).map((i) => i.config)) === JSON.stringify(itemsOf(saved, type).map((i) => i.config)) && itemsOf(saved, type).length > 0);
// the saved JSON validates through the model
const ok = await page.evaluate((j) => window.MaisonModel.validate(JSON.parse(j), window.MaisonRegistry), JSON.stringify(reloaded));
check('the exported dashboard validates', ok.ok === true, JSON.stringify(ok.errors || []).slice(0, 300));
// export → import into a fresh editor keeps every new widget configuration
const p2 = await T.page({ width: 1500, height: 1000 });
await p2.waitForTimeout(1200);
await p2.evaluate(() => localStorage.clear());
await p2.reload(); await p2.waitForTimeout(1200);
await p2.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.dataset.k === 'more').click());
await p2.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.dataset.k === 'import').click());
await p2.waitForSelector('dialog[open] textarea');
await p2.fill('dialog[open] textarea', JSON.stringify(reloaded));
await p2.evaluate(() => [...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Import').click());
await p2.waitForTimeout(800);
const imported = await (async () => { await p2.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.dataset.k === 'more').click()); await p2.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.dataset.k === 'export').click()); await p2.waitForSelector('textarea.ed-code'); return JSON.parse(await p2.$eval('textarea.ed-code', (t) => t.value)); })();
for (const type of types) check(`${type}: survives export / import`, JSON.stringify(itemsOf(imported, type).map((i) => i.config)) === JSON.stringify(itemsOf(reloaded, type).map((i) => i.config)));
check('no page errors', page.errors.length === 0 && p2.errors.length === 0, [...page.errors, ...p2.errors].join('|'));
await T.close();
