/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// THE INIQDASH DEMO AS THE DEFAULT OF A NEW INSTALLATION (server/DemoInstall.php):
//   a NEW installation: signing in opens the demo's Home page in viewing mode (simulated, badge), the demo is the default dashboard;
//   deleted, it does not come back; an EXISTING installation (a dashboard, a default, Studio widgets) is never changed.
import fs from 'node:fs';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const list = async (c) => (await (await c.send('GET', '/api/dashboards.php')).json());
let L, B;
try {
  // ---- a NEW installation
  L = await live({ demoInstall: true });
  B = await liveBrowser(L, { viewport: { width: 1440, height: 900 } }); const p = B.page;   // signs in
  await p.goto(`${L.base}/`);                                              // …and opens the application, as a user does
  await p.waitForFunction(() => window.editor && window.editor.viewing() && window.IniqHA.simulated(), null, { timeout: 20000 }); await p.waitForTimeout(1500);
  const c = L.client(); await c.login();
  let l = await list(c);
  const view = await p.evaluate(() => ({ page: window.editor.navigation().current, name: window.editor.getModel().app.id, badge: !document.querySelector('[data-k=sim-badge]').hidden,
    pages: window.editor.getModel().pages.map((x) => x.id) }));
  check('a new installation: the INIQDASH demo is added, it is the default dashboard, and signing in opens its Home page in viewing mode (simulated)',
    l.dashboards.length === 1 && l.dashboards[0].name === 'INIQDASH demo' && l.settings.default === l.dashboards[0].id && view.page === 'home' && view.name === 'iniqdash-demo' && view.badge
      && view.pages.join() === 'home,lights,climate,rooms,energy,security', JSON.stringify({ l, view }));
  const mark = JSON.parse(fs.readFileSync(`${L.priv}/demo.json`, 'utf8'));
  check('…recorded once, in the private folder', mark.added === l.dashboards[0].id);
  await p.click('[data-grid-id="h-d0"] .iq-dev__sw');                    // a demo control works at once (the floor lamp's device tile)
  check('…its controls work at once (a device tile)', await p.waitForFunction(() => window.IniqHA.get('light.demo_living_floor')?.state === 'off', null, { timeout: 8000 }).then(() => true, () => false));
  // deleted: never added again
  await c.post('/api/dashboards.php', { action: 'delete', id: l.dashboards[0].id });
  l = await list(c); l = await list(c);
  check('deleted by the user, the demo does not come back', l.dashboards.length === 0, JSON.stringify(l.dashboards));
  await B.close(); B = null; await L.close(); L = null;

  // ---- an EXISTING installation: its dashboard and default are kept, nothing is added
  L = await live({ demoInstall: true });
  const pre = fs.readdirSync(L.priv);
  const c2 = L.client(); await c2.login();
  // (the first list read decides — so the user's dashboard is written to storage first, as an older version would have)
  fs.mkdirSync(`${L.priv}/dashboards`, { recursive: true });
  const r = await (await c2.post('/api/dashboards.php', { action: 'create', name: 'My home', dashboard: { version: 3, app: { id: 'mine', startPage: 'p', navigation: {} }, pages: [{ id: 'p', name: 'Mine', nav: true, items: [] }] } })).json();
  await c2.post('/api/dashboards.php', { action: 'settings', default: r.entry.id });
  const l2 = await list(c2);
  check('an existing installation: its dashboard and default are kept, the demo is NOT added (it stays available in Dashboards)',
    l2.dashboards.length === 1 && l2.dashboards[0].name === 'My home' && l2.settings.default === r.entry.id && JSON.parse(fs.readFileSync(`${L.priv}/demo.json`, 'utf8')).existing === true, JSON.stringify({ l2, pre }));
} catch (e) {
  check('demo-default ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
