/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// CONFIGURATION CONSISTENCY: the same concept is configured the same way in every widget.
//  · field keys are unique per type (except mutually exclusive `when` alternatives)
//  · a widget bound to ONE entity offers it as `entity`, restricted to the domains its binding declares
//  · typed secondary mappings live under `mappings.<role>` (optional, entity pickers with domains); unknown / malformed mappings are dropped on normalise
//  · demo values never show once an entity is linked (Home Assistant decides)
//  · variants: an unknown id is dropped, a valid one survives normalisation; changing it never touches other keys
//  · shared options (corners, interactions, visibility, details button, information lines) come from the shared framework fields
import { start, check } from './lib/harness.mjs';
const T = await start([]);
const page = await T.page();
const r = await page.evaluate(() => {
  const R = window.MaisonRegistry, HA = window.IniqHA, out = [];
  const types = Object.entries(R.TYPES).filter(([k, t]) => !t.isContainer && !t.isFloating && !t.hidden && !['popup', 'notification'].includes(k));
  types.forEach(([type, t]) => {
    const bad = [], keys = t.fields.map((f) => f.key);
    // duplicates must be mutually exclusive alternatives (each carries a `when`)
    keys.forEach((k, i) => { if (keys.indexOf(k) !== i && !t.fields.filter((f) => f.key === k).every((f) => typeof f.when === 'function')) bad.push(`duplicate key ${k} without when`); });
    const ent = t.fields.find((f) => f.key === 'entity');
    const b = HA.bindings[type];
    if (b && b.domains && !b.many && type !== 'text' && type !== 'button' && type !== 'action' && !ent) bad.push('bound single-entity widget without an entity field');
    if (ent && b && Array.isArray(b.domains) && JSON.stringify(ent.domains) !== JSON.stringify(b.domains)) bad.push(`entity domains ${JSON.stringify(ent.domains)} ≠ binding ${JSON.stringify(b.domains)}`);
    // mappings
    t.fields.filter((f) => f.key.startsWith('mappings.')).forEach((f) => {
      if (f.type !== 'entity') bad.push(`${f.key} is not an entity field`);
      if (!f.optional) bad.push(`${f.key} is not optional`);
      if (!Array.isArray(f.domains) || !f.domains.length) bad.push(`${f.key} has no domain filter`);
    });
    if (t.fields.some((f) => f.key.startsWith('mappings.'))) {
      const c = R.fullConfig(type, { mappings: { 'evil': 'light.x', 'battery': '', 'moon': 5 } });
      if (c.mappings && Object.keys(c.mappings).some((k) => ['evil'].includes(k) || c.mappings[k] === '' || typeof c.mappings[k] !== 'string')) bad.push('malformed / unknown mappings survive normalise');
      const c2 = R.fullConfig(type, { mappings: 'nope' }); if (c2.mappings !== undefined) bad.push('non-object mappings survive normalise');
    }
    // demo values hidden when linked
    if (ent) {
      const linked = { ...R.fullConfig(type, {}), entity: 'sensor.some_entity' };
      const shown = t.fields.filter((f) => f.demo === true && f.key !== 'entity' && R.isShown(f, linked));
      if (shown.length) bad.push(`demo fields shown while linked: ${shown.map((f) => f.key).join(',')}`);
    }
    // variants
    if (t.variants && !t.variantsFor) {
      const ids = t.variants.map((v) => v.id), def = t.variants.find((v) => v.default).id;
      if (R.fullConfig(type, { variant: 'zzz-unknown' }).variant !== undefined) bad.push('unknown variant kept');
      const last = ids[ids.length - 1], c = R.fullConfig(type, { variant: last, name: 'N' });
      if (c.variant !== (last === def ? undefined : last) && c.variant !== last) bad.push('valid variant dropped');
      const base = R.fullConfig(type, { name: 'Keep' }), withV = R.fullConfig(type, { name: 'Keep', variant: last });
      const strip = (x) => { const y = { ...x }; delete y.variant; return JSON.stringify(y); };
      if (strip(base) !== strip(withV)) bad.push('choosing a variant changed other configuration');
    }
    // shared framework fields
    const hasKey = (p) => keys.some((k) => k === p || k.startsWith(p + '.'));
    if (b && !b.many && ent && !hasKey('moreButton')) bad.push('bound widget without the shared ⋮ details button');
    if (!hasKey('visibility') && type !== 'text' ) bad.push('no shared visibility condition');
    out.push([type, bad]);
  });
  return out;
});
r.forEach(([type, bad]) => check(`${type}: consistent configuration schema`, bad.length === 0, bad.join('; ')));
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
