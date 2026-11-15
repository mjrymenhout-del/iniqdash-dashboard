/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// BATTERIES widget (real server, the SIMULATED home):
//   1  automatic: every battery sensor Home Assistant reports (device class battery), the emptiest first, "N low", red / orange / green
//   2  chosen batteries only (auto off); "Only the low ones"; the low threshold
//   3  a row opens the entity's details; it renders in the gallery (demo values, no entity)
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const lay = (y) => ({ desktop: { x: 1, y, w: 4, h: 6 }, tablet: { x: 1, y, w: 4, h: 6 }, mobile: { w: 4, h: 6 } });
const dash = { version: 3, app: { id: 'b', startPage: 'p', navigation: {}, simulated: true }, pages: [{ id: 'p', name: 'P', nav: true, items: [
  { id: 'auto', type: 'batteries', config: { name: 'All batteries' }, layout: lay(1) },
  { id: 'chosen', type: 'batteries', config: { name: 'Chosen', auto: false, chosen: [{ id: 'b1', entity: 'sensor.demo_hall_motion_battery' }, { id: 'b2', entity: 'sensor.demo_front_door_battery' }] }, layout: lay(8) },
  { id: 'low', type: 'batteries', config: { name: 'Low ones', only: 'low', low: 20 }, layout: lay(15) }] }] };

let L, B;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const id = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Batteries', dashboard: dash })).json()).entry.id;
  B = await liveBrowser(L, { viewport: { width: 1400, height: 1100 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${L.base}/?d=${id}`); await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 });
  // wait until EVERY widget has its states (under a loaded machine the three load at different moments) — the checks below are unchanged
  await p.waitForFunction(() => document.querySelectorAll('[data-grid-id="auto"] .iq-bat__b').length >= 6 && document.querySelectorAll('[data-grid-id="chosen"] .iq-bat__b').length === 2
    && document.querySelectorAll('[data-grid-id="low"] .iq-bat__b').length >= 2, null, { timeout: 30000 }).catch(() => {});
  await wait(800);
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT, clip: { x: 0, y: 0, width: 1400, height: 760 } });
  const read = (k) => E((k) => { const r = document.querySelector(`[data-grid-id="${k}"]`); return { rows: [...r.querySelectorAll('.iq-bat__b')].map((b) => [b.querySelector('.iq-bat__name').textContent, b.querySelector('.iq-bat__pct').textContent, b.dataset.tone]), count: r.querySelector('.iq-bat__count').textContent, empty: r.querySelector('.iq-bat__empty').hidden ? '' : r.querySelector('.iq-bat__empty').textContent }; }, k);
  const a = await read('auto');
  const pct = a.rows.map((r) => parseInt(r[1], 10));
  check('1 · automatic: every battery sensor of the home, the emptiest first ("Garden motion" 7 % first, red), "N low" counted, names without "battery"',
    a.rows.length >= 6 && a.rows[0][0] === 'Garden motion' && a.rows[0][2] === 'low' && pct.every((v, i) => i === 0 || v >= pct[i - 1]) && /^\d+ low$/.test(a.count) && !a.rows.some((r) => /battery$/i.test(r[0])) && a.rows.some((r) => r[2] === 'ok'),
    JSON.stringify(a));
  const c = await read('chosen'), l = await read('low');
  check('2 · chosen batteries only (2 rows, the lower first); "Only the low ones" lists just those under 20 %', c.rows.length === 2 && c.rows[0][0] === 'Front door lock' && l.rows.length >= 2 && l.rows.every((r) => r[2] === 'low'),
    JSON.stringify({ c, l }));
  await p.click('[data-grid-id="auto"] .iq-bat__b'); await wait(800);
  const det = await E(() => [window.editor.details().current, document.querySelector('#iq-details, .iqd, [id=iq-details]')?.innerText || ''].join(' | '));
  check('3 · a row opens that entity\'s details (the Garden motion battery)', /iq-details/.test(det) && /\b7\s*%/.test(det), det.slice(0, 200));
  const demo = await E(() => { const n = window.MaisonRegistry.build('batteries', { auto: false }); document.body.append(n); const rows = n.querySelectorAll('.iq-bat__it').length; n.remove(); return rows; });
  check('…without entities (unlinked, as in the gallery) it shows its demo batteries', demo === 5, String(demo));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('batteries test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
