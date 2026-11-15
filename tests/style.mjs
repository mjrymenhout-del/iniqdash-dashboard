/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Copy / Paste Style foundation: a style is ONLY corners + theme override. Pasting never changes entity, labels, variant, mappings or layout,
// works across widget types, is one undo step, and containers are excluded.
import { start, check } from './lib/harness.mjs';
const S = await start([], { server: false });
const page = await S.page({ width: 1400, height: 900 });
await page.waitForTimeout(1500);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const getModel = () => page.evaluate(() => window.editor.getModel());
const settle = (ms = 300) => page.waitForTimeout(ms);
await page.evaluate(() => window.editor.setEditing(true));
// pure functions
const pure = await page.evaluate(() => {
  const R = window.MaisonRegistry;
  const cfg = { name: 'A', entity: 'sensor.x', corners: { tl: { shape: 'normal', r: 4 }, tr: { shape: 'normal', r: 4 }, bl: { shape: 'normal', r: 4 }, br: { shape: 'normal', r: 4 } }, theme: { tokens: { accent: '#123456' } }, variant: 'value' };
  const st = R.styleOf(cfg);
  return { keys: Object.keys(st).sort().join(), leak: ['name', 'entity', 'variant'].some((k) => k in st), STYLE: R.STYLE_KEYS.join() };
});
check('styleOf keeps only corners and theme', pure.keys === 'corners,theme' && !pure.leak, JSON.stringify(pure));
const m0 = await getModel();
const tops = m0.pages[0].items.filter((i) => i.type !== 'container' && !i.parent);
const a = tops.find((i) => i.type === 'sensor'), b = tops.find((i) => i.type !== 'sensor' && i.type !== 'weather' && i.id !== a.id) || tops[1];
// give A a style
const m1 = structuredClone(m0);
const ia = m1.pages[0].items.find((i) => i.id === a.id);
ia.config.theme = { tokens: { accent: '#0a8f5a' } }; ia.config.corners = { tl: { shape: 'normal', r: 6 }, tr: { shape: 'concave', r: 12 }, bl: { shape: 'normal', r: 6 }, br: { shape: 'normal', r: 6 } };
await page.click('[data-k=more]').catch(() => {}); await page.click('[data-k=import]'); await page.waitForSelector('dialog[open] textarea');
await page.fill('dialog[open] textarea', JSON.stringify(m1)); await page.click('dialog[open] .ed-btn--primary:has-text("Import")'); await settle(700);
await page.evaluate(() => window.editor.setEditing(true));
await page.click(`[data-grid-id="${a.id}"]`, { force: true }); await settle(150);
await page.click('[data-k=copy-style]'); await settle(150);
await page.click(`[data-grid-id="${b.id}"]`, { force: true }); await settle(150);
check('Paste style appears once a style is copied', !!(await page.$('[data-k=paste-style]')));
const before = (await getModel()).pages[0].items.find((i) => i.id === b.id);
await page.click('[data-k=paste-style]'); await settle(500);
const after = (await getModel()).pages[0].items.find((i) => i.id === b.id);
check('the theme override was pasted', JSON.stringify(after.config.theme) === JSON.stringify(ia.config.theme));
const strip = (c) => { const x = structuredClone(c); delete x.theme; delete x.corners; return JSON.stringify(x); };
check('nothing functional changed (entity, labels, mappings, variant, layout)', strip(after.config) === strip(before.config) && JSON.stringify(after.layout) === JSON.stringify(before.layout) && after.type === before.type);
await page.keyboard.press('Control+z'); await settle(300);
const undone = (await getModel()).pages[0].items.find((i) => i.id === b.id);
check('one undo removes the pasted style', JSON.stringify(undone.config) === JSON.stringify(before.config));
// containers have no style actions
const box = m0.pages[0].items.find((i) => i.type === 'container' && !i.parent);
if (box) { await page.click(`[data-grid-id="${box.id}"]`, { force: true }); await settle(150); check('containers offer neither Copy style nor Paste style', !(await page.$('[data-k=copy-style]')) && !(await page.$('[data-k=paste-style]'))); }
// the style survives a configuration dialog Apply (the dialog must not drop the theme key)
await page.click(`[data-grid-id="${a.id}"]`, { force: true }); await settle(150);
await page.click('[data-k=edit-config]'); await page.waitForSelector('dialog[open] .ef'); await page.click('dialog[open] .ecfg-foot button:has-text("Apply")'); await settle(500);
const kept = (await getModel()).pages[0].items.find((i) => i.id === a.id);
check('Apply in the configuration dialog keeps theme and corners', !!kept.config.theme && !!kept.config.corners, JSON.stringify(Object.keys(kept.config)));
check('no page errors', errors.length === 0, errors.join('|'));
await S.close();
console.log('finished');
