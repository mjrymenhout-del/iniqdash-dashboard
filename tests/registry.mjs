/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Shared registry / model infrastructure: every widget type (old and new) builds, validates, normalises idempotently, every variant
// renders with its own data-variant, the shipped dashboards still validate, and each widget JS file is free of generic root classes.
import fs from 'node:fs';
import { start, check } from './lib/harness.mjs';
const T = await start([]);
const page = await T.page({ width: 1300, height: 900 });
const res = await page.evaluate(() => {
  const R = window.MaisonRegistry, out = [];
  Object.keys(R.TYPES).forEach((type) => {
    const t = R.TYPES[type];
    if (t.isContainer || ['popup', 'notification', 'floating'].includes(type)) return;
    const r = { type, errors: [] };
    try {
      const full = R.fullConfig(type, {});
      const again = R.fullConfig(type, JSON.parse(JSON.stringify(full)));
      if (JSON.stringify(full) !== JSON.stringify(again)) r.errors.push('fullConfig not idempotent');
      const v = R.validateConfig(type, full); if (v.length) r.errors.push(`validate: ${JSON.stringify(v)}`);
      const el = R.build(type, {}); if (!el) r.errors.push('no element');
      const ids = t.variantsFor ? (t.variantsFor({}) || []) : (t.variants || []).map((x) => x.id);
      (t.variants || []).filter((vr) => ids.includes(vr.id)).forEach((vr) => {
        const x = R.build(type, { variant: vr.id });
        const root = x.dataset && x.dataset.variant ? x : x.querySelector('[data-variant]');
        if (!root || root.dataset.variant !== vr.id) r.errors.push(`variant ${vr.id} not rendered`);
        if (R.validateConfig(type, R.fullConfig(type, { variant: vr.id })).length) r.errors.push(`variant ${vr.id} invalid`);
      });
      const bad = R.fullConfig(type, { variant: 'nope-not-a-variant' }); if (t.variants && !t.variantsFor && bad.variant !== undefined) r.errors.push('unknown variant kept');
      if (!t.label || !t.description || !t.glyph) r.errors.push('missing label / description / glyph');
    } catch (e) { r.errors.push(String(e.message || e)); }
    out.push(r);
  });
  return out;
});
res.forEach((r) => check(`type ${r.type}: builds, validates, normalises, variants`, r.errors.length === 0, r.errors.join(' | ')));
const NEW = ['robot', 'entitylist', 'datetime', 'timer', 'sunmoon'];
const types = await page.evaluate(() => Object.keys(window.MaisonRegistry.TYPES));
NEW.forEach((n) => check(`new type ${n} registered`, types.includes(n)));
// the gallery categories exist for the new widgets
const cats = await page.evaluate((NEW) => NEW.map((n) => window.MaisonRegistry.TYPES[n].group), NEW);
check('new widgets are in real categories', cats.every((g) => Object.values({ a: 'Controls', b: 'Climate & Environment', c: 'Appliances & Robots', d: 'Time & Calendar' }).includes(g)), cats.join());
// shipped dashboards still validate through the model (existing widget configs untouched)
const dash = await page.evaluate(() => Object.entries(window.IniqDashboards || {}).map(([k, v]) => [k, window.MaisonModel.validate(JSON.parse(JSON.stringify(v)), window.MaisonRegistry)]).map(([k, r]) => [k, r.ok, (r.errors || []).slice(0, 3)]));
dash.forEach(([k, ok, errs]) => check(`dashboard "${k}" validates`, ok, JSON.stringify(errs)));
// CSS namespace rule: no generic two-letter root classes in the new widgets
for (const w of ['robot', 'entitylist', 'datetime', 'timer', 'sunmoon']) {
  const css = fs.readFileSync(`widgets/default/${w}/${w}.css`, 'utf8');
  const roots = [...css.matchAll(/(?:^|[\s,}])\.([a-z][a-z0-9]*)(?=[\s.{:,\[>_-])/g)].map((m) => m[1]);
  check(`${w}.css uses only iq-* classes`, roots.every((c) => c.startsWith('iq')), [...new Set(roots.filter((c) => !c.startsWith('iq')))].join());
}
// the gallery: every widget in its intended category, with its human-readable name and its own icon
const EXPECT = { light: ['Light', 'controls'], climate: ['Climate', 'climate'], sensor: ['Sensor', 'sensors'], switch: ['Switch', 'controls'], fan: ['Fan', 'controls'], numsel: ['Number & Select', 'controls'],
  cover: ['Cover', 'controls'], media: ['Media player', 'media'], action: ['Action', 'controls'], camera: ['Camera', 'security'], lock: ['Lock', 'security'], alarm: ['Alarm', 'security'],
  gauge: ['Gauge', 'sensors'], chart: ['Chart', 'sensors'], energy: ['Energy Flow', 'energy'], appliance: ['Appliance', 'appliances'], robot: ['Robot', 'appliances'], entitylist: ['Entity List', 'controls'],
  datetime: ['Date & Time', 'time'], timer: ['Timer', 'time'], sunmoon: ['Sun & Moon', 'climate'], weather: ['Weather', 'climate'], person: ['Person', 'people'], calendar: ['Calendar', 'time'] };
const gal = await page.evaluate(() => { const R = window.MaisonRegistry, g = {}; Object.entries(R.TYPES).forEach(([k, t]) => { (g[t.glyph] ||= []).push(k); }); return { t: Object.fromEntries(Object.entries(R.TYPES).map(([k, t]) => [k, [t.label, t.category]])), dup: Object.values(g).filter((a) => a.length > 1) }; });
Object.entries(EXPECT).forEach(([k, [label, cat]]) => check(`gallery: ${k} is "${label}" in the ${cat} category`, JSON.stringify(gal.t[k]) === JSON.stringify([label, cat]), JSON.stringify(gal.t[k])));
check('gallery: every widget has its own icon', gal.dup.length === 0, JSON.stringify(gal.dup));
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
