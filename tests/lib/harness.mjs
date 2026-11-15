/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Browser test harness: serves the repository statically, marks the page as "served by the IniqDash server" and mocks the
// api/ha_*.php endpoints with entities produced by the REAL server code (tests/fixtures.php). No Home Assistant needed.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
export function playwright() {
  for (const p of ['playwright', path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')]) { try { return require(p); } catch { /* next */ } }
  throw new Error('playwright not found');
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };

/** rows: [[entity id, state, picks]] → { id: normalised entity } through server/ha/HaService.php */
export function normalise(rows) {
  const f = path.join(os.tmpdir(), `iniq-rows-${process.pid}-${Math.random().toString(36).slice(2)}.json`);   // unique: suites may run in parallel
  fs.writeFileSync(f, JSON.stringify(rows));
  try { return JSON.parse(execFileSync('php', [path.join(ROOT, 'tests/fixtures.php'), f]).toString()); } finally { fs.unlinkSync(f); }
}

export async function start(rows, { server: haMeta = true, browserArgs = [] } = {}) {
  let states = normalise(rows);
  const calls = [];
  let onCall = null;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname.startsWith('/api/')) {
      const name = u.pathname.slice(5);
      if (name === 'ha_status.php') return json({ ok: true, configured: true, connected: true, version: '2026.10.0', temperature_unit: '°C' });
      if (name === 'ha_states.php') { const out = {}; (u.searchParams.get('ids') || '').split(',').filter(Boolean).forEach((id) => { out[id] = states[id] || null; }); return json({ ok: true, configured: true, connected: true, states: out, at: new Date().toISOString() }); }
      if (name === 'ha_entities.php') return json({ ok: true, configured: true, connected: true, entities: Object.values(states).map((e) => ({ id: e.id, domain: e.domain, name: e.name, state: e.state, unit: e.unit, dc: e.attrs.device_class, area: null })) });
      if (name === 'ha_call.php' && req.method === 'POST') {
        let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { const body = JSON.parse(b || '{}'); calls.push(body); const r = onCall ? onCall(body, states) : null; json(r || { ok: true, accepted: true, expect: {} }); });
        return;
      }
      return json({ ok: false, error: 'mock' }, 404);
    }
    let file = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/editor.html' : u.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    let body = fs.readFileSync(file);
    if (haMeta && path.basename(file) === 'editor.html') body = Buffer.from(String(body).replace('<head>', '<head><meta name="iniqdash-server" content="1"><meta name="iniqdash-csrf" content="t">'));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await playwright().chromium.launch({ args: browserArgs });
  const url = `http://127.0.0.1:${server.address().port}/editor.html`;
  return {
    calls, url,
    setStates: (r) => { states = normalise(r); },
    onCall: (fn) => { onCall = fn; },
    async page(size = { width: 1200, height: 900 }, opts = {}) {
      const ctx = await browser.newContext({ viewport: size, locale: opts.locale || 'en-GB', timezoneId: opts.timezone || 'Europe/Amsterdam' });
      const page = await ctx.newPage();
      if (opts.time) { await page.clock.install({ time: new Date(opts.time.getTime() - 1000) }); await page.clock.pauseAt(opts.time); }   // frozen at opts.time until the test runs the clock
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      // console errors count too (failed network requests of the mocked server — 404s, favicon — are not widget errors)
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR/i.test(m.text())) errors.push(`console: ${m.text()}`); });
      await page.goto(url);
      await page.waitForFunction(() => window.MaisonRegistry && window.IniqHA);
      page.errors = errors;
      return page;
    },
    /** mount a widget of `type` with `config` at width × height (px) and return its wrapper's handle */
    async mount(page, type, config, w = 360, h = 200, id = 'w') {
      await page.evaluate(({ type, config, w, h, id }) => {
        document.getElementById(id)?.remove();
        const box = document.createElement('div');
        box.id = id; box.style.cssText = `position:fixed;left:10px;top:10px;width:${w}px;height:${h}px;z-index:99999;background:#222;display:grid`;
        box.append(window.MaisonRegistry.build(type, config));
        document.body.append(box);
      }, { type, config, w, h, id });
      await page.waitForTimeout(500);
    },
    async close() { await browser.close(); server.close(); },
  };
}
export const check = (label, ok, extra = '') => { console.log(`${ok ? 'ok   ' : 'FAIL '}${label}${ok ? '' : ` ${extra}`}`); if (!ok) process.exitCode = 1; };
