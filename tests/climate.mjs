/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// CLIMATE — Home Assistant capabilities drive which controls exist (the shared segmented control for 2–4 options, a select for more;
// − value + steppers for the target humidity and the target range); every request goes out as the right HA action; the variants render;
// Minimal is read-only. (The full real-editor acceptance is tests/climate-reference.mjs.)
import { start, check } from './lib/harness.mjs';
const T = await start([
  ['climate.hall', 'heat', { name: 'Hall', f: 1 | 8 | 16, cur: 19.5, target: 21, min: 5, max: 30, step: 0.5, modes: ['heat', 'off'], action: 'heating', fm: 'low', fml: ['low', 'high'], preset: 'eco', pml: ['eco', 'comfort', 'away', 'boost', 'sleep'], hum: 44 }],
  ['climate.range', 'heat_cool', { name: 'Range', f: 2, cur: 22, tlo: 19, thi: 24, modes: ['heat_cool', 'off'] }],
  ['climate.basic', 'heat', { name: 'Basic', f: 1, cur: 20, target: 22, min: 5, max: 30, modes: ['heat', 'off'] }],
]);
const page = await T.page();
const q = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const vis = (sel) => page.$eval(sel, (e) => !!e.offsetParent).catch(() => false);

await T.mount(page, 'climate', { entity: 'climate.hall' }, 360, 460);
check('preset (5 options): a select from the HA list; fan (2 options): the shared segmented control', (await page.$$('#w .cw__sel[data-k=preset]')).length === 1 && (await page.$$('#w .iqc-seg[data-k=fan] .iqc-seg__o')).length === 2);
check('fan: the option HA reports is selected (low)', await page.$eval('#w .iqc-seg[data-k=fan] [aria-checked="true"]', (e) => e.dataset.id) === 'low');
check('everything inside the widget', await page.$eval('#w .cw', (e) => { const r = e.getBoundingClientRect(); return [...e.querySelectorAll('.iqdl,.cw__btn,.iqc-seg,.cw__choice')].filter((x) => x.offsetParent).every((x) => { const b = x.getBoundingClientRect(); return b.bottom <= r.bottom + 1 && b.right <= r.right + 1 && b.top >= r.top - 1 && b.left >= r.left - 1; }); }));
check('the room humidity is not invented as a control or a line (it is Information, when chosen)', !(await vis('#w .cw__hum')) && !(await page.$('#w .cw__stp[data-k=humidity]')));
await page.selectOption('#w .cw__sel[data-k=preset]', 'comfort');
await page.waitForTimeout(300);
check('preset sent as set_preset_mode', T.calls.some((c) => c.entity === 'climate.hall' && c.action === 'set_preset_mode' && c.value === 'comfort'), JSON.stringify(T.calls));
await page.click('#w .iqc-seg[data-k=fan] .iqc-seg__o[data-id="high"]');
await page.waitForTimeout(300);
check('fan mode sent as set_fan_mode', T.calls.some((c) => c.action === 'set_fan_mode' && c.value === 'high'));
await page.click('#w .cw__btn[data-k=plus]');
await page.waitForTimeout(300);
check('+ → set_temperature 21.5 (the entity\'s 0.5 step)', T.calls.some((c) => c.action === 'set_temperature' && c.value === 21.5), JSON.stringify(T.calls.slice(-2)));
await T.mount(page, 'climate', { entity: 'climate.basic' }, 360, 460);
check('basic climate: no fan / preset / swing / humidity / range controls', !(await page.$('#w :is(.iqc-seg[data-k=fan], .cw__sel, .cw__stp, .cw__range)')));
check('basic (heat / off): the mode selector offers exactly those two, HA\'s mode selected', (await page.$$eval('#w .iqc-seg[data-k=mode] .iqc-seg__o', (o) => o.map((x) => `${x.dataset.id}:${x.getAttribute('aria-checked')}`).join())) === 'heat:true,off:false');
await T.mount(page, 'climate', { entity: 'climate.range' }, 360, 460);
check('range-only: shows the range, read-only on the dial', ((await q('#w .iqdl__target')) || '').includes('19.0–24.0'), await q('#w .iqdl__target'));
check('range-only: no ± buttons, no handle', !(await page.$('#w .cw__btn[data-k=plus]')) && !(await vis('#w .iqdl__knob')));
for (const v of ['dial', 'horizontal', 'compact', 'minimal']) {
  await T.mount(page, 'climate', { entity: 'climate.hall', variant: v }, v === 'horizontal' ? 560 : 360, v === 'horizontal' ? 300 : v === 'dial' ? 460 : 150);
  check(`variant ${v} renders (the value shown)`, (await page.$eval('#w .cw', (e) => e.dataset.variant)) === v && (await vis('#w .iqdl__target')));
}
await T.mount(page, 'climate', { entity: 'climate.hall', variant: 'minimal' }, 260, 120);
check('minimal: read-only (no controls)', !(await page.$('#w :is(.cw__btn, .iqc-seg, .cw__sel, .cw__stp)')));
// advanced capabilities: swing, target humidity, target range — all gated by the entity
const T2 = await start([
  ['climate.adv', 'heat_cool', { name: 'Adv', f: 2 | 4 | 32, cur: 22, tlo: 19, thi: 24, min: 10, max: 30, step: 0.5, modes: ['heat_cool', 'off'], sml: ['off', 'vertical'], swm: 'off', hmin: 30, hmax: 70, thum: 50 }],
  ['climate.nohum', 'heat', { name: 'NoHum', f: 1 | 4, target: 21, min: 5, max: 30, modes: ['heat'], thum: 50 }],
]);
const p2 = await T2.page();
await T2.mount(p2, 'climate', { entity: 'climate.adv' }, 440, 520);
const calls2 = T2.calls;
check('swing: the shared segmented control from the HA list', (await p2.$$('#w .iqc-seg[data-k=swing] .iqc-seg__o')).length === 2);
await p2.click('#w .iqc-seg[data-k=swing] .iqc-seg__o[data-id="vertical"]');
await p2.waitForTimeout(300);
check('swing sent as set_swing_mode', calls2.some((c) => c.action === 'set_swing_mode' && c.value === 'vertical'), JSON.stringify(calls2));
check('humidity stepper shows target 50%', (await p2.$eval('#w .cw__stp[data-k=humidity] .cw__stp-v', (e) => e.textContent)) === '50%');
await p2.click('#w .cw__stp[data-k=humidity] .cw__stp-b >> nth=1');
await p2.waitForTimeout(300);
check('humidity + → set_humidity 51', calls2.some((c) => c.action === 'set_humidity' && c.value === 51), JSON.stringify(calls2));
check('range steppers (low 19.0 / high 24.0)', (await p2.$eval('#w .cw__stp[data-k=low] .cw__stp-v', (e) => e.textContent)) === '19.0°' && (await p2.$eval('#w .cw__stp[data-k=high] .cw__stp-v', (e) => e.textContent)) === '24.0°');
await p2.click('#w .cw__stp[data-k=high] .cw__stp-b >> nth=1');
await p2.waitForTimeout(300);
check('range high + → set_temperature_range 19:24.5', calls2.some((c) => c.action === 'set_temperature_range' && c.value === '19:24.5'), JSON.stringify(calls2.slice(-2)));
await T2.mount(p2, 'climate', { entity: 'climate.nohum' }, 440, 520);
check('humidity feature bit without a reported range: no stepper', !(await p2.$('#w .cw__stp')));
check('no page errors (advanced)', p2.errors.length === 0, p2.errors.join('|'));
await T2.close();
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
