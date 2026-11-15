/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ROOM CARD CONTENT: the only visible data is the owner's Information (config.info, in their order); the room's lights are FUNCTIONAL
// state (known, never printed) that drives the VISUAL state of the artwork. No summary line, no automatic light / temperature text, at
// any size. Real PHP server + FAKE Home Assistant.
import { live, liveBrowser, AREAS } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const ID = 'custom.room-scene';
let L, B;
try {
  L = await live();
  Object.assign(AREAS, { salon: 'Salon' });
  L.setEntity('light.a', 'on', { name: 'Ceiling', f: 0, area: 'salon' }); L.setEntity('light.b', 'off', { name: 'Floor lamp', f: 0, deviceArea: 'salon' });
  L.setEntity('sensor.t', '21.4', { name: 'Slidingdoor - Sensor Device temperature', unit: '°C', dc: 'temperature', area: 'salon' });
  L.setEntity('sensor.h', '58', { name: 'Salon Humidity', unit: '%', dc: 'humidity', area: 'salon' });
  L.setEntity('sensor.p', '428', { name: 'Salon Power', unit: 'W', dc: 'power', area: 'salon' });
  L.setEntity('scene.r', 'unknown', { name: 'Relax', area: 'salon' });
  B = await liveBrowser(L); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const mount = (c, w = 900, h = 560) => E(({ id, c, w, h }) => {
    document.getElementById('rw')?.remove();
    const box = document.createElement('div'); box.id = 'rw'; box.style.cssText = `position:fixed;left:10px;top:10px;width:${w}px;height:${h}px;z-index:99999;display:grid`;
    box.append(window.MaisonRegistry.build(id, c)); document.body.append(box);
  }, { id: ID, c, w, h });
  const card = () => E(() => { const r = document.querySelector('#rw .iq-room'); return { lit: r.dataset.lit, all: r.textContent, seen: r.innerText, head: r.querySelector('.iq-room__head').textContent,
    stats: [...r.querySelectorAll('.iq-room__stat')].map((x) => [x.querySelector('.iq-room__sval').textContent, x.querySelector('.iq-room__slab').textContent]), strip: !r.querySelector('.iq-room__stats').hidden,
    sum: !!r.querySelector('.iq-room__sum'), scenes: r.querySelectorAll('.iq-room__scene').length, fn: r.room.getState().functional.lights }; });
  const T = { id: 'i1', entity: 'sensor.t', value: 'state', label: 'Temperature', icon: 'thermo', color: 'info' };
  const H = { id: 'i2', entity: 'sensor.h', value: 'state', label: 'Humidity', icon: 'drop', color: 'cool' };
  const P = { id: 'i3', entity: 'sensor.p', value: 'state', label: 'Power', icon: 'bolt', color: 'warning' };

  // ---- 1 / 2 / 3 / 4 / 10 / 11: zero Information — title and artwork only (the lights are known and light the picture)
  await mount({ name: 'Living Room', area: 'salon' });
  await page.waitForFunction(() => document.querySelector('#rw .iq-room')?.dataset.lit === 'true', null, { timeout: 15000 });
  let c = await card();
  check('4 the title stays', c.seen.trim() === 'Living Room', JSON.stringify(c.seen));
  check('1 zero Information → no information strip', !c.strip && c.stats.length === 0);
  check('2 / 3 no automatic temperature, no light status text, no summary line', !/°C|light|on|off/i.test(c.all.replace('Living Room', '')) && !c.sum, JSON.stringify(c.all));
  check('10 / 11 the area lights are known (2, one on) and light the artwork — no light Information is created', c.fn.mapped === 2 && c.fn.on === 1 && c.lit === 'true' && c.stats.length === 0);
  // ---- 5 / 6 / 9: one Information line
  await mount({ name: 'Living Room', area: 'salon', info: [T] });
  await page.waitForFunction(() => document.querySelectorAll('#rw .iq-room__stat').length === 1, null, { timeout: 15000 });
  c = await card();
  check('5 one Information line, shown exactly once', c.stats.length === 1 && (c.all.match(/21\.4/g) || []).length === 1, JSON.stringify(c.stats));
  check('6 the owner\'s label wins over the HA name', c.stats[0][1] === 'Temperature' && !/Slidingdoor/.test(c.all));
  check('9 the temperature is not repeated in the header', !/21\.4|°C/.test(c.head), c.head);
  // ---- 7: order
  await mount({ name: 'Living Room', area: 'salon', info: [P, T, H] });
  await page.waitForFunction(() => document.querySelectorAll('#rw .iq-room__stat').length === 3, null, { timeout: 15000 });
  check('7 several lines keep the owner\'s order', (await card()).stats.map((x) => x[1]).join() === 'Power,Temperature,Humidity');
  await mount({ name: 'Living Room', area: 'salon', info: [H, P, T] });
  await page.waitForFunction(() => document.querySelectorAll('#rw .iq-room__stat').length === 3, null, { timeout: 15000 });
  check('7 reordered by the owner → shown in that order', (await card()).stats.map((x) => x[1]).join() === 'Humidity,Power,Temperature');
  // ---- 8: none again
  await mount({ name: 'Living Room', area: 'salon', info: [] });
  await page.waitForTimeout(600);
  c = await card();
  check('8 all Information removed → nothing of it left on the card', !c.strip && !c.stats.length && !/21\.4|58|428/.test(c.all));
  // ---- 12 / 13: the artwork still follows the area lights
  L.setEntity('light.a', 'off');
  await page.waitForFunction(() => document.querySelector('#rw .iq-room')?.dataset.lit === 'false', null, { timeout: 15000 });
  check('12 every area light off → the dimmed artwork (still no text)', !/off/i.test((await card()).all.replace('Living Room', '')));
  L.setEntity('light.b', 'unavailable');
  await page.waitForFunction(() => document.querySelector('#rw .iq-room')?.dataset.lit === 'unknown', null, { timeout: 15000 });
  check('13 a light not reported, none on → neutral dimmed (never lit)', true);
  L.setEntity('light.b', 'off'); L.setEntity('light.a', 'on');
  // ---- 14 / 15: scenes stay explicit
  const fresh = await E((id) => window.MaisonRegistry.fullConfig(id, {}), ID);
  check('14 a new Room has no scenes (no Relax / Movie / …)', !(fresh.scenes || []).length && fresh.info === undefined);
  check('15 zero scenes: no scene buttons', (await card()).scenes === 0);
  // ---- 16 / 17: interactions
  check('16 / 17 Tap / Double tap / Long press, popup among the choices', await E((id) => ['tap', 'doubleTap', 'longPress'].every((g) => { const f = window.MaisonRegistry.TYPES[id].fields.find((x) => x.key === `interactions.${g}.action`); return f && f.options.some((o) => o.value === 'popup'); }), ID));
  // ---- 18: every size, zero Information — nothing invented
  const sizes = {};
  for (const [k, w, h] of [['large', 1000, 600], ['normal', 440, 400], ['compact', 380, 200], ['micro', 170, 170]]) {
    await mount({ name: 'Living Room', area: 'salon' }, w, h); await page.waitForTimeout(700);
    sizes[k] = await E(() => { const r = document.querySelector('#rw .iq-room'); return { arr: r.dataset.fitArr, seen: r.innerText.trim(), stats: r.querySelectorAll('.iq-room__stat').length }; });
  }
  check('18 Large / Normal / Compact / Micro: only the title is shown, no Information made up', Object.values(sizes).every((x) => x.seen === 'Living Room' && x.stats === 0) && Object.keys(sizes).every((k) => sizes[k].arr === k), JSON.stringify(sizes));
  // the owner's first lines at Normal, more at Large, none in the small cards — always the owner's first ones
  const shown = {};
  for (const [k, w, h] of [['large', 1000, 600], ['normal', 440, 400], ['compact', 380, 200]]) {
    await mount({ name: 'Living Room', area: 'salon', info: [P, T, H] }, w, h);
    await page.waitForFunction(() => document.querySelectorAll('#rw .iq-room__stat').length === 3, null, { timeout: 15000 }); await page.waitForTimeout(300);
    shown[k] = await E(() => [...document.querySelectorAll('#rw .iq-room__stat')].filter((x) => x.offsetParent).map((x) => x.querySelector('.iq-room__slab').textContent));
  }
  check('18 MaisonFit shows the owner\'s FIRST lines: Large all, Normal some, Compact none', shown.large.join() === 'Power,Temperature,Humidity' && shown.normal.length >= 1 && shown.normal.join() === ['Power', 'Temperature', 'Humidity'].slice(0, shown.normal.length).join() && shown.compact.length === 0, JSON.stringify(shown));
  // ---- 19: an older Room (temperature / air-quality roles + lights mapping) still loads; only its Information shows
  await mount({ name: 'Old', haRoles: { lights: ['light.a'], temperature: 'sensor.t' }, labels: { temperature: 'Inside' } });
  await page.waitForFunction(() => document.querySelectorAll('#rw .iq-room__stat').length === 1, null, { timeout: 15000 });
  c = await card();
  check('19 an older Room loads: its temperature is now its Information line ("Inside"), once; its light only lights the picture', c.stats[0][1] === 'Inside' && (c.all.match(/21\.4/g) || []).length === 1 && c.lit === 'true' && !/light/i.test(c.all), JSON.stringify(c));
  // ---- 20: the configurator is unchanged
  await E((id) => { const f = window.MaisonForm.create({ type: id, config: { name: 'X', area: 'salon', info: [{ id: 'i1', entity: 'sensor.t', value: 'state', label: 'Temperature' }] } }); f.el.id = 'cf'; document.body.prepend(f.el); }, ID);
  check('20 the configurator: Room (name, Area) · Information rows · + Add scene', await E(() => document.querySelectorAll('#cf [data-col="info"] .ef-col__row').length === 1 && !!document.querySelector('#cf [data-col="scenes"] [data-k=col-add]') && !!document.querySelector('#cf .ef-field--area')));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
