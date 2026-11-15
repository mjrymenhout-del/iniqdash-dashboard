/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ALARM CODE — the existing Alarm widget's code prompt through the real UI, real PHP server, FAKE Home Assistant (tests/lib/live.mjs —
// not a real Home Assistant): masked keypad · backspace · Cancel sends nothing · OK sends the code ONCE through the validated server
// action (alarm_control_panel.alarm_disarm with the code) · the prompt closes by itself after 30 s without a key (the half-typed code is
// gone) · the code is never kept (not in the dashboard, not in browser storage, not on the page afterwards) · only supported modes.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

let L, B;
try {
  L = await live();
  L.setEntity('alarm_control_panel.home', 'armed_away', { name: 'Home alarm', f: 1 | 2, cf: 'number' });
  B = await liveBrowser(L, { viewport: { width: 1300, height: 900 } }); const page = B.page;
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const posts = () => L.haCalls.filter((x) => x.method === 'POST' && /\/api\/services\//.test(x.url));
  await E(() => { const m = window.editor.getModel(); m.pages[0].items.push({ id: 'al', type: 'alarm', parent: null, config: { name: 'Home alarm', entity: 'alarm_control_panel.home' }, layout: { desktop: { x: 1, y: 40, w: 4, h: 5 }, tablet: { x: 1, y: 40, w: 4, h: 5 }, mobile: { w: 4, h: 5 } } }); window.editor.setModel(m); });
  await page.waitForFunction(() => !!document.querySelector('[data-grid-id="al"] .al__btn'), null, { timeout: 15000 }); await wait(800);
  await (await page.$('[data-grid-id="al"]')).scrollIntoViewIfNeeded();
  const modes = await E(() => [...document.querySelectorAll('[data-grid-id="al"] .al__btn')].map((b) => [...b.classList].find((c) => c.startsWith('al__btn--')).slice(9)));
  check('ONLY SUPPORTED MODES: the panel reports Home and Away (not Night / Vacation / Custom) — Disarm and those two', JSON.stringify(modes.sort()) === JSON.stringify(['arm_away', 'arm_home', 'disarm'].sort()), JSON.stringify(modes));
  const disarm = '[data-grid-id="al"] .al__btn--disarm';
  const p0 = posts().length;
  // 1 · cancel: nothing sent, nothing kept
  await page.click(disarm); await page.waitForSelector('dialog.iqcode[open]');
  for (const k of ['1', '2', '3']) await page.click(`dialog.iqcode [data-k="${k}"]`);
  const masked = await E(() => { const i = document.querySelector('dialog.iqcode input'); return { type: i.type, len: i.value.length }; });
  await page.click('dialog.iqcode [data-k="clear"]');
  const afterBack = await E(() => document.querySelector('dialog.iqcode input').value.length);
  await page.click('dialog.iqcode [data-act="cancel"]'); await wait(400);
  check('KEYPAD: masked (password field), backspace removes a digit; CANCEL closes it and sends nothing', masked.type === 'password' && masked.len === 3 && afterBack === 2 && !(await page.$('dialog.iqcode')) && posts().length === p0, JSON.stringify({ masked, afterBack }));
  // 2 · idle: closes by itself after 30 s, the half-typed code gone, nothing sent
  await page.click(disarm); await page.waitForSelector('dialog.iqcode[open]');
  await page.click('dialog.iqcode [data-k="4"]'); await page.click('dialog.iqcode [data-k="2"]');
  await wait(31500);
  check('IDLE 30 s: the prompt closes by itself — the half-typed code is gone and nothing is sent', !(await page.$('dialog.iqcode')) && posts().length === p0);
  // 3 · OK: the code goes once, through the server's alarm action
  await page.click(disarm); await page.waitForSelector('dialog.iqcode[open]');
  for (const k of ['2', '4', '6', '8']) await page.click(`dialog.iqcode [data-k="${k}"]`);
  await E(() => { const b = document.querySelector('dialog.iqcode [data-k="ok"]'); b.click(); b.click(); });   // a double press
  await wait(1500);
  const sent = posts().slice(p0);
  check('OK (even pressed twice): ONE request — alarm_control_panel.alarm_disarm for the panel, with the code', sent.length === 1 && /alarm_control_panel\/alarm_disarm/.test(sent[0].url) && JSON.parse(sent[0].body).code === '2468' && JSON.parse(sent[0].body).entity_id === 'alarm_control_panel.home',
    JSON.stringify(sent.map((x) => [x.url, x.body])));
  const kept = await E(() => { const all = JSON.stringify(window.editor.getModel()) + JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.body.innerHTML; return { model: all.includes('2468'), dialog: !!document.querySelector('dialog.iqcode') }; });
  check('NEVER KEPT: the code is not in the dashboard, browser storage or the page afterwards', !kept.model && !kept.dialog, JSON.stringify(kept));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
