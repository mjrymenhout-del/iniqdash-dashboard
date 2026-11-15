/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// MOTION SAFETY / PERFORMANCE: timers stop when a widget leaves the page, nothing keeps a requestAnimationFrame loop, and with
// prefers-reduced-motion: reduce every widget animation is off (Energy Flow dots, Camera ringing, Washing Machine drum, recording dot).
import { start, check } from './lib/harness.mjs';
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const T = await start([
  ['timer.run', 'active', { name: 'Run', dur: '0:05:00', fin: iso(120000) }],
  ['media_player.m', 'playing', { name: 'M', f: 16384 | 1, title: 'T', mpos: 10, mposu: iso(-1000), mdur: 300 }],
  ['sensor.p', '1500', { name: 'P', unit: 'W', dc: 'power' }],
  ['sensor.g', '-800', { name: 'G', unit: 'W', dc: 'power' }],
  ['event.bell', iso(-5000), { name: 'Bell' }],
  ['camera.c', 'recording', { name: 'C', f: 2 }],
]);
const page = await T.page();
await page.addInitScript(() => {
  const live = new Set(), si = window.setInterval.bind(window), ci = window.clearInterval.bind(window);
  window.setInterval = (fn, ms, ...a) => { const id = si(fn, ms, ...a); live.add(id); return id; };
  window.clearInterval = (id) => { live.delete(id); ci(id); };
  window.__liveIntervals = () => live.size;
  let raf = 0; const r = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (f) => { raf++; return r(f); };
  window.__rafCount = () => raf;
});
await page.reload(); await page.waitForFunction(() => window.MaisonRegistry && window.IniqHA);
const live = () => page.evaluate(() => window.__liveIntervals());
const base = await live();
await T.mount(page, 'timer', { entity: 'timer.run' }, 240, 300);
await T.mount(page, 'media', { entity: 'media_player.m' }, 480, 240, 'w2');
await T.mount(page, 'sunmoon', {}, 300, 300, 'w3');
await page.waitForTimeout(800);
const running = await live();
check('active timer / playing media / sun & moon each hold their own interval while on the page', running >= base + 3, `${base} → ${running}`);
await page.evaluate(() => ['w', 'w2', 'w3'].forEach((id) => document.getElementById(id).remove()));
await page.waitForTimeout(1500);
check('every interval is cleared once the widgets have left the page (timer, media)', (await live()) <= base + 1, `${base} → ${await live()}`);
// the sun & moon widget refreshes every 5 minutes: it only clears at its next fire — it must not stack
check('no animation frame loop is running (rAF is not used by widgets while idle)', await (async () => { const a = await page.evaluate(() => window.__rafCount()); await page.waitForTimeout(700); return (await page.evaluate(() => window.__rafCount())) - a <= 5; })());
// reduced motion
await page.emulateMedia({ reducedMotion: 'reduce' });
await T.mount(page, 'energy', { entity: 'sensor.p', mappings: { grid: 'sensor.g' } }, 320, 320);
await page.waitForTimeout(700);
const dots = await page.$$eval('#w .iq-energy__dots', (d) => d.map((x) => getComputedStyle(x).animationName));
check('Energy Flow: dots do not animate with reduced motion', dots.length > 0 && dots.every((n) => n === 'none'), dots.join());
await T.mount(page, 'camera', { entity: 'camera.c', variant: 'doorbell', mappings: { ring: 'event.bell' } }, 360, 220);
await page.waitForTimeout(700);
check('Camera: the ringing frame and the recording dot are still with reduced motion', await page.evaluate(() => { const c = document.querySelector('#w .cam'); return getComputedStyle(c, '::after').animationName === 'none' && getComputedStyle(c.querySelector('.cam__dot')).animationName === 'none'; }));
await T.mount(page, 'appliance', { profile: 'washer', state: 'washing' }, 360, 260);
await page.waitForTimeout(500);
check('Washing Machine: the drum does not turn with reduced motion', await page.evaluate(() => [...document.querySelectorAll('#w [data-iqv-anim]')].every((e) => getComputedStyle(e).animationName === 'none')));
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
