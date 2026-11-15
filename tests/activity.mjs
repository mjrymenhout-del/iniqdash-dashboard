/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// LIVE ACTIVITY — a standard widget: what is ACTIVE right now among the entities you map. Real editor, real PHP server, FAKE Home Assistant
// (tests/lib/live.mjs — not a real Home Assistant). Active = Home Assistant's own rule for the kind (light on, climate heating, binary
// sensor on…) or the owner's condition (state is…, value above / below…); the text is Home Assistant's; look per entity > per type >
// default; a tap opens Entity Details — no service call ever; live updates; Demo without Home Assistant entities.
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
let L, B;
try {
  L = await live();
  L.setEntity('climate.stove', 'heat', { name: 'Pellet stove', f: 1, cur: 19, target: 21, min: 7, max: 30, step: 0.5, modes: ['heat', 'off'], action: 'heating' });
  L.setEntity('light.kitchen', 'on', { name: 'Kitchen light', f: 0, br: 200, cm: 'brightness', scm: ['brightness'] });
  L.setEntity('light.hall', 'on', { name: 'Hall light', f: 0, br: 90, cm: 'brightness', scm: ['brightness'] });
  L.setEntity('light.salon', 'off', { name: 'Salon light', f: 0, br: 0, cm: 'brightness', scm: ['brightness'] });
  L.setEntity('binary_sensor.door', 'on', { name: 'Back door', dc: 'door' });
  L.setEntity('sensor.co2', '1240', { name: 'CO2', unit: 'ppm', dc: 'carbon_dioxide' });
  L.setEntity('vacuum.robot', 'docked', { name: 'Robot' });
  B = await liveBrowser(L, { viewport: { width: 1400, height: 1000 } }); const page = B.page;
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const svc = () => L.haCalls.filter((x) => /\/api\/services\//.test(x.url)).length;
  const n0 = svc();
  const cfg = { name: 'Live activity', entries: [
    { id: 'a1', entity: 'climate.stove' }, { id: 'a2', entity: 'light.kitchen', color: 'light-warm' }, { id: 'a3', entity: 'light.hall' }, { id: 'a4', entity: 'light.salon', color: 'info' },
    { id: 'a5', entity: 'binary_sensor.door', color: 'danger', badge: 'Alert' }, { id: 'a6', entity: 'sensor.co2', label: 'CO₂ high', when: 'above', limit: 1000 }, { id: 'a7', entity: 'vacuum.robot', when: 'state', is: 'cleaning, returning' }],
    types: [{ id: 't1', domain: 'light', color: 'warning', badge: 'Lights' }], style: { color: 'accent' } };
  await E((c) => { const m = window.editor.getModel(); m.pages[0].items.push({ id: 'act', type: 'activity', parent: null, config: c, layout: { desktop: { x: 1, y: 40, w: 4, h: 9 }, tablet: { x: 1, y: 40, w: 4, h: 9 }, mobile: { w: 4, h: 9 } } },
    { id: 'demoact', type: 'activity', parent: null, config: { name: 'Demo activity' }, layout: { desktop: { x: 5, y: 40, w: 4, h: 9 }, tablet: { x: 5, y: 40, w: 4, h: 9 }, mobile: { w: 4, h: 9 } } }); const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join('; ')); }, cfg);
  await page.waitForFunction(() => document.querySelectorAll('[data-grid-id="act"] .iq-act__entry').length >= 4, null, { timeout: 15000 }).catch(() => {});
  await wait(800);
  const read = () => E(() => { const r = document.querySelector('[data-grid-id="act"] .iq-act'); return { count: r.querySelector('.iq-act__count').textContent, rows: [...r.querySelectorAll('.iq-act__entry')].map((e) => ({ t: e.querySelector('.iq-act__title').textContent, s: e.querySelector('.iq-act__status').textContent,
    c: e.style.getPropertyValue('--iq-act-c'), b: e.querySelector('.iq-act__badge')?.textContent || '', active: e.dataset.active })) }; });
  await (await page.$('[data-grid-id="act"]')).scrollIntoViewIfNeeded();
  let a = await read();
  if (SHOTS) await (await page.$('[data-grid-id="act"]')).screenshot({ path: path.join(SHOTS, 'c2-activity.png') });
  const t = (name) => a.rows.find((r) => r.t === name);
  check('ACTIVE ONLY: the heating stove, the two lights on, the open door and CO₂ above 1000 — not the light that is off, not the docked robot ("cleaning, returning" only); "5 active"',
    JSON.stringify(a.rows.map((r) => r.t)) === JSON.stringify(['Pellet stove', 'Kitchen light', 'Hall light', 'Back door', 'CO₂ high']) && /5 active/i.test(a.count), JSON.stringify(a));
  check('HOME ASSISTANT\'S WORDS: each card says what Home Assistant reports (nothing invented)', t('Back door').s === 'Open' && /^1[,.\u202f\u00a0]?240 ppm$/.test(t('CO₂ high').s) && t('Pellet stove').s === 'Heat', JSON.stringify(a.rows.map((r) => [r.t, r.s])));
  check('LOOK PRECEDENCE: the kitchen light its OWN colour (light-warm) over its type\'s (warning); the hall light its TYPE\'s (warning + "Lights" badge); the stove the widget DEFAULT (accent); the door its own colour and badge',
    t('Kitchen light').c === 'var(--light-warm)' && t('Kitchen light').b === 'Lights' && t('Hall light').c === 'var(--warning)' && t('Hall light').b === 'Lights' && t('Pellet stove').c === 'var(--accent)' && t('Back door').c === 'var(--danger)' && t('Back door').b === 'Alert', JSON.stringify(a.rows));
  // live: the kitchen light goes off, the robot starts cleaning
  L.setEntity('light.kitchen', 'off'); L.setEntity('vacuum.robot', 'cleaning');
  await page.waitForFunction(() => { const r = [...document.querySelectorAll('[data-grid-id="act"] .iq-act__title')].map((x) => x.textContent); return !r.includes('Kitchen light') && r.includes('Robot'); }, null, { timeout: 20000 }).catch(() => {});
  a = await read();
  check('LIVE: the kitchen light switched off leaves; the robot that started cleaning arrives — from Home Assistant\'s states, with no reload', !t('Kitchen light') && !!t('Robot') && /5 active/i.test(a.count), JSON.stringify(a.rows.map((r) => r.t)));
  // a tap: Entity Details, no service call
  await page.click('[data-grid-id="act"] .iq-act__entry:first-child .iq-act__btn'); await wait(700);
  const det = await E(() => window.editor.details().current);
  check('A TAP opens Entity Details for that entity — and nothing is sent to Home Assistant', !!det && svc() === n0, JSON.stringify({ det, calls: svc() - n0 }));
  await E(() => window.editor.closeDetails && window.editor.closeDetails()); await wait(300);
  // demo without entities: labelled Demo
  const demo = await E(() => { const g = document.querySelector('[data-grid-id="demoact"]'); return { rows: g.querySelectorAll('.iq-act__entry').length, demoTag: /demo/i.test(g.textContent) }; });
  check('NO ENTITIES: sample cards, labelled Demo (never presented as Home Assistant data)', demo.rows === 3 && demo.demoTag, JSON.stringify(demo));
  // show all + its configuration dialog (the shared editor)
  await E(() => { const m = window.editor.getModel(); const it = m.pages[0].items.find((i) => i.id === 'act'); it.config.show = 'all'; window.editor.setModel(m); }); await wait(900);
  a = await read();
  check('SHOW ALL: inactive entities too, dimmed (the light that is off keeps its own colour, marked inactive)', a.rows.some((r) => r.t === 'Salon light' && r.active === 'false' && r.c === 'var(--info)'), JSON.stringify(a.rows.map((r) => [r.t, r.active])));
  await E(() => window.editor.setEditing(true)); await wait(300);
  await page.click('.ed-canvas [data-grid-id="act"]', { position: { x: 12, y: 12 }, force: true }); await wait(200);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector('dialog[open] .ef'); await wait(800);
  const dlg = await E(() => { const d = document.querySelector('dialog[open]'); return { groups: [...d.querySelectorAll('details.ef-group--acc')].map((x) => x.dataset.group), rows: d.querySelectorAll('[data-col="entries"] .ef-col__row').length, types: d.querySelectorAll('[data-col="types"] .ef-col__row').length, pv: d.querySelectorAll('.ecfg-pv .iq-act__entry').length }; });
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'c2-configure.png') });
  check('CONFIGURE (the shared widget editor): Content · Entities · Look per type · Appearance · Visibility; the 7 entities and the light type as rows; the Live preview shows the cards', JSON.stringify(dlg.groups) === JSON.stringify(['identity', 'data', 'types', 'appearance', 'visibility']) && dlg.rows === 7 && dlg.types === 1 && dlg.pv >= 5, JSON.stringify(dlg));
  await page.click('dialog[open] .ecfg-foot button:has-text("Cancel")'); await wait(300);
  check('SAVE (the server accepts the new widget)', await E(() => window.editor.save()));
  check('no Home Assistant service call at all', svc() === n0, String(svc() - n0));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
