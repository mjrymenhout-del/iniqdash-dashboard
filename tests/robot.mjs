/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
import { start, check } from './lib/harness.mjs';

const VAC = ['vacuum.rocky', 'docked', { name: 'Rocky', f: 8192 | 4 | 8 | 16 | 32 | 512, bat: 77, fs: 'Quiet', fsl: ['Quiet', 'Turbo'] }];
const MOW = ['lawn_mower.mo', 'mowing', { name: 'Mo', f: 1 | 2 | 4 }];
const BAT = ['sensor.mo_battery', '55', { name: 'Mo battery', unit: '%', dc: 'battery' }];
const T = await start([VAC, MOW, BAT, ['vacuum.old', 'cleaning', { name: 'Old', f: 4 }]]);
const page = await T.page();
const txt = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const reqs = () => page.$$eval('#w .iq-robot__btn', (b) => b.map((x) => x.dataset.req));

// vacuum, docked: Start, Dock-not-offered (already docked), Locate; battery from the attribute; fan list
await T.mount(page, 'robot', { entity: 'vacuum.rocky', name: 'Rocky' }, 420, 220);
check('vacuum state in HA words', (await txt('#w .iq-robot__state')) === 'Docked', await txt('#w .iq-robot__state'));
check('vacuum battery 77%', (await txt('#w .iq-robot__pct')) === '77%');
let r = await reqs();
check('docked vacuum: start+locate only', r.join() === 'start,locate', r.join());
check('fan speed select offered', (await page.$$('#w .iq-robot__fan-sel option')).length === 2);
await page.click('#w .iq-robot__btn[data-req=start]');
await page.waitForTimeout(300);
check('start sent through the secure channel', T.calls.some((c) => c.entity === 'vacuum.rocky' && c.action === 'start'));
// vacuum without START/stop/dock: nothing but pause while cleaning
await T.mount(page, 'robot', { entity: 'vacuum.old' }, 420, 220);
r = await reqs();
check('limited vacuum (pause only) offers only pause', r.join() === 'pause', r.join());
// mower: battery only through the mapped sensor; no locate/spot/fan
await T.mount(page, 'robot', { entity: 'lawn_mower.mo', mappings: { battery: 'sensor.mo_battery' } }, 420, 220);
check('mower profile', (await page.$eval('#w .iq-robot', (e) => e.dataset.kind)) === 'mower');
check('mower battery from the mapped sensor', (await txt('#w .iq-robot__pct')) === '55%', await txt('#w .iq-robot__pct'));
r = await reqs();
check('mowing mower: pause+dock', r.join() === 'pause,dock', r.join());
check('no fan select for a mower', await page.$eval('#w .iq-robot__fan', (e) => e.hidden));
await T.mount(page, 'robot', { entity: 'lawn_mower.mo' }, 420, 220);
check('no battery shown when nothing reports one', await page.$eval('#w .iq-robot__bat', (e) => e.hidden));
// variants + responsive
for (const v of ['standard', 'compact', 'status']) {
  await T.mount(page, 'robot', { entity: 'vacuum.rocky', variant: v }, 420, 220);
  const n = (await reqs()).length;
  check(`variant ${v}: ${v === 'status' ? 'no controls' : 'has controls'}`, v === 'status' ? n === 0 : n > 0);
}
for (const [w, h] of [[420, 220], [260, 120], [160, 90], [120, 60]]) {
  await T.mount(page, 'robot', { entity: 'vacuum.rocky' }, w, h);
  const ok = await page.$eval('#w .iq-robot', (e) => { const r = e.getBoundingClientRect(); return [...e.querySelectorAll('.iq-robot__state,.iq-robot__btn:not(.is-cut)')].filter((x) => x.offsetParent).every((x) => { const b = x.getBoundingClientRect(); return b.right <= r.right + 1 && b.bottom <= r.bottom + 1; }); });
  check(`fits inside ${w}x${h}`, ok);
}
// demo (unlinked)
await T.mount(page, 'robot', { name: 'Demo' }, 420, 220);
await page.click('#w .iq-robot__btn[data-req=start]');
check('demo changes its own state, sends nothing', (await txt('#w .iq-robot__state')) === 'Cleaning' && T.calls.filter((c) => c.entity === undefined).length === 0);
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
