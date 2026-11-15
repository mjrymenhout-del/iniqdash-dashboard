/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ABOUT INIQDASH (editor → More → About INIQDASH…), through the real server:
//   1  the dialog shows the installed version (the VERSION file), the licence and the founder
//   2  the support button is the project's Buy Me a Coffee page, opens in a new tab without giving it the page (noopener)
//   3  the button is the service's yellow button (#FFDD00, black text), drawn locally (no image, script or request to another site),
//      a 44 px touch target that fits the dialog on desktop and on a phone
//   4  the repository's funding file and the README use the same account
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
let L, B;
try {
  L = await live({ configureHa: false });
  const open = async (viewport) => {
    B = await liveBrowser(L, { viewport });
    const p = B.page, foreign = [];
    p.on('request', (r) => { if (!r.url().startsWith(L.base.replace(/\/[^/]*$/, ''))) foreign.push(r.url()); });
    await p.goto(`${L.base}/editor.html`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await p.waitForTimeout(800);
    await p.evaluate(() => window.editor.setEditing && window.editor.setEditing(true)); await p.waitForTimeout(500);
    await p.evaluate(() => document.querySelector('[data-k=about]').click()); await p.waitForTimeout(600);
    const a = await p.evaluate(() => {
      const d = document.querySelector('dialog.ed-dlg--about'); const l = d && d.querySelector('[data-k=about-support] a.ed-bmc');
      if (!d || !l) return d && { text: d.textContent };
      const cs = getComputedStyle(l), r = l.getBoundingClientRect(), dr = d.getBoundingClientRect();
      return { text: d.textContent, label: l.textContent, href: l.getAttribute('href'), target: l.getAttribute('target'), rel: l.getAttribute('rel'),
        bg: cs.backgroundColor, color: cs.color, h: r.height, inside: r.left >= dr.left && r.right <= dr.right + 0.5 && r.width > 120,
        imgs: d.querySelectorAll('[data-k=about-support] img').length, svg: !!l.querySelector('svg'), vw: innerWidth, docW: document.documentElement.scrollWidth };
    });
    return { p, a, foreign };
  };
  for (const [name, viewport] of [['desktop', { width: 1400, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const { a, foreign } = await open(viewport);
    if (name === 'desktop') {
      check('1 · About shows the installed version, the licence and the founder', !!a && a.text.includes(`INIQDASH ${VERSION}`) && /Mozilla Public License 2\.0/.test(a.text) && /Marcel Rymenhout/.test(a.text), JSON.stringify(a));
      check('2 · the support button opens https://buymeacoffee.com/iniqdash in a new tab, noopener', !!a && a.href === 'https://buymeacoffee.com/iniqdash' && a.target === '_blank' && /noopener/.test(a.rel) && /Buy me a coffee/.test(a.label), JSON.stringify(a));
    }
    check(`3 · ${name}: the yellow Buy Me a Coffee button (#FFDD00, black, cup), drawn locally, ≥ 44 px high, inside the dialog`,
      !!a && a.bg === 'rgb(255, 221, 0)' && a.color === 'rgb(0, 0, 0)' && a.svg && a.imgs === 0 && a.h >= 44 && a.inside && a.docW <= a.vw && foreign.length === 0,
      JSON.stringify({ ...a, text: undefined, foreign }));
    check(`no page errors (${name})`, B.errors.length === 0, B.errors.join(' | '));
    await B.close(); B = null;
  }
  const fund = fs.readFileSync(path.join(ROOT, '.github', 'FUNDING.yml'), 'utf8');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const links = [...readme.matchAll(/(?<!cdn\.)buymeacoffee\.com\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  check('4 · FUNDING.yml and the README name the same Buy Me a Coffee account, the README with the official button image',
    /^buy_me_a_coffee:\s*iniqdash\s*$/m.test(fund) && links.length >= 2 && links.every((x) => x === 'iniqdash')
    && /<a href="https:\/\/buymeacoffee\.com\/iniqdash"><img src="https:\/\/cdn\.buymeacoffee\.com\/buttons\/v2\/default-yellow\.png"/.test(readme), fund);
} catch (e) {
  check('about test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
