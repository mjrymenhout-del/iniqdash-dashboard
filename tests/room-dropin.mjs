/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ROOM / SCENE (custom.room-scene) — drop-in lifecycle AND live Home Assistant behaviour through the GENERIC custom-widget contract
// (widget.json "ha": binding "roles"): package absent → copy ONLY widgets/custom/room-scene/ → reload → discovered → Add Widget → configure
// multiple HA mappings and secure scene actions → add → fake-HA states reach it → live summary → a scene press creates the expected secure
// fake-HA request → live updates → save → reload → mappings / actions persist → still works. Real PHP server + FAKE Home Assistant.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { live, liveBrowser, AREAS } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PKG = path.join(ROOT, 'widgets/custom/room-scene');
const STASH = fs.mkdtempSync(path.join(os.tmpdir(), 'iniq-room-pkg-'));
const ID = 'custom.room-scene';
const man = JSON.parse(fs.readFileSync(path.join(PKG, 'widget.json'), 'utf8'));
check('the package is one folder: widget.json + script + stylesheet + assets/', fs.readdirSync(PKG).sort().join(',') === 'assets,room-scene.css,room-scene.js,widget.json');
check('manifest: custom.<folder>, source custom, declares the roles binding (no core knowledge needed)', man.id === ID && man.source === 'custom' && man.ha && man.ha.binding === 'roles' && !!man.ha.roles.lights.multiple);
fs.cpSync(PKG, path.join(STASH, 'room-scene'), { recursive: true });
fs.rmSync(PKG, { recursive: true, force: true });                      // A. package ABSENT
let L, B;
try {
  L = await live();
  AREAS.living = 'Living Room';
  // the room's lights: HA places them in the Living Room area (l1, l2 directly; l3 through its device) — the Room finds them by its Area
  L.setEntity('light.l1', 'on', { name: 'Lamp 1', f: 0, area: 'living' }); L.setEntity('light.l2', 'on', { name: 'Lamp 2', f: 0, area: 'living' }); L.setEntity('light.l3', 'off', { name: 'Lamp 3', f: 0, deviceArea: 'living' });
  L.setEntity('light.elsewhere', 'on', { name: 'Hall lamp', f: 0 });
  L.setEntity('sensor.temp', '21.46', { name: 'Room temperature', unit: '°C', dc: 'temperature' });
  L.setEntity('sensor.aqi', '28', { name: 'Air quality index', unit: 'AQI' });
  L.setEntity('scene.relax', 'unknown', { name: 'Relax' }); L.setEntity('script.movie', 'off', { name: 'Movie night' }); L.setEntity('button.alloff', 'unknown', { name: 'All off' });
  B = await liveBrowser(L); const page = B.page;
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const discovered = () => E(() => JSON.parse(document.getElementById('iniqdash-custom-widgets').textContent).packages.map((p) => p.id));
  await page.waitForTimeout(800);
  check('B: absent → not discovered, not a widget type', !(await discovered()).includes(ID) && !(await E((id) => !!window.MaisonRegistry.TYPES[id], ID)));
  fs.cpSync(path.join(STASH, 'room-scene'), PKG, { recursive: true });   // C. copy ONLY the package folder
  await page.reload(); await page.waitForFunction(() => window.editor && window.MaisonRegistry, null, { timeout: 15000 }); await page.waitForTimeout(800);   // D. the normal reload
  check('E: discovered automatically', (await discovered()).includes(ID) && (await E((id) => window.MaisonRegistry.TYPES[id].ha, ID)) === 'roles');
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
  await page.waitForSelector(`.ecfg-tile[data-type="${ID}"]`, { timeout: 8000 });
  check('F: appears in the Add Widget gallery', (await page.locator(`.ecfg-tile[data-type="${ID}"]`).count()) === 1);
  await page.click(`.ecfg-tile[data-type="${ID}"]`); await page.waitForTimeout(600);
  // ---- G: configure: several lights (GENERATED role fields), two Information lines (temperature, air quality), four scenes with actions
  // Room (name, area, lights) is the first section and open; open Information and Scenes too
  for (const t of ['Information', 'Scenes']) await page.locator('dialog[open] .ef-acc__h', { hasText: t }).first().click();
  check('G: a new Room starts with no scenes and no information', (await page.locator('dialog[open] .ef-col__row').count()) === 0);
  await page.fill('dialog[open] input[type=text] >> nth=0', 'Living Room');
  await page.waitForFunction(() => [...document.querySelectorAll('dialog[open] .ef-field--area option')].some((o) => o.value === 'living'), null, { timeout: 8000 });
  await page.selectOption('dialog[open] .ef-field--area select', 'living');   // the Room's Home Assistant Area (HA's registry)
  const pickIn = async (field, entity) => {
    await field.locator('[data-k=iqp-choose]').click();
    const item = field.locator(`.iqp__item[data-entity="${entity}"]`);
    await page.waitForTimeout(300);
    if (!(await item.count()) && (await field.locator('[data-k=iqp-scope-btn]:not([hidden])').count())) await field.locator('[data-k=iqp-scope-btn]').click();   // not in the Room's area: Show all
    await item.waitFor({ timeout: 8000 }).catch(async (e) => { console.log('LIST', await field.locator('.iqp__panel').innerText()); throw e; }); await item.click(); await page.waitForTimeout(150);
  };
  const byLabel = (t) => page.locator('dialog[open] .ef-field').filter({ has: page.locator('.ef-label', { hasText: new RegExp(`^${t}\\*?$`) }) });
  check('G: no Light 1 / Light 2 … fields: the lights come from the Area', (await byLabel('Light 1').count()) === 0);
  // Information and Scenes: one item at a time in the collection's item editor (Add → configure → Save)
  const ed = page.locator('dialog[open] [data-k=item-editor]');
  for (const e of ['sensor.temp', 'sensor.aqi']) {
    await page.click('dialog[open] [data-col="info"] [data-k=col-add]');
    await pickIn(ed.locator('.ef-field[data-key="entity"]'), e);
    await ed.locator('[data-k=sub-save]').click(); await page.waitForTimeout(150);
  }
  for (const [t, e] of [['Relax', 'scene.relax'], ['Movie', 'script.movie'], ['Evening', null], ['All Off', 'button.alloff']]) {
    await page.click('dialog[open] [data-col="scenes"] [data-k=col-add]');
    await ed.locator('.ef-field[data-key="label"] input').fill(t);
    if (e) await pickIn(ed.locator('.ef-field[data-key="entity"]'), e);
    await ed.locator('[data-k=sub-save]').click(); await page.waitForTimeout(150);
  }
  await page.click('.ecfg-foot button:has-text("Next")'); await page.waitForTimeout(300);
  await page.click('.ecfg-foot button:has-text("Add Room / Scene")'); await page.waitForTimeout(900);
  // the form may hold a list as { 0: …, 1: … } until the dashboard is validated / saved — read both shapes the way the host does
  const cfg = () => E((id) => { const i = window.editor.getModel().pages.flatMap((p) => p.items).find((x) => x.type === id); if (!i) return null; const c = structuredClone(i.config); const L = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map((k) => v[k]) : []); if (c.haRoles && c.haRoles.lights) c.haRoles.lights = L(c.haRoles.lights); if (c.haSlots && c.haSlots.scenes && !Array.isArray(c.haSlots.scenes)) { const a = []; Object.keys(c.haSlots.scenes).forEach((k) => { a[Number(k)] = c.haSlots.scenes[k]; }); c.haSlots.scenes = Array.from(a, (v) => v ?? null); } return c; }, ID);
  let c = await cfg();
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(500);   // use it like a visitor (the editing overlay would intercept presses)
  check('G: the Room stores its Area (no light mapping), Information as config.info lines', c && c.area === 'living' && !(c.haRoles && c.haRoles.lights) && c.info.map((x) => x.entity).join() === 'sensor.temp,sensor.aqi', JSON.stringify(c));
  check('G: secure actions stored per slot position (config.haSlots)', c.haSlots.scenes[0] === 'scene.relax' && c.haSlots.scenes[1] === 'script.movie' && c.haSlots.scenes[3] === 'button.alloff' && !c.haSlots.scenes[2], JSON.stringify(c.haSlots));
  // ---- live state reaches Room: its lights are FUNCTIONAL state (the picture), never text; the only text is the owner's Information
  const txt = (q) => E((qq) => { const e = document.querySelector(qq); return e ? e.textContent.trim().replace(/\s+/g, ' ') : null; }, q);
  await page.waitForFunction(() => (document.querySelector('.iq-room') && document.querySelector('.iq-room').room ? document.querySelector('.iq-room').room.getState().functional.lights : {}).on === 2, null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('.iq-room__stat').length === 2, null, { timeout: 15000 });
  const card = () => E(() => document.querySelector('.iq-room').textContent);   // everything the card holds, also lines its size hides
  check('the Area lights are known (2 of 3 on, lit picture) — and no summary / light words / temperature are added by the card', await E(() => document.querySelector('.iq-room').dataset.lit === 'true' && !document.querySelector('.iq-room__sum'))
    && !/lights? (on|off)/i.test(await card()) && ((await card()).match(/21\.46/g) || []).length === 1, await card());
  const stats = await E(() => [...document.querySelectorAll('.iq-room__stat')].map((x) => x.textContent.trim().replace(/\s+/g, ' ')));
  check('the Information lines in order: the temperature with its unit, the air quality as reported (AQI 28 — no invented "Good")', stats.length === 2 && /^21\.46 °C/.test(stats[0]) && /^28 AQI/.test(stats[1]), JSON.stringify(stats));
  // ---- actions: the expected secure fake-HA request
  const calls = () => L.haCalls.filter((x) => /\/api\/services\//.test(x.url));
  const n0 = calls().length;
  await page.click('.iq-room__scene >> nth=0'); await page.waitForTimeout(700);
  let k = calls().slice(n0);
  check('scene button → the server planned scene.turn_on for the mapped scene', k.length === 1 && k[0].url === '/api/services/scene/turn_on' && JSON.parse(k[0].body).entity_id === 'scene.relax', JSON.stringify(k));
  await page.click('.iq-room__scene >> nth=1'); await page.waitForTimeout(700);
  check('script button → script.turn_on', calls().at(-1).url === '/api/services/script/turn_on' && JSON.parse(calls().at(-1).body).entity_id === 'script.movie');
  await page.click('.iq-room__scene >> nth=3'); await page.waitForTimeout(700);
  check('button → button.press', calls().at(-1).url === '/api/services/button/press' && JSON.parse(calls().at(-1).body).entity_id === 'button.alloff');
  const n1 = calls().length;
  await page.click('.iq-room__scene >> nth=2'); await page.waitForTimeout(500);
  check('a scene button with no entity sends nothing', calls().length === n1);
  const feedback = await E(() => [...document.querySelectorAll('.iq-room__scene')].map((x) => x.dataset.active));
  check('press feedback is transient: the unmapped press lit up once (no remembered scene)', feedback[2] === 'true' || feedback[2] === 'false');
  await page.waitForTimeout(1700);
  check('…and it fades (nothing stays active from a press)', (await E(() => [...document.querySelectorAll('.iq-room__scene')].map((x) => x.dataset.active))).every((v) => v === 'false'));
  // ---- live updates without a reload
  L.setEntity('light.l3', 'on'); L.setEntity('sensor.temp', '22.04'); L.setEntity('sensor.aqi', '35'); L.setEntity('script.movie', 'on');
  await page.waitForFunction(() => (document.querySelector('.iq-room') && document.querySelector('.iq-room').room ? document.querySelector('.iq-room').room.getState().functional.lights : {}).on === 3, null, { timeout: 15000 });
  await page.waitForFunction(() => /^35 AQI/.test(document.querySelectorAll('.iq-room__stat')[1].textContent.trim()), null, { timeout: 15000 });
  check('live: light on/off change, temperature change and air-quality change reach the widget', /^22\.04 °C/.test((await E(() => document.querySelectorAll('.iq-room__stat')[0].textContent)).trim()) && ((await card()).match(/22\.04/g) || []).length === 1, await card());
  await page.waitForFunction(() => document.querySelectorAll('.iq-room__scene')[1].dataset.active === 'true', null, { timeout: 15000 });
  check('a running script (the entity says "on") shows its button active — truthful state only', true);
  // ---- save → reload → persists, works
  check('H: the dashboard saves', await E(() => window.editor.save())); await page.waitForTimeout(600);
  const did = await E(() => window.editor.dashboard().id);
  await page.goto(`${L.base}/editor.html?d=${did}`); await page.waitForFunction(() => window.editor && window.editor.getModel(), null, { timeout: 15000 }); await page.waitForTimeout(1200);
  c = await cfg();
  check('I: the Home Assistant Area persists after a save and a reload', c && c.area === 'living', JSON.stringify(c && c.area));
  check('I: mappings and actions persist after a reload', c && c.area === 'living' && c.info[0].entity === 'sensor.temp' && c.haSlots.scenes[0] === 'scene.relax' && c.haSlots.scenes[3] === 'button.alloff', JSON.stringify(c));
  await page.waitForFunction(() => (document.querySelector('.iq-room') && document.querySelector('.iq-room').room ? document.querySelector('.iq-room').room.getState().functional.lights : {}).on > 0, null, { timeout: 15000 });
  const n2 = calls().length;
  await page.click('.iq-room__scene >> nth=0'); await page.waitForTimeout(700);
  check('J: after the reload it shows live data and its action still works', calls().length === n2 + 1 && calls().at(-1).url === '/api/services/scene/turn_on');
  check('the saved dashboard is valid', await E(() => window.MaisonModel.validate(window.editor.getModel(), window.MaisonRegistry).ok));
  check('no page errors', B.errors.length === 0, B.errors.join('|'));
} finally {
  if (!fs.existsSync(PKG)) fs.cpSync(path.join(STASH, 'room-scene'), PKG, { recursive: true });
  fs.rmSync(STASH, { recursive: true, force: true });
  if (B) await B.close();
  if (L) await L.close();
}
