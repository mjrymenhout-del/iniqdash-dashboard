/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// CLIMATE GROUP (real server, the SIMULATED home's thermostats):
//   1  every unit listed with its own temperature and mode; the average; a unit that does not exist is "Unavailable" (and ignored by the group)
//   2  the shared modes are only the ones EVERY available unit offers (the intersection — the pellet stove's "auto" is not offered)
//   3  the shared target +: each unit gets its own target + its own step, inside its own range (Home Assistant's state changes)
//   4  a shared mode: every unit switches to it; a unit's own − changes only that unit
//   5  the configuration: saved, reloaded; non-climate entities dropped
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const units = ['climate.demo_living', 'climate.demo_bedroom', 'climate.bedroom_parents', 'climate.no_such_unit'];   // demo units: off · heat · cool · auto; the parents' room: off · heat
const dash = { version: 3, app: { id: 'g', startPage: 'p', navigation: {}, simulated: true }, pages: [{ id: 'p', name: 'P', nav: true, items: [
  { id: 'cg', type: 'climategroup', config: { name: 'Heating', units }, layout: { desktop: { x: 1, y: 1, w: 5, h: 9 }, tablet: { x: 1, y: 1, w: 5, h: 9 }, mobile: { w: 4, h: 9 } } }] }] };

let L, B;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const id = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Group', dashboard: dash })).json()).entry.id;
  B = await liveBrowser(L, { viewport: { width: 1300, height: 900 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${L.base}/?d=${id}`); await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 });
  await p.waitForFunction(() => document.querySelectorAll('[data-grid-id="cg"] .iq-cg__unit[data-available="true"]').length >= 3, null, { timeout: 15000 }).catch(() => {});
  await wait(600);
  const read = () => E(() => { const r = document.querySelector('[data-grid-id="cg"] .iq-cg'); return { avg: r.querySelector('.iq-cg__avg').textContent, tgt: r.querySelector('.iq-cg__tgt b').textContent, groupShown: !r.querySelector('.iq-cg__group').hidden,
    modes: [...r.querySelectorAll('.iq-cg__modes .iq-cg__chip')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]), units: [...r.querySelectorAll('.iq-cg__unit')].map((u) => [u.dataset.entity, u.dataset.available, u.querySelector('.iq-cg__info span').textContent, u.querySelector('.iq-cg__ctl b')?.textContent || '']) }; });
  const st = (ids) => E(async (ids) => { await new Promise((r) => setTimeout(r, 2500)); return Object.fromEntries(ids.map((id) => { const e = window.IniqHA.get(id); return [id, e ? [e.state, e.attrs.target_temperature] : null]; })); }, ids);
  const a = await read();
  check('1 · four units: three live ones with temperature and mode, the missing one "Unavailable"; the average of the live ones', a.units.length === 4 && a.units.filter((u) => u[1] === 'true').length === 3 && a.units.find((u) => u[0] === 'climate.no_such_unit')[2] === 'Unavailable' && /average/.test(a.avg), JSON.stringify(a));
  const modeNames = a.modes.map((m) => m[0]);
  check('2 · shared modes = what every live unit offers: Off and Heat (Cool and Auto, which one unit lacks, are not offered to the group)', modeNames.join() === 'Off,Heat' || modeNames.join() === 'Heat,Off', JSON.stringify(a.modes));
  const s0 = await st(units.slice(0, 3));
  await p.click('[data-grid-id="cg"] .iq-cg__step[data-d="1"]');
  const s1 = await st(units.slice(0, 3));
  const raised = units.slice(0, 3).filter((u) => s0[u] && s1[u] && Number.isFinite(s0[u][1]) && s1[u][1] > s0[u][1]);
  check('3 · the shared + raises every unit that has a set point, each by its own step inside its own range (Home Assistant\'s targets change)', raised.length >= 2, JSON.stringify({ s0, s1 }));
  await E(() => [...document.querySelectorAll('[data-grid-id="cg"] .iq-cg__modes .iq-cg__chip')].find((b) => b.textContent === 'Off').click());
  const s2 = await st(units.slice(0, 3));
  const before = (await st(['climate.demo_living']))['climate.demo_living'][1];
  await E(() => document.querySelector('[data-grid-id="cg"] .iq-cg__unit[data-entity="climate.demo_living"] .iq-cg__s').click());
  const s3 = await st(units.slice(0, 3));
  check('4 · the shared mode Off switches every unit off; one unit\'s − changes only that unit', units.slice(0, 3).every((u) => s2[u][0] === 'off') && s3['climate.demo_living'][1] < before && s3['climate.demo_bedroom'][1] === s2['climate.demo_bedroom'][1],
    JSON.stringify({ s2, before, s3 }));
  await p.goto(`${L.base}/editor.html?d=${id}`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(500);
  const c5 = await E(() => window.MaisonRegistry.fullConfig('climategroup', { units: ['climate.a', 'light.b', 'climate.a', 'climate.c'] }).units);
  const saved = await E(() => { const md = window.editor.getModel(); md.pages[0].items[0].config.name = 'All heating'; window.editor.setModel(md); return window.editor.save(); });
  await p.reload(); await p.waitForFunction(() => window.editor, null, { timeout: 20000 });
  const back = await E(() => window.editor.getModel().pages[0].items[0].config);
  check('5 · saved and reloaded (name, four units); a light and a duplicate are dropped from the units', saved && back.name === 'All heating' && back.units.length === 4 && JSON.stringify(c5) === '["climate.a","climate.c"]', JSON.stringify({ back, c5 }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('climate-group test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
