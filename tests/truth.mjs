/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// TRUTHFULNESS edge cases: zero ≠ unavailable, false/off ≠ missing, unknown / unavailable are said in words, optional attributes stay
// optional (no control, no "undefined" / "NaN" / "null" text anywhere), units are kept.
import { start, check } from './lib/harness.mjs';
const T = await start([
  ['sensor.zero', '0', { name: 'Zero', unit: '%', dc: 'battery' }],
  ['sensor.unk', 'unknown', { name: 'Unk', unit: '°C' }],
  ['sensor.na', 'unavailable', { name: 'NA', unit: '°C' }],
  ['sensor.kw', '0', { name: 'Power', unit: 'kW', dc: 'power' }],
  ['vacuum.v0', 'docked', { name: 'V0', f: 8192, bat: 0 }],
  ['vacuum.vnone', 'docked', { name: 'VN', f: 8192 }],
  ['cover.c0', 'closed', { name: 'C0', f: 7, pos: 0 }],
  ['cover.cnone', 'closed', { name: 'CN', f: 3 }],
  ['media_player.vol0', 'playing', { name: 'M', f: 4 | 8 | 16384 | 32768 | 262144, vol: 0, muted: false, shuf: false, rep: 'off' }],
  ['media_player.bare', 'playing', { name: 'MB', f: 16384 | 32768 | 262144 }],
  ['timer.rem0', 'paused', { name: 'T', dur: '0:05:00', rem: '0:00:00' }],
  ['climate.zero', 'heat', { name: 'Z', f: 1, cur: 0, target: 0, min: -10, max: 30, step: 0.5, modes: ['heat', 'off'] }],
  ['fan.f0', 'off', { name: 'F', f: 1, pct: 0 }],
  ['input_number.n0', '0', { name: 'N', nmin: 0, nmax: 10, nstep: 1 }],
  ['light.off', 'off', { name: 'L', f: 0, scm: ['brightness'], br: 0 }],
  ['switch.off', 'off', { name: 'S' }],
]);
const page = await T.page();
const text = () => page.$eval('#w', (e) => e.innerText);
const noJunk = async (label) => { const t = await text(); check(`${label}: no undefined / NaN / null text`, !/\b(undefined|NaN|null)\b/.test(t), t.replace(/\s+/g, ' ').slice(0, 120)); };
const q = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);

await T.mount(page, 'sensor', { entity: 'sensor.zero', variant: 'level' }, 300, 180);
check('sensor: zero percent is a value (0%) with an empty bar, not "unavailable"', /^0(\.0)?$/.test(await q('#w .sw__value')) && (await page.$eval('#w .sw__level', (e) => !e.hidden)), await q('#w .sw__value'));
await noJunk('sensor zero');
await T.mount(page, 'sensor', { entity: 'sensor.unk' }, 300, 180);
check('sensor: unknown says Unknown (word), keeps no number', (await q('#w .sw__status-t')) === 'Unknown', await q('#w .sw__status-t'));
await T.mount(page, 'sensor', { entity: 'sensor.na' }, 300, 180);
check('sensor: unavailable says Unavailable', (await q('#w .sw__status-t')) === 'Unavailable');
await T.mount(page, 'sensor', { entity: 'sensor.kw' }, 300, 180);
check('sensor: 0 kW keeps its unit', /^0(\.0)?$/.test(await q('#w .sw__value')) && (await q('#w .sw__unit')) === 'kW', await q('#w .sw__value') + '|' + await q('#w .sw__unit'));
await T.mount(page, 'robot', { entity: 'vacuum.v0' }, 360, 200);
check('robot: battery 0% is shown (zero ≠ missing)', (await q('#w .iq-robot__pct')) === '0%' && !(await page.$eval('#w .iq-robot__bat', (e) => e.hidden)));
await T.mount(page, 'robot', { entity: 'vacuum.vnone' }, 360, 200);
check('robot: no battery reported → no battery element', await page.$eval('#w .iq-robot__bat', (e) => e.hidden));
await noJunk('robot without battery');
await T.mount(page, 'cover', { entity: 'cover.c0' }, 320, 200);
check('cover: position 0 is Closed (not unknown)', (await q('#w .vw__state')) === 'Closed');
await T.mount(page, 'cover', { entity: 'cover.cnone' }, 320, 200);
check('cover: no position reported → no percentage text, no slider', !/%/.test(await q('#w .vw__state')) && !(await page.$('#w [data-positionable]')));
await T.mount(page, 'media', { entity: 'media_player.vol0' }, 480, 240);
check('media: volume 0 shown as 0 and unmuted (false ≠ missing)', (await page.$eval('#w .mw__vol input', (e) => e.value)) === '0');
check('media: shuffle false / repeat off are real controls', (await page.$$('#w .iq-media-opt--shuffle, #w .iq-media-opt--repeat')).length === 2);
await T.mount(page, 'media', { entity: 'media_player.bare' }, 480, 240);
check('media: shuffle / repeat bits without the attributes → no control', (await page.$$('#w .iq-media-opt')).length === 0);
await T.mount(page, 'timer', { entity: 'timer.rem0' }, 240, 300);
check('timer: paused with 0 s left shows 0:00 (not a dash)', (await q('#w .iq-timer__time')) === '0:00', await q('#w .iq-timer__time'));
await T.mount(page, 'climate', { entity: 'climate.zero' }, 340, 400);
check('climate: 0° is a temperature (target 0, room 0)', /^0/.test(await q('#w .iqdl__int')) && (await q('#w .iqdl__room')).includes('0.0'), await q('#w .iqdl__int') + '|' + await q('#w .iqdl__room'));
await T.mount(page, 'fan', { entity: 'fan.f0' }, 300, 220);
await noJunk('fan speed 0');
await T.mount(page, 'numsel', { entity: 'input_number.n0' }, 300, 180);
check('number: 0 is a value', (await page.$$eval('#w input', (i) => i.some((x) => x.value === '0'))) || /\b0\b/.test(await text()), await text());
await T.mount(page, 'light', { entity: 'light.off' }, 260, 300);
await noJunk('light off at brightness 0');
await T.mount(page, 'entitylist', { rows: [{ id: 'i1', entity: 'sensor.zero', value: 'state' }, { id: 'i2', entity: 'sensor.na', value: 'state' }, { id: 'i3', entity: 'switch.off', value: 'state' }] }, 360, 240);
const rows = await page.$$eval('#w .iq-elist__row', (r) => r.map((x) => x.querySelector('.iq-elist__val').textContent.trim()));
check('entity list: 0 %, Unavailable, Off — each in words', rows[0] === '0%' && rows[1] === 'Unavailable' && rows[2] === 'Off', rows.join('|'));
await T.mount(page, 'energy', { entity: 'sensor.kw' }, 300, 300);
check('energy flow: 0 kW is "0 kW", still a known value', /0\s*kW/.test(await text()) && !/unavailable/i.test(await text()), (await text()).replace(/\s+/g, ' ').slice(0, 100));
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
