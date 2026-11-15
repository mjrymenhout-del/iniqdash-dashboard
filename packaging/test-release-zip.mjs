/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// INSTALL FROM THE RELEASE ZIP, as a user would — the ZIP itself, not a Git checkout:
//   unpack into a shared-hosting-like layout (account/sites/site = the web root, PHP limited to the account by open_basedir), open the
//   site, create the account in the browser wizard, finish with the demo, open the dashboard in a real browser and check it renders.
// No Home Assistant is used (the demo's simulated home). Needs PHP 8.1+, Node, Playwright (Chromium).
//   node packaging/test-release-zip.mjs <iniqdash-x.y.z.zip>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ZIP = path.resolve(process.argv[2] || '');
if (!fs.existsSync(ZIP)) { console.log('usage: node packaging/test-release-zip.mjs <release zip>'); process.exit(2); }
const require = createRequire(import.meta.url);
const pw = (() => { for (const p of ['playwright', path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')]) { try { return require(p); } catch { /* next */ } } throw new Error('playwright not found'); })();
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  ${detail}`}`); if (!ok) failed++; };

const ACCT = fs.mkdtempSync(path.join(os.tmpdir(), 'iniq-zip-'));
const SITE = path.join(ACCT, 'sites', 'site');
fs.mkdirSync(SITE, { recursive: true });
execFileSync('unzip', ['-q', ZIP, '-d', SITE]);
const APP = path.join(SITE, 'iniqdash');
// the built-in PHP server ignores .htaccess: a router does what .htaccess does (login / logout direct, everything else via gate.php)
const ROUTER = path.join(ACCT, 'router.php');
fs.writeFileSync(ROUTER, `<?php
$p = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$rel = substr($p, strlen('/iniqdash'));
if (in_array($rel, ['/login.php', '/logout.php'], true)) { $_SERVER['SCRIPT_NAME'] = '/iniqdash' . $rel; require ${JSON.stringify(APP)} . $rel; return true; }
$_SERVER['SCRIPT_NAME'] = '/iniqdash/gate.php';
require ${JSON.stringify(APP)} . '/gate.php';
`);
const port = await new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const php = spawn('php', ['-d', 'opcache.enable_cli=0', '-d', `open_basedir=${ACCT}`, '-S', `127.0.0.1:${port}`, ROUTER],
  { cwd: SITE, env: { ...process.env, INIQDASH_TRUSTED_PROXIES: '127.0.0.1', INIQDASH_PRIVATE: '' }, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}/iniqdash`;
for (let i = 0; i < 60; i++) { try { await fetch(`${base}/login.php`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
const browser = await pw.chromium.launch();
try {
  const files = execFileSync('unzip', ['-Z1', ZIP]).toString().split('\n').filter(Boolean);
  check(`the ZIP unpacks into one folder "iniqdash" (${files.length} entries) with no tests, Git data, secrets or private material`,
    files.every((f) => f.startsWith('iniqdash/')) && !files.some((f) => /(^|\/)(tests|\.git|maintainers)\/|iniqdash-secrets\.php$|server\/local\.php$/.test(f)));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${base}/`);
  check('a fresh install opens on the account step of the wizard', await p.isVisible('#password2'));
  await p.fill('#user', 'owner'); await p.fill('#password', 'a long first-run password'); await p.fill('#password2', 'a long first-run password');
  await Promise.all([p.waitForURL(/setup=1/, { timeout: 20000 }), p.click('button[type=submit]')]);
  await p.waitForSelector('[data-k=setup-demo]', { timeout: 20000 });
  const priv = path.join(ACCT, 'sites', 'iniqdash-private');            // beside the site's folder (installation.md)
  check('the account is created; the private folder is outside the website and the secrets file is 0600',
    fs.existsSync(path.join(priv, 'iniqdash-secrets.php')) && (fs.statSync(path.join(priv, 'iniqdash-secrets.php')).mode & 0o777) === 0o600 && !fs.existsSync(path.join(SITE, 'iniqdash-private')));
  await Promise.all([p.waitForURL(/\?d=/, { timeout: 30000 }), p.click('[data-k=setup-demo]')]);
  await p.waitForFunction(() => window.editor && window.editor.getModel && window.editor.getModel().pages.length >= 5, null, { timeout: 25000 });
  await p.waitForTimeout(3000);
  const view = await p.evaluate(() => ({ pages: window.editor.getModel().pages.map((x) => x.id), widgets: document.querySelectorAll('.mg__item').length }));
  check('"Explore the demo" opens the demo dashboard: its pages render with widgets', view.pages.includes('home') && view.pages.includes('energy') && view.widgets > 10, JSON.stringify(view));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
} catch (e) {
  check('release ZIP test ran', false, e.stack || e.message);
} finally {
  await browser.close(); php.kill();
  fs.rmSync(ACCT, { recursive: true, force: true });
}
console.log(failed ? `${failed} check(s) FAILED` : 'release ZIP: all checks passed');
process.exit(failed ? 1 : 0);
