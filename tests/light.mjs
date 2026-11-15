/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
import { start, check } from './lib/harness.mjs';
const T = await start([
  ['light.full', 'on', { name: 'Full', f: 0, scm: ['color_temp', 'hs'], br: 128, cm: 'color_temp', ctk: 3000, ckmin: 2000, ckmax: 6500, hs: [30, 80] }],
  ['light.dim', 'on', { name: 'Dim', f: 0, scm: ['brightness'], br: 200 }],
  ['light.onoff', 'off', { name: 'OnOff', f: 0, scm: ['onoff'] }],
  ['light.norange', 'on', { name: 'NoRange', f: 0, scm: ['color_temp'], br: 100, cm: 'color_temp', ctk: 3000 }],
]);
const page = await T.page();
const q = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const vis = (sel) => page.$eval(sel, (e) => !!e.offsetParent).catch(() => false);
const last = () => T.calls[T.calls.length - 1];

// the four variants (Standard = 'artwork', Compact, Slider, Artwork = 'image'): each renders, everything visible stays inside the card
for (const v of ['artwork', 'compact', 'slider', 'image']) {
  await T.mount(page, 'light', { entity: 'light.full', variant: v }, v === 'compact' ? 320 : 280, v === 'compact' ? 80 : 260);
  check(`${v}: renders with its state`, (await page.$eval('#w .lw', (e) => e.dataset.variant)) === v);
  const inside = await page.$eval('#w .lw', (e) => { const r = e.getBoundingClientRect(); return [...e.querySelectorAll('.lw__power, .lw__name, .lw__range, .iq-light-more')].filter((x) => x.offsetParent && x.getBoundingClientRect().width).every((x) => { const b = x.getBoundingClientRect(); return b.right <= r.right + 1 && b.bottom <= r.bottom + 1 && b.left >= r.left - 1 && b.top >= r.top - 1; }); });
  check(`${v}: controls inside the widget`, inside);
}
check('an older "tile" light becomes Standard', await page.evaluate(() => { const c = window.MaisonRegistry.fullConfig('light', { variant: 'tile' }); return !('variant' in c) && window.MaisonRegistry.variantOf('light', c) === 'artwork'; }));
// artwork: colour tools behind the Colour button (only for a light that reports them)
await T.mount(page, 'light', { entity: 'light.full', variant: 'artwork', image: 'widgets/default/light/assets/pendant-dome.png' }, 260, 330);
check('artwork: Colour button for a colour light', !!(await page.$('#w .iq-light-more')));
await page.click('#w .iq-light-more');
check('artwork: colour tools open', await vis('#w .iq-light-pop .iq-light-sw__b'));
await page.keyboard.press('Escape');
await T.mount(page, 'light', { entity: 'light.dim', variant: 'artwork' }, 260, 330);
check('artwork: no Colour button for a dimmable-only light', !(await page.$('#w .iq-light-more')));
// capabilities: a Large Standard card of a full light shows colour temperature + swatches inline; slider-range from HA; sends the right actions
await T.mount(page, 'light', { entity: 'light.full', variant: 'artwork' }, 760, 480);
check('Large Standard: the colour tools are inline (no Colour button)', (await page.$eval('#w .lw', (e) => e.dataset.extra)) === 'inline' && !(await vis('#w .iq-light-more')));
check('colour temperature control with HA range', (await page.$eval('#w .iq-light-ct__range', (e) => [e.min, e.max, e.value].join())) === '2000,6500,3000');
check('8 colour swatches', (await page.$$('#w .iq-light-sw__b')).length === 8);
await page.click('#w .iq-light-sw__b[data-hue="120"]');
await page.waitForTimeout(300);
check('swatch → hue action', last()?.action === 'hue' && last().value === 120, JSON.stringify(last()));
await page.$eval('#w .iq-light-ct__range', (e) => { e.value = 4000; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
await page.waitForTimeout(300);
check('colour temperature → color_temp action', last()?.action === 'color_temp' && last().value === 4000, JSON.stringify(last()));
// no capability, no control
await T.mount(page, 'light', { entity: 'light.dim', variant: 'artwork' }, 440, 320);
check('dimmable only: brightness yes, colour no', (await vis('#w .lw__range')) && !(await page.$('#w .iq-light-ct')) && !(await page.$('#w .iq-light-sw')));
await T.mount(page, 'light', { entity: 'light.norange', variant: 'artwork' }, 760, 480);
check('colour temp without a reported range: no control', !(await page.$('#w .iq-light-ct')));
for (const v of ['artwork', 'compact', 'slider', 'image']) {
  await T.mount(page, 'light', { entity: 'light.onoff', variant: v }, 440, 320);
  check(`${v} · on/off light: no brightness control, no colour button, no "%"`, !(await page.$('#w .lw__range')) && !(await page.$('#w .iq-light-more')) && !/%/.test(await q('#w .lw__state')));
}
await T.mount(page, 'light', { entity: 'light.onoff', variant: 'slider' }, 280, 160);
check('slider without brightness: a power tile', !!(await page.$('#w .iq-light-alt__hit')) && (await q('#w .lw__big')) === 'Off');
await page.click('#w .iq-light-alt__hit');
await page.waitForTimeout(300);
check('power tile turns it on', last()?.action === 'turn_on' && last().entity === 'light.onoff', JSON.stringify(last()));
// slider: dragging the card sets brightness
await T.mount(page, 'light', { entity: 'light.dim', variant: 'slider' }, 300, 160);
const box = await (await page.$('#w .lw__range')).boundingBox();
await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
await page.waitForTimeout(300);
check('slider card sets brightness', last()?.action === 'brightness' && Math.abs(last().value - 25) <= 3, JSON.stringify(last()));
// a tall Slider is vertical: the bottom is dim, the top bright
await T.mount(page, 'light', { entity: 'light.dim', variant: 'slider' }, 200, 380);
check('tall slider is vertical', (await page.$eval('#w .lw', (e) => e.dataset.orient)) === 'vertical');
const vb = await (await page.$('#w .lw')).boundingBox();
await page.mouse.click(vb.x + vb.width / 2, vb.y + vb.height * 0.2);
await page.waitForTimeout(300);
check('vertical slider: near the top → bright', last()?.action === 'brightness' && Math.abs(last().value - 80) <= 6, JSON.stringify(last()));
// inner controls never start the card's own interactions (tap / double / long press)
check('inner controls are marked as controls (never a card gesture)', await page.evaluate(() => [...document.querySelectorAll('#w .lw__range, #w .lw__power')].every((x) => x.matches('button, input, [data-iq-control]'))));
// the old Artwork card is unchanged for a plain demo light
await T.mount(page, 'light', {}, 240, 280);
check('demo artwork card still has its fixture', !!(await page.$('#w .lw__art')) && (await vis('#w .lw__stage')));
// effects: exactly the list HA reports
const T3 = await start([
  ['light.fx', 'on', { name: 'FX', f: 4, scm: ['hs'], br: 100, cm: 'hs', fx: 'Rainbow', fxl: ['Rainbow', 'Pulse'] }],
  ['light.nofx', 'on', { name: 'NoFX', f: 0, scm: ['hs'], br: 100, fxl: ['Rainbow'] }],
]);
const p3 = await T3.page();
await T3.mount(p3, 'light', { entity: 'light.fx', variant: 'artwork' }, 760, 480);
check('effect select lists exactly the reported effects', (await p3.$$eval('#w .iq-light-fx__sel option', (o) => o.map((x) => x.value))).join('|') === '|Rainbow|Pulse');
check('current effect selected', (await p3.$eval('#w .iq-light-fx__sel', (e) => e.value)) === 'Rainbow');
await p3.selectOption('#w .iq-light-fx__sel', 'Pulse');
await p3.waitForTimeout(300);
check('effect sent', T3.calls.some((c) => c.entity === 'light.fx' && c.action === 'effect' && c.value === 'Pulse'), JSON.stringify(T3.calls));
await T3.mount(p3, 'light', { entity: 'light.nofx', variant: 'artwork' }, 760, 480);
check('no feature bit: no effect control', !(await p3.$('#w .iq-light-fx')));
await T3.mount(p3, 'light', { entity: 'light.fx', variant: 'artwork', image: 'widgets/default/light/assets/pendant-dome.png' }, 260, 330);
check('artwork: Colour & effects button', (await p3.$eval('#w .iq-light-more', (e) => e.textContent)) === 'Colour & effects');
check('no page errors (effects)', p3.errors.length === 0, p3.errors.join('|'));
await T3.close();
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
