/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Responsive Preview Studio (real editor): a preview size is an exact LOGICAL CSS viewport. Zoom (Fit / 50 / 75 / 100) is only a
// visual transform and must never change the layout: same logical width, same breakpoint, same widget size classes.
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page({ width: 1500, height: 1000 });
await page.waitForTimeout(1500);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const settle = (ms = 300) => page.waitForTimeout(ms);
const logical = () => page.evaluate(() => { const f = document.querySelector('.ed-frame'); return { w: f.offsetWidth, h: f.offsetHeight, bp: document.querySelector('[data-k=pv-info]').dataset.bp, info: document.querySelector('[data-k=pv-info]').textContent }; });
const fitSig = () => page.evaluate(() => [...document.querySelectorAll('.ed-frame [data-widget]')].map((w) => `${w.dataset.widget}:${[...w.classList].filter((c) => /fit|^is-/.test(c)).join('.')}:${w.offsetWidth}x${w.offsetHeight}`).join('|'));
const pick = async (v) => { await page.selectOption('[data-k=pv-device]', v); await settle(500); };
await page.evaluate(() => window.editor.setEditing(true)); await settle();

const expect = [['1366x768', 1366, 768, 'desktop'], ['1024x768', 1024, 768, 'tablet'], ['768x1024', 768, 1024, 'tablet'], ['390x844', 390, 844, 'mobile'], ['360x800', 360, 800, 'mobile'], ['430x932', 430, 932, 'mobile']];
for (const [v, w, h, bp] of expect) {
  const opts = await page.$$eval('[data-k=pv-device] option', (o) => o.map((x) => x.value));
  if (!opts.includes(v)) { check(`preset ${v} exists`, false); continue; }
  await pick(v);
  const l = await logical();
  check(`${v}: logical viewport is exactly ${w} × ${h}`, l.w === w && l.h === h, JSON.stringify(l));
  check(`${v}: breakpoint is ${bp}`, l.bp === bp, l.bp);
}
// zoom never changes the logical layout
await pick('768x1024');
const base = { l: await logical(), f: await fitSig() };
for (const z of ['fit', '0.5', '0.75', '1']) {
  await page.click(`[data-zoom="${z}"]`); await settle(400);
  const l = await logical(), f = await fitSig();
  check(`zoom ${z}: logical size, breakpoint and widget sizes unchanged`, l.w === base.l.w && l.h === base.l.h && l.bp === base.l.bp && f === base.f, `${l.w}x${l.h} ${l.bp}`);
}
// rotate swaps the logical dimensions
await page.click('[data-k=pv-rotate]'); await settle(400);
let l = await logical();
check('rotate swaps width and height', l.w === 1024 && l.h === 768, JSON.stringify(l));
// custom width × height
await page.fill('[data-k=pv-w]', '500'); await page.fill('[data-k=pv-h]', '700'); await page.press('[data-k=pv-h]', 'Tab'); await settle(500);
l = await logical();
check('custom W × H is applied exactly', l.w === 500 && l.h === 700, JSON.stringify(l));
check('custom 500 wide is the mobile breakpoint (content width below 560 is mobile)', l.bp === 'mobile', l.bp);
// absurd sizes are clamped, not trusted
await page.fill('[data-k=pv-w]', '99999'); await page.press('[data-k=pv-w]', 'Tab'); await settle(400);
l = await logical();
check('width is clamped to the supported range', l.w <= 3840 && l.w >= 240, String(l.w));
// the dashboard scrolls INSIDE the fixed viewport (frame size does not follow the content)
await pick('390x844');
const sc = await page.evaluate(() => { const f = document.querySelector('.ed-frame'); return { fh: f.offsetHeight, inner: [...f.querySelectorAll('*')].some((n) => n.scrollHeight > n.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(n).overflowY)) }; });
check('the preview height stays the chosen height', sc.fh === 844, JSON.stringify(sc));
// saved preset, then selectable
await pick('390x844');
await page.fill('[data-k=pv-w]', '411'); await page.fill('[data-k=pv-h]', '731'); await page.press('[data-k=pv-h]', 'Tab'); await settle(400);
const hasSave = await page.$('[data-k=pv-save]');
if (hasSave) {
  await page.click('[data-k=pv-save]'); await settle(200);
  if (await page.$('[data-k=preset-name]')) { await page.fill('[data-k=preset-name]', 'My phone'); await page.keyboard.press('Enter'); await settle(300); }
  const opts = await page.$$eval('[data-k=pv-device] option', (o) => o.map((x) => x.textContent));
  check('a saved preset is offered', opts.some((t) => /My phone/.test(t)), opts.filter((t) => /411|phone/i.test(t)).join('|'));
}
// "current browser window" is labelled as the window, never as a screen/device
const labels = await page.$$eval('[data-k=pv-device] option', (o) => o.map((x) => x.textContent));
const win = labels.find((t) => /browser window/i.test(t));
check('"Current browser window" is offered and labelled as the window', !!win && !/screen|device/i.test(win), String(win));
// multi preview shows several logical sizes at once, without changing the main one
const mainBefore = await logical();
await page.click('[data-k=pv-multi]'); await settle(900);
check('multi preview shows more than one preview frame', (await page.$$('.ed-mini, .ed-multi__item, [data-mini]')).length >= 2 || (await page.$$('.ed-minis > *')).length >= 2);
const mainAfter = await logical();
check('multi preview leaves the main logical size alone', mainAfter.w === mainBefore.w && mainAfter.h === mainBefore.h);
await page.click('[data-k=pv-multi]'); await settle(300);
// width scrubber
await page.click('[data-k=pv-scrub]'); await settle(300);
await page.fill('[data-k=pv-range]', '700'); await page.dispatchEvent('[data-k=pv-range]', 'input'); await settle(400);
l = await logical();
check('the width scrubber sets the logical width', l.w === 700, JSON.stringify(l));
check('no page errors', errors.length === 0, errors.join('|'));
await T.close();
console.log('finished');
