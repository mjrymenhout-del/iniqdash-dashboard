/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// CALENDAR WITH SEVERAL CALENDARS (real server, the SIMULATED home):
//   1  three calendars in one card: events merged by time, each in its calendar's colour; the legend names them
//   2  a calendar that does not exist is reported on its own chip — the others still show
//   3  a tap on a legend chip hides / shows that calendar's events (this screen only)
//   4  views: list, day, week (overlapping events side by side), month; ‹ › move the dates and Today comes back
//   5  a calendar saved with ONE entity (before this update) still works: it becomes the first of the list
//   6  a tap on an event opens its details; Escape closes them
//   7  the configuration: adding calendars in the editor, saved, reloaded
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const lay = (y, w = 6, h = 7) => ({ desktop: { x: 1, y, w, h }, tablet: { x: 1, y, w: 8, h }, mobile: { w: 4, h } });
const cals = [{ id: 'k1', entity: 'calendar.family', color: '#e8697d' }, { id: 'k2', entity: 'calendar.waste_collection', label: 'Bins' }, { id: 'k3', entity: 'calendar.demo_household' }];
const dash = { version: 3, app: { id: 'c', startPage: 'p', navigation: {}, simulated: true }, pages: [{ id: 'p', name: 'P', nav: true, items: [
  { id: 'multi', type: 'calendar', config: { name: 'Everything', calendars: cals }, layout: lay(1) },
  { id: 'broken', type: 'calendar', config: { name: 'With a missing one', calendars: [cals[0], { id: 'k9', entity: 'calendar.does_not_exist' }] }, layout: lay(9) },
  { id: 'old', type: 'calendar', config: { name: 'Old single', entity: 'calendar.family' }, layout: lay(17, 4, 5) },
  { id: 'week', type: 'calendar', config: { name: 'Week', view: 'week', dayStart: 5, dayEnd: 21, calendars: cals }, layout: lay(23, 12, 9) },
  { id: 'month', type: 'calendar', config: { name: 'Month', view: 'month', calendars: cals }, layout: lay(33, 8, 9) },
  { id: 'list', type: 'calendar', config: { name: 'List', view: 'list', days: 10, calendars: cals }, layout: lay(43, 6, 9) }] }] };

let L, B;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const id = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Calendars', dashboard: dash })).json()).entry.id;
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${L.base}/?d=${id}`); await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 });
  await p.waitForFunction(() => (document.querySelector('[data-grid-id="multi"] .ca')?.calendar?.getState().shown || 0) >= 6, null, { timeout: 20000 }).catch(() => {});
  await wait(800);
  const st = (k) => E((k) => document.querySelector(`[data-grid-id="${k}"] .ca`).calendar.getState(), k);

  // ---- 1
  const m = await st('multi');
  const chips = await E(() => [...document.querySelectorAll('[data-grid-id="multi"] .ca__chip')].map((b) => [b.textContent, b.style.getPropertyValue('--c')]));
  const heroC = await E(() => getComputedStyle(document.querySelector('[data-grid-id="multi"] .ca__next')).getPropertyValue('--c'));
  check('1 · three calendars in one card: their events merged (≥ 6), three named chips, the Family calendar in its own colour, "Bins" renamed',
    m.sources.length === 3 && m.shown >= 6 && chips.length === 3 && chips[0][1] === '#e8697d' && chips.some(([t]) => t === 'Bins') && !!heroC, JSON.stringify({ m, chips, heroC }));
  // ---- 2
  const b = await st('broken');
  const bchips = await E(() => [...document.querySelectorAll('[data-grid-id="broken"] .ca__chip')].map((x) => [x.textContent, x.dataset.ok]));
  check('2 · a calendar that does not exist is reported on its own chip; the other calendar still shows its events', b.available && b.shown >= 2 && bchips.some(([t, ok]) => ok === 'false' && /not found/.test(t)) && bchips.some(([, ok]) => ok === 'true'), JSON.stringify({ b, bchips }));
  // ---- 3
  const before = (await st('multi')).shown;
  await p.click('[data-grid-id="multi"] .ca__chip[data-src="k2"]'); await wait(300);
  const hid = await st('multi');
  await p.click('[data-grid-id="multi"] .ca__chip[data-src="k2"]'); await wait(300);
  const back = await st('multi');
  check('3 · a tap on a calendar\'s chip hides its events (aria-pressed false), a second tap shows them again', hid.shown < before && hid.sources.find((x) => x.key === 'k2').hidden && back.shown === before, JSON.stringify({ before, hid: hid.shown, back: back.shown }));
  // ---- 4
  const w = await E(() => { const r = document.querySelector('[data-grid-id="week"]'); return { cols: r.querySelectorAll('.ca__tg-col').length, blocks: [...r.querySelectorAll('.ca__blk')].map((x) => [x.querySelector('b').textContent, x.style.left, x.style.width]), allday: r.querySelectorAll('.ca__tg-ad .ca__chipev').length, today: !!r.querySelector('.ca__tg-col[data-today="true"]') }; });
  const mo = await E(() => { const r = document.querySelector('[data-grid-id="month"]'); return { cells: r.querySelectorAll('.ca__mo-c').length, evs: r.querySelectorAll('.ca__mo-ev').length, today: !!r.querySelector('.ca__mo-c[data-today="true"]') }; });
  const li = await E(() => { const r = document.querySelector('[data-grid-id="list"]'); return { days: r.querySelectorAll('.ca__day').length, rows: r.querySelectorAll('.ca__lrow').length }; });
  const label0 = await E(() => document.querySelector('[data-grid-id="month"] .ca__cal-day').textContent);
  await p.click('[data-grid-id="month"] .ca__navb[data-go="1"]'); await wait(400);
  const label1 = await E(() => document.querySelector('[data-grid-id="month"] .ca__cal-day').textContent);
  const ms1 = await st('month');
  await p.click('[data-grid-id="month"] .ca__today'); await wait(400);
  const label2 = await E(() => document.querySelector('[data-grid-id="month"] .ca__cal-day').textContent);
  check('4 · views: a week grid of 7 days with timed blocks and all-day chips; a 42-day month with events and today marked; a list grouped by days; › moves to the next month, Today returns',
    w.cols === 7 && w.blocks.length >= 1 && w.allday >= 1 && w.today && mo.cells === 42 && mo.evs >= 3 && mo.today && li.days >= 2 && li.rows >= 4 && label1 !== label0 && ms1.anchor && label2 === label0,
    JSON.stringify({ w, mo, li, label0, label1, label2 }));
  // overlapping events share the width (the widget's own lane function)
  const lanes = await E(() => window.MaisonCalendar.lanes([{ s: 0, f: 60 }, { s: 30, f: 90 }, { s: 100, f: 120 }]).map((x) => [x.lane, x.lanes]));
  check('4b · overlapping events sit side by side (two lanes), a later one gets the full width', JSON.stringify(lanes) === '[[0,2],[1,2],[0,1]]', JSON.stringify(lanes));
  // ---- 5
  const o = await st('old');
  const oldCfg = await E(() => window.editor.getModel().pages[0].items.find((i) => i.id === 'old').config);
  check('5 · a calendar saved with one entity still shows its events (it became the first calendar of the list)', o.sources.length === 1 && o.shown >= 1 && Array.isArray(oldCfg.calendars) && oldCfg.calendars[0].entity === 'calendar.family' && !oldCfg.entity, JSON.stringify({ o, oldCfg }));
  // ---- 6
  await p.click('[data-grid-id="multi"] .ca__hero'); await wait(300);
  const d = await E(() => { const x = document.querySelector('[data-grid-id="multi"] .ca__detail'); return { open: !x.hidden, title: x.querySelector('.ca__d-title').textContent, when: x.querySelector('.ca__d-when').textContent, focus: document.activeElement?.className }; });
  await p.keyboard.press('Escape'); await wait(200);
  const closed = await E(() => document.querySelector('[data-grid-id="multi"] .ca__detail').hidden);
  check('6 · a tap on an event opens its details in the card (title, when, focus on Close); Escape closes them', d.open && d.title && d.when && /ca__close/.test(d.focus) && closed, JSON.stringify({ d, closed }));
  // ---- 7 · editor: add a calendar to a new widget through the configuration
  await p.goto(`${L.base}/editor.html?d=${id}`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(800);
  const ok7 = await E(() => {
    const md = window.editor.getModel();
    md.pages[0].items.find((i) => i.id === 'old').config.calendars.push({ id: 'k2', entity: 'calendar.waste_collection', color: 'success', hidden: true });
    const r = window.editor.setModel(md); return r.ok;
  });
  const saved = await E(() => window.editor.save());
  await p.reload(); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(600);
  const cfg7 = await E(() => window.editor.getModel().pages[0].items.find((i) => i.id === 'old').config.calendars);
  const v = await E(() => window.MaisonModel.validate({ version: 3, app: { id: 'x', startPage: 'p', navigation: {} }, pages: [{ id: 'p', name: 'P', nav: true, items: [{ id: 'w', type: 'calendar', layout: { desktop: { x: 1, y: 1, w: 4, h: 4 } }, config: { name: 'X', calendars: [{ id: 'a', entity: 'calendar.x', color: 'red; background:url(x)', label: '  Hi  ' }], view: 'year', days: 900 } }] }] }, window.MaisonRegistry));
  const markup = await E(() => !window.MaisonModel.validate({ version: 3, app: { id: 'x', startPage: 'p', navigation: {} }, pages: [{ id: 'p', name: 'P', nav: true, items: [{ id: 'w', type: 'calendar', layout: { desktop: { x: 1, y: 1, w: 4, h: 4 } }, config: { name: 'X', calendars: [{ id: 'a', entity: 'calendar.x', label: '<b>Hi</b>' }] } }] }] }, window.MaisonRegistry).ok);
  const vc = v.ok ? v.model.pages[0].items[0].config : { errors: v.errors };
  check('7 · two calendars saved and reloaded (colour and "hidden at first" kept); unsafe colours and out-of-range options are dropped; markup in a name is refused',
    ok7 && saved && cfg7.length === 2 && cfg7[1].color === 'success' && cfg7[1].hidden === true && vc && vc.calendars && !vc.calendars[0].color && vc.calendars[0].label === 'Hi' && markup && !vc.view && !vc.days,
    JSON.stringify({ ok7, saved, cfg7, vc }));
  // ---- 8 · the server's date window (simulated home: X-IniqDash-Simulated)
  const q = (u) => E(async (u) => (await fetch(u, { headers: { 'X-IniqDash-Simulated': '1' } })).json(), u);
  const today = new Date().toISOString().slice(0, 10);
  const okW = await q(`api/ha_calendar.php?entity=calendar.family&from=${today}&days=42`);
  const bad1 = await q('api/ha_calendar.php?entity=calendar.family&from=2026-13-40&days=7');
  const bad2 = await q(`api/ha_calendar.php?entity=calendar.family&from=${today}&days=400`);
  const bad3 = await q('api/ha_calendar.php?entity=calendar.family&from=1999-01-01&days=7');
  check('8 · the server accepts a 42-day window and refuses an impossible date, more than 62 days and a window years away', okW.ok && okW.days === 42 && [bad1, bad2, bad3].every((x) => !x.ok && x.error === 'bad_range'), JSON.stringify({ okW: [okW.ok, okW.days], bad: [bad1.error, bad2.error, bad3.error] }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('calendar-multi test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
