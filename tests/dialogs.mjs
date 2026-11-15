/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Every widget type's configuration dialog renders fully (guards against CSS collisions with the editor's .ef form framework).
import { start, check } from './lib/harness.mjs';
const T = await start([['light.l', 'on', { name: 'L', f: 0 }]]);
const page = await T.page({ width: 1400, height: 1000 });
const types = process.argv.slice(2).length ? process.argv.slice(2) : await page.evaluate(() => Object.keys(window.MaisonRegistry.TYPES).filter((t) => !window.MaisonRegistry.TYPES[t].isContainer));
for (const type of types) {
  const r = await page.evaluate((type) => {
    document.querySelectorAll('dialog').forEach((d) => d.remove());
    window.MaisonConfigure.open({ mount: document.body, mode: 'edit', type, config: undefined, size: null, onApply() {} });
    const f = document.querySelector('dialog .ef'), d = document.querySelector('dialog');
    // collapsible sections (a type's accordion): measured open — the check is that every section renders its fields
    if (f) f.querySelectorAll('details.ef-group--acc').forEach((x) => { x.open = true; });
    const out = { h: f ? f.getBoundingClientRect().height : 0, groups: f ? f.querySelectorAll('.ef-group').length : 0, fields: f ? f.querySelectorAll('.ef-field').length : 0 };
    d.close(); return out;
  }, type).catch((e) => ({ err: e.message }));
  check(`config dialog ${type}: ${r.groups} sections, ${r.fields} fields, ${Math.round(r.h || 0)}px`, !r.err && r.h > 150 && r.fields > 2, JSON.stringify(r));
}
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
