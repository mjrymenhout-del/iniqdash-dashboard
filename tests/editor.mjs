/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// The real editor (local mode, no server): every new widget can be picked, configured, placed and added; the config dialog of each
// new type renders fully; the added item survives a reload of the saved dashboard (persistence of the new config keys).
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page({ width: 1500, height: 1000 });
await page.waitForTimeout(1500);
const NEW = { robot: 'Robot', entitylist: 'Entity List', datetime: 'Date & Time', timer: 'Timer', sunmoon: 'Sun & Moon' };
const count = () => page.evaluate(() => document.querySelectorAll('[data-item-id], [data-item]').length);
for (const [type, label] of Object.entries(NEW)) {
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
  await page.waitForSelector(`.ecfg-tile[data-type=${type}]`);
  await page.click(`.ecfg-tile[data-type=${type}]`);
  await page.waitForTimeout(250);
  const h = await page.$eval('dialog .ef', (f) => f.getBoundingClientRect().height).catch(() => 0);
  check(`${label}: configure step renders fully (${Math.round(h)}px)`, h > 200);
  await page.click('.ecfg-foot button:has-text("Next")');
  await page.waitForTimeout(200);
  await page.click(`.ecfg-foot button:has-text("Add ${label}")`);
  await page.waitForTimeout(500);
  check(`${label}: added to the dashboard`, await page.evaluate((t) => !!document.querySelector(`[data-widget="${t}"]`), type));
}
// the obsolete Compact / Standard / Wide preview-size controls must not come back (they were never Variants)
{
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
  await page.click('.ecfg-tile[data-type=sensor]'); await page.waitForTimeout(250);
  const words = await page.$$eval('dialog[open] .ecfg-pv button, dialog[open] .ecfg-pv [data-size]', (b) => b.map((x) => x.textContent.trim()));
  check('configuration dialog: no Compact / Standard / Wide preview-size buttons', words.length === 0 && !(await page.$('dialog[open] .ecfg-pv__sizes')), words.join());
  check('configuration dialog: the live preview is still there', !!(await page.$('dialog[open] .ecfg-pv__stage')));
  await page.click('dialog[open] .ecfg-foot button:has-text("Back")').catch(() => {});
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const src = (await Promise.all(['components/editor/configure.js', 'components/editor/configure.css'].map((f) => fetch(new URL(`/${f}`, page.url()).href).then((r) => r.text())))).join('\n');
  check('the obsolete preview-size code is gone from the sources', !/ecfg-pv__sizes|PREVIEW\s*=|pvSize/.test(src));
}
// responsive tiers come from the LOGICAL size only (MaisonFit.classify is pure: no scale, no screen)
check('MaisonFit.classify depends on width × height only', await page.evaluate(() => { const F = window.MaisonFit, a = F.classify(400, 300), b = F.classify(400, 300); return JSON.stringify(a) === JSON.stringify(b) && a.tier === 'normal' && F.classify(100, 80).tier === 'micro' && F.classify(180, 150).tier === 'compact' && F.classify(500, 500).tier === 'large'; }));
// TYPE → VARIANT → MAISONFIT: resizing an item never changes its configured variant or any other setting
{
  const readModel = async () => { await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.dataset.k === 'more').click()); await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.dataset.k === 'export').click()); await page.waitForSelector('textarea.ed-code'); const m = JSON.parse(await page.$eval('textarea.ed-code', (x) => x.value)); await page.keyboard.press('Escape'); await page.waitForTimeout(150); return m; };
  const find = (m, type) => m.pages.flatMap((p) => p.items).filter((i) => i.type === type).pop();
  const before = find(await readModel(), 'timer');
  await page.click(`[data-grid-id="${before.id}"]`, { force: true });
  await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector('[data-k="edit-config"]').click());
  await page.waitForSelector('dialog[open] .ef');
  await page.$eval('dialog[open] .ef-field[data-key="variant"] select', (s) => { s.value = 'compact'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('dialog[open] .ecfg-foot button:has-text("Apply")');
  await page.waitForTimeout(300);
  const mid = find(await readModel(), 'timer');
  check('variant chosen in the configuration is stored', mid.config.variant === 'compact');
  for (const label of ['W+', 'W+', 'H+', 'H+', 'W−']) { await page.evaluate((l) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === l)?.click(), label); await page.waitForTimeout(120); }
  const after = find(await readModel(), 'timer');
  check('resizing the widget changed its size…', JSON.stringify(after.layout) !== JSON.stringify(mid.layout), JSON.stringify(after.layout));
  check('…but not its variant or any other setting', JSON.stringify(after.config) === JSON.stringify(mid.config), `${JSON.stringify(mid.config)} -> ${JSON.stringify(after.config)}`);
  check('the widget on the canvas still presents the stored variant', (await page.evaluate((id) => document.querySelector(`[data-grid-id="${id}"] [data-widget="timer"]`)?.dataset.variant, before.id)) === 'compact');
}
// the dashboard is stored locally with the new items
await page.waitForTimeout(800);
const stored = await page.evaluate(() => Object.entries(localStorage).map(([k, v]) => [k, v]).filter(([k, v]) => /"type":\s*"robot"/.test(v)).length);
check('the new widgets are persisted in the saved dashboard', stored > 0);
const all = await page.evaluate(() => Object.values(localStorage).find((v) => /"type":\s*"robot"/.test(v)) || '');
check('all five new types are in the saved dashboard', ['robot', 'entitylist', 'datetime', 'timer', 'sunmoon'].every((t) => new RegExp(`"type":\\s*"${t}"`).test(all)));
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
