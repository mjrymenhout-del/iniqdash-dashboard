/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
import { start, check } from './lib/harness.mjs';
const now = new Date(Date.now() - 20000).toISOString();
const T = await start([
  ['media_player.full', 'playing', { name: 'Full', f: 1 | 4 | 8 | 16 | 32 | 16384 | 2048 | 32768 | 262144 | 128 | 256, title: 'Song', artist: 'Band', vol: 0.4, source: 'Radio', sources: ['Radio', 'TV'], mpos: 30, mposu: now, mdur: 200, shuf: false, rep: 'off' }],
  ['media_player.basic', 'paused', { name: 'Basic', f: 1 | 16384, title: 'Only', artist: '' }],
  ['media_player.off', 'off', { name: 'Off', f: 128 | 256 | 16384 }],
]);
const page = await T.page();
const q = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const vis = (sel) => page.$eval(sel, (e) => !!e.offsetParent).catch(() => false);
const last = () => T.calls[T.calls.length - 1];

await T.mount(page, 'media', { entity: 'media_player.full' }, 480, 220);
check('artwork: title', (await q('#w .mw__title')) === 'Song');
check('artwork: progress from the real position (~50s of 3:20)', (await q('#w .iq-media-prog__t')).startsWith('0:5') && (await q('#w .iq-media-prog__t')).endsWith('3:20'), await q('#w .iq-media-prog__t'));
check('shuffle + repeat + power controls exist (supported)', (await page.$$('#w .iq-media-opt')).length === 3);
await page.click('#w .iq-media-opt--shuffle');
await page.waitForTimeout(300);
check('shuffle sent', last()?.action === 'shuffle' && last().value === true, JSON.stringify(last()));
await page.click('#w .iq-media-opt--repeat');
await page.waitForTimeout(300);
check('repeat sent (off → all)', last()?.action === 'repeat' && last().value === 'all', JSON.stringify(last()));
await T.mount(page, 'media', { entity: 'media_player.basic' }, 480, 220);
check('basic player: no progress, no shuffle/repeat/power, no volume', !(await vis('#w .iq-media-prog')) && !(await page.$('#w .iq-media-opt')) && !(await page.$('#w .mw__vol')));
await T.mount(page, 'media', { entity: 'media_player.off' }, 480, 220);
check('off player with power: power button enabled', await page.$eval('#w .iq-media-opt--power', (b) => !b.disabled));
await page.click('#w .iq-media-opt--power');
await page.waitForTimeout(300);
check('power on sent', last()?.action === 'power' && last().value === true, JSON.stringify(last()));
for (const v of ['compact', 'minibar']) {
  await T.mount(page, 'media', { entity: 'media_player.full', variant: v }, v === 'compact' ? 320 : 420, v === 'compact' ? 80 : 48);
  check(`${v}: title + play`, (await q('#w .iq-media-alt__title')) === 'Song' && !!(await page.$('#w .iq-media-btn--play')));
  check(`${v}: hides the old card`, !(await vis('#w .mw__in')));
  const ok = await page.$eval('#w .mw', (e) => { const r = e.getBoundingClientRect(); return [...e.querySelectorAll('.iq-media-btn,.iq-media-alt__title')].filter((x) => x.offsetParent).every((x) => { const b = x.getBoundingClientRect(); return b.right <= r.right + 1 && b.bottom <= r.bottom + 1 && b.top >= r.top - 1; }); });
  check(`${v}: fits its box`, ok);
}
await page.click('#w .iq-media-btn--play');
await page.waitForTimeout(300);
check('minibar play/pause sends pause', last()?.action === 'pause' && last().entity === 'media_player.full', JSON.stringify(last()));
await T.mount(page, 'media', { entity: 'media_player.basic', variant: 'minibar' }, 420, 48);
check('minibar: no progress line without position/duration', !(await vis('#w .iq-media-prog--line')));
await T.mount(page, 'media', {}, 400, 200);
check('demo card still renders', (await q('#w .mw__title')) === 'Evening Tide');
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
