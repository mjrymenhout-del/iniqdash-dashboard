/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// CONFIGURATOR FOUNDATION through Room / Scene: Home Assistant AREAS (HA's registry: an entity's own area or its device's), the Area field
// as the form's context, the area-first entity picker with "Show all entities", search and the secondary type filter, and the Room's
// configuration structure (Room · Information · Scenes · Interactions · Appearance · Images). Real PHP server + FAKE Home Assistant.
import { live, liveBrowser, RAW, AREAS, FAKE_TOKEN } from './lib/live.mjs';
import { check } from './lib/harness.mjs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ID = 'custom.room-scene';
// the form may hold a list as { 0: …, 1: … } until the dashboard is saved — read both shapes the way the host does
const arr = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map((k) => v[k]) : []);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// 23 (server, pure): the area of an entity is its own, else its device's — never anything else
const php = (code) => execFileSync('php', ['-r', `require '${ROOT}/server/ha/HaClient.php'; require '${ROOT}/server/ha/HaService.php'; ${code}`]).toString();
check('7 server: entity area wins, else the device area, else none', php("echo json_encode([HaService::areaOf('salon', 'kitchen'), HaService::areaOf(null, 'kitchen'), HaService::areaOf(null, null), HaService::areaOf('../x', null)]);") === '["salon","kitchen",null,null]');

let L, B;
try {
  L = await live();
  Object.assign(AREAS, { salon: 'Salon', kitchen: 'Kitchen' });
  L.setEntity('light.salon_main', 'on', { name: 'Main Light', f: 0, area: 'salon' });                 // the entity's own area
  L.setEntity('light.salon_floor', 'off', { name: 'Floor Lamp', f: 0, deviceArea: 'salon' });        // only its DEVICE is in Salon
  L.setEntity('light.kitchen', 'off', { name: 'Kitchen Light', f: 0, area: 'kitchen' });
  L.setEntity('light.loose', 'off', { name: 'Loose Lamp', f: 0 });                                    // no area at all
  L.setEntity('sensor.salon_temp', '21.4', { name: 'Salon Temperature', unit: '°C', dc: 'temperature', deviceArea: 'salon' });
  L.setEntity('binary_sensor.salon_motion', 'off', { name: 'Salon Motion', dc: 'motion', area: 'salon' });
  L.setEntity('sensor.outside', '8.2', { name: 'Outside Temperature', unit: '°C', dc: 'temperature' });
  L.setEntity('scene.salon_relax', 'unknown', { name: 'Salon Relax', area: 'salon' });
  L.setEntity('scene.global', 'unknown', { name: 'Goodnight' });
  RAW['sensor.salon_temp'] = { entity_id: 'sensor.salon_temp', state: '21.4', attributes: { unit_of_measurement: '°C', device_class: 'temperature', friendly_name: 'Salon Temperature' } };
  B = await liveBrowser(L); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);

  // ---- 1 / 6 / 7 / 23: areas and area membership from HA's registry, through the existing discovery
  const me = L.client(); await me.login();
  const raw = await (await me.send('GET', '/api/ha_entities.php?fresh=1')).text();
  const disc = JSON.parse(raw), byId = Object.fromEntries(disc.entities.map((e) => [e.id, e]));
  check('1 the area list comes from HA (id + HA name, by name)', JSON.stringify(disc.areas) === JSON.stringify([{ id: 'kitchen', name: 'Kitchen' }, { id: 'salon', name: 'Salon' }]), JSON.stringify(disc.areas));
  check('6 direct area membership', byId['light.salon_main'].areaId === 'salon' && byId['light.salon_main'].area === 'Salon');
  check('7 device-inherited area membership', byId['light.salon_floor'].areaId === 'salon' && byId['sensor.salon_temp'].areaId === 'salon');
  check('8 an entity without an area has none (no guess from its name)', byId['light.loose'].areaId === null && byId['sensor.outside'].areaId === null);
  check('23 no Home Assistant credential in the discovery answer', !raw.includes(FAKE_TOKEN) && !/token/i.test(raw));
  check('the discovery asks HA for both the entity area and the device area', L.haCalls.some((c) => c.url === '/api/template' && /area_id\(s\.entity_id\)/.test(c.body) && /device_id\(s\.entity_id\)/.test(c.body) && /areas\(\)/.test(c.body)));
  check('the browser layer serves the same areas', JSON.stringify(await E(async () => (await window.IniqHA.areas()).map((a) => a.id))) === '["kitchen","salon"]');

  // ---- the Room form: structure, Area field, context
  await E(({ id }) => { const f = window.MaisonForm.create({ type: id, config: window.MaisonRegistry.fullConfig(id, {}) }); f.el.id = 'af'; document.body.prepend(f.el); window.__af = f; f.el.querySelectorAll('details.ef-group').forEach((d) => { d.open = true; }); }, { id: ID });
  const groups = await E(() => [...document.querySelectorAll('#af .ef-group')].filter((g) => !g.hidden).map((g) => g.querySelector('.ef-acc__t').textContent));
  check('configurator structure: Room · Information · Scenes · Interactions · Appearance · Images · Visibility', groups.join(' · ') === 'Room · Information · Scenes · Interactions · Appearance · Images · Visibility', groups.join(' · '));
  check('Room section: just the name and the Home Assistant Area (no Light 1 / Light 2 …, no fixed sensors)', await E(() => { const g = document.querySelector('#af .ef-group[data-group="identity"]'); const ls = [...g.querySelectorAll('.ef-field:not([hidden]) > .ef-label')].map((l) => l.textContent); return ls.join() === 'Room name,Home Assistant Area'; }), JSON.stringify(await E(() => [...document.querySelectorAll('#af .ef-group[data-group="identity"] .ef-field:not([hidden]) > .ef-label')].map((l) => l.textContent))));
  check('no internal terms in the visible labels (haRoles / haSlots / binding / slot)', await E(() => ![...document.querySelectorAll('#af .ef-label, #af .ef-help, #af .ef-acc__t, #af .ef-acc__hint')].some((l) => /haRoles|haSlots|binding|slot|manifest|registry/i.test(l.textContent))));
  check('19 / 20 zero Information and zero Scenes are a valid Room', (await E(() => window.__af.errors().length)) === 0 && (await E(() => document.querySelectorAll('#af .ef-col__row').length)) === 0);
  check('21 Interactions keep the shared Tap / Double tap / Long press (+ where the card leads)', await E(() => { const g = document.querySelector('#af .ef-group[data-group="interactions"]'); const ls = [...g.querySelectorAll('.ef-label')].map((l) => l.textContent); return ['Tap', 'Double tap', 'Long press', 'Chevron opens'].every((x) => ls.includes(x)); }));
  const areaOpts = await E(() => [...document.querySelector('#af .ef-field--area select').options].map((o) => [o.value, o.textContent]));
  check('2 the Area field lists HA\'s areas by name (and No area)', JSON.stringify(areaOpts) === JSON.stringify([['', 'No area'], ['kitchen', 'Kitchen'], ['salon', 'Salon']]), JSON.stringify(areaOpts));
  await page.selectOption('#af .ef-field--area select', 'salon'); await page.waitForTimeout(100);
  check('2 / 3 the Room stores HA\'s area id', (await E(() => window.__af.value())).area === 'salon');

  const items = (loc) => loc.locator('.iqp__item').evaluateAll((l) => l.map((b) => b.dataset.entity));
  // ---- 5 / 6 / 7 / 8 / 16: the functional light picker opens on Salon
  // ---- 5 / 6 / 7 / 8 / 9 / 10 / 11: the area-first list (here: an Information line's entity, in its item editor)
  await page.click('#af [data-col="info"] [data-k=col-add]');
  const l1 = page.locator('#af [data-k=item-editor] .ef-field[data-key="entity"]');
  await l1.locator('[data-k=iqp-choose]').click(); await page.waitForTimeout(300);
  check('5 the entity list opens on the Room\'s area', (await l1.locator('[data-k=iqp-scope]').textContent()) === 'In Salon');
  let ids = await items(l1);
  check('6 / 7 / 8 Salon only: own area + via its device; not Kitchen, not area-less', ids.includes('light.salon_main') && ids.includes('light.salon_floor') && !ids.includes('light.kitchen') && !ids.includes('light.loose'), ids.join());
  await l1.locator('.iqp__search').fill('floor'); await page.waitForTimeout(100);
  check('10 search stays inside the area', (await items(l1)).join() === 'light.salon_floor');
  await l1.locator('.iqp__search').fill('kitchen'); await page.waitForTimeout(100);
  check('10 a search with nothing in the area says so, with the way out', (await items(l1)).length === 0 && /in Salon/.test(await l1.locator('.iqp__info').textContent()));
  await l1.locator('[data-k=iqp-scope-btn]').click(); await page.waitForTimeout(100);
  check('11 after Show all entities the same search is global', (await items(l1)).join() === 'light.kitchen' && (await l1.locator('[data-k=iqp-scope]').textContent()) === 'All entities');
  await l1.locator('.iqp__search').fill(''); await page.waitForTimeout(100);
  check('9 Show all exposes the area-less light', (await items(l1)).includes('light.loose'));
  await l1.locator('[data-k=iqp-choose]').click(); await l1.locator('[data-k=iqp-choose]').click(); await page.waitForTimeout(200);
  check('the next opening is on Salon again (Show all is per opening, the area stays the Room\'s)', (await l1.locator('[data-k=iqp-scope]').textContent()) === 'In Salon');
  await page.click('#af [data-k=item-editor] [data-k=sub-cancel]');

  // ---- 13 / 14 / 12 / 18: Information (its item editor: tests/room-collection.mjs)
  const ed = page.locator('#af [data-k=item-editor]'), save = () => ed.locator('[data-k=sub-save]').click();
  await page.click('#af [data-col="info"] [data-k=col-add]');
  const row = ed.locator('.ef-field[data-key="entity"]');
  await row.locator('[data-k=iqp-choose]').click(); await page.waitForTimeout(300);
  ids = await items(row);
  check('13 Add information: its picker opens on Salon (sensor via device, motion, scene, lights)', (await row.locator('[data-k=iqp-scope]').textContent()) === 'In Salon' && ids.includes('sensor.salon_temp') && ids.includes('binary_sensor.salon_motion') && !ids.includes('sensor.outside'), ids.join());
  check('12 the type filter is secondary: a "Filter by type" link, chips hidden', !(await row.locator('[data-k=iqp-filter]').evaluate((b) => b.hidden)) && await row.locator('.iqp__chips').evaluate((c) => c.hidden));
  await row.locator('[data-k=iqp-filter]').click();
  await row.locator('.iqp__chip[data-domain="sensor"]').click(); await page.waitForTimeout(100);
  check('12 the type filter still narrows (within the area)', (await items(row)).join() === 'sensor.salon_temp');
  await row.locator('.iqp__item[data-entity="sensor.salon_temp"]').click(); await page.waitForTimeout(200);
  await row.locator('[data-k=ha-values] > summary').click();
  await page.waitForSelector('#af [data-k=item-editor] [data-k=ha-values] .iq-insp__row[data-attr="device_class"]', { timeout: 8000 });
  check('18 the HA values inspector still works on the line\'s entity', true);
  await save(); await page.waitForTimeout(150);
  await page.click('#af [data-col="info"] [data-k=col-add]');
  await row.locator('[data-k=iqp-choose]').click(); await page.waitForTimeout(300);
  await row.locator('[data-k=iqp-scope-btn]').click(); await row.locator('.iqp__search').fill('outside'); await page.waitForTimeout(100);
  await row.locator('.iqp__item[data-entity="sensor.outside"]').click(); await page.waitForTimeout(150);
  await save(); await page.waitForTimeout(150);
  check('14 Information can use an entity outside the area', arr((await E(() => window.__af.value())).info).map((x) => x.entity).join() === 'sensor.salon_temp,sensor.outside');

  // ---- 15: scenes (the scene editor: area-aware picker, area-less scenes reachable)
  await page.click('#af [data-col="scenes"] [data-k=col-add]');
  check('the scene editor holds label, icon and entity together', await E(() => ['label', 'icon', 'entity'].every((k) => document.querySelector(`#af [data-k=item-editor] .ef-field[data-key="${k}"]`))));
  const sc = ed.locator('.ef-field[data-key="entity"]');
  await sc.locator('[data-k=iqp-choose]').click(); await page.waitForTimeout(300);
  check('15 the scene picker opens on Salon\'s scenes', (await items(sc)).join() === 'scene.salon_relax');
  await sc.locator('[data-k=iqp-scope-btn]').click(); await page.waitForTimeout(100);
  check('15 an area-less scene is reachable through Show all', (await items(sc)).includes('scene.global'));
  await sc.locator('.iqp__item[data-entity="scene.global"]').click(); await page.waitForTimeout(150);
  await save(); await page.waitForTimeout(150);
  let v = await E(() => window.__af.value());
  check('15 the scene action is stored as before', arr(v.haSlots.scenes)[0] === 'scene.global' && arr(v.scenes).length === 1, JSON.stringify(v));
  check('the configured Room validates', (await E(() => window.__af.errors().length)) === 0, JSON.stringify(await E(() => window.__af.errors())));
  // a field with nothing suitable in the area opens on everything (and says so)
  await page.selectOption('#af .ef-field--area select', 'kitchen'); await page.waitForTimeout(100);
  await page.click('#af [data-col="scenes"] [data-index="0"] [data-k=col-edit]');
  await sc.locator('[data-k=iqp-choose]').click(); await page.waitForTimeout(300);
  check('no scene in Kitchen → all entities, said plainly', /Nothing suitable in Kitchen/.test(await sc.locator('[data-k=iqp-scope]').textContent()) && (await items(sc)).includes('scene.global'));
  await ed.locator('[data-k=sub-cancel]').click();
  // no area: the pickers behave exactly as before (no scope bar)
  await page.selectOption('#af .ef-field--area select', ''); await page.waitForTimeout(100);
  check('4 no area: no area context, the stored area is gone', (await E(() => window.__af.value())).area === undefined);
  await page.click('#af [data-col="scenes"] [data-index="0"] [data-k=col-edit]');
  await sc.locator('[data-k=iqp-choose]').click(); await page.waitForTimeout(300);
  check('4 without an area the list is the full list, as before', await sc.locator('.iqp__scope').evaluate((x) => x.hidden) && (await items(sc)).includes('scene.salon_relax') && (await items(sc)).includes('scene.global'));
  await E(() => document.getElementById('af').remove());

  // ---- 22 / 24: saved configurations; the card does not depend on the area
  const OLD = { name: 'Lounge', haRoles: { lights: ['light.salon_main'] }, scenes: [{ label: 'Relax', icon: 'bulb' }], haSlots: { scenes: ['scene.salon_relax'] },
    info: [{ id: 'i1', entity: 'sensor.salon_temp', value: 'state', label: 'Temp', icon: 'thermo', color: 'accent-hot' }], interactions: { tap: { action: 'navigate', page: 'p' } } };
  const c0 = await E(({ id, c }) => window.MaisonRegistry.fullConfig(id, c), { id: ID, c: OLD });
  check('22 a saved Room (no area) keeps name, lights, information, scenes and interactions', c0.name === 'Lounge' && c0.haRoles.lights[0] === 'light.salon_main' && c0.scenes[0].label === 'Relax' && c0.haSlots.scenes[0] === 'scene.salon_relax'
    && c0.info[0].label === 'Temp' && c0.interactions.tap.page === 'p' && c0.area === undefined, JSON.stringify(c0));
  check('22 it validates without an area', (await E(({ id, c }) => window.MaisonRegistry.validateConfig(id, c).length, { id: ID, c: { ...OLD, interactions: undefined } })) === 0);
  check('3 an area survives normalising and validates', (await E(({ id, c }) => { const R = window.MaisonRegistry; return R.fullConfig(id, c).area === 'salon' && R.validateConfig(id, c).length === 0; }, { id: ID, c: { ...OLD, interactions: undefined, area: 'salon' } })));
  check('a malformed area id is dropped', (await E(({ id }) => window.MaisonRegistry.fullConfig(id, { name: 'X', area: '<b>' }).area, { id: ID })) === undefined);
  const html = await E(({ id, c }) => {
    const strip = (el) => el.outerHTML.replace(/ data-fit-[a-z-]+="[^"]*"/g, '');
    const a = window.MaisonRegistry.build(id, c), b = window.MaisonRegistry.build(id, { ...c, area: 'salon' });
    return [strip(a.querySelector('.iq-room') || a), strip(b.querySelector('.iq-room') || b)];
  }, { id: ID, c: OLD });
  check('24 the card is the same with or without an area (configuration context only)', html[0] === html[1]);
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
