/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// CONTENT SECURITY POLICY: every page and file the gate serves carries the enforced policy (scripts only from IniqDash's own files), and
// the application works under it — the sample dashboard (every built-in widget family), the first-party custom Room widget, the Add
// Widget gallery with live thumbnails, a widget configuration preview, the theme gallery, Widget Studio, settings and the viewing mode
// raise NO violation. A violation is recorded from the browser's own `securitypolicyviolation` events and console reports.
// Real PHP server (gate.php) + FAKE Home Assistant (tests/lib/live.mjs).
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

let L, B;
try {
  L = await live();
  const anon = L.client();
  const h = (r) => r.headers.get('content-security-policy') || '';
  const login = await anon.send('GET', '/login.php');
  check('the sign-in page sends its own, stricter policy (no script at all, not frameable)', /default-src 'none'/.test(h(login)) && !/script-src/.test(h(login)) && /frame-ancestors 'none'/.test(h(login)), h(login));
  const me = L.client(); await me.login();
  for (const u of ['/editor.html', '/', '/components/editor/editor.js', '/api/dashboards.php']) {
    const r = await me.send('GET', u);
    check(`signed in: ${u} carries the policy`, /script-src 'self';/.test(h(r)), `${r.status} ${h(r)}`);
  }
  check('nothing reports-only by default (the policy is enforced)', !(await me.send('GET', '/editor.html')).headers.get('content-security-policy-report-only'));

  B = await liveBrowser(L, { viewport: { width: 1500, height: 1000 } });
  const page = B.page, wait = (ms) => page.waitForTimeout(ms);
  const violations = [];
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text().slice(0, 200)); });
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  const collect = async (label) => { const v = await page.evaluate(() => window.__csp.splice(0)).catch(() => []); violations.push(...v.map((x) => `${label}: ${x}`)); };

  await page.goto(`${L.base}/editor.html`); await page.waitForFunction(() => window.editor && window.MaisonRegistry, null, { timeout: 15000 }); await wait(1500);
  const counts = await page.evaluate(() => ({ items: window.editor.getModel().pages.reduce((n, p) => n + p.items.length, 0), types: [...new Set(window.editor.getModel().pages.flatMap((p) => p.items.map((i) => i.type)))].length }));
  await collect('editor');
  check('the editor with the built-in sample dashboard renders under the policy', counts.items > 10 && counts.types > 8, JSON.stringify(counts));
  // the first-party custom widget (a separate script file discovered by the server) is allowed
  const room = await page.evaluate(() => !!(window.MaisonRegistry && window.MaisonRegistry.build && window.MaisonRegistry.build('custom.room-scene', { name: 'R' })));
  check('the first-party custom Room widget (its own script file) loads and builds', room);
  // every page of the sample
  const pages = await page.evaluate(() => window.editor.getModel().pages.map((p) => p.id));
  for (const id of pages) { await page.evaluate((id) => window.editor.showPage && window.editor.showPage(id), id).catch(() => {}); await wait(300); }
  await collect('pages');
  await page.evaluate(() => window.editor.setEditing(true)); await wait(300);
  // the Add Widget gallery: a live thumbnail of every widget, then one configuration with its preview
  await page.click('.ed-bar button:has-text("Add")'); await page.waitForSelector('dialog[open] .ecfg-tile'); await wait(1500);
  const tiles = await page.evaluate(() => document.querySelectorAll('dialog[open] .ecfg-tile').length);
  await page.click('dialog[open] .ecfg-tile[data-type="light"]'); await page.waitForSelector('dialog[open] .ecfg-pv__box .lw'); await wait(600);
  await collect('gallery'); await page.keyboard.press('Escape'); await wait(300); await page.keyboard.press('Escape'); await wait(300);
  check('the Add Widget gallery (live thumbnails) and a configuration preview work', tiles > 20, String(tiles));
  // the theme gallery and Widget Studio
  await page.click('[data-k=more]'); await page.click('[data-k=themes]'); await page.waitForSelector('dialog[open].ed-dlg--tgal'); await wait(800);
  await collect('themes'); await page.keyboard.press('Escape'); await wait(300);
  await page.evaluate(() => window.IniqStudioLibrary && window.IniqStudioLibrary.createCollection && window.IniqStudioLibrary.createCollection('CSP'));
  await page.evaluate(() => window.editor.setEditing(true)); await wait(300);
  const studio = await page.click('[data-k=studio]', { timeout: 6000 }).then(() => page.waitForSelector('dialog.wst[open]', { timeout: 8000 })).then(() => true).catch(() => false);
  if (studio) { await page.click('dialog.wst[open] [data-k=wst-new-empty]').catch(() => page.click('dialog.wst[open] [data-k=wst-new]').catch(() => {})); await wait(600); }
  await wait(800); await collect('studio'); await page.keyboard.press('Escape'); await wait(300);
  check('Widget Studio opens', studio);
  // the application root in viewing mode
  await page.goto(`${L.base}/`); await page.waitForFunction(() => window.editor && window.editor.viewing, null, { timeout: 15000 }); await wait(1200);
  await collect('viewing');
  check('NO Content-Security-Policy violation anywhere above', violations.length === 0, violations.slice(0, 6).join(' | '));
  check('no page error', B.errors.filter((e) => !/Content Security Policy/.test(e)).length === 0, B.errors.slice(0, 3).join(' | '));
  // and the policy really blocks: an injected inline script does not run (what an HTML-injection bug would try)
  const ran = await page.evaluate(async () => { window.__inj = 0; const sc = document.createElement('script'); sc.textContent = 'window.__inj = 1'; document.head.append(sc);
    const im = document.createElement('img'); im.src = 'https://evil.example/x.png'; document.body.append(im); await new Promise((r) => setTimeout(r, 300)); im.remove(); return window.__inj; });
  const blocked = await page.evaluate(() => window.__csp.splice(0));
  check('…and it blocks: an injected inline script does not run, an image from another host is refused (both reported)', ran === 0 && blocked.some((v) => /script-src/.test(v)) && blocked.some((v) => /img-src/.test(v)), JSON.stringify({ ran, blocked }));
} catch (e) {
  check('csp test ran', false, e.stack);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
