/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// THEME — IniqDash Original stays PIXEL-IDENTICAL. Screenshots every page of the built-in sample dashboard (no theme applied — the
// state of every existing dashboard) at desktop, tablet and mobile sizes, plus a geometry signature (every grid item's box), in the
// snapshot format of tests/lib/snapshot.mjs. Run it on the commit BEFORE the theme work and on this one, then compare:
//   node tests/theme-original.mjs <out-dir>            (no server / no Home Assistant needed: the editor's sample dashboard)
//   node tests/lib/snapshot.mjs --compare <before> <after>
// The clock is frozen so clocks and dates draw the same.
import fs from 'node:fs';
import path from 'node:path';
import { start } from './lib/harness.mjs';

const out = process.argv[2];
if (!out) { console.error('usage: node tests/theme-original.mjs <out-dir>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const S = await start([], { server: false });
const sig = {};
try {
  for (const [bp, size] of [['desktop', { width: 1400, height: 1000 }], ['tablet', { width: 860, height: 1100 }], ['mobile', { width: 400, height: 860 }]]) {
    const page = await S.page(size, { time: new Date('2026-06-15T10:30:00Z') });
    await page.waitForTimeout(2000);
    const ids = await page.evaluate(() => window.editor.getModel().pages.map((p) => p.id));
    for (const [i, id] of ids.slice(0, 4).entries()) {
      await page.evaluate((x) => window.editor.go(x), id); await page.waitForTimeout(1200);
      const key = `${bp}-${i + 1}`;
      await page.screenshot({ path: path.join(out, `${key}.png`), fullPage: true, animations: 'disabled' });
      sig[key] = await page.evaluate(() => [...document.querySelectorAll('.ed-canvas [data-grid-id], .mnav__b, .ed-canvas')].map((n) => { const r = n.getBoundingClientRect(), c = getComputedStyle(n);
        return [n.className, n.dataset.gridId || '', Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), c.backgroundColor, c.color, c.borderRadius, c.boxShadow, c.fontFamily].join('|'); }));
    }
    await page.context().close();
  }
  fs.writeFileSync(path.join(out, 'sig.json'), JSON.stringify(sig));
  console.log(`wrote ${Object.keys(sig).length} views to ${out}`);
} finally { await S.close(); }
