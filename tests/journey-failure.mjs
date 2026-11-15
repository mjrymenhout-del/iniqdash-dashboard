/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Journey E + HA disconnection / reconnection (real editor, real PHP server, FAKE Home Assistant that can drop, return errors, report
// unavailable entities or forget them): the dashboard stays visible and structurally usable, nothing pretends to be live, controls fail
// safe, the retry rate is bounded, recovery needs no reload, and no token appears anywhere in the page.
import { live, liveBrowser, FAKE_TOKEN } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const L = await live();
const B = await liveBrowser(L); const page = B.page;
await page.waitForTimeout(800);
const E = (fn, ...a) => page.evaluate(fn, ...a);
const lay = { desktop: { x: 1, y: 1, w: 4, h: 4 }, tablet: { w: 4, h: 4 }, mobile: { w: 4, h: 4 } };
const model = await E((lay) => { const R = window.MaisonRegistry; return { version: 3, app: { id: 'a', startPage: 'p', navigation: {} }, pages: [{ id: 'p', name: 'P', nav: true, items: [
  { id: 'l1', type: 'light', config: R.fullConfig('light', { entity: 'light.kitchen', name: 'Kitchen' }), layout: lay },
  { id: 'n1', type: 'numsel', config: R.fullConfig('numsel', { entity: 'number.level' }), layout: { ...lay, desktop: { ...lay.desktop, x: 5 } } },
  { id: 'g1', type: 'light', config: R.fullConfig('light', { entity: 'light.missing', name: 'Missing' }), layout: { ...lay, desktop: { ...lay.desktop, x: 9 } } }] }] }; }, lay);
const c = await E((m) => window.IniqDashStore.create('Failure', m), model);
await page.goto(`${L.base}/editor.html?d=${c.entry.id}`); await page.waitForFunction(() => window.editor && window.editor.dashboard(), null, { timeout: 15000 });
const txt = (id) => E((id) => { const w = document.querySelector(`[data-grid-id=${id}]`); return w ? w.innerText.replace(/\s+/g, ' ').trim() : null; }, id);
const st = () => E(() => window.IniqHA.status().state);
const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await page.waitForTimeout(400); } return false; };

check('connected: the light shows its live state', await until(async () => (await st()) === 'connected' && /Kitchen/.test(await txt('l1') || '')));
check('an entity Home Assistant does not know is shown as missing, not as a state', await until(async () => /not found|unknown|missing|unavailable|no longer/i.test(await txt('g1') || '')), await txt('g1'));
const structure = () => E(() => [...document.querySelectorAll('[data-grid-id]')].filter((n) => n.dataset.gridId !== 'dashboard').map((n) => n.dataset.gridId).join());

// ---- Home Assistant becomes unreachable
const n0 = L.haCalls.length; const t0 = Date.now();
L.ha.down = true;
check('the editor notices (status leaves "connected")', await until(async () => (await st()) !== 'connected', 20000));
check('the widgets stay on screen (structure unchanged)', (await structure()) === 'l1,n1,g1');
check('the light says Home Assistant is unreachable instead of pretending to be live', await until(async () => /unreachable|unavailable|offline|not connected/i.test(await txt('l1') || ''), 10000), await txt('l1'));
const callsBefore = L.haCalls.length;
const r = await E(() => window.IniqHA.call('light.kitchen', 'toggle'));
check('a control used during the outage fails safe (reports an error)', r && r.ok === false, JSON.stringify(r));
check('…and no service call reached Home Assistant', L.haCalls.slice(callsBefore).filter((x) => x.url.startsWith('/api/services/')).length === 0);
await page.waitForTimeout(14000);
const during = L.haCalls.slice(n0).length, secs = (Date.now() - t0) / 1000;
check(`the retry rate is bounded (backoff): ${during} requests in ${secs.toFixed(0)} s of outage`, during <= Math.ceil(secs / 2) + 4, String(during));
check('the page is still usable during the outage (editing mode opens)', await E(() => { window.editor.setEditing(true); return true; }));
await E(() => window.editor.setEditing(false));

// ---- an error from a proxy in front of HA (502) is treated the same way
L.ha.status = 502; await page.waitForTimeout(3000);
check('a proxy error (502) is "unavailable", not a crash', (await st()) !== 'connected' && B.errors.length === 0, `${await st()} ${B.errors.join('|')}`);
L.ha.status = 0; L.ha.down = false;
check('recovery needs no reload: the status becomes connected again', await until(async () => (await st()) === 'connected', 40000));
check('the light is live again', await until(async () => !/unreachable/i.test(await txt('l1') || '') && /Kitchen/.test(await txt('l1') || ''), 10000), await txt('l1'));

// ---- an entity becomes unavailable
L.setEntity('light.kitchen', 'unavailable');
check('an unavailable entity is shown as unavailable', await until(async () => /unavailable/i.test(await txt('l1') || ''), 15000), await txt('l1'));
const noCtl = await E(() => { const w = document.querySelector('[data-grid-id=l1]'); const cs = [...w.querySelectorAll('button, input[type=range]')]; return cs.length > 0 && cs.every((b) => b.disabled || b.closest('[inert]')); });
check('its controls take no input from the keyboard either (inert, out of the tab order)', noCtl);
check('…nor from the pointer', await E(() => getComputedStyle(document.querySelector('[data-grid-id=l1] .lw')).pointerEvents === 'none' || getComputedStyle(document.querySelector('[data-grid-id=l1] .iqha > :first-child')).pointerEvents === 'none'));
const ca = L.haCalls.length; const ru = await E(() => window.IniqHA.call('light.kitchen', 'toggle'));
check('and the server refuses actions on it (409)', ru && ru.ok === false && L.haCalls.slice(ca).filter((x) => x.url.startsWith('/api/services/')).length === 0, JSON.stringify(ru));
L.setEntity('light.kitchen', 'on');
check('it recovers when the entity returns', await until(async () => !/unavailable/i.test(await txt('l1') || ''), 15000), await txt('l1'));
check('…and its controls work again (no longer inert)', await E(() => ![...document.querySelectorAll('[data-grid-id=l1] button')].some((b) => b.closest('[inert]'))));
// ---- an entity is removed from Home Assistant
L.removeEntity('number.level');
check('a removed entity is shown as missing, the rest keeps working', await until(async () => /not found|unknown|missing|unavailable|no longer/i.test(await txt('n1') || ''), 15000) && /Kitchen/.test(await txt('l1') || ''), await txt('n1'));

// ---- the token never shows up on the page
const dump = await E(() => document.documentElement.outerHTML + JSON.stringify(Object.assign({}, localStorage)) + JSON.stringify(Object.assign({}, sessionStorage)));
check('no Home Assistant token (or its address) in the page, local or session storage', !dump.includes(FAKE_TOKEN) && !dump.includes(L.haUrl));
check('no resource (script, style, image, file) failed to load', B.failed.filter((f) => !/\/api\//.test(f)).length === 0, B.failed.filter((f) => !/\/api\//.test(f)).join(', '));
check('no uncaught errors in the whole journey', B.errors.length === 0, B.errors.join(' | ').slice(0, 300));
await B.close(); await L.close();

// ---- Home Assistant not configured at all: structurally usable, demo data clearly marked
const L2 = await live({ configureHa: false }); const B2 = await liveBrowser(L2); const p2 = B2.page;
await p2.waitForTimeout(2500);
check('not configured: status says so and the editor works', (await p2.evaluate(() => window.IniqHA.status().state)) === 'not_configured' && (await p2.evaluate(() => window.editor.getModel().pages.length)) > 0);
check('not configured: no uncaught errors', B2.errors.length === 0, B2.errors.join('|'));
await B2.close(); await L2.close();
console.log('finished');
