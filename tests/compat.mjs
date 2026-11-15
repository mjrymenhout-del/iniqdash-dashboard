/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Backward compatibility: dashboards saved by older versions load through the deterministic, tested migrations (1 → 2 → 3); a migrated model is
// valid, identical when migrated twice and unchanged when saved and loaded again; versions this build does not know are refused; configs
// that predate newer optional keys (theme, grid, corners, mappings…) still load with the defaults.
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page();
const run = (fn, ...a) => page.evaluate(fn, ...a);
const lay = { desktop: { x: 1, y: 1, w: 3, h: 3 }, tablet: { x: 1, y: 1, w: 4, h: 3 }, mobile: { w: 4, h: 3 } };
const v1 = { version: 1, dashboard: { id: 'maison', title: 'Old Home', subtitle: 'first version', background: 'darker' }, items: [
  { id: 'a', type: 'sensor', config: { name: 'Temp', entity: 'sensor.temp' }, layout: lay }, { id: 'c', type: 'container', config: { title: 'Room', variant: 'primary' }, layout: lay },
  { id: 'b', type: 'text', parent: 'c', config: { text: 'hello' }, layout: { desktop: { x: 1, y: 1, w: 2, h: 1 } } }] };
const v2 = { version: 2, app: { id: 'old', startPage: 'p1', navigation: { desktop: 'left', tablet: 'bottom', mobile: 'bottom' } }, pages: [
  { id: 'p1', name: 'One', nav: true, items: [{ id: 'a', type: 'sensor', config: { name: 'Temp' }, layout: lay }] }, { id: 'p2', name: 'Two', nav: false, items: [] }] };
const v3old = { version: 3, app: { id: 'x', startPage: 'p', navigation: { desktop: 'left', tablet: 'bottom', mobile: 'bottom' } }, pages: [{ id: 'p', name: 'P', nav: true, items: [
  { id: 'l', type: 'light', config: { name: 'Lamp', entity: 'light.lamp' }, layout: lay }, { id: 'w', type: 'weather', config: {}, layout: lay }, { id: 'r', type: 'radial', config: {}, layout: lay }] }], popups: [], notifications: { templates: [], rules: [] } };

const parse = (m) => run((m) => { const r = window.MaisonModel.parse(JSON.stringify(m), window.MaisonRegistry); return { ok: r.ok, errors: r.errors, migrated: r.migrated, model: r.model }; }, m);
for (const [label, m] of [['version 1 (single dashboard)', v1], ['version 2 (pages, no popups / notifications)', v2], ['a version 3 model without the newer optional keys', v3old]]) {
  const r = await parse(m);
  check(`${label} loads`, r.ok, JSON.stringify(r.errors || []).slice(0, 200));
  if (!r.ok) continue;
  check(`${label}: ends at the current version with pages, popups and notifications`, r.model.version === 3 && Array.isArray(r.model.pages) && Array.isArray(r.model.popups) && !!r.model.notifications);
  const again = await parse(JSON.parse(JSON.stringify(r.model)));
  check(`${label}: saving and loading again changes nothing`, again.ok && JSON.stringify(again.model) === JSON.stringify(r.model));
  const twice = await parse(m);
  check(`${label}: migration is deterministic`, JSON.stringify(twice.model) === JSON.stringify(r.model));
  const v = await run((x) => window.MaisonModel.validate(x, window.MaisonRegistry).ok, r.model);
  check(`${label}: the result validates`, v === true);
  check(`${label}: every item has a complete config for its type (defaults filled)`, await run((x) => x.pages.flatMap((p) => p.items).every((i) => window.MaisonRegistry.validateConfig(i.type, i.config).length === 0), r.model));
}
const r1 = await parse(v1);
check('version 1: the dashboard became the start page with its title, subtitle and background', r1.ok && r1.model.pages[0].name === 'Old Home' && r1.model.pages[0].subtitle === 'first version' && r1.model.pages[0].background === 'darker' && r1.model.app.startPage === r1.model.pages[0].id);
check('version 1: parent / child relations survive', r1.ok && r1.model.pages[0].items.find((i) => i.id === 'b').parent === 'c');
const r2 = await parse(v2);
check('version 2: pages, start page, dock and nav flags survive', r2.ok && r2.model.pages.length === 2 && r2.model.app.startPage === 'p1' && r2.model.pages[1].nav === false);
check('a model from a NEWER version is refused with a message (never guessed at)', await run(() => { const r = window.MaisonModel.parse(JSON.stringify({ version: 99, app: {}, pages: [] }), window.MaisonRegistry); return !r.ok && r.errors.length > 0; }));
check('a model without a version is refused', await run(() => !window.MaisonModel.parse(JSON.stringify({ pages: [] }), window.MaisonRegistry).ok));
check('the shipped dashboards still load', await run(() => Object.values(window.IniqDashboards || {}).every((m) => window.MaisonModel.validate(JSON.parse(JSON.stringify(m)), window.MaisonRegistry).ok)));
check('an unknown widget type (a removed custom widget) does not break loading the rest', await run(() => { const m = JSON.parse(JSON.stringify({ version: 3, app: { id: 'x', startPage: 'p', navigation: {} }, pages: [{ id: 'p', name: 'P', nav: true, items: [{ id: 'k', type: 'custom.removed', config: {}, layout: { desktop: { x: 1, y: 1, w: 2, h: 2 } } }, { id: 's', type: 'text', config: { text: 'still here' }, layout: { desktop: { x: 3, y: 1, w: 2, h: 2 } } }] }] })); const r = window.MaisonModel.validate(m, window.MaisonRegistry); return r.ok; }));
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
console.log('finished');
