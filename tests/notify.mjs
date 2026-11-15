/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Notification presentation: event → rule → template → rendered surface. Plain text only, payload placeholders, dismissal, timeout,
// stacking limit, centre queue, no markup injection, disabled rules ignored, unknown template ignored.
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page({ width: 1200, height: 800 });
await page.waitForTimeout(1500);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.evaluate(() => {
  const layer = document.createElement('div'); layer.style.cssText = 'position:fixed;inset:0;pointer-events:none'; document.body.append(layer);
  const N = window.MaisonNotify, bus = N.createEvents(), center = N.createCenter({ layer });
  const templates = [{ id: 't1', name: 'Door', config: { title: '{name} is {state}', message: 'Check <b>{name}</b> {nope}', tone: 'warning', position: 'top-right', duration: 1 } },
    { id: 'tp', name: 'Pers', config: { title: 'Stay', persistent: true, position: 'bottom-left' } },
    { id: 'tc', name: 'Centre', config: { title: 'C', persistent: true, position: 'center' } }];
  const rules = [{ id: 'r1', event: 'ha.door', template: 't1', enabled: true }, { id: 'r2', event: 'ha.off', template: 't1', enabled: false },
    { id: 'r3', event: 'ha.missing', template: 'nope', enabled: true }, { id: 'r4', event: 'ha.stay', template: 'tp', enabled: true }, { id: 'r5', event: 'ha.c', template: 'tc', enabled: true }];
  window.__n = { bus, center, engine: N.createRules({ bus, rules: () => rules, templates: () => templates, center }), layer };
});
const act = (fn, ...a) => page.evaluate(fn, ...a);
await act(() => window.__n.bus.emit('ha.door', { name: 'Front door', state: 'open', obj: { x: 1 } }));
await page.waitForTimeout(100);
const t = await act(() => { const e = document.querySelector('.mnote'); return e && { title: e.querySelector('.mnote__title').textContent, msg: e.querySelector('.mnote__msg').textContent, role: e.getAttribute('role'), html: e.querySelector('.mnote__msg').innerHTML }; });
check('placeholders are filled from the event payload', t && t.title === 'Front door is open', JSON.stringify(t));
check('unknown placeholders stay as written', t && /\{nope\}/.test(t.msg));
check('markup in a template is shown as text, never parsed', t && /<b>/.test(t.msg) && !/<b>/.test(t.html.replace(/&lt;b&gt;/g, '')), t && t.html);
check('a warning is announced as an alert', t && t.role === 'alert');
await act(() => { window.__n.bus.emit('ha.off'); window.__n.bus.emit('ha.missing'); });
check('a disabled rule and an unknown template show nothing', (await act(() => window.__n.center.active().length)) === 1);
await page.waitForTimeout(2600);
check('a timed notification dismisses itself', (await act(() => window.__n.center.active().length)) === 0);
await act(() => window.__n.bus.emit('ha.stay'));
await act(() => document.querySelector('.mnote__close').click()); await page.waitForTimeout(800);
check('the close button dismisses a persistent notification', (await act(() => window.__n.center.active().length)) === 0 && (await page.$$('.mnote')).length === 0);
await act(() => { for (let i = 0; i < 7; i++) window.__n.center.show({ title: 'n' + i, persistent: true, position: 'top-left' }); });
await page.waitForTimeout(300);
check('a corner never holds more than 4', (await act(() => window.__n.center.active().filter((a) => a.position === 'top-left').length)) <= 4);
await act(() => window.__n.center.clear()); await page.waitForTimeout(1500);
await act(() => { window.__n.bus.emit('ha.c'); window.__n.bus.emit('ha.c'); window.__n.bus.emit('ha.c'); });
check('centre notifications queue one at a time', (await act(() => [window.__n.center.active().length, window.__n.center.queued()])).join() === '1,2');
await act(() => window.__n.center.clear()); await page.waitForTimeout(1500);
check('clear leaves no notification element behind', (await page.$$('.mnote')).length === 0);
// the fill function itself: scalars only, bounded
const f = await act(() => window.MaisonNotify.fill({ title: '{a}{b}{c}{d}', message: '{__proto__}{constructor}' }, { a: 1, b: true, c: { x: 1 }, d: 'x'.repeat(500) }));
check('only scalar payload values are used, long values are cut', f.title.startsWith('1true{c}') && f.title.length < 140 && f.message === '{__proto__}{constructor}', JSON.stringify(f).slice(0, 120));
check('no page errors', errors.length === 0, errors.join('|'));
await T.close();
console.log('finished');
