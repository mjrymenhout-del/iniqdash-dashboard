/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Popup host (MaisonPopup): one popup at a time, Escape / outside / button close, focus moves in, is trapped for modal popups and is
// restored on close, no orphan overlay or listener left behind after repeated open / close.
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page({ width: 1200, height: 800 });
await page.waitForTimeout(1500);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.evaluate(() => {
  const layer = document.createElement('div'); layer.id = 'tl'; layer.style.cssText = 'position:fixed;inset:0;z-index:50'; document.body.append(layer);
  const open = document.createElement('button'); open.id = 'opener'; open.textContent = 'open'; document.body.append(open);
  const behind = document.createElement('button'); behind.id = 'behind'; behind.textContent = 'behind'; document.body.append(behind);
  window.__host = window.MaisonPopup.createHost({ layer, key: () => 'desktop', viewport: () => ({ w: 1200, h: 800 }),
    build: () => { const d = document.createElement('div'); d.innerHTML = '<button id="b1">one</button><button id="b2">two</button>'; return d; } });
  window.__def = (id, o = {}) => ({ id, name: id, config: { title: id, closeButton: true, backdrop: true, outsideClose: true, escClose: true, enter: 'none', exit: 'none', size: 'fit', ...o }, items: [] });
});
const act = () => page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.className));
const count = () => page.evaluate(() => document.querySelectorAll('#tl .mpop').length);
await page.focus('#opener');
await page.evaluate(() => window.__host.open(window.__def('p1')));
await page.waitForTimeout(100);
check('opening a popup focuses inside it', await page.evaluate(() => document.getElementById('tl').contains(document.activeElement)));
check('the dialog is labelled and modal', await page.evaluate(() => { const p = document.querySelector('#tl .mpop__panel'); return p.getAttribute('role') === 'dialog' && p.getAttribute('aria-modal') === 'true' && !!p.getAttribute('aria-label'); }));
let escaped = false;
for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => document.getElementById('tl').contains(document.activeElement)))) escaped = true; }
check('Tab never leaves a modal popup', !escaped);
escaped = false;
for (let i = 0; i < 8; i++) { await page.keyboard.press('Shift+Tab'); if (!(await page.evaluate(() => document.getElementById('tl').contains(document.activeElement)))) escaped = true; }
check('Shift+Tab never leaves a modal popup', !escaped);
await page.evaluate(() => window.__host.open(window.__def('p2')));
await page.waitForTimeout(100);
check('opening a second popup replaces the first (one at a time)', (await page.evaluate(() => document.querySelectorAll('#tl .mpop:not(.is-leaving)').length)) === 1 && (await page.evaluate(() => window.__host.current())) === 'p2');
await page.keyboard.press('Escape'); await page.waitForTimeout(450);
check('Escape closes it', (await count()) === 0 && (await page.evaluate(() => window.__host.current())) === null);
// outside click
await page.evaluate(() => window.__host.open(window.__def('p3'))); await page.waitForTimeout(100);
await page.mouse.click(5, 5); await page.waitForTimeout(450);
check('click outside closes it', (await count()) === 0);
// close button
await page.evaluate(() => window.__host.open(window.__def('p4'))); await page.waitForTimeout(100);
await page.click('.mpop__close'); await page.waitForTimeout(450);
check('close button closes it', (await count()) === 0);
// escClose off / outsideClose off are honoured
await page.evaluate(() => window.__host.open(window.__def('p5', { escClose: false, outsideClose: false, backdrop: false }))); await page.waitForTimeout(100);
await page.keyboard.press('Escape'); await page.mouse.click(5, 5); await page.waitForTimeout(450);
check('escClose:false and outsideClose:false are honoured', (await count()) === 1);
await page.evaluate(() => window.__host.close('api')); await page.waitForTimeout(450);
// focus restoration
await page.focus('#opener'); await page.evaluate(() => window.__host.open(window.__def('p6'))); await page.waitForTimeout(100);
await page.keyboard.press('Escape'); await page.waitForTimeout(450);
check('focus returns to the opener on close', (await act()) === 'opener', String(await act()));
// repeated open / close leaves nothing behind
const listeners = await page.evaluate(() => { let n = 0; const orig = document.addEventListener; return 0; });
for (let i = 0; i < 25; i++) { await page.evaluate((i) => { window.__host.open(window.__def(`r${i}`)); window.__host.close('api'); }, i); }
await page.waitForTimeout(2200);
check('25 open / close cycles leave no overlay in the DOM', (await count()) === 0);
await page.evaluate(() => window.__host.open(window.__def('late'))); await page.waitForTimeout(400);
await page.keyboard.press('Escape'); await page.waitForTimeout(450);
check('Escape still closes exactly once after many cycles (no stale handlers)', (await count()) === 0 && (await page.evaluate(() => window.__host.log.filter((e) => e.id === 'late' && e.event === 'close').length)) === 1);
check('no page errors', errors.length === 0, errors.join('|'));
await T.close();
console.log('finished');
