/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// FIRST INSTALL ON A SHARED HOST: the site in account/sites/site, IniqDash in site/iniqdash, PHP limited by open_basedir to the site
// and one other folder of the account (account/data). Nothing is prepared by hand:
//   1  the sign-in page opens on "Create your account" (no private folder, no server/local.php)
//   2  creating the account works: the folder beside the site is out of reach, so the private folder is made in the reachable
//      account folder (outside the web site), server/local.php points to it, the secrets file is 0600 and holds a hash, not the password
//   3  with no reachable place outside the web site, the page says so (a readable message) — the folder is never put inside the site
//   2b an update that lost server/local.php finds the existing private folder (never a second, empty installation)
//   4  a PHP failure on a fresh install shows "IniqDash could not start" with the reason, once — not an empty HTTP 500
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { check } from './lib/harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
// a temporary place that is NOT under the system temp folder's own name rules (the host test needs its own "account" folder)
const ACCT = fs.mkdtempSync(path.join(os.tmpdir(), 'iniq-acct-'));
const SITE = path.join(ACCT, 'sites', 'site'), APP = path.join(SITE, 'iniqdash'), DATA = path.join(ACCT, 'data');
fs.mkdirSync(APP, { recursive: true }); fs.mkdirSync(DATA);
execFileSync('bash', ['-c', `cd "${ROOT}" && git ls-files -z | xargs -0 tar -cf - | tar -xf - -C "${APP}"`]);
const servers = [];
async function serve(basedir) {
  const port = await freePort();
  const php = spawn('php', ['-d', 'opcache.enable=0', '-d', 'opcache.enable_cli=0', '-d', 'display_errors=0', '-d', 'log_errors=0', '-d', `open_basedir=${basedir}`, '-S', `127.0.0.1:${port}`], { cwd: SITE, env: { ...process.env, INIQDASH_TRUSTED_PROXIES: '127.0.0.1', INIQDASH_PRIVATE: '' }, stdio: 'ignore' });
  servers.push(php);
  const base = `http://127.0.0.1:${port}/iniqdash`;
  for (let i = 0; i < 60; i++) { try { await fetch(`${base}/login.php`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
  return base;
}
const H = { 'X-Forwarded-Proto': 'https' };
async function createAccount(base) {
  const r1 = await fetch(`${base}/login.php`, { headers: H });
  const html = await r1.text(), cookie = (r1.headers.get('set-cookie') || '').split(';')[0];
  const csrf = (html.match(/name="setup_csrf" value="([0-9a-f]+)"/) || [])[1];
  const body = new URLSearchParams({ action: 'setup', setup_csrf: csrf || '', user: 'owner', password: 'a long first password', password2: 'a long first password' });
  const r2 = await fetch(`${base}/login.php`, { method: 'POST', redirect: 'manual', headers: { ...H, Cookie: cookie, Origin: base.replace('http:', 'https:').replace('/iniqdash', ''), 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  return { first: html, status: r2.status, location: r2.headers.get('location') || '', text: r2.status === 303 ? '' : await r2.text() };
}

try {
  // ---- 1 + 2: PHP reaches the site and account/data
  let base = await serve(`${SITE}${path.delimiter}${DATA}`);
  const a = await createAccount(base);
  check('1 · a fresh install opens on "Create your account" (nothing prepared by hand)', /Create your account/.test(a.first), a.first.slice(0, 200));
  const local = path.join(APP, 'server', 'local.php'), priv = path.join(DATA, 'iniqdash-private'), secrets = path.join(priv, 'iniqdash-secrets.php');
  const okFiles = fs.existsSync(secrets) && fs.existsSync(local) && fs.readFileSync(local, 'utf8').includes(priv);
  const mode = okFiles ? (fs.statSync(secrets).mode & 0o777).toString(8) : '';
  const content = okFiles ? fs.readFileSync(secrets, 'utf8') : '';
  check('2 · the account is created; the private folder is made in the reachable account folder (outside the site), local.php points to it, the secrets file is 0600 with a hash (no password)',
    a.status === 303 && /setup=continue/.test(a.location) && okFiles && mode === '600' && /argon2id|\$2y\$/.test(content) && !content.includes('a long first password'),
    JSON.stringify({ status: a.status, location: a.location, okFiles, mode, text: a.text.replace(/<[^>]+>/g, ' ').slice(-300) }));
  // ---- 2b: an update that replaced the folder and lost server/local.php finds the existing private folder again (no new setup)
  fs.rmSync(local, { force: true });
  const again = await (await fetch(`${base}/login.php`, { headers: H })).text();
  check('2b · after an update that lost server/local.php the existing installation is found again: the sign-in page, not a new account',
    !/Create your account/.test(again) && /type="password"/.test(again) && !fs.existsSync(local), again.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200));
  servers.forEach((s) => s.kill()); servers.length = 0;
  // ---- 3: PHP reaches the site only — no place outside it
  fs.rmSync(priv, { recursive: true, force: true }); fs.rmSync(local, { force: true });
  base = await serve(SITE);
  const b = await createAccount(base);
  const insideSite = fs.readdirSync(SITE).concat(fs.readdirSync(APP)).some((n) => /iniqdash-private/.test(n));
  check('3 · with no reachable place outside the web site the page explains it, and nothing is created inside the site',
    b.status !== 303 && /outside the web site/i.test(b.text) && !insideSite && !fs.existsSync(local), JSON.stringify({ status: b.status, insideSite }));
  // ---- 4: a PHP failure on a fresh install
  const setupFile = path.join(APP, 'server', 'FirstRun.php'), orig = fs.readFileSync(setupFile, 'utf8');
  fs.writeFileSync(setupFile, `${orig}\nfunction broken( {\n`);
  await new Promise((res) => setTimeout(res, 2600));     // PHP's opcode cache looks at changed files every 2 s
  const r = await fetch(`${base}/login.php`, { headers: H }), t = await r.text();
  fs.writeFileSync(setupFile, orig);
  check('4 · a PHP failure on a fresh install shows "IniqDash could not start" with the reason, once (not an empty 500); no server folders in it',
    r.status === 500 && (t.match(/IniqDash could not start<\/h1>/g) || []).length === 1 && /ParseError/.test(t) && /FirstRun\.php:\d+/.test(t) && !t.includes(ACCT), t.replace(/<[^>]+>/g, ' ').slice(0, 300));
} catch (e) {
  check('setup-hosting test ran', false, e.stack || e.message);
} finally {
  servers.forEach((s) => s.kill());
  fs.rmSync(ACCT, { recursive: true, force: true });
}
console.log('finished');
