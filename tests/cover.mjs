/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
import { start, check } from './lib/harness.mjs';
const T = await start([
  ['cover.gate', 'closed', { name: 'Gate', f: 1 | 2 | 8, dc: 'gate' }],
  ['cover.garage', 'open', { name: 'Garage', f: 1 | 2, dc: 'garage' }],
  ['cover.blind', 'open', { name: 'Blind', f: 1 | 2 | 4 | 8, pos: 40, dc: 'blind' }],
  ['cover.oddity', 'closed', { name: 'Garage-named blind', f: 1 | 2 | 4, pos: 0, dc: 'shutter' }],
]);
const page = await T.page();
const q = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const vis = (sel) => page.$eval(sel, (e) => !!e.offsetParent).catch(() => false);
const last = () => T.calls[T.calls.length - 1];

await T.mount(page, 'cover', { entity: 'cover.gate', variant: 'garage' }, 300, 260);
check('garage: gate drawn from device class', (await page.$eval('#w .iq-cover-pic', (e) => e.dataset.kind)) === 'gate');
check('garage: state in words', (await q('#w .iq-cover-alt__state')) === 'Closed');
check('garage: only supported buttons (open, stop, close)', (await page.$$eval('#w .iq-cover-btn', (b) => b.map((x) => x.className.split('--')[1]))).join() === 'open,stop,close');
await page.click('#w .iq-cover-btn--open');
await page.waitForTimeout(300);
check('open sent', last()?.entity === 'cover.gate' && last().action === 'open');
await T.mount(page, 'cover', { entity: 'cover.garage', variant: 'garage' }, 300, 260);
check('garage drawn from its class', (await page.$eval('#w .iq-cover-pic', (e) => e.dataset.kind)) === 'garage');
check('garage without stop: no stop button', !(await page.$('#w .iq-cover-btn--stop')));
await T.mount(page, 'cover', { entity: 'cover.oddity', variant: 'garage' }, 300, 260);
check('a shutter is NOT drawn as a garage (device class decides, not the name)', (await page.$eval('#w .iq-cover-pic', (e) => e.dataset.kind)) === 'other');
// slider
await T.mount(page, 'cover', { entity: 'cover.blind', variant: 'slider' }, 300, 140);
check('slider: reflects 40% open', (await page.$eval('#w .iq-cover-range', (e) => e.value)) === '40');
const box = await (await page.$('#w .iq-cover-range')).boundingBox();
await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
await page.waitForTimeout(300);
check('slider sets position', last()?.action === 'position' && Math.abs(last().value - 80) <= 4, JSON.stringify(last()));
await T.mount(page, 'cover', { entity: 'cover.gate', variant: 'slider' }, 300, 140);
check('slider without position support: buttons only', !(await page.$('#w .iq-cover-range')) && (await page.$$('#w .iq-cover-btn')).length === 3);
// compact
await T.mount(page, 'cover', { entity: 'cover.blind', variant: 'compact' }, 300, 80);
check('compact: icon buttons + bar', (await page.$$('#w .iq-cover-btn')).length === 3 && !!(await page.$('#w .iq-cover-bar')));
// window unchanged
await T.mount(page, 'cover', { entity: 'cover.blind' }, 300, 200);
check('window variant unchanged', (await vis('#w .vw__win')) && !(await page.$('#w .iq-cover-alt')));
for (const [v, w, h] of [['garage', 150, 90], ['garage', 520, 160], ['compact', 160, 60], ['slider', 200, 100]]) {
  await T.mount(page, 'cover', { entity: 'cover.blind', variant: v }, w, h);
  const ok = await page.$eval('#w .vw', (e) => { const r = e.getBoundingClientRect(); return [...e.querySelectorAll('.iq-cover-alt__name,.iq-cover-btn')].filter((x) => x.offsetParent).every((x) => { const b = x.getBoundingClientRect(); return b.right <= r.right + 1 && b.bottom <= r.bottom + 1; }); });
  check(`${v} fits ${w}x${h}`, ok);
}
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
