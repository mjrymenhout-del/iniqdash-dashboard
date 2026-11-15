/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// The PUBLIC screenshot set (docs/screenshots/, used by README.md and the guides), from the real application on a throwaway server with
// the fictional demo home — nothing outside the repository is touched, no real Home Assistant is involved.
//   1. run  node tools/iniqdash-demo-screenshots.mjs   (the demo pages and popups → docs/iniqdash-demo/)
//   2. run  node tools/readme-screenshots.mjs          (picks from those, adds the editor, the widget gallery, Widget Studio and the
//                                                       first-run wizard, writes optimised JPEGs to docs/screenshots/)
// Needs Python 3 with Pillow for the JPEG conversion.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { live, liveBrowser } from '../tests/lib/live.mjs';
import { playwright } from '../tests/lib/harness.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DEMO = path.join(ROOT, 'docs', 'iniqdash-demo'), OUT = path.join(ROOT, 'docs', 'screenshots');
const TMP = fs.mkdtempSync(path.join(ROOT, '.shots-'));
fs.mkdirSync(OUT, { recursive: true });
const jpeg = (src, dest, maxH = 1200) => execFileSync('python3', ['-c', `
from PIL import Image; import sys
im = Image.open(sys.argv[1]).convert('RGB'); h = min(im.height, int(sys.argv[3]))
im.crop((0, 0, im.width, h)).save(sys.argv[2], quality=86, optimize=True)`, src, dest, String(maxH)]);

// ---- 1 · the demo pages (already rendered by the demo screenshot tool)
const PICK = { 'home-desktop': 'home-desktop', 'lights-desktop': 'lights-desktop', 'climate-desktop': 'climate-desktop', 'rooms-desktop': 'rooms-desktop',
  'energy-desktop': 'energy-desktop', 'security-desktop': 'security-desktop', 'room-popup': 'popup-room-desktop', 'room-popup-lights': 'popup-room-lights-desktop',
  'mobile-home': 'home-mobile', 'mobile-room-popup': 'popup-room-mobile', 'tablet-home': 'home-tablet', 'radial-menu': 'radial-desktop' };
for (const [to, from] of Object.entries(PICK)) {
  const src = path.join(DEMO, `${from}.png`);
  if (!fs.existsSync(src)) throw new Error(`missing ${src} — run tools/iniqdash-demo-screenshots.mjs first`);
  jpeg(src, path.join(OUT, `${to}.jpg`), to.startsWith('mobile') ? 1700 : 1200);
}

// ---- 2 · the editor, the widget gallery, Widget Studio (signed in, the demo dashboard)
let L = await live({ configureHa: false });
const c = L.client(); await c.login();
const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'demo', 'iniqdash-demo.json'), 'utf8'));
const r = await (await c.post('/api/dashboards.php', { action: 'create', name: 'INIQDASH demo', dashboard: model })).json();
let B = await liveBrowser(L, { viewport: { width: 1440, height: 900 } });
let p = B.page;
const wait = (ms) => p.waitForTimeout(ms);
try {
  await p.goto(`${L.base}/editor.html?d=${r.entry.id}`); await p.waitForFunction(() => window.editor, null, { timeout: 25000 }); await wait(2500);
  await p.evaluate(() => window.editor.setEditing && window.editor.setEditing(true)); await wait(1500);
  const w = await p.$('[data-grid-id="h-climate"]') || await p.$('.mg__item');
  if (w) { await w.click({ position: { x: 40, y: 20 } }); await wait(1200); }
  await p.screenshot({ path: path.join(TMP, 'editor.png') });
  await p.keyboard.press('Escape'); await wait(400);
  await p.click('.ed-btn--primary.ed-only-edit'); await wait(1800);
  await p.screenshot({ path: path.join(TMP, 'gallery.png') });
  await p.keyboard.press('Escape'); await wait(600);
  await p.click('[data-k=studio]'); await wait(3000);
  // a widget composed in the Studio: a blank widget with an arc gauge from the toolbox, its properties open
  const btn = await p.$('button:has-text("Create blank widget")'); if (btn) { await btn.click(); await wait(1500); }
  for (const name of ['Arc gauge']) {
    const it = await p.$(`text="${name}"`); if (it) { await it.click(); await wait(900); }
  }
  await wait(1000);
  await p.screenshot({ path: path.join(TMP, 'studio.png') });
  console.log('page errors:', B.errors.length ? B.errors.join(' | ') : 'none');
} finally { await B.close(); await L.close(); }
jpeg(path.join(TMP, 'editor.png'), path.join(OUT, 'editor.jpg'));
jpeg(path.join(TMP, 'gallery.png'), path.join(OUT, 'widget-gallery.jpg'));
jpeg(path.join(TMP, 'studio.png'), path.join(OUT, 'widget-studio.jpg'));

// ---- 3 · the first-run wizard: a fresh installation, the account step
L = await live({ configureHa: false, fresh: true });
const br = await playwright().chromium.launch();
try {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 860 }, extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' } });
  p = await ctx.newPage();
  await p.goto(`${L.base}/`); await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(TMP, 'setup.png') });
} finally { await br.close(); await L.close(); }
jpeg(path.join(TMP, 'setup.png'), path.join(OUT, 'setup-wizard.jpg'));
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`screenshots in ${path.relative(ROOT, OUT)}: ${fs.readdirSync(OUT).join(', ')}`);
process.exit(0);
