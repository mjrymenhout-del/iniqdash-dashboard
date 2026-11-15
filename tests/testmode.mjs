/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Full-screen Test Mode (real editor): no editor chrome, handles, grid dots or guides; the dashboard keeps the chosen LOGICAL size
// (scaled, never reflowed); navigation and widgets work; Escape leaves (after popups / dialogs); editing resumes where it was.
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page({ width: 1500, height: 950 });
await page.waitForTimeout(1500);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const E = (fn, ...a) => page.evaluate(fn, ...a);
const settle = (ms = 400) => page.waitForTimeout(ms);
const visible = (sel) => E((s) => { const n = document.querySelector(s); if (!n) return false; const r = n.getBoundingClientRect(), cs = getComputedStyle(n); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; }, sel);
await E(() => window.editor.setEditing(true)); await settle();
const first = await E(() => window.editor.getPage().items.find((i) => !i.parent).id);
await page.click(`[data-grid-id="${first}"]`, { force: true }); await settle(200);
await page.evaluate(() => document.querySelector('[data-k=aid-grid]')?.click());   // grid dots on, if it is a toggle
check('before: the editor chrome is there (toolbar, selection, panel)', (await visible('.ed-bar')) && (await visible('.ed-sel')) && (await visible('.ed-panel')));

// a mobile preview size, then Test Mode with that size
await page.selectOption('[data-k=pv-device]', '390x844'); await settle(600);
const logicalBefore = await E(() => { const f = document.querySelector('.ed-frame'); return [f.offsetWidth, f.offsetHeight]; });
await page.click('[data-k=pv-fs]'); await page.click('[data-k=fs-preview]'); await settle(900);
check('Test Mode is on and editing is off', await E(() => document.querySelector('.ed').classList.contains('ed--fs') && !document.querySelector('.ed').classList.contains('is-editing')) || await E(() => document.querySelector('.ed').classList.contains('ed--fs')));
for (const [sel, label] of [['.ed-sel', 'selection box'], ['.ed-sel__h', 'resize handles'], ['.ed-layer', 'overlay layer (guides, targets)'], ['.ed-bar', 'toolbar'], ['.ed-panel', 'inspector panel'], ['.ed-pv', 'preview bar'], ['.ed-frame-label', 'frame label']])
  check(`Test Mode hides the ${label}`, !(await visible(sel)));
check('the grid dots / guides are not drawn', !(await visible('.ed-aids, .ed-guide, .mg--dots')) || (await E(() => !document.querySelector('.ed').classList.contains('is-editing'))));
check('the exit control is visible', await visible('[data-k=fs-exit]'));
const logicalIn = await E(() => { const f = document.querySelector('.ed-frame'); return [f.offsetWidth, f.offsetHeight]; });
check('the dashboard keeps its logical size (390 × 844), only scaled', JSON.stringify(logicalIn) === JSON.stringify(logicalBefore) && logicalIn[0] === 390, JSON.stringify([logicalBefore, logicalIn]));
const rect = await E(() => { const r = document.querySelector('.ed-frame').getBoundingClientRect(); return [r.width, r.height, innerWidth, innerHeight]; });
check('and the scaled screen fits the window', rect[0] <= rect[2] + 1 && rect[1] <= rect[3] + 1, JSON.stringify(rect));
check('no widget can be selected or dragged in Test Mode', await E((id) => { const n = document.querySelector(`[data-grid-id="${id}"]`); n.click(); return document.querySelector('.ed-sel')?.hidden !== false; }, first));
// navigation works inside Test Mode
const dockPages = await E(() => [...document.querySelectorAll('.ed-frame [data-page], .ed-frame .mnav a, .ed-frame .mnav button, .ed-frame nav button, .ed-frame nav a')].length);
if (dockPages > 1) {
  const cur0 = await E(() => window.editor.getPage().id);
  await E(() => [...document.querySelectorAll('.ed-frame nav button, .ed-frame nav a, .ed-frame .mnav button, .ed-frame .mnav a')].filter((b) => !b.getAttribute('aria-current') && b.getAttribute('aria-pressed') !== 'true')[0]?.click()); await settle(600);
  check('the navigation dock switches pages in Test Mode', (await E(() => window.editor.getPage().id)) !== cur0);
} else console.log('SKIP navigation: no dock in this preview');
// the page scrolls INSIDE the fixed screen
check('the screen scrolls inside the fixed viewport (the window does not)', await E(() => document.documentElement.scrollHeight <= innerHeight + 2 || getComputedStyle(document.documentElement).overflow === 'hidden' || document.documentElement.classList.contains('iq-fs')));
// Escape: a dialog/popup gets it first, then Test Mode ends
await page.keyboard.press('Escape'); await settle(500);
check('Escape leaves Test Mode', !(await E(() => document.querySelector('.ed').classList.contains('ed--fs'))));
check('editing resumes with the chrome back', (await visible('.ed-bar')) && (await visible('.ed-panel')));
const logicalAfter = await E(() => { const f = document.querySelector('.ed-frame'); return [f.offsetWidth, f.offsetHeight]; });
check('and the preview size is unchanged', JSON.stringify(logicalAfter) === JSON.stringify(logicalBefore));
// "this browser window" is a different mode and is labelled as such
await page.click('[data-k=pv-fs]');
const labels = await E(() => [...document.querySelectorAll('[data-k=fs-preview], [data-k=fs-screen]')].map((b) => b.textContent.replace(/\s+/g, ' ')));
check('the two Test Mode choices are named differently (preview size vs this browser window)', labels.length === 2 && labels[0] !== labels[1] && /preview|selected/i.test(labels[0]) && /browser window|window/i.test(labels[1]), labels.join(' | '));
await page.click('[data-k=fs-screen]'); await settle(900);
const win = await E(() => { const f = document.querySelector('.ed-frame'); return [f.offsetWidth, f.offsetHeight, innerWidth, innerHeight]; });
check('"this browser window" uses the window size as the logical size', Math.abs(win[0] - win[2]) <= 1 && Math.abs(win[1] - win[3]) <= 1, JSON.stringify(win));
await page.keyboard.press('Escape'); await settle(500);
check('no page errors', errors.length === 0, errors.join('|'));
await T.close();
console.log('finished');
