/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
import { start, check } from './lib/harness.mjs';
const T = await start([
  ['person.marcel', 'home', { name: 'Marcel', src: 'device_tracker.pixel' }],
  ['person.guest', 'not_home', { name: 'Guest' }],
  ['person.work', 'Office', { name: 'Worker', src: 'device_tracker.router_phone' }],
  ['device_tracker.pixel', 'home', { name: 'Pixel 8', stt: 'gps', bat: 15, lat: 52.3 }],
  ['device_tracker.router_phone', 'Office', { name: 'Phone (router)', stt: 'router' }],
]);
const page = await T.page();
const q = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const vis = (sel) => page.$eval(sel, (e) => !!e.offsetParent).catch(() => false);

await T.mount(page, 'person', { entity: 'person.marcel', name: 'Marcel' }, 220, 220);
check('portrait: presence in HA words', (await q('#w .pr__state-t')) === 'Home' && (await page.$eval('#w .pr', (e) => e.dataset.variant)) === 'portrait');
check('tracker line hidden unless asked', !(await q('#w .pr__more'))?.includes('Tracked'));
await T.mount(page, 'person', { entity: 'person.marcel', name: 'Marcel', showTracker: true }, 300, 120);
await page.waitForTimeout(2600);   // the tracker joins the shared poll (next 2 s tick)
check('tracker line: name + how it tracks', (await q('#w .pr__more')).includes('Tracked by Pixel 8 (GPS)'), await q('#w .pr__more'));
await T.mount(page, 'person', { entity: 'person.marcel', name: 'Marcel', ring: 'tracker' }, 220, 220);
await page.waitForTimeout(2600);   // the tracker joins the shared poll (next 2 s tick)
check('tracker battery draws the ring', (await page.$eval('#w .pr', (e) => e.dataset.ring)) === 'yes');
await T.mount(page, 'person', { entity: 'person.guest', name: 'Guest', ring: 'tracker', showTracker: true }, 300, 120);
await page.waitForTimeout(2600);   // the tracker joins the shared poll (next 2 s tick)
check('no tracker reported: no ring, no tracker line', (await page.$eval('#w .pr', (e) => e.dataset.ring)) === 'no' && !(await q('#w .pr__more'))?.includes('Tracked'));
await T.mount(page, 'person', { entity: 'person.work', name: 'Worker', showTracker: true, ring: 'tracker' }, 300, 120);
await page.waitForTimeout(2600);   // the tracker joins the shared poll (next 2 s tick)
check('router tracker: line, but no battery → no ring', (await q('#w .pr__more')).includes('(router)') && (await page.$eval('#w .pr', (e) => e.dataset.ring)) === 'no', await q('#w .pr__more'));
check('zone shown by name', (await q('#w .pr__state-t')) === 'Office');
// a device tracker linked directly
await T.mount(page, 'person', { entity: 'device_tracker.pixel', name: 'Pixel', showTracker: true }, 300, 120);
await page.waitForTimeout(400);
check('device_tracker as the primary entity', (await q('#w .pr__state-t')) === 'Home' && (await q('#w .pr__more')).includes('Tracked by Pixel 8'), await q('#w .pr__more'));
check('no coordinates anywhere in the DOM', !(await page.evaluate(() => document.body.innerHTML.includes('52.3'))));
for (const v of ['portrait', 'row', 'compact', 'status']) {
  await T.mount(page, 'person', { entity: 'person.marcel', name: 'Marcel', variant: v }, v === 'portrait' ? 200 : 300, v === 'portrait' ? 240 : 90);
  check(`${v}: name + presence visible`, (await q('#w .pr__name')) === 'Marcel' && (await vis('#w .pr__state-t')));
  check(`${v}: avatar ${v === 'status' ? 'hidden' : 'shown'}`, (await vis('#w .pr__av')) === (v !== 'status'));
  const ok = await page.$eval('#w .pr', (e) => { const r = e.getBoundingClientRect(); return [...e.querySelectorAll('.pr__av,.pr__name,.pr__state')].filter((x) => x.offsetParent).every((x) => { const b = x.getBoundingClientRect(); return b.right <= r.right + 1 && b.bottom <= r.bottom + 1 && b.left >= r.left - 1 && b.top >= r.top - 1; }); });
  check(`${v}: inside its box`, ok);
}
// row forced even in a tall tile
await T.mount(page, 'person', { entity: 'person.marcel', name: 'Marcel', variant: 'row' }, 200, 260);
check('row in a tall tile: avatar beside the text', await page.$eval('#w .pr', (e) => { const a = e.querySelector('.pr__av').getBoundingClientRect(), n = e.querySelector('.pr__name').getBoundingClientRect(); return n.left >= a.right - 1; }));
await T.mount(page, 'person', {}, 200, 200);
check('demo person unchanged', (await q('#w .pr__name')) === 'Marcel');
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
