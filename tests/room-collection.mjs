/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// CONFIG COLLECTION editor (field type 'collection') through Room / Scene: Information and Scenes as compact rows, one item editor at a
// a time (Add / Edit / Save / Cancel / Remove, a draft), ⋮ Move up / Move down / Remove, the area-aware picker and the HA values inspector
// inside the item editor, validation styling, keyboard / focus. Real PHP server + FAKE Home Assistant.
import { live, liveBrowser, RAW, AREAS } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const ID = 'custom.room-scene';
// the shared MDI icon picker: open, search, choose
const pickIcon = async (ed, n) => { await ed.locator('[data-k=icon-field]').click(); await ed.locator('.iqi__search').fill(n); await ed.locator(`.iqi__opt[data-icon="mdi:${n}"]`).click(); };
const iconOf = (ed) => ed.locator('.ef-field[data-key="icon"] .iqi__name').textContent();
const arr = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map((k) => v[k]) : []);
let L, B;
try {
  L = await live();
  Object.assign(AREAS, { salon: 'Salon' });
  L.setEntity('sensor.salon_temp', '24', { name: 'Salon Temperature', unit: '°C', dc: 'temperature', deviceArea: 'salon' });
  L.setEntity('sensor.salon_hum', '58', { name: 'Salon Humidity', unit: '%', dc: 'humidity', area: 'salon' });
  L.setEntity('sensor.power', '428', { name: 'Salon Power', unit: 'W', dc: 'power', area: 'salon' });
  L.setEntity('sensor.outside', '8.2', { name: 'Outside', unit: '°C', dc: 'temperature' });
  L.setEntity('light.salon', 'on', { name: 'Salon Light', f: 0, area: 'salon' });
  L.setEntity('scene.salon_relax', 'unknown', { name: 'Salon Relax', area: 'salon' });
  L.setEntity('scene.salon_movie', 'unknown', { name: 'Salon Movie', area: 'salon' });
  L.setEntity('scene.global', 'unknown', { name: 'Goodnight' });
  RAW['sensor.salon_hum'] = { entity_id: 'sensor.salon_hum', state: '58', attributes: { unit_of_measurement: '%', device_class: 'humidity', friendly_name: 'Salon Humidity' } };
  B = await liveBrowser(L); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);

  const SAVED = { name: 'Salon', area: 'salon', haRoles: { lights: ['light.salon'] },
    info: [{ id: 'i1', entity: 'sensor.salon_temp', value: 'state', label: 'Temperature', icon: 'thermo', color: 'accent-hot' }, { id: 'i2', entity: 'sensor.salon_hum', value: 'state', label: 'Humidity', icon: 'drop', color: 'info' }],
    scenes: [{ label: 'Relax', icon: 'bulb' }, { label: 'Movie', icon: 'movie' }], haSlots: { scenes: ['scene.salon_relax', 'scene.salon_movie'] } };
  await E(({ id, c }) => { const f = window.MaisonForm.create({ type: id, config: c }); f.el.id = 'cf'; document.body.prepend(f.el); window.__cf = f; f.el.querySelectorAll('details.ef-group').forEach((d) => { d.open = true; }); }, { id: ID, c: SAVED });
  const val = () => E(() => window.__cf.value());
  const col = (k) => `#cf [data-col="${k}"]`;
  const rows = (k) => E((s) => [...document.querySelectorAll(`${s} .ef-col__row`)].map((r) => ({ t: r.querySelector('.ef-col__t').textContent, s: r.querySelector('.ef-col__s')?.textContent || '', v: r.querySelector('[data-k=col-value]')?.textContent || '', ic: !!r.querySelector('.ef-col__ic svg'), color: r.querySelector('.ef-col__ic').style.color, h: r.getBoundingClientRect().height })), col(k));
  const editor = () => page.locator('#cf [data-k=item-editor]');
  const isOpen = () => E(() => !!document.querySelector('#cf [data-k=item-editor]'));

  // ---- 1 / 2 / 15 / 19: compact rows
  await page.waitForFunction(() => /24/.test(document.querySelector('#cf [data-col="info"] [data-k=col-value]')?.textContent || ''), null, { timeout: 15000 });
  let ri = await rows('info');
  check('1 saved Information appears as compact rows (icon in its colour, label, entity)', ri.length === 2 && ri[0].t === 'Temperature' && ri[0].s === 'sensor.salon_temp' && ri[0].ic && ri[0].color === 'var(--accent-hot)' && ri[1].t === 'Humidity', JSON.stringify(ri));
  check('15 the row shows the value now (HA\'s value and unit)', /^24 ?°C$/.test(ri[0].v) && /^58 ?%$/.test(ri[1].v), JSON.stringify(ri.map((x) => x.v)));
  check('1 one compact row each (≤ 56 px)', ri.every((x) => x.h <= 56), JSON.stringify(ri.map((x) => x.h)));
  check('2 no field controls in the list (no entity picker, label input, icon or colour palette, inspector)', await E(() => { const c = document.querySelector('#cf [data-col="info"]'); return !c.querySelector('.iqp, input, select, .ef-icons, [data-k=ha-values]'); }));
  const rs = await rows('scenes');
  check('19 saved Scenes appear as compact rows (icon, label, entity)', rs.length === 2 && rs[0].t === 'Relax' && rs[0].s === 'scene.salon_relax' && rs[1].t === 'Movie' && rs.every((x) => x.ic && x.h <= 56), JSON.stringify(rs));
  check('19 no scene field controls in the list', await E(() => !document.querySelector('#cf [data-col="scenes"]').querySelector('.iqp, input, .ef-icons')));

  // ---- 3 / 4: Add → editor; Cancel adds nothing
  await page.click(`${col('info')} [data-k=col-add]`);
  check('3 Add opens the item editor as a compact MODAL over the form (the form stays as it is behind it)', await isOpen() && await E(() => { const d = document.querySelector('#cf [data-k=item-editor]'); return d.tagName === 'DIALOG' && d.matches(':modal') && getComputedStyle(document.querySelector('#cf .ef-group')).display !== 'none' && d.getBoundingClientRect().width <= 650; }) && /^Add information$/.test(await editor().locator('.ef-sub__t').textContent()));
  check('3 the editor holds entity, what to show, label, icon, icon colour and the inspector together', await E(() => { const ed = document.querySelector('#cf [data-k=item-editor]'); return ['entity', 'value', 'label', 'icon', 'color'].every((k) => ed.querySelector(`.ef-field[data-key="${k}"]`)); }));
  check('29 focus moves into the editor', await E(() => document.querySelector('#cf [data-k=item-editor]').contains(document.activeElement)));
  await editor().locator('[data-k=sub-cancel]').click();
  check('4 Cancel Add creates nothing', !(await isOpen()) && arr((await val()).info).length === 2);
  check('29 focus returns to "+ Add information"', await E(() => document.activeElement && document.activeElement.dataset.k === 'col-add' && !!document.activeElement.closest('[data-col="info"]')));
  // ---- 5 / 9 / 10 / 11 / 12 / 13 / 14: Add and Save
  await page.click(`${col('info')} [data-k=col-add]`);
  const ed = editor();
  await ed.locator('[data-k=sub-save]').click();
  check('Save without an entity is refused (a real error, shown on the entity)', await isOpen() && await E(() => document.querySelector('#cf [data-k=item-editor] .ef-field[data-key="entity"]').classList.contains('is-invalid')));
  await ed.locator('[data-k=iqp-choose]').click(); await page.waitForTimeout(300);
  check('10 the entity list opens on the Room\'s area', (await ed.locator('[data-k=iqp-scope]').textContent()) === 'In Salon' && !(await ed.locator('.iqp__item').evaluateAll((l) => l.map((b) => b.dataset.entity))).includes('sensor.outside'));
  await ed.locator('[data-k=iqp-scope-btn]').click(); await page.waitForTimeout(100);
  check('11 Show all entities still reaches the rest', (await ed.locator('.iqp__item').evaluateAll((l) => l.map((b) => b.dataset.entity))).includes('sensor.outside'));
  await ed.locator('[data-k=iqp-scope-btn]').click(); await page.waitForTimeout(100);
  await ed.locator('.iqp__item[data-entity="sensor.power"]').click(); await page.waitForTimeout(200);
  check('9 the entity chosen in the editor, back in the editor (no other surface)', await isOpen() && /sensor\.power/.test(await ed.locator('.ef-field[data-key="entity"] .iqp__cur').textContent()));
  await ed.locator('.ef-field[data-key="label"] input').fill('Power');
  await pickIcon(ed, 'flash');
  await ed.locator('.ef-field[data-key="color"] [data-value="warning"]').click();
  check('13 / 14 icon and colour chosen in the editor', (await iconOf(ed)) === 'mdi:flash' && (await ed.locator('.ef-field[data-key="color"] [data-value="warning"]').getAttribute('aria-checked')) === 'true');
  check('nothing is added before Save', arr((await val()).info).length === 2);
  await ed.locator('[data-k=sub-save]').click(); await page.waitForTimeout(200);
  let info = arr((await val()).info);
  check('5 Save adds exactly one line, with all its settings', !(await isOpen()) && info.length === 3 && JSON.stringify(info[2]) === JSON.stringify({ id: 'i3', entity: 'sensor.power', value: 'state', label: 'Power', icon: 'mdi:flash', color: 'warning' }), JSON.stringify(info));
  check('29 focus lands on the new row\'s Edit', await E(() => document.activeElement && document.activeElement.dataset.k === 'col-edit' && document.activeElement.closest('[data-index]').dataset.index === '2'));
  // ---- 6 / 7 / 8 / 12: Edit — a draft
  await page.click(`${col('info')} [data-index="1"] [data-k=col-edit]`);
  check('6 Edit opens the line\'s values', /^Edit information$/.test(await ed.locator('.ef-sub__t').textContent()) && (await ed.locator('.ef-field[data-key="label"] input').inputValue()) === 'Humidity' && (await iconOf(ed)) === 'mdi:water-percent' && (await ed.locator('.ef-field[data-key="color"] [data-value="info"]').getAttribute('aria-checked')) === 'true');
  await ed.locator('[data-k=ha-values] > summary').click();
  await page.waitForSelector('#cf [data-k=item-editor] [data-k=ha-values] .iq-insp__row[data-attr="device_class"]', { timeout: 8000 });
  check('12 the HA values inspector works in the editor (collapsed until opened)', true);
  await ed.locator('.ef-field[data-key="label"] input').fill('Changed');
  await ed.locator('.ef-field[data-key="color"] [data-value="danger"]').click();
  await page.keyboard.press('Escape');
  check('7 Cancel (Esc) changes nothing — the line is exactly as before', !(await isOpen()) && JSON.stringify(arr((await val()).info)[1]) === JSON.stringify({ ...SAVED.info[1], icon: 'mdi:water-percent' }));
  check('29 Esc closed only the item editor (the form is back), focus on that row\'s Edit', await E(() => !!document.querySelector('#cf .ef-group') && getComputedStyle(document.querySelector('#cf .ef-group')).display !== 'none' && document.activeElement.dataset.k === 'col-edit' && document.activeElement.closest('[data-index]').dataset.index === '1'));
  await page.click(`${col('info')} [data-index="1"] [data-k=col-edit]`);
  await ed.locator('.ef-field[data-key="label"] input').fill('Humidity %');
  await ed.locator('[data-k=sub-save]').click(); await page.waitForTimeout(150);
  check('8 Save applies the edit (and only that)', arr((await val()).info)[1].label === 'Humidity %' && arr((await val()).info)[1].entity === 'sensor.salon_hum' && arr((await val()).info).length === 3);
  // ---- 16 / 17 / 29: ⋮ menu — keyboard
  await page.focus(`${col('info')} [data-index="0"] [data-k=col-menu]`);
  await page.keyboard.press('Enter');
  check('29 ⋮ opens a menu, focus on its first item', await E(() => document.activeElement.getAttribute('role') === 'menuitem' && document.activeElement.dataset.cmd === 'down'));
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  info = arr((await val()).info);
  check('16 Move down from the keyboard reorders (display order = list order)', info.map((x) => x.label).join() === 'Humidity %,Temperature,Power', info.map((x) => x.label).join());
  check('16 the rows follow', (await rows('info')).map((x) => x.t).join() === 'Humidity %,Temperature,Power');
  await page.click(`${col('info')} [data-index="2"] [data-k=col-menu]`);
  check('the last line cannot move down', await E(() => document.querySelector('#cf [data-col="info"] [data-index="2"] [data-cmd="down"]').disabled));
  await page.keyboard.press('Escape');
  check('29 Esc closes the menu, focus back on ⋮ (the dialog stays)', await E(() => document.activeElement.dataset.k === 'col-menu' && document.querySelector('#cf [data-col="info"] [data-index="2"] .ef-col__menu').hidden));
  await page.click(`${col('info')} [data-index="2"] [data-k=col-menu]`); await page.click(`${col('info')} [data-index="2"] [data-cmd="remove"]`); await page.waitForTimeout(100);
  check('17 Remove from the ⋮ menu', arr((await val()).info).map((x) => x.entity).join() === 'sensor.salon_hum,sensor.salon_temp');
  await page.click(`${col('info')} [data-index="0"] [data-k=col-edit]`); await ed.locator('[data-k=sub-remove]').click(); await page.waitForTimeout(100);
  check('17 Remove inside the editor too', !(await isOpen()) && arr((await val()).info).map((x) => x.entity).join() === 'sensor.salon_temp');
  await page.click(`${col('info')} [data-index="0"] [data-k=col-menu]`); await page.click(`${col('info')} [data-index="0"] [data-cmd="remove"]`); await page.waitForTimeout(100);
  check('18 removing the last line leaves only "+ Add information" (no placeholder)', !(await val()).info && await E(() => { const c = document.querySelector('#cf [data-col="info"]'); return !c.querySelector('.ef-col__row') && /\+ Add information/.test(c.textContent); }));

  // ---- SCENES: 20 / 21 / 22 / 23 / 24 / 25 / 26 / 27
  await page.click(`${col('scenes')} [data-k=col-add]`);
  check('20 Add scene opens the scene editor (label, icon, entity)', /^Add scene$/.test(await ed.locator('.ef-sub__t').textContent()) && await E(() => ['label', 'icon', 'entity'].every((k) => document.querySelector(`#cf [data-k=item-editor] .ef-field[data-key="${k}"]`))));
  await ed.locator('[data-k=sub-cancel]').click();
  check('21 Cancel creates nothing', arr((await val()).scenes).length === 2 && !(await isOpen()));
  await page.click(`${col('scenes')} [data-k=col-add]`);
  await ed.locator('[data-k=sub-save]').click();
  check('an empty scene cannot be saved (label, icon or entity needed)', await isOpen() && /label, an icon or an entity/.test(await ed.locator('.ef-sub__err').textContent()));
  await ed.locator('.ef-field[data-key="label"] input').fill('Night');
  await pickIcon(ed, 'weather-night');
  await ed.locator('[data-k=iqp-choose]').click(); await page.waitForTimeout(300);
  check('the scene list opens on Salon\'s scenes', (await ed.locator('[data-k=iqp-scope]').textContent()) === 'In Salon' && (await ed.locator('.iqp__item').evaluateAll((l) => l.map((b) => b.dataset.entity))).join() === 'scene.salon_movie,scene.salon_relax');
  await ed.locator('[data-k=iqp-scope-btn]').click(); await ed.locator('.iqp__item[data-entity="scene.global"]').click(); await page.waitForTimeout(150);
  await ed.locator('[data-k=sub-save]').click(); await page.waitForTimeout(150);
  let v = await val();
  check('22 Save creates one scene: label + icon in scenes, the entity in its action slot (same position)', arr(v.scenes).length === 3 && JSON.stringify(arr(v.scenes)[2]) === '{"label":"Night","icon":"mdi:weather-night"}' && arr(v.haSlots.scenes)[2] === 'scene.global', JSON.stringify(v));
  await page.click(`${col('scenes')} [data-index="0"] [data-k=col-edit]`);
  check('23 Edit shows the scene\'s label, icon and entity', (await ed.locator('.ef-field[data-key="label"] input').inputValue()) === 'Relax' && (await iconOf(ed)) === 'mdi:lightbulb' && /scene\.salon_relax/.test(await ed.locator('.ef-field[data-key="entity"] .iqp__cur').textContent()));
  await ed.locator('[data-k=sub-cancel]').click();
  await page.click(`${col('scenes')} [data-index="0"] [data-k=col-menu]`); await page.click(`${col('scenes')} [data-index="0"] [data-cmd="down"]`); await page.waitForTimeout(100);
  v = await val();
  check('25 / 24 reordering moves label, icon AND its entity together (the secure slot follows)', arr(v.scenes).map((x) => x.label).join() === 'Movie,Relax,Night' && arr(v.haSlots.scenes).join() === 'scene.salon_movie,scene.salon_relax,scene.global', JSON.stringify(v));
  for (let i = 0; i < 3; i++) { await page.click(`${col('scenes')} [data-index="0"] [data-k=col-menu]`); await page.click(`${col('scenes')} [data-index="0"] [data-cmd="remove"]`); await page.waitForTimeout(100); }
  v = await val();
  check('26 / 27 removing every scene leaves zero scenes and no slot mappings', arr(v.scenes).length === 0 && !(v.haSlots && v.haSlots.scenes) && await E(() => !document.querySelector('#cf [data-col="scenes"] .ef-col__row')), JSON.stringify(v));
  check('27 / 18 zero scenes and zero information validate', (await E(() => window.__cf.errors().length)) === 0);

  // ---- 28: optional, untouched fields never look like errors
  await page.click(`${col('scenes')} [data-k=col-add]`);
  const red = await E(() => [...document.querySelectorAll('#cf [data-k=item-editor] input, #cf [data-k=item-editor] select')].filter((x) => /255, 77, 79|rgb\(255, 77, 79\)/.test(getComputedStyle(x).boxShadow)).length);
  check('28 an untouched new item shows no error styling', red === 0 && !(await E(() => !!document.querySelector('#cf [data-k=item-editor] .is-invalid'))));
  await ed.locator('[data-k=sub-cancel]').click();
  check('28 the error rule marks a field\'s own control only (never nested inputs)', await E(() => [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch (e) { return []; } }).some((r) => r.selectorText === '.ef-field.is-invalid > :is(input, select)')));
  await E(() => document.getElementById('cf').remove());

  // ---- 30 / 31 / 32 / 33: stored format, the card, interactions, the light picture
  const c0 = await E(({ id, c }) => window.MaisonRegistry.fullConfig(id, c), { id: ID, c: SAVED });
  check('30 the stored format is unchanged — older icon names read as their MDI icons (thermo → mdi:thermometer …), nothing lost', JSON.stringify(c0.info) === JSON.stringify([{ ...SAVED.info[0], icon: 'mdi:thermometer' }, { ...SAVED.info[1], icon: 'mdi:water-percent' }]) && JSON.stringify(c0.scenes) === JSON.stringify([{ label: 'Relax', icon: 'mdi:lightbulb' }, { label: 'Movie', icon: 'mdi:movie-open' }]) && JSON.stringify(c0.haSlots) === JSON.stringify(SAVED.haSlots));
  check('30 it validates', (await E(({ id, c }) => window.MaisonRegistry.validateConfig(id, c).length, { id: ID, c: SAVED })) === 0, JSON.stringify(await E(({ id, c }) => window.MaisonRegistry.validateConfig(id, c), { id: ID, c: SAVED })));
  check('32 the shared interactions are still offered', await E((id) => ['tap', 'doubleTap', 'longPress'].every((g) => window.MaisonRegistry.TYPES[id].fields.some((f) => f.key === `interactions.${g}.action`)), ID));
  await E(({ id, c }) => { const box = document.createElement('div'); box.id = 'rw'; box.style.cssText = 'position:fixed;left:10px;top:10px;width:900px;height:560px;z-index:99999;display:grid'; box.append(window.MaisonRegistry.build(id, c)); document.body.append(box); }, { id: ID, c: SAVED });
  await page.waitForFunction(() => document.querySelector('#rw .iq-room')?.dataset.lit === 'true', null, { timeout: 15000 });
  check('31 / 33 the card renders its scenes, information and the lit picture as before', await E(() => { const r = document.querySelector('#rw .iq-room'); return r.querySelectorAll('.iq-room__scene').length === 2 && r.querySelectorAll('.iq-room__stat').length === 2; }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
