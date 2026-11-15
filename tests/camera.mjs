/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
import { start, check } from './lib/harness.mjs';
const T = await start([
  ['camera.door', 'idle', { name: 'Door', f: 2, cst: 'hls' }],
  ['binary_sensor.bell', 'off', { name: 'Bell', dc: 'sound' }],
  ['event.bell_event', new Date(Date.now() - 20000).toISOString(), { name: 'Bell event', dc: 'doorbell' }],
  ['binary_sensor.motion', 'on', { name: 'Motion', dc: 'motion' }],
  ['lock.front', 'locked', { name: 'Front' }],
  ['sensor.bell_batt', '12', { name: 'Batt', unit: '%', dc: 'battery' }],
]);
// a tiny PNG for the snapshot endpoint
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const page = await T.page();
let snaps = 0;
await page.route('**/api/ha_cam.php*', (r) => { snaps++; r.fulfill({ body: PNG, contentType: 'image/png' }); });
const q = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const vis = (sel) => page.$eval(sel, (e) => !!e.offsetParent).catch(() => false);

await T.mount(page, 'camera', { entity: 'camera.door' }, 360, 220);
await page.waitForTimeout(600);
check('picture: image loaded through IniqDash, no chips', (await page.$eval('#w .cam', (e) => e.dataset.img)) === 'ok' && !(await vis('#w .cam__chips')));
check('picture: enlarge button', await vis('#w .cam__expand'));
await page.click('#w .cam__expand');
check('enlarged picture opens a modal dialog', await page.$eval('.iq-cam-lightbox', (d) => d.open));
const before = snaps;
await page.waitForTimeout(3300);
check('enlarged picture refreshes while open', snaps > before);
await page.click('.iq-cam-lightbox button'); await page.waitForTimeout(200);
check('dialog closes and is removed', !(await page.$('.iq-cam-lightbox')));
// doorbell
await T.mount(page, 'camera', { entity: 'camera.door', variant: 'doorbell', mappings: { ring: 'binary_sensor.bell', motion: 'binary_sensor.motion', lock: 'lock.front', battery: 'sensor.bell_batt' } }, 400, 240);
await page.waitForTimeout(600);
const chips = await page.$$eval('#w .cam__chip', (c) => c.map((x) => x.textContent));
check('doorbell chips in HA words (Doorbell/Motion/Door/Battery)', chips.join('|') === 'Doorbell: Clear|Motion: Detected|Door: Locked|Battery: 12%', chips.join('|'));
check('not ringing (bell binary sensor is off)', (await page.$eval('#w .cam', (e) => e.dataset.ringing)) === 'false');
await T.mount(page, 'camera', { entity: 'camera.door', variant: 'doorbell', mappings: { ring: 'event.bell_event' } }, 400, 240);
await page.waitForTimeout(600);
check('event entity: ringing just now (20 s ago)', (await q('#w .cam__chip')) === 'Last ring: just now' && (await page.$eval('#w .cam', (e) => e.dataset.ringing)) === 'true', await q('#w .cam__chip'));
await T.mount(page, 'camera', { entity: 'camera.door', variant: 'doorbell' }, 400, 240);
check('doorbell without mappings: no chips (nothing guessed)', !(await vis('#w .cam__chips')));
await T.mount(page, 'camera', { entity: 'camera.door', variant: 'doorbell', mappings: { lock: 'sensor.bell_batt' } }, 400, 240);
await page.waitForTimeout(400);
check('mapping to the wrong domain is ignored', !(await vis('#w .cam__chips')));
await T.mount(page, 'camera', { entity: 'camera.door', variant: 'doorbell', mappings: { motion: 'binary_sensor.nope' } }, 400, 240);
await page.waitForTimeout(500);
check('unknown mapped entity says not found', (await q('#w .cam__chip')) === 'Motion: not found', await q('#w .cam__chip'));
for (const [w, h] of [[160, 100], [260, 150], [500, 320]]) {
  await T.mount(page, 'camera', { entity: 'camera.door', variant: 'doorbell', mappings: { ring: 'binary_sensor.bell', motion: 'binary_sensor.motion' } }, w, h);
  await page.waitForTimeout(400);
  const ok = await page.$eval('#w .cam', (e) => { const r = e.getBoundingClientRect(); return [...e.querySelectorAll('.cam__chips,.cam__bar,.cam__expand')].filter((x) => x.offsetParent).every((x) => { const b = x.getBoundingClientRect(); return b.right <= r.right + 1 && b.bottom <= r.bottom + 1 && b.left >= r.left - 1 && b.top >= r.top - 1; }); });
  check(`doorbell inside ${w}x${h}`, ok);
}
await T.mount(page, 'camera', {}, 360, 220);
check('demo camera unchanged', (await page.$eval('#w .cam', (e) => e.dataset.variant)) === 'picture');
await T.mount(page, 'camera', { variant: 'doorbell', demoRing: true }, 360, 220);
check('demo doorbell ringing preview', (await page.$eval('#w .cam', (e) => e.dataset.ringing)) === 'true');
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
