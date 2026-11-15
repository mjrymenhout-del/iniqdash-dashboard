/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// the configuration FIELDS of Room, Light, Climate and Popup (their collections' item fields included) as data: static properties, and
// every function property evaluated on sample items — for a refactor's BEFORE / AFTER comparison. `node tests/lib/fields-dump.mjs <out.json>`
import fs from 'node:fs';
import { live, liveBrowser } from './live.mjs';
let L, B;
try {
  L = await live(); B = await liveBrowser(L); const page = B.page; await page.waitForTimeout(600);
  const out = await page.evaluate(() => {
    const R = window.MaisonRegistry;
    const samples = [{}, { icon: 'mdi:fan', color: 'accent', style: 'bare', showLabel: false, animation: 'rotate' }, { icon: 'mdi:x', style: 'emphasis', type: 'dial' }, { type: 'minus', show: true, place: 'top-left' }, { infoLayout: 'bar', info: [{}], barWidth: 'custom' }];
    const val = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
    const dump = (f) => {
      const o = {};
      Object.keys(f).sort().forEach((k) => {
        const v = f[k];
        if (k === 'fields') o[k] = v.map(dump);
        else if (typeof v === 'function') o[k] = samples.map((x) => { try { const c = structuredClone(x); const r = v(c, {}); return k === 'set' ? val(c) : val(r); } catch (e) { return `ERR ${e.message}`; } }).join(' ; ');
        else o[k] = val(v);
      });
      return o;
    };
    const sets = (t) => (R.schemaOf(t).fields || []).map(dump);
    return { room: sets('custom.room-scene'), light: sets('light'), climate: sets('climate'), popup: sets('popup') };
  });
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log('fields dumped', process.argv[2]);
} finally { if (B) await B.close(); if (L) await L.close(); }
