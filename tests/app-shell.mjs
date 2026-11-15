/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// THE APPLICATION — dashboard-first. Real PHP server (gate.php, login.php, sessions, CSRF), real browser, FAKE Home Assistant
// (tests/lib/live.mjs — not a real one).
//   sign-in lands on the site root = the dashboard in VIEWING mode (no showroom navigation, no editor chrome, the dock) · refresh stays
//   there · the developer showroom (dev/) does not exist unless the installation enables it (server-side) · the DEFAULT DASHBOARD
//   (application setting) opens first; a deleted default falls back (no loop) · the discreet EDIT control: hidden, mouse rest 2 s in the
//   top-right corner, touch long-press 2 s (a moved press cancels), keyboard (Tab / Shift+E), "always visible" setting · Edit opens the
//   existing editor; Done saves and returns to viewing · mobile: the bottom dock stays on screen.
import { live } from './lib/live.mjs';
import { check, playwright } from './lib/harness.mjs';

let L, browser;
try {
  L = await live();
  browser = await playwright().chromium.launch();
  const open = async (vp = { width: 1440, height: 900 }) => {
    const ctx = await browser.newContext({ viewport: vp, locale: 'en-GB', timezoneId: 'Europe/Amsterdam', extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' } });
    const page = await ctx.newPage(); page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
    return { ctx, page };
  };
  const login = async (page) => {
    await page.goto(`${L.base}/`);
    const atLogin = /login\.php/.test(page.url()) && !/next=/.test(page.url());
    await page.fill('input[name=user]', 'admin'); await page.fill('input[name=password]', 'correct horse battery staple');
    await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
    await page.waitForFunction(() => window.editor && window.editor.viewing, null, { timeout: 15000 });
    await page.waitForTimeout(800);
    return atLogin;
  };
  const shell = (page) => page.evaluate(() => {
    const vis = (q) => { const e = document.querySelector(q); if (!e) return false; const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const ea = document.querySelector('.iqea');
    return { path: location.pathname, viewing: window.editor.viewing(), editing: document.querySelector('.ed').classList.contains('ed--editing'), toolbar: vis('.ed-bar'), header: vis('[data-app-header]'),
      showroomNav: !!document.querySelector('[data-showroom-nav], .snav'), dock: vis('.msh__dock'), editShown: ea ? getComputedStyle(ea).opacity === '1' : null,
      editClickable: ea ? getComputedStyle(ea).pointerEvents !== 'none' : null, d: new URLSearchParams(location.search).get('d') };
  });

  // ---------------------------------------------------------------- landing
  const A = await open();
  const atLogin = await login(A.page);
  let s = await shell(A.page);
  check('SIGN-IN: the root asks for the login (no showroom "next"), then lands on the ROOT — the dashboard in viewing mode: no showroom navigation, no editor toolbar or header, the Navigation Dock',
    atLogin && s.path === '/' && s.viewing && !s.editing && !s.toolbar && !s.header && !s.showroomNav && s.dock, JSON.stringify(s));
  await A.page.reload(); await A.page.waitForFunction(() => window.editor && window.editor.viewing, null, { timeout: 15000 }); await A.page.waitForTimeout(600);
  s = await shell(A.page);
  check('REFRESH: still the dashboard, still viewing', s.path === '/' && s.viewing && !s.toolbar, JSON.stringify(s));
  // (asked from the signed-in page itself, with its session)
  const devr = await A.page.evaluate(async () => { const d = await fetch('dev/index.html', { redirect: 'manual' }), i = await fetch('index.html'); const t = await i.text();
    return { dev: d.status, idx: i.status, app: /data-editor/.test(t), nav: /data-showroom-nav/.test(t) }; });
  check('THE DEVELOPER SHOWROOM is not part of the application: dev/ answers 404 to a signed-in user (enforced by the server, not hidden by CSS); /index.html is the application',
    devr.dev === 404 && devr.idx === 200 && devr.app && !devr.nav, JSON.stringify(devr));

  // ---------------------------------------------------------------- the Edit control: hidden, mouse corner rest, Done
  check('EDIT CONTROL hidden at first (transparent and click-through — "Hidden until corner activation", the default)', s.editShown === false && s.editClickable === false, JSON.stringify(s));
  await A.page.mouse.move(700, 400); await A.page.mouse.move(1420, 20, { steps: 4 }); await A.page.waitForTimeout(900);
  const early = (await shell(A.page)).editShown;
  await A.page.mouse.move(1418, 22); await A.page.waitForTimeout(1500);
  s = await shell(A.page);
  check('MOUSE: resting in the top-right corner — not after 1 s, shown after 2 s', early === false && s.editShown && s.editClickable, JSON.stringify({ early, s }));
  await A.page.mouse.move(700, 500); await A.page.waitForTimeout(2000);
  check('…leaving the corner: it fades away again', (await shell(A.page)).editShown === false);
  await A.page.mouse.move(1418, 22, { steps: 3 }); await A.page.waitForTimeout(2300);
  await A.page.click('[data-k=edit-dashboard]'); await A.page.waitForTimeout(600);
  s = await shell(A.page);
  check('EDIT DASHBOARD opens the existing editor: the toolbar (Done, Add, Undo…), edit mode on, the viewing mode left', s.editing && !s.viewing && s.toolbar && (await A.page.textContent('.ed-btn--edit')).trim() === 'Done', JSON.stringify(s));
  // a change, then Done: saved (the existing save) and back to viewing
  const rev0 = await A.page.evaluate(() => (window.editor.dashboard() || {}).revision ?? null);
  await A.page.evaluate(() => { const m = window.editor.getModel(); m.pages[0].name = 'Living'; window.editor.setModel(m); });
  await A.page.click('.ed-btn--edit'); await A.page.waitForFunction(() => window.editor.viewing(), null, { timeout: 15000 }); await A.page.waitForTimeout(500);
  s = await shell(A.page);
  const saved = await A.page.evaluate(() => ({ dirty: window.editor.isDirty(), d: window.editor.dashboard() }));
  check('DONE saves the change (the existing save) and returns to viewing — no toolbar, the edit control hidden again, nothing unsaved', s.viewing && !s.editing && !s.toolbar && s.editShown === false && !saved.dirty && saved.d && saved.d.revision !== rev0, JSON.stringify({ s, saved, rev0 }));

  // ---------------------------------------------------------------- keyboard
  await A.page.reload(); await A.page.waitForFunction(() => window.editor && window.editor.viewing && window.editor.viewing(), null, { timeout: 15000 }); await A.page.waitForTimeout(600);   // a fresh page
  await A.page.keyboard.press('Tab'); await A.page.waitForTimeout(500);
  const kb = await A.page.evaluate(() => ({ focused: document.activeElement?.dataset.k, label: document.activeElement?.getAttribute('aria-label'), shown: getComputedStyle(document.querySelector('.iqea')).opacity }));
  await A.page.keyboard.press('Escape'); await A.page.evaluate(() => document.activeElement.blur()); await A.page.waitForTimeout(500);
  await A.page.keyboard.press('Shift+E'); await A.page.waitForTimeout(200);
  const kb2 = await A.page.evaluate(() => document.activeElement?.dataset.k);
  await A.page.keyboard.press('Enter'); await A.page.waitForTimeout(600);
  const kb3 = await shell(A.page);
  check('KEYBOARD: the first Tab reaches "Edit dashboard" (labelled, visible while focused); Shift+E focuses it too; Enter opens the editor',
    kb.focused === 'edit-dashboard' && kb.label === 'Edit dashboard' && kb.shown === '1' && kb2 === 'edit-dashboard' && kb3.editing, JSON.stringify({ kb, kb2, kb3 }));
  await A.page.evaluate(() => window.editor.done()); await A.page.waitForTimeout(500);

  // ---------------------------------------------------------------- touch (a tablet)
  const T = await open({ width: 900, height: 1180 });
  await login(T.page);
  const shownNow = () => T.page.evaluate(() => document.querySelector('.iqea').dataset.shown === 'true');
  const touch = (x, y, type, id = 7) => T.page.evaluate(({ x, y, type, id }) => document.elementFromPoint(Math.min(x, innerWidth - 1), y).dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true })), { x, y, type, id });
  await touch(880, 20, 'pointerdown'); await touch(884, 26, 'pointermove'); await T.page.waitForTimeout(2300);
  const held = await shownNow();
  await touch(880, 20, 'pointerup');
  await T.page.evaluate(() => window.editor.editAccess().hide()); await T.page.waitForTimeout(300);
  await touch(880, 20, 'pointerdown', 8); await touch(880, 60, 'pointermove', 8); await T.page.waitForTimeout(2300);
  const moved = await shownNow();
  await touch(880, 60, 'pointerup', 8);
  await touch(880, 20, 'pointerdown', 9); await T.page.waitForTimeout(800); await touch(880, 20, 'pointerup', 9); await T.page.waitForTimeout(1600);
  const short = await shownNow();
  check('TOUCH: a 2-second press in the top-right corner shows it (small wobble allowed); a press that moves away, or one lifted early, does not', held && !moved && !short, JSON.stringify({ held, moved, short }));
  await T.ctx.close();

  // ---------------------------------------------------------------- the application settings: always visible · default dashboard
  const c = L.client(); await c.login();
  const mk = async (name) => (await (await c.post('/api/dashboards.php', { action: 'create', name, dashboard: await A.page.evaluate(() => window.editor.getModel()) })).json()).entry.id;
  const second = await mk('Second'), third = await mk('Third');
  const bad = await c.post('/api/dashboards.php', { action: 'settings', default: 'd0000000000000000' });
  const badMode = await c.post('/api/dashboards.php', { action: 'settings', editButton: 'sometimes' });
  const ok = await (await c.post('/api/dashboards.php', { action: 'settings', default: second, editButton: 'always' })).json();
  check('SETTINGS (server): an unknown dashboard or an unknown Edit mode is refused; a real one is stored', bad.status === 404 && badMode.status === 400 && ok.ok && ok.settings.default === second && ok.settings.editButton === 'always', JSON.stringify([bad.status, badMode.status, ok]));
  const B = await open();
  await B.page.evaluate(() => { try { localStorage.setItem('iniqdash.lastDashboard', ''); } catch (e) { /* none */ } });
  await login(B.page);
  s = await shell(B.page);
  check('DEFAULT DASHBOARD: a new session opens the configured default ("Second"), viewing; "Always visible": the Edit control shows without any gesture',
    s.d === second && s.viewing && s.editShown && s.editClickable, JSON.stringify(s));
  await c.post('/api/dashboards.php', { action: 'delete', id: second });
  const after = await (await c.send('GET', '/api/dashboards.php')).json();
  await B.page.goto(`${L.base}/`); await B.page.waitForFunction(() => window.editor && window.editor.viewing, null, { timeout: 15000 }); await B.page.waitForTimeout(600);
  s = await shell(B.page);
  check('…the default DELETED: the setting reads as none, the application falls back to another dashboard (no error, no redirect loop)',
    after.settings.default === null && s.viewing && s.d && s.d !== second && [third].concat(after.dashboards.map((d) => d.id)).includes(s.d), JSON.stringify({ settings: after.settings, s }));
  await B.ctx.close();

  // ---------------------------------------------------------------- mobile: the bottom dock stays on screen
  const M = await open({ width: 390, height: 844 });
  await login(M.page);
  const dock = await M.page.evaluate(() => { const r = document.querySelector('.msh__dock').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight }; });
  check('MOBILE: viewing at the phone\'s own size; the bottom dock stays on screen while the dashboard scrolls', dock.bottom <= dock.h && dock.top > dock.h / 2, JSON.stringify(dock));
  await M.ctx.close();
  check('no page errors', A.page.errors.length === 0, A.page.errors.join(' | '));
  await A.ctx.close();
} finally {
  if (browser) await browser.close();
  if (L) await L.close();
}
