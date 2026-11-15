/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
import { start, check } from './lib/harness.mjs';
const T = await start([
  ['light.kitchen', 'on', { name: 'Kitchen light', f: 0, scm: ['brightness'], br: 100 }],
  ['switch.plug', 'off', { name: 'Plug' }],
  ['cover.blind', 'open', { name: 'Blind', f: 3, pos: 100 }],
  ['cover.opener', 'closed', { name: 'Opener', f: 1 }],
  ['scene.night', 'unknown', { name: 'Good night' }],
  ['lock.door', 'locked', { name: 'Front door' }],
  ['sensor.temp', '21.5', { name: 'Temperature', unit: '°C', dc: 'temperature' }],
  ['binary_sensor.door', 'on', { name: 'Back door', dc: 'door' }],
]);
const page = await T.page();
const last = () => T.calls[T.calls.length - 1];
const R = (entity, extra = {}) => ({ id: `i${Math.random().toString(36).slice(2, 7)}`, entity, value: 'state', ...extra });
const rows = [R('light.kitchen'), R('switch.plug'), R('cover.blind'), R('cover.opener'), R('scene.night'), R('lock.door'), R('sensor.temp'), R('binary_sensor.door'), R('sensor.nothere'), R('light.kitchen', { label: 'Mine' })];
await T.mount(page, 'entitylist', { name: 'Home', rows }, 420, 520);
const info = await page.$$eval('#w .iq-elist__row', (r) => r.map((x) => [x.querySelector('.iq-elist__n').textContent, x.querySelector('.iq-elist__val').textContent, x.querySelector('[data-type]')?.dataset.type || '-']));
const by = (n) => info.find((x) => x[0] === n);
check('10 rows (a duplicate entity is allowed)', info.length === 10, JSON.stringify(info));
check('name from HA, state in HA words', by('Kitchen light')[1] === 'On' && by('Back door')[1] === 'Open' && by('Temperature')[1] === '21.5 °C', JSON.stringify(info));
check('your label wins over the HA name', !!by('Mine'));
check('controls: light switch, plug switch, cover move, scene run', by('Kitchen light')[2] === 'toggle' && by('Plug')[2] === 'toggle' && by('Blind')[2] === 'move' && by('Good night')[2] === 'run', JSON.stringify(info));
check('no control for a cover that cannot both open and close', by('Opener')[2] === '-');
check('no control for lock / sensor / binary sensor', by('Front door')[2] === '-' && by('Temperature')[2] === '-' && by('Back door')[2] === '-');
check('unknown entity says so', by('sensor.nothere')[1] === 'Not found', JSON.stringify(by('sensor.nothere')));
await page.click('#w .iq-elist__row:nth-child(1) [data-type=toggle]');
await page.waitForTimeout(300);
check('toggle on a light that is on → turn_off', last()?.entity === 'light.kitchen' && last().action === 'turn_off', JSON.stringify(last()));
await page.click('#w .iq-elist__row:nth-child(2) [data-type=toggle]');
await page.waitForTimeout(300);
check('plug off → turn_on', last()?.entity === 'switch.plug' && last().action === 'turn_on');
await page.click('#w .iq-elist__row:nth-child(3) [data-type=move]');
await page.waitForTimeout(300);
check('open cover → close', last()?.entity === 'cover.blind' && last().action === 'close');
await page.click('#w .iq-elist__row:nth-child(5) [data-type=run]');
await page.waitForTimeout(300);
check('scene → trigger', last()?.entity === 'scene.night' && last().action === 'trigger');
// a row showing a reported value instead of the state has no control
await T.mount(page, 'entitylist', { rows: [R('light.kitchen', { value: 'brightness' })] }, 420, 200);
const r2 = await page.$$eval('#w .iq-elist__row', (r) => r.map((x) => [x.querySelector('.iq-elist__val').textContent, !!x.querySelector('[data-type]')]));
check('value row: brightness shown, no control', r2[0][0] === '39%' && r2[0][1] === false, JSON.stringify(r2));
// empty linked list + demo
await T.mount(page, 'entitylist', {}, 420, 300);
check('no rows: demo rows (marked demo by the registry on a live server)', (await page.$$('#w .iq-elist__row')).length === 4);
// responsive: wide = one line; narrow = stacked; always inside the box
for (const [w, h] of [[420, 260], [180, 240], [300, 90]]) {
  await T.mount(page, 'entitylist', { rows: rows.slice(0, 3) }, w, h);
  const ok = await page.$eval('#w .iq-elist', (e) => { const r = e.getBoundingClientRect(); return [...e.querySelectorAll('.iq-elist__name,.iq-elist__list')].every((x) => { const b = x.getBoundingClientRect(); return b.right <= r.right + 1 && b.bottom <= r.bottom + 1; }) && e.querySelector('.iq-elist__list').scrollHeight >= 0; });
  check(`fits ${w}x${h} (list scrolls inside)`, ok);
}
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
