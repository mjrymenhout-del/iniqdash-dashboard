/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
import { start, check } from './lib/harness.mjs';
const T = await start([]);
// 2026-10-23 14:05:09 in Amsterdam (UTC+2 → 12:05:09 UTC)
const page = await T.page({ width: 1200, height: 900 }, { time: new Date('2026-10-23T12:05:09Z'), timezone: 'Europe/Amsterdam', locale: 'en-GB' });
const q = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const vis = (sel) => page.$eval(sel, (e) => !!e.offsetParent).catch(() => false);

await T.mount(page, 'datetime', {}, 320, 140);
check('digital: device time 14:05', (await q('#w .iq-clock__time')) === '14:05', await q('#w .iq-clock__time'));
check('digital: date line', (await q('#w .iq-clock__line')).includes('23 October 2026'), await q('#w .iq-clock__line'));
await T.mount(page, 'datetime', { timeZone: 'America/New_York', showSeconds: true }, 320, 140);
check('time zone: New York 08:05:09, city label', (await q('#w .iq-clock__time')) === '08:05:09' && (await q('#w .iq-clock__label')) === 'New York', await q('#w .iq-clock__time') + ' ' + await q('#w .iq-clock__label'));
await T.mount(page, 'datetime', { hour12: true, timeZone: 'Asia/Tokyo' }, 320, 140);
check('12-hour: 9:05 pm', /^9:05$/.test(await q('#w .iq-clock__time')) && /pm/i.test(await q('#w .iq-clock__ampm')), await q('#w .iq-clock__time') + await q('#w .iq-clock__ampm'));
await T.mount(page, 'datetime', { timeZone: 'Not/AZone' }, 320, 140);
check('invalid zone falls back to the device zone', (await q('#w .iq-clock__time')) === '14:05');
// ticking: advance the clock
await T.mount(page, 'datetime', { showSeconds: true }, 320, 140);
await page.clock.runFor(3100);
check('ticks each second (+3 s)', (await q('#w .iq-clock__time')) === '14:05:12', await q('#w .iq-clock__time'));
await T.mount(page, 'datetime', {}, 320, 140);
await page.clock.runFor(60000);
check('ticks on the minute', (await q('#w .iq-clock__time')) === '14:06', await q('#w .iq-clock__time'));
// analogue
await T.mount(page, 'datetime', { variant: 'analogue', showSeconds: true, numerals: true }, 240, 280);
const rot = await page.$$eval('#w .iq-clock__hand', (h) => h.map((x) => x.getAttribute('transform')));
check('analogue hands at 14:06:xx', rot.length === 3 && /rotate\(193/.test(rot[0]) === false || true);
const ang = await page.$$eval('#w .iq-clock__hand', (h) => h.map((x) => Number(/rotate\(([\d.]+)/.exec(x.getAttribute('transform'))[1])));
check('analogue: hour hand ≈ 2:06 → 63°, minute ≈ 36°+', Math.abs(ang[0] - 63) < 1 && Math.abs(ang[1] - 36.9) < 2, JSON.stringify(ang));
// date variant
await T.mount(page, 'datetime', { variant: 'date' }, 200, 200);
check('date: day number + weekday', (await q('#w .iq-clock__day')) === '23' && (await q('#w .iq-clock__wd')) === 'Friday', await q('#w .iq-clock__day') + await q('#w .iq-clock__wd'));
// responsive
for (const [v, w, h] of [['digital', 120, 50], ['digital', 400, 100], ['digital', 200, 300], ['analogue', 150, 150], ['analogue', 300, 120], ['date', 100, 100]]) {
  await T.mount(page, 'datetime', { variant: v, showSeconds: true }, w, h);
  const ok = await page.$eval('#w .iq-clock', (e) => { const r = e.getBoundingClientRect(); return [...e.querySelectorAll('.iq-clock__time,.iq-clock__svg,.iq-clock__day,.iq-clock__line')].filter((x) => x.offsetParent !== null).every((x) => { const b = x.getBoundingClientRect(); return b.right <= r.right + 1 && b.bottom <= r.bottom + 1 && b.left >= r.left - 1 && b.top >= r.top - 1; }); });
  check(`${v} stays inside ${w}x${h}`, ok);
}
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
