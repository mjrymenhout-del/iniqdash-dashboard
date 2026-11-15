/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ALARM PRESETS — the existing Alarm widget's presentations (the shared Variant system). Real editor, real PHP server, FAKE Home Assistant
// (tests/lib/live.mjs — not a real Home Assistant): an alarm panel that asks for a numeric code and supports Home, Away, Night and Vacation.
//   FULL SECURITY KEYPAD: only the panel's own modes; a masked code (dots — never an input, never stored), backspace, clear; a mode button
//   SUBMITS through the existing secure alarm action — ONE request with the code, no second prompt; the code is gone right after; nothing
//   is claimed until Home Assistant reports the state; 30 s without a key clears a half-typed code; no code → nothing is sent.
//   COMPACT · SECURITY STATUS (no control at all) · MODERN PANEL · STANDARD unchanged. Configure lists the presets; save + reload.
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
let L, B;
try {
  L = await live();
  L.setEntity('alarm_control_panel.home', 'armed_away', { name: 'Home alarm', f: 1 | 2 | 4 | 32, cf: 'number' });
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } }); const page = B.page;
  await page.waitForTimeout(1000);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const posts = () => L.haCalls.filter((x) => x.method === 'POST' && /\/api\/services\//.test(x.url));
  const lay = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y: y * 2 + x, w: Math.min(w, 8), h }, mobile: { w: 4, h } });
  await E((ls) => { const m = window.editor.getModel(); const ent = 'alarm_control_panel.home'; m.pages[0].items = [
    { id: 'a-std', type: 'alarm', parent: null, config: { name: 'Standard', entity: ent }, layout: ls[0] },
    { id: 'a-key', type: 'alarm', parent: null, config: { name: 'Keypad', entity: ent, variant: 'keypad' }, layout: ls[1] },
    { id: 'a-cmp', type: 'alarm', parent: null, config: { name: 'Compact', entity: ent, variant: 'compact' }, layout: ls[2] },
    { id: 'a-st', type: 'alarm', parent: null, config: { name: 'Status', entity: ent, variant: 'status' }, layout: ls[3] },
    { id: 'a-mod', type: 'alarm', parent: null, config: { name: 'Modern', entity: ent, variant: 'modern' }, layout: ls[4] },
  ]; const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join('; ')); }, [lay(1, 1, 4, 4), lay(5, 1, 4, 12), lay(9, 1, 4, 2), lay(9, 3, 4, 4), lay(1, 5, 4, 8)]);
  await page.waitForFunction(() => /Armed/.test(document.querySelector('.ed-canvas [data-grid-id="a-key"] .al__state')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  await wait(800);
  const K = '.ed-canvas [data-grid-id="a-key"]';
  const keyState = () => E((K) => { const w = document.querySelector(K); return { state: w.querySelector('.al__state').textContent, code: w.querySelector('.al__code').textContent, hint: w.querySelector('.al__hint').textContent,
    modes: [...w.querySelectorAll('.al__btn')].map((b) => b.dataset.request), keys: w.querySelectorAll('.al__key').length, inputs: w.querySelectorAll('input').length }; }, K);
  let k = await keyState();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'alarm-presets.png') });
  check('KEYPAD: Home Assistant\'s state, a 12-key keypad, no input field, and ONLY the panel\'s own modes (Disarm, Home, Away, Night, Vacation — no Custom)',
    /Armed · Away/.test(k.state) && k.keys === 12 && k.inputs === 0 && JSON.stringify(k.modes) === JSON.stringify(['disarm', 'arm_home', 'arm_away', 'arm_night', 'arm_vacation']), JSON.stringify(k));
  const p0 = posts().length;
  await page.click(`${K} .al__btn--disarm`); await wait(300);
  k = await keyState();
  check('NO CODE: pressing Disarm sends nothing and says to enter the code', posts().length === p0 && /Enter the code first/.test(k.hint), JSON.stringify(k));
  const key = async (x) => { await page.click(`${K} .al__key[data-key="${x}"]`); await wait(60); };
  for (const x of ['1', '2', '3']) await key(x);
  const masked = (await keyState()).code;
  await key('back'); const afterBack = (await keyState()).code;
  await key('cancel'); const afterClear = (await keyState()).code;
  check('MASKED: three digits show as ••• (never the digits); backspace → ••; Clear → empty', masked === '•••' && afterBack === '••' && /Enter the code/.test(afterClear), JSON.stringify({ masked, afterBack, afterClear }));
  for (const x of ['2', '4', '6', '8']) await key(x);
  await page.click(`${K} .al__btn--disarm`); await wait(1200);
  const sent = posts().slice(p0);
  k = await keyState();
  const leak = await E(() => { const all = JSON.stringify(window.editor.getModel()) + JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.body.innerHTML; return all.includes('2468'); });
  check('SUBMIT: Disarm sends ONE request through the secure alarm action — alarm_control_panel.alarm_disarm for the panel with the code — and no second code prompt',
    sent.length === 1 && /alarm_control_panel\/alarm_disarm/.test(sent[0].url) && JSON.parse(sent[0].body).code === '2468' && JSON.parse(sent[0].body).entity_id === 'alarm_control_panel.home' && !(await page.$('dialog.iqcode')),
    JSON.stringify(sent.map((x) => [x.url, x.body])));
  check('…the code is gone at once (not on screen, not in the dashboard, not in browser storage) and success is NOT claimed: "Disarming…" until Home Assistant reports',
    !leak && /Enter the code/.test(k.code) && /Disarming/.test(k.state), JSON.stringify(k));
  L.setEntity('alarm_control_panel.home', 'disarmed');
  await page.waitForFunction((K) => /^Disarmed/.test(document.querySelector(`${K} .al__state`).textContent), K, { timeout: 15000 }).catch(() => {});
  check('CONFIRMED: Disarmed only once Home Assistant reports it', /^Disarmed/.test((await keyState()).state));
  // idle: a half-typed code clears itself after 30 s
  for (const x of ['9', '9']) await key(x);
  const typed = (await keyState()).code;
  await wait(31000);
  { const ks = await keyState(); check('IDLE 30 s: a half-typed code (••) clears itself (and its hint), nothing sent', typed === '••' && /Enter the code/.test(ks.code) && ks.hint === '' && posts().length === p0 + 1, JSON.stringify(ks)); }
  // the other presets
  const other = await E(() => { const q = (id) => document.querySelector(`.ed-canvas [data-grid-id="${id}"] .al`); const btn = (id) => [...q(id).querySelectorAll('.al__btn')];
    return { std: { variant: q('a-std').dataset.variant, btns: btn('a-std').length },
      cmp: { variant: q('a-cmp').dataset.variant, labels: btn('a-cmp').filter((b) => getComputedStyle(b.querySelector('span')).display !== 'none').length, btns: btn('a-cmp').length },
      st: { variant: q('a-st').dataset.variant, controls: btn('a-st').length + q('a-st').querySelectorAll('.al__key').length, state: q('a-st').querySelector('.al__state').textContent },
      mod: { variant: q('a-mod').dataset.variant, cols: getComputedStyle(q('a-mod').querySelector('.al__modes')).gridTemplateColumns.split(' ').length, btns: btn('a-mod').length } }; });
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'alarm-presets-after.png') });
  check('STANDARD unchanged (Disarm + the panel\'s 4 modes, no keypad); COMPACT: icon-only buttons; SECURITY STATUS: the state and NO control; MODERN: two-column mode tiles',
    other.std.variant === 'standard' && other.std.btns === 5 && other.cmp.variant === 'compact' && other.cmp.labels === 0 && other.cmp.btns === 5 && other.st.variant === 'status' && other.st.controls === 0 && /Disarmed/.test(other.st.state)
      && other.mod.variant === 'modern' && other.mod.cols === 2 && other.mod.btns === 5, JSON.stringify(other));
  // Configure: the presets in the shared editor
  await E(() => window.editor.setEditing(true)); await wait(300);
  await page.click(`${K}`, { position: { x: 10, y: 10 }, force: true }); await wait(200);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector('dialog[open] .ef'); await wait(500);
  const presets = await E(() => [...document.querySelectorAll('dialog[open] .ef-field[data-key="variant"] option')].map((o) => o.textContent));
  check('CONFIGURE (the shared widget editor): Standard · Full security keypad · Compact alarm · Security status · Modern alarm panel', JSON.stringify(presets) === JSON.stringify(['Standard', 'Full security keypad', 'Compact alarm', 'Security status', 'Modern alarm panel']), JSON.stringify(presets));
  await page.click('dialog[open] .ecfg-foot button:has-text("Cancel")'); await wait(300);
  await E(() => window.editor.setEditing(false));
  check('SAVE', await E(() => window.editor.save()));
  await page.reload(); await page.waitForFunction(() => window.editor); await wait(1500);
  const saved = await E(() => window.editor.getModel().pages[0].items.map((i) => [i.id, i.config.variant || 'standard']));
  check('RELOAD: every preset kept', JSON.stringify(saved) === JSON.stringify([['a-std', 'standard'], ['a-key', 'keypad'], ['a-cmp', 'compact'], ['a-st', 'status'], ['a-mod', 'modern']]), JSON.stringify(saved));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
