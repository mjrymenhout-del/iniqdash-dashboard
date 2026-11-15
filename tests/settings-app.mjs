/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// DASHBOARD SETTINGS — the redesigned dialog in the application. Real PHP server, real browser, FAKE Home Assistant (tests/lib/live.mjs).
//   sections as tabs (General · Appearance · Navigation · Grid & layout · Wall tablet · Editing), keyboard tablist · DEFAULT DASHBOARD and the EDIT
//   BUTTON (application settings, stored on the server) persist and take effect · dock position with its live picture · Cancel changes
//   nothing · the dialog fits a phone, a tablet and a desktop without sideways scrolling.
import path from 'node:path';
import { live } from './lib/live.mjs';
import { check, playwright } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
let L, browser;
try {
  L = await live();
  browser = await playwright().chromium.launch();
  const c = L.client(); await c.login();
  const open = async (vp) => {
    const ctx = await browser.newContext({ viewport: vp, locale: 'en-GB', extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' } });
    const page = await ctx.newPage(); page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
    await page.goto(`${L.base}/`);
    await page.fill('input[name=user]', 'admin'); await page.fill('input[name=password]', 'correct horse battery staple');
    await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
    await page.waitForFunction(() => window.editor && window.editor.viewing && window.editor.viewing(), null, { timeout: 15000 });
    return { ctx, page };
  };
  // two saved dashboards to choose from
  const A = await open({ width: 1440, height: 900 });
  const model = await A.page.evaluate(() => window.editor.getModel());
  const ids = [];
  for (const name of ['Ground floor', 'Garden']) ids.push((await (await c.post('/api/dashboards.php', { action: 'create', name, dashboard: model })).json()).entry.id);
  await A.page.reload(); await A.page.waitForFunction(() => window.editor && window.editor.viewing && window.editor.viewing(), null, { timeout: 15000 });
  const page = A.page;
  await page.evaluate(() => window.editor.setEditing(true)); await page.waitForTimeout(400);
  await page.click('button[aria-label="Dashboard settings"]'); await page.waitForSelector('dialog[open] [role=tablist]'); await page.waitForTimeout(600);
  const tabs = await page.evaluate(() => [...document.querySelectorAll('dialog[open] [role=tab]')].map((t) => [t.textContent, t.getAttribute('aria-selected')]));
  check('SECTIONS: General · Appearance · Navigation · Grid & layout · Wall tablet · Editing (a tablist; General first)',
    JSON.stringify(tabs.map((t) => t[0])) === JSON.stringify(['General', 'Appearance', 'Navigation', 'Grid & layout', 'Wall tablet', 'Editing']) && tabs[0][1] === 'true', JSON.stringify(tabs));
  const opts = await page.evaluate(() => [...document.querySelectorAll('[data-k=default-dashboard] option')].map((o) => o.textContent));
  check('GENERAL: the page\'s name, subtitle, icon, start page — and the DEFAULT DASHBOARD (every saved dashboard, or "the one opened last")',
    opts[0] === 'The one opened last on this device' && opts.includes('Ground floor') && opts.includes('Garden') && !!(await page.$('dialog[open] [data-k=page-name]')), JSON.stringify(opts));
  if (SHOTS) await (await page.$('dialog[open]')).screenshot({ path: path.join(SHOTS, 'settings-general.png') });
  await page.selectOption('[data-k=default-dashboard]', ids[1]);
  // keyboard: arrows move through the tabs
  await page.focus('[data-k=settings-tab-general]'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  const kb = await page.evaluate(() => ({ focus: document.activeElement.textContent, shown: [...document.querySelectorAll('dialog[open] [role=tabpanel]')].filter((p) => !p.hidden).map((p) => p.dataset.tab) }));
  check('KEYBOARD: arrow keys move through the sections (focus and panel follow)', kb.focus === 'Navigation' && JSON.stringify(kb.shown) === JSON.stringify(['navigation']), JSON.stringify(kb));
  await page.click('dialog[open] [data-k=settings-tab-navigation]');
  await page.click('dialog[open] [aria-label="Desktop dock position"] [data-v=top]');
  const pic = await page.evaluate(() => document.querySelector('.ed-dockpic--desktop').dataset.edge);
  check('NAVIGATION: the dock position with a live picture of the screen (Desktop → Top redraws it at once)', pic === 'top', pic);
  if (SHOTS) await (await page.$('dialog[open]')).screenshot({ path: path.join(SHOTS, 'settings-navigation.png') });
  await page.click('dialog[open] [data-k=settings-tab-editing]');
  await page.click('dialog[open] [data-k=edit-button] [data-v=always]');
  if (SHOTS) await (await page.$('dialog[open]')).screenshot({ path: path.join(SHOTS, 'settings-editing.png') });
  await page.click('dialog[open] [data-k=settings-tab-grid]');
  if (SHOTS) await (await page.$('dialog[open]')).screenshot({ path: path.join(SHOTS, 'settings-grid.png') });
  await page.click('[data-k=apply-settings]'); await page.waitForTimeout(1200);
  const srv = await (await c.send('GET', '/api/dashboards.php')).json();
  const m = await page.evaluate(() => window.editor.getModel().app.navigation.desktop);
  check('APPLY: the default dashboard ("Garden") and "Edit button: always visible" are stored on the server; the dock position in the dashboard',
    srv.settings.default === ids[1] && srv.settings.editButton === 'always' && m === 'top', JSON.stringify({ s: srv.settings, m }));
  // cancel changes nothing
  await page.click('button[aria-label="Dashboard settings"]'); await page.waitForSelector('dialog[open] [role=tablist]');
  await page.click('dialog[open] [data-k=settings-tab-editing]'); await page.click('dialog[open] [data-k=edit-button] [data-v=corner]');
  await page.click('dialog[open] button:has-text("Cancel")'); await page.waitForTimeout(800);
  check('CANCEL: nothing changes (the Edit button stays "always")', (await (await c.send('GET', '/api/dashboards.php')).json()).settings.editButton === 'always');
  await page.evaluate(() => window.editor.done()); await page.waitForTimeout(500);
  check('…"Always visible" takes effect at once in viewing mode', await page.evaluate(() => getComputedStyle(document.querySelector('.iqea')).opacity === '1'));
  await A.ctx.close();
  const B = await open({ width: 1440, height: 900 });
  check('A NEW SESSION opens the default dashboard ("Garden")', new URLSearchParams(await B.page.evaluate(() => location.search)).get('d') === ids[1]);
  await B.ctx.close();

  // responsive: no sideways scrolling in any section
  const res = [];
  for (const [k, vp] of [['mobile', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1180 }], ['desktop', { width: 1440, height: 900 }]]) {
    const P = await open(vp);
    await P.page.evaluate(() => window.editor.setEditing(true)); await P.page.waitForTimeout(400);
    await P.page.click('button[aria-label="Dashboard settings"]'); await P.page.waitForSelector('dialog[open] [role=tablist]'); await P.page.waitForTimeout(400);
    let fits = true;
    for (const tab of ['general', 'appearance', 'navigation', 'grid', 'editing']) {
      await P.page.click(`dialog[open] [data-k=settings-tab-${tab}]`); await P.page.waitForTimeout(150);
      const f = await P.page.evaluate(() => { const d = document.querySelector('dialog[open]'), b = d.querySelector('.ed-dlg__body'), r = d.getBoundingClientRect();
        return r.left >= -1 && r.right <= innerWidth + 1 && b.scrollWidth <= b.clientWidth + 1; });
      fits = fits && f;
      if (SHOTS && tab === 'navigation' && k !== 'desktop') await P.page.screenshot({ path: path.join(SHOTS, `settings-${k}.png`) });
    }
    res.push([k, fits]);
    await P.ctx.close();
  }
  check('RESPONSIVE: every section fits a phone (390), a tablet (820) and a desktop (1440) without sideways scrolling', res.every((x) => x[1]), JSON.stringify(res));
  check('no page errors', page.errors.length === 0, page.errors.join(' | '));
} finally {
  if (browser) await browser.close();
  if (L) await L.close();
}
