/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ROOM AREA LIGHTS + the collection item editor's dialog shell. The Room's functional lights are EVERY light Home Assistant places in its
// Area (own or device area — the generic area role, "area": true), with an older Room's own light mapping as the fallback without an Area.
// The item editor (Add / Edit information, Add / Edit scene) is the dialog: flat, its own title and actions. Real PHP server + FAKE HA.
import { live, liveBrowser, AREAS } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const ID = 'custom.room-scene';
const pickIcon = async (ed, n) => { await ed.locator('[data-k=icon-field]').click(); await ed.locator('.iqi__search').fill(n); await ed.locator(`.iqi__opt[data-icon="mdi:${n}"]`).click(); };
const iconOf = (ed) => ed.locator('.ef-field[data-key="icon"] .iqi__name').textContent();
let L, B;
try {
  L = await live();
  Object.assign(AREAS, { salon: 'Salon', single: 'Study', kitchen: 'Kitchen', empty: 'Attic' });
  const names = ['ceiling', 'floor_lamp', 'table_lamp', 'wall_lamp', 'tv_backlight'];
  names.forEach((n, i) => L.setEntity(`light.${n}`, 'off', { name: n, f: 0, ...(i % 2 ? { deviceArea: 'salon' } : { area: 'salon' }) }));   // direct + via device
  L.setEntity('light.desk', 'on', { name: 'Desk', f: 0, area: 'single' });
  L.setEntity('light.kitchen', 'on', { name: 'Kitchen', f: 0, area: 'kitchen' });                    // another area: never the Salon's
  L.setEntity('switch.salon_plug', 'on', { name: 'Salon plug', area: 'salon' });                     // in Salon, not a light
  L.setEntity('sensor.salon_temp', '21', { name: 'Salon Salon', unit: '°C', dc: 'temperature', area: 'salon' });
  L.setEntity('light.legacy', 'on', { name: 'Old lamp', f: 0 });
  L.setEntity('light.salon_same_name', 'on', { name: 'Salon', f: 0, area: 'kitchen' });               // named like the area, but HA says Kitchen
  B = await liveBrowser(L); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const mount = (c, w = 900, h = 560) => E(({ id, c, w, h }) => {
    document.getElementById('rw')?.remove();
    const box = document.createElement('div'); box.id = 'rw'; box.style.cssText = `position:fixed;left:10px;top:10px;width:${w}px;height:${h}px;z-index:99999;display:grid`;
    box.append(window.MaisonRegistry.build(id, c)); document.body.append(box);
  }, { id: ID, c, w, h });
  const room = () => E(() => { const r = document.querySelector('#rw .iq-room'); return { lit: r.dataset.lit, fn: r.room.getState().functional.lights, text: r.innerText, sum: r.querySelector('.iq-room__sum'), filter: getComputedStyle(r.querySelector('.iq-room__img, .iq-room__fallback')).filter }; });
  const lightsOf = () => E(() => window.IniqHA._debug().subs.filter((x) => x.startsWith('light.')).sort());
  const settle = (lit) => page.waitForFunction((v) => document.querySelector('#rw .iq-room')?.dataset.lit === v, lit, { timeout: 15000 });

  // ---- 2 / 3 / 4 / 5 / 6 / 8: five Salon lights (own area and via their device), all off
  await mount({ name: 'Salon', area: 'salon' });
  await settle('false');
  let r = await room();
  const subs = await lightsOf();
  check('2 every Salon light is followed automatically (5 — no light fields)', ['light.ceiling', 'light.floor_lamp', 'light.table_lamp', 'light.tv_backlight', 'light.wall_lamp'].every((x) => subs.includes(x)), subs.join());
  check('3 / 4 own-area and device-area lights both belong', subs.includes('light.ceiling') && subs.includes('light.floor_lamp'));
  check('5 a light of another area is not the Salon\'s (also when it is called "Salon")', !subs.includes('light.kitchen') && !subs.includes('light.salon_same_name') && !subs.includes('light.desk'));
  check('6 non-light entities in the area are not lights (plug, sensor)', !(await E(() => window.IniqHA._debug().subs)).some((x) => x === 'switch.salon_plug' || x === 'sensor.salon_temp'));
  check('8 all five off → the OFF picture (desaturated, dimmed)', r.lit === 'false' && /grayscale/.test(r.filter), JSON.stringify(r));
  check('11 the room knows its 5 area lights (all off) — functional state, never printed (no summary, no light words)', r.fn.mapped === 5 && r.fn.off === 5 && r.sum === null && !/light/i.test(r.text), JSON.stringify(r));
  // ---- 7 / 11: any on
  L.setEntity('light.wall_lamp', 'on'); L.setEntity('light.tv_backlight', 'on');
  await settle('true');
  r = await room();
  check('7 any area light on → the full-colour picture', r.lit === 'true' && !/grayscale/.test(r.filter));
  check('11 2 of the area lights on — known, not printed', r.fn.on === 2 && !/lights? on/i.test(r.text), JSON.stringify(r));
  // ---- 9: unknown / unavailable, none on
  L.setEntity('light.wall_lamp', 'off'); L.setEntity('light.tv_backlight', 'unavailable');
  await settle('unknown');
  check('9 a light not reported, none on → neutral dimmed, never lit', (await room()).lit === 'unknown' && /grayscale/.test((await room()).filter));
  L.setEntity('light.tv_backlight', 'off');
  // ---- 1: one light
  await mount({ name: 'Study', area: 'single' });
  await settle('true');
  check('1 an area with one light: found and followed', (await room()).fn.mapped === 1 && (await room()).fn.on === 1 && (await lightsOf()).includes('light.desk'));
  // ---- 10: an area without lights
  await mount({ name: 'Attic', area: 'empty', info: [{ id: 'i1', entity: 'sensor.salon_temp', value: 'state' }] });
  await page.waitForFunction(() => document.querySelectorAll('#rw .iq-room__stat').length === 1, null, { timeout: 15000 });
  r = await room();
  check('10 no light in the area → no light state invented (picture as it is, no light words)', r.lit === 'none' && r.fn.mapped === 0 && !/light/i.test(r.text) && (r.filter === 'none' || !/grayscale/.test(r.filter)), JSON.stringify(r));
  // ---- 13 / 14: an older Room
  await mount({ name: 'Old', haRoles: { lights: ['light.legacy'] } });
  await settle('true');
  check('14 an older Room without an Area keeps using its own light mapping', (await room()).fn.mapped === 1 && (await room()).lit === 'true');
  await mount({ name: 'Old with area', area: 'salon', haRoles: { lights: ['light.legacy'] } });
  await settle('false');
  check('13 with an Area, the Area\'s lights are the truth (the old mapping is not used)', (await room()).fn.mapped === 5 && (await room()).lit === 'false');
  const kept = await E((id) => window.MaisonRegistry.fullConfig(id, { name: 'Old', haRoles: { lights: ['light.legacy'] } }).haRoles.lights.join(), ID);
  check('14 the old mapping is kept in the configuration (fallback), never destroyed', kept === 'light.legacy');
  // ---- 12: a new Room's configuration
  await E((id) => { const f = window.MaisonForm.create({ type: id, config: window.MaisonRegistry.fullConfig(id, {}) }); f.el.id = 'nf'; document.body.prepend(f.el); }, ID);
  check('12 a new Room has no Light 1 / Light 2 … fields (nor any light field)', await E(() => ![...document.querySelectorAll('#nf .ef-label')].some((l) => /^Light/.test(l.textContent)) && !document.querySelector('#nf .ef-field[data-key^="haRoles"]')));
  check('12 the Room section is name + Home Assistant Area', await E(() => [...document.querySelectorAll('#nf .ef-group[data-group="identity"] .ef-field:not([hidden]) > .ef-label')].map((l) => l.textContent).join() === 'Room name,Home Assistant Area'));
  await E(() => document.getElementById('nf').remove());

  // ---- 15–29: the item editor IS the dialog (the real configuration dialog)
  await E(() => document.getElementById('rw')?.remove());
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
  await page.waitForSelector(`.ecfg-tile[data-type="${ID}"]`); await page.click(`.ecfg-tile[data-type="${ID}"]`); await page.waitForTimeout(600);
  await page.waitForFunction(() => [...document.querySelectorAll('dialog[open] .ef-field--area option')].some((o) => o.value === 'salon'), null, { timeout: 8000 });
  await page.selectOption('dialog[open] .ef-field--area select', 'salon');
  for (const t of ['Information', 'Scenes']) await page.locator('dialog[open] .ef-acc__h', { hasText: t }).first().click();
  const ed = page.locator('dialog[open] [data-k=item-editor]');
  const shell = () => E(() => {
    const d = document.querySelector('dialog.ed-dlg[open]'), ed = document.querySelector('dialog[data-k=item-editor][open]'), vis = (el) => !!el && getComputedStyle(el).display !== 'none' && !!el.offsetParent;
    const g = ed.querySelector('.ef-group'), cs = getComputedStyle(g), r = ed.getBoundingClientRect();
    return { title: ed.querySelector('.ef-sub__t').textContent, modal: ed.matches(':modal'), parentKept: vis(d.querySelector('.ef-group')) && vis(d.querySelector('.ecfg-foot')), width: r.width, compact: r.width <= 650 && r.height < window.innerHeight - 20,
      preview: !!ed.querySelector('.ecfg-pv, .ecfg-pv__head'),
      flat: (cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent') && cs.paddingLeft === '0px', actions: [...ed.querySelectorAll('.ef-sub__foot button')].map((b) => b.textContent),
      overflow: ed.scrollWidth > ed.clientWidth + 1 };
  });
  await page.click('dialog[open] [data-col="info"] [data-k=col-add]');
  let sh = await shell();
  check('15 / 19 Add information: a compact modal titled "Add information" above the configuration (which stays as it is), no preview in it', sh.title === 'Add information' && sh.modal && sh.parentKept && sh.compact && !sh.preview, JSON.stringify(sh));
  check('20 flat: no card around the item fields', sh.flat, JSON.stringify(sh));
  check('16 / 25 Add shell: Cancel and Save (no Remove before it exists)', sh.actions.join() === 'Cancel,Save');
  await ed.locator('[data-k=iqp-choose]').click(); await page.waitForTimeout(300);
  await ed.locator('.iqp__item[data-entity="sensor.salon_temp"]').click(); await page.waitForTimeout(200);
  const ent = await ed.locator('.ef-field[data-key="entity"] .iqp__sel').evaluate((e) => [e.querySelector('b').textContent, e.querySelector('small').textContent, getComputedStyle(e.querySelector('small')).fontFamily]);
  check('21 the chosen entity: its HA name, then its entity id (monospace) — not the area', ent[0] === 'Salon Salon' && /^sensor\.salon_temp/.test(ent[1]) && /mono/i.test(ent[2]), JSON.stringify(ent));
  await ed.locator('[data-k=ha-values] > summary').click();
  await page.waitForSelector('dialog[open] [data-k=item-editor] [data-k=ha-values] .iq-insp__msg, dialog[open] [data-k=item-editor] [data-k=ha-values] .iq-insp__row', { timeout: 8000 });
  check('22 the HA values inspector opens in the editor (collapsed by default)', true);
  await pickIcon(ed, 'thermometer');
  await ed.locator('.ef-field[data-key="color"] [data-value="accent-hot"]').click();
  check('23 / 24 icon and colour choices work', (await iconOf(ed)) === 'mdi:thermometer' && (await ed.locator('.ef-field[data-key="color"] [data-value="accent-hot"]').getAttribute('aria-checked')) === 'true');
  await ed.locator('[data-k=sub-save]').click(); await page.waitForTimeout(200);
  check('26 Save adds the line; the modal is gone, the configuration is as it was', (await page.locator('dialog[open] [data-col="info"] .ef-col__row').count()) === 1 && await E(() => !!document.querySelector('dialog[open] .ecfg-foot').offsetParent));
  await page.click('dialog[open] [data-col="info"] [data-k=col-edit]');
  sh = await shell();
  check('16 Edit information: the same shell, Remove · Cancel · Save', sh.title === 'Edit information' && sh.modal && sh.compact && !sh.preview && sh.flat && sh.actions.join() === 'Remove,Cancel,Save', JSON.stringify(sh));
  await page.keyboard.press('Escape');
  check('25 / 28 Esc cancels the item editor only (the configuration dialog stays open), focus on Edit', (await page.locator('dialog[open]').count()) === 1 && !(await ed.count()) && await E(() => document.activeElement && document.activeElement.dataset.k === 'col-edit'));
  await page.click('dialog[open] [data-col="scenes"] [data-k=col-add]');
  sh = await shell();
  check('17 Add scene: the same shell', sh.title === 'Add scene' && sh.modal && sh.compact && !sh.preview && sh.flat && sh.actions.join() === 'Cancel,Save', JSON.stringify(sh));
  await ed.locator('.ef-field[data-key="label"] input').fill('Relax');
  await ed.locator('[data-k=sub-save]').click(); await page.waitForTimeout(150);
  await page.click('dialog[open] [data-col="scenes"] [data-k=col-edit]');
  sh = await shell();
  check('18 Edit scene: the same shell', sh.title === 'Edit scene' && sh.modal && !sh.preview && sh.flat && sh.actions.join() === 'Remove,Cancel,Save', JSON.stringify(sh));
  await ed.locator('[data-k=sub-remove]').click(); await page.waitForTimeout(150);
  check('27 Remove from the editor', (await page.locator('dialog[open] [data-col="scenes"] .ef-col__row').count()) === 0);
  // 29: a narrow window
  await page.setViewportSize({ width: 380, height: 800 }); await page.waitForTimeout(300);
  await page.click('dialog[open] [data-col="info"] [data-k=col-edit]'); await page.waitForTimeout(200);
  sh = await shell();
  const wide = await E(() => { const d = document.querySelector('dialog[open]'); const ed = d.querySelector('[data-k=item-editor]'); const r = ed.getBoundingClientRect(); return { over: [...ed.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().right > r.right + 1).map((x) => x.className).slice(0, 5), page: document.documentElement.scrollWidth > window.innerWidth }; });
  check('29 narrow: nothing wider than the editor (icons / colours wrap, long ids ellipsis), actions reachable', !sh.overflow && !wide.over.length && await ed.locator('[data-k=sub-save]').isVisible(), JSON.stringify({ sh, wide }));
  await ed.locator('[data-k=sub-cancel]').click();
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
