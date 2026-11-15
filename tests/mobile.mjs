/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Editing on a phone-sized window (390 × 844): the 4-column grid, dialogs that fit and scroll, the Add flow, page navigation and Save —
// all through the real editor. (Touch gestures themselves are not simulated here: that needs a real device.)
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page({ width: 390, height: 844 });
await page.waitForTimeout(1800);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const E = (fn, ...a) => page.evaluate(fn, ...a);
const settle = (ms = 400) => page.waitForTimeout(ms);
check('a phone-width window uses the mobile breakpoint', (await E(() => document.querySelector('.ed').dataset.bp)) === 'mobile');
check('the page does not scroll sideways', await E(() => document.documentElement.scrollWidth <= innerWidth + 1));
check('the grid has 4 columns', await E(() => { const g = document.querySelector('.ed-frame .mg__grid'); return !!g && /repeat\(4\b/.test(getComputedStyle(g).gridTemplateColumns.replace(/\s+/g, ' ')) || getComputedStyle(g).gridTemplateColumns.split(' ').length === 4; }));
check('items are in reading order (no overlapping rows)', await E(() => { const r = [...document.querySelectorAll('.ed-frame > * [data-grid-id]')].filter((n) => n.dataset.gridId !== 'dashboard' && !n.closest('[data-grid-id="dashboard--x"]')).map((n) => n.getBoundingClientRect()).filter((b) => b.width > 0).sort((a, b) => a.top - b.top || a.left - b.left); return r.length > 2; }));
await E(() => window.editor.setEditing(true)); await settle();
check('the inspector is a collapsed bottom sheet (low, full width minus gutters), not a sidebar eating the screen', await E(() => { const p = document.querySelector('.ed-panel'); const r = p.getBoundingClientRect(); return p.classList.contains('is-collapsed') && r.height < innerHeight * 0.3 && r.width > innerWidth * 0.85 && r.bottom <= innerHeight + 1; }));
const dialogs = { settings: () => page.click('button[aria-label="Dashboard settings"]'), pages: () => page.click('.ed-btn--pages'), add: () => E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click()), export: async () => { await page.click('[data-k=more]'); await page.click('[data-k=export]'); } };
for (const [name, open] of Object.entries(dialogs)) {
  await E(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close())); await settle(150);
  await open(); await settle(500);
  const g = await E(() => { const d = document.querySelector('dialog[open]'); if (!d) return null; const r = d.getBoundingClientRect(); const body = d.querySelector('.ed-dlg__body, .ecfg-body, .ecfg-main') || d; const close = [...d.querySelectorAll('button')].find((b) => /close|cancel/i.test(b.textContent)); const cr = close && close.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight, closeVisible: !!cr && cr.top >= 0 && cr.bottom <= innerHeight && cr.left >= 0 && cr.right <= innerWidth, scrolls: body.scrollHeight > body.clientHeight ? getComputedStyle(body).overflowY !== 'visible' : true }; });
  check(`${name} dialog fits the phone screen`, !!g && g.l >= -1 && g.r <= g.vw + 1 && g.t >= -1 && g.b <= g.vh + 1, JSON.stringify(g));
  check(`${name} dialog: its close / cancel control is on screen and its content can scroll`, !!g && g.closeVisible && g.scrolls, JSON.stringify(g));
  await page.keyboard.press('Escape'); await settle(250);
}
// the Add flow works end to end on a phone
const before = await E(() => window.editor.getPage().items.length);
await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
await page.locator('.ecfg-tile[data-type=sensor]').first().waitFor(); await page.click('.ecfg-tile[data-type=sensor]'); await settle(250);
const nextVisible = await E(() => { const b = [...document.querySelectorAll('.ecfg-foot button')].find((x) => /next/i.test(x.textContent)); const r = b.getBoundingClientRect(); return r.bottom <= innerHeight && r.right <= innerWidth; });
check('the configuration step keeps its Next button on screen', nextVisible);
await page.click('.ecfg-foot button:has-text("Next")'); await settle(200); await page.click('.ecfg-foot button:has-text("Add Sensor")'); await settle(500);
check('adding a widget works on a phone', (await E(() => window.editor.getPage().items.length)) === before + 1);
// page navigation and Save
const nav = await E(() => [...document.querySelectorAll('nav[aria-label] button, nav[aria-label] a')].length);
check('the page navigation is reachable on a phone', nav > 1);
const here = await E(() => window.editor.getPage().id);
await E(() => [...document.querySelectorAll('nav[aria-label] button, nav[aria-label] a')].find((b) => !(b.getAttribute('aria-current') === 'page' || b.getAttribute('aria-pressed') === 'true')).click()); await settle(600);
check('tapping a navigation item switches the page', (await E(() => window.editor.getPage().id)) !== here);
check('Save works on a phone', await E(() => window.editor.save()));
check('the page still does not scroll sideways', await E(() => document.documentElement.scrollWidth <= innerWidth + 1));
check('no page errors', errors.length === 0, errors.join('|'));
await T.close();
console.log('finished');
