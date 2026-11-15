/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Contact sheet: node tests/lib/shots.mjs out.png '<json: [[type, config, w, h], …]>' '<json rows>'
import { start } from './harness.mjs';
const [out, specs, rows] = [process.argv[2], JSON.parse(process.argv[3]), JSON.parse(process.argv[4] || '[]')];
const T = await start(rows);
const page = await T.page({ width: +(process.env.SW || 1300), height: +(process.env.SH || 700) });
await page.evaluate((specs) => {
  document.querySelectorAll('body > *').forEach((e) => { e.style.display = 'none'; });
  const wrap = document.createElement('div'); wrap.id = 'sheet'; wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--page-bg,#0b0b0d);display:flex;flex-wrap:wrap;gap:14px;padding:14px;align-content:flex-start';
  specs.forEach(([type, config, w, h]) => { const b = document.createElement('div'); b.style.cssText = `width:${w}px;height:${h}px;display:grid`; b.append(window.MaisonRegistry.build(type, config)); wrap.append(b); });
  document.body.append(wrap);
}, specs);
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
await T.close();
