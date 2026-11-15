/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
import { start, check } from './lib/harness.mjs';
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const T = await start([
  ['timer.run', 'active', { name: 'Run', dur: '0:05:00', fin: iso(90000) }],
  ['timer.paused', 'paused', { name: 'Paused', dur: '0:10:00', rem: '0:03:21' }],
  ['timer.idle', 'idle', { name: 'Idle', dur: '0:05:00' }],
  ['timer.noend', 'active', { name: 'NoEnd', dur: '0:05:00' }],
  ['timer.gone', 'unavailable', { name: 'Gone' }],
]);
const page = await T.page();
const q = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const reqs = () => page.$$eval('#w .iq-timer__btn', (b) => b.map((x) => x.dataset.req));
const last = () => T.calls[T.calls.length - 1];

await T.mount(page, 'timer', { entity: 'timer.run' }, 240, 300);
const t1 = await q('#w .iq-timer__time');
check('active: counts to HA\'s finish moment (~1:2x–1:3x left)', /^1:(2\d|3\d)$/.test(t1), t1);
await page.waitForTimeout(2200);
const t2 = await q('#w .iq-timer__time');
check('active: counts down on its own', t2 !== t1, `${t1} → ${t2}`);
check('active: Pause + Cancel', (await reqs()).join() === 'pause,cancel');
await page.click('#w .iq-timer__btn--pause');
await page.waitForTimeout(300);
check('pause sent', last()?.entity === 'timer.run' && last().action === 'pause');
await T.mount(page, 'timer', { entity: 'timer.paused' }, 240, 300);
check('paused: HA\'s remaining 3:21, state Paused', (await q('#w .iq-timer__time')) === '3:21' && (await q('#w .iq-timer__state')) === 'Paused');
check('paused: Resume + Cancel', (await reqs()).join() === 'start,cancel' && (await q('#w .iq-timer__btn--start')) === 'Resume');
await T.mount(page, 'timer', { entity: 'timer.idle' }, 240, 300);
check('idle: Ready with the configured duration', (await q('#w .iq-timer__time')) === '5:00' && (await q('#w .iq-timer__state')) === 'Ready');
await page.click('#w .iq-timer__btn--start');
await page.waitForTimeout(300);
check('start sent', last()?.entity === 'timer.idle' && last().action === 'start');
await T.mount(page, 'timer', { entity: 'timer.noend' }, 240, 300);
check('active without a finish moment: NO invented countdown', (await q('#w .iq-timer__time')) === 'Running' && (await q('#w .iq-timer__state')) === 'No end time reported', await q('#w .iq-timer__time'));
await T.mount(page, 'timer', { entity: 'timer.gone' }, 240, 300);
check('unavailable: no controls, no time', (await reqs()).length === 0 && (await q('#w .iq-timer__time')) === '—');
await T.mount(page, 'timer', { entity: 'timer.run', variant: 'compact' }, 320, 64);
check('compact: time + name + pause', /^1:/.test(await q('#w .iq-timer__time')) && (await reqs()).includes('pause'));
for (const [v, w, h] of [['ring', 140, 170], ['ring', 300, 160], ['compact', 200, 56], ['ring', 220, 320]]) {
  await T.mount(page, 'timer', { entity: 'timer.run', variant: v }, w, h);
  const ok = await page.$eval('#w .iq-timer', (e) => { const r = e.getBoundingClientRect(); return [...e.querySelectorAll('.iq-timer__time,.iq-timer__btn,.iq-timer__svg')].filter((x) => getComputedStyle(x).display !== 'none' && x.getClientRects().length > 0).every((x) => { const b = x.getBoundingClientRect(); return b.right <= r.right + 1 && b.bottom <= r.bottom + 1 && b.left >= r.left - 1 && b.top >= r.top - 1; }); });
  check(`${v} stays inside ${w}x${h}`, ok);
}
await T.mount(page, 'timer', {}, 240, 300);
check('demo timer (active): counts from its own demo time', /^[34]:/.test(await q('#w .iq-timer__time')), await q('#w .iq-timer__time'));
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
