/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// TEMPLATES, the "Open a web address" action, glass blur and content size (real server, the SIMULATED home):
//   1  IniqTemplate on its own: values, units, conditions (words: gt / lt), filters, relative time, entity list; invalid templates are
//      reported and shown as "—"; nothing that looks like code is ever run
//   2  a Text widget with templates shows live values and follows a change in Home Assistant (a lock locked / unlocked)
//   3  an invalid template is refused by the configuration (a readable message), a valid one is saved
//   4  Tap → Open a web address: a new tab, noopener; only http(s) addresses are kept
//   5  Glass blur and Content size reach the card and are saved; out-of-range values are clamped / dropped
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const L1 = (y, w = 6, h = 2) => ({ desktop: { x: 1, y, w, h }, tablet: { x: 1, y, w, h }, mobile: { w: 4, h } });
const dash = { version: 3, app: { id: 't', startPage: 'p', navigation: {}, simulated: true }, pages: [{ id: 'p', name: 'P', nav: true, items: [
  { id: 'tpl', type: 'text', config: { variant: 'text', primary: "House {{ value('sensor.demo_energy_house') }} · solar {{ num('sensor.demo_energy_solar') / 1000 | round(1) }} kW",
    secondary: "Car {{ 'locked' if is('lock.demo_car_doors', 'locked') else 'OPEN' }} · {{ 'sunny' if num('sensor.demo_energy_solar') gt 1000 else 'dull' }}" }, layout: L1(1) },
  { id: 'link', type: 'sensor', config: { name: 'Link', entity: 'sensor.demo_energy_house', interactions: { tap: { action: 'url', url: 'https://www.home-assistant.io/' }, longPress: { action: 'url', url: 'javascript:alert(1)' } },
    bgBlur: 12, contentScale: 120, widgetBg: 'opacity', widgetBgOpacity: 40 }, layout: L1(4, 4, 3) },
] }] };

let L, B;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const id = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Templates', dashboard: dash })).json()).entry.id;
  B = await liveBrowser(L, { viewport: { width: 1300, height: 900 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  // ---- 1
  const u = await E(() => {
    const T = window.IniqTemplate, now = Date.parse('2026-11-13T12:00:00Z');
    const db = { 'sensor.t': { state: '21.46', unit: '°C', name: 'Living', changed: '2026-11-13T11:55:00Z', attrs: { friendly_name: 'Living' } }, 'binary_sensor.door': { state: 'on', name: 'Front door' }, 'sensor.na': { state: 'unavailable' } };
    const get = (id) => db[id] || null, r = (t) => T.render(t, get, now);
    window.__hit = 0;
    return {
      v: r("{{ value('sensor.t') }}"), n: r("{{ num('sensor.t') | round(1) }}"), c: r("{{ 'Warm' if num('sensor.t') gt 21 else 'Cool' }} / {{ 'Open' if is('binary_sensor.door', 'on') else 'Shut' }}"),
      f: r("{{ name('binary_sensor.door') | upper }} · {{ state('sensor.na') | default('n/a') }} · {{ 5 / 0 }} · {{ num('sensor.nope') }}"), s: r("updated {{ since('sensor.t') }}"),
      ids: T.ids("{{ state('sensor.a') }} {{ attr('light.b', 'brightness') }} {{ now() }}"),
      bad: ["{{ state('x' }}", "{{ constructor }}", "{{ state('a').__proto__ }}", "{{ alert(1) }}", "{{ '1' | eval }}", '{{ ' + 'state('.repeat(30) + "'a'" + ')'.repeat(30) + ' }}'].map((t) => [T.valid(t).ok, r(t)]),
      hit: window.__hit, plain: r('no template here'),
    };
  });
  check('1 · templates: value with unit, number + filter, conditions with words, filters, relative time, the entities read; invalid ones are reported and shown as "—" (nothing run)',
    u.v === '21.46 °C' && u.n === '21.5' && u.c === 'Warm / Open' && u.f === 'FRONT DOOR · n/a · — · —' && u.s === 'updated 5 min ago' && JSON.stringify(u.ids) === '["sensor.a","light.b"]'
      && u.bad.every(([ok, out]) => !ok && out === '—') && u.hit === 0 && u.plain === 'no template here', JSON.stringify(u));
  // ---- 2
  await p.goto(`${L.base}/?d=${id}`); await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 });
  await p.waitForFunction(() => /1\.8 kW|1,800 W/.test(document.querySelector('[data-grid-id="tpl"] .tx__p')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  await wait(500);
  const t1 = await E(() => [document.querySelector('[data-grid-id="tpl"] .tx__p').textContent, document.querySelector('[data-grid-id="tpl"] .tx__s').textContent]);
  await E(() => window.IniqHA.call('lock.demo_car_doors', 'unlock'));
  await p.waitForFunction(() => /OPEN/.test(document.querySelector('[data-grid-id="tpl"] .tx__s')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  const t2 = await E(() => document.querySelector('[data-grid-id="tpl"] .tx__s').textContent);
  await E(() => window.IniqHA.call('lock.demo_car_doors', 'lock'));
  check('2 · a Text widget with templates shows live values ("House 1,800 W · solar 4.2 kW", "Car locked · sunny") and follows Home Assistant (unlocked → "Car OPEN")',
    /House 1,?800 W · solar 4\.2 kW/.test(t1[0]) && t1[1] === 'Car locked · sunny' && /^Car OPEN/.test(t2), JSON.stringify({ t1, t2 }));
  // ---- 4 · url action
  await E(() => { window.__opened = []; window.open = (u, t, f) => { window.__opened.push([u, t, f]); return null; }; });
  await p.click('[data-grid-id="link"] .iq-wsurf, [data-grid-id="link"] > *'); await wait(500);
  const opened = await E(() => window.__opened);
  const cfgLink = await E(() => window.editor.getModel().pages[0].items.find((i) => i.id === 'link').config.interactions);
  check('4 · Tap → Open a web address: a new tab with noopener; a javascript: address is never kept', opened.length === 1 && opened[0][0] === 'https://www.home-assistant.io/' && opened[0][1] === '_blank' && /noopener/.test(opened[0][2]) && !cfgLink.longPress?.url && cfgLink.longPress?.action === 'none',
    JSON.stringify({ opened, cfgLink }));
  // ---- 5 · blur / scale
  const st = await E(() => { const r = document.querySelector('[data-grid-id="link"] .iq-wsurf'); return r ? { bf: r.style.backdropFilter || r.style.getPropertyValue('-webkit-backdrop-filter'), zoom: r.style.zoom, w: r.style.width } : null; });
  const clamp = await E(() => { const c = window.MaisonRegistry.fullConfig('sensor', { name: 'x', bgBlur: 99, contentScale: 10 }); return [c.bgBlur, c.contentScale]; });
  check('5 · glass blur 12 px and content size 120 % reach the card (backdrop blur, zoom with the box compensated); 99 px → 24, 10 % → 80 (clamped)',
    st && /blur\(12px\)/.test(st.bf) && st.zoom === '1.2' && /83\.3/.test(st.w) && clamp[0] === 24 && clamp[1] === 80, JSON.stringify({ st, clamp }));
  // ---- 3 · the configuration refuses an invalid template, accepts a valid one
  const v = await E(() => { const R = window.MaisonRegistry; return { bad: R.validateConfig('text', R.fullConfig('text', { primary: "{{ state('x' }}" })), ok: R.validateConfig('text', R.fullConfig('text', { primary: "{{ value('sensor.a') }}" })) }; });
  check('3 · the configuration refuses an unreadable template with a readable message and accepts a valid one', v.bad.some((e) => /template cannot be read/.test(e.message)) && v.ok.length === 0, JSON.stringify(v));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('templates-actions test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
