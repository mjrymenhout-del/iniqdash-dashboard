/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// GENERIC proof of the custom-widget HA contract (binding "roles" + action slots) with a fixture that has NOTHING to do with Room:
// two sensors, a multiple "doors" role and a switch action slot (tests/fixtures/custom/probe-roles). Real PHP server + fake Home Assistant.
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';
import { install, remove, ROOT } from './lib/package.mjs';

import fs from 'node:fs';
const ID = 'custom.probe-roles';
// no production core file knows any custom widget by id / name (Room / Scene is only a consumer of the generic contract)
const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const core = ['components', 'server', 'api', 'assets/js', 'assets/css'].flatMap(walk).concat(['editor.html', 'gate.php', 'login.php', 'widgets/index.js']).filter((f) => /\.(js|php|html|css|json)$/.test(f));
const hits = core.filter((f) => /room-scene|custom\.room|custom\.probe/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
check('no production core file names a custom widget (no Room / probe id or package name anywhere in core)', hits.length === 0, hits.join(', '));
install(path.join(ROOT, 'tests/fixtures/custom/probe-roles'), 'probe-roles');
let L, B;
try {
  L = await live();
  L.setEntity('sensor.in', '21.4', { name: 'Inside', unit: '°C', dc: 'temperature' });
  L.setEntity('sensor.out', '8', { name: 'Outside', unit: '°C', dc: 'temperature' });
  L.setEntity('binary_sensor.d1', 'off', { name: 'Door 1', dc: 'door' });
  L.setEntity('binary_sensor.d2', 'on', { name: 'Door 2', dc: 'door' });
  L.setEntity('switch.heater', 'off', { name: 'Heater' });
  B = await liveBrowser(L); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  check('the fixture is discovered with its roles declaration, no core edit', await E((id) => !!window.MaisonRegistry.TYPES[id] && window.MaisonRegistry.TYPES[id].ha === 'roles', ID));
  // ---- the configuration fields are GENERATED from the manifest
  const fields = await E((id) => window.MaisonRegistry.TYPES[id].fields.filter((f) => /^ha(Roles|Slots)\./.test(f.key)).map((f) => ({ k: f.key, t: f.type, d: f.domains, r: !!f.required, g: f.group })), ID);
  const keys = fields.map((f) => f.k).join(',');
  check('single role → one selector; multiple role → up to max selectors; slot → one selector per position', keys === 'haRoles.inside,haRoles.outside,haRoles.doors.0,haRoles.doors.1,haRoles.doors.2,haSlots.power.0', keys);
  check('every selector is an entity picker restricted to the declared domains', fields.every((f) => f.t === 'entity') && fields[0].d.join() === 'sensor' && fields[2].d.join() === 'binary_sensor' && fields[5].d.join() === 'switch');
  check('required role → required selector; slots go to Actions', fields[0].r && !fields[1].r && fields[5].g === 'actions');
  // ---- put it on the dashboard (the editor validates the model: persisted roles / slots must survive dashboard validation)
  const place = (config) => E(({ id, config }) => {
    const m = window.editor.getModel(); const pg = m.pages[0]; pg.items = pg.items.filter((i) => i.type !== id);
    pg.items.push({ id: 'probe1', type: id, parent: null, config, layout: { desktop: { x: 1, y: 40, w: 4, h: 3 }, tablet: { x: 1, y: 40, w: 4, h: 3 }, mobile: { w: 4, h: 3 } } });
    const r = window.editor.setModel(m); return { ok: r.ok, errors: r.errors || null };
  }, { id: ID, config });
  const r = await place({ name: 'P', haRoles: { inside: 'sensor.in', outside: 'sensor.out', doors: ['binary_sensor.d1', 'binary_sensor.d2', 'binary_sensor.d3', 'binary_sensor.d4'], bogus: 'sensor.x' }, haSlots: { power: ['switch.heater', 'switch.second'] } });
  check('the dashboard validates', r.ok, JSON.stringify(r.errors));
  const saved = await E((id) => window.editor.getModel().pages.flatMap((p) => p.items).find((i) => i.type === id).config, ID);
  check('cleaning against the declaration: unknown role dropped, multiple capped at max, single slot capped at 1',
    !saved.haRoles.bogus && saved.haRoles.doors.length === 3 && saved.haSlots.power.length === 1 && saved.haRoles.inside === 'sensor.in', JSON.stringify(saved));
  const bad = await place({ name: 'Q', haRoles: { inside: 'light.kitchen' }, haSlots: { power: ['light.kitchen'] } });
  const bsaved = await E(() => window.editor.getModel().pages.flatMap((p) => p.items).filter((i) => i.id === 'probe1')[0].config);
  check('a wrong-domain entity is never accepted into a role or a slot (refused by validation, or cleaned away)', bad.ok === false || (!bsaved.haRoles && !bsaved.haSlots), JSON.stringify([bad, bsaved]));
  // ---- live state reaches the widget through the generic layer
  await place({ name: 'P', haRoles: { inside: 'sensor.in', outside: 'sensor.out', doors: ['binary_sensor.d1', 'binary_sensor.d2'] }, haSlots: { power: ['switch.heater'] } });
  const st = () => E(() => { const el = document.querySelector('.iq-probe'); return el ? el.probe.state() : null; });
  await page.waitForFunction(() => { const el = document.querySelector('.iq-probe'); const s = el && el.probe.state(); return s && s.roles.inside && s.roles.inside.status === 'ready'; }, null, { timeout: 15000 });
  let s = await st();
  check('single role: the normalised entity (state, unit)', s.roles.inside.state.state === '21.4' && s.roles.inside.state.unit === '°C' && s.roles.outside.state.state === '8', JSON.stringify(s.roles.inside));
  check('multiple role: the individual entity states, in order', Array.isArray(s.roles.doors) && s.roles.doors.length === 2 && s.roles.doors[0].state.state === 'off' && s.roles.doors[1].state.state === 'on');
  check('slots deliver the mapped entity (state only — never a token or a connection detail)', s.slots.power[0].entity === 'switch.heater' && !JSON.stringify(s).includes('token'));
  L.setEntity('sensor.in', '23.0');
  await page.waitForFunction(() => document.querySelector('.iq-probe').probe.state().roles.inside.state.state === '23.0', null, { timeout: 15000 });
  check('a state change reaches the widget without a reload', true);
  // ---- secure actions
  const calls = () => L.haCalls.filter((c) => /\/api\/services\//.test(c.url));
  const n0 = calls().length;
  await page.click('.iq-probe__on'); await page.waitForTimeout(700);
  const c1 = calls().slice(n0);
  check('declared slot action → the server plans switch.turn_on for the mapped entity', c1.length === 1 && c1[0].url === '/api/services/switch/turn_on' && JSON.parse(c1[0].body).entity_id === 'switch.heater', JSON.stringify(c1));
  await page.click('.iq-probe__off'); await page.waitForTimeout(700);
  check('turn_off likewise', calls().at(-1).url === '/api/services/switch/turn_off');
  const n1 = calls().length;
  const res = await E(async () => { const p = document.querySelector('.iq-probe').probe; return [await p.request({ slot: 'power', index: 0, action: 'toggle' }), await p.request({ slot: 'nope', index: 0, action: 'turn_on' }), await p.request({ slot: 'power', index: 5, action: 'turn_on' }), await p.request({ slot: 'power', index: 0, action: 'turn_on', entity: 'light.kitchen', service: 'light.turn_off' })]; });
  check('undeclared action / unknown slot / bad index are refused in the browser; a named entity or service is ignored', res[0].error === 'not_declared' && res[1].error === 'not_declared' && res[2].error === 'unknown_entity' && res[3].ok === true, JSON.stringify(res));
  await page.waitForTimeout(600);
  const extra = calls().slice(n1);
  check('…and the only call that reached HA is the declared one on the MAPPED entity', extra.length === 1 && extra[0].url === '/api/services/switch/turn_on' && JSON.parse(extra[0].body).entity_id === 'switch.heater', JSON.stringify(extra));
  // ---- the server re-checks the declaration (a crafted request, not the widget)
  const me = L.client(); await me.login();
  const post = async (b) => { const x = await me.post('/api/ha_call.php', b); return x.status; };
  check('server: an undeclared domain is refused (403)', (await post({ widget: ID, entity: 'light.kitchen', action: 'turn_on' })) === 403);
  check('server: an undeclared action is refused (403)', (await post({ widget: ID, entity: 'switch.heater', action: 'toggle' })) === 403);
  check('server: a scene trigger is refused for a package that does not declare it (403)', (await post({ widget: ID, entity: 'scene.x', action: 'trigger' })) === 403);
  check('server: another package id cannot borrow the declaration (403)', (await post({ widget: 'custom.nope', entity: 'switch.heater', action: 'turn_on' })) === 403);
  check('server: the declared request passes (200)', (await post({ widget: ID, entity: 'switch.heater', action: 'turn_on' })) === 200);
  // ---- export / import: the normal dashboard JSON carries the mappings and slots and re-validates unchanged
  const rt = await E((id) => { const m = JSON.parse(JSON.stringify(window.editor.getModel())); const r = window.MaisonModel.validate(m, window.MaisonRegistry); const it = r.ok && r.model.pages.flatMap((p) => p.items).find((i) => i.type === id); return it ? it.config : null; }, ID);
  check('export → import: haRoles / haSlots survive the normal dashboard JSON round trip', rt && rt.haRoles.inside === 'sensor.in' && rt.haRoles.doors.length === 2 && rt.haSlots.power[0] === 'switch.heater', JSON.stringify(rt));
  // ---- save → reload → persists
  check('save', await E(() => window.editor.save())); await page.waitForTimeout(500);
  const did = await E(() => window.editor.dashboard().id);
  await page.goto(`${L.base}/editor.html?d=${did}`); await page.waitForFunction(() => window.editor && window.editor.getModel(), null, { timeout: 15000 }); await page.waitForTimeout(1200);
  const back = await E((id) => window.editor.getModel().pages.flatMap((p) => p.items).find((i) => i.type === id).config, ID);
  check('mappings and slots persist after a reload', back.haRoles.inside === 'sensor.in' && back.haRoles.doors.length === 2 && back.haSlots.power[0] === 'switch.heater', JSON.stringify(back));
  await page.waitForFunction(() => { const el = document.querySelector('.iq-probe'); const s = el && el.probe.state(); return s && s.roles.inside && s.roles.inside.status === 'ready'; }, null, { timeout: 15000 });
  check('…and the widget works again', true);
  check('no page errors', B.errors.length === 0, B.errors.join('|'));
} finally {
  remove('probe-roles');
  if (B) await B.close();
  if (L) await L.close();
}
