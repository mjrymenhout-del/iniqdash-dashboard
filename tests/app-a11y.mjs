/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// App-level accessibility and keyboard operation (real editor): landmarks, names, dialog semantics + focus handling for every editor dialog,
// keyboard-reachable canvas items, page navigation, reduced motion in the shared CSS.
import fs from 'node:fs';
import path from 'node:path';
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page({ width: 1500, height: 950 });
await page.waitForTimeout(1500);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const E = (fn, ...a) => page.evaluate(fn, ...a);
const settle = (ms = 350) => page.waitForTimeout(ms);
await E(() => window.editor.setEditing(true)); await settle();

// ---- document structure
check('the page declares a language and a title', await E(() => !!document.documentElement.lang && !!document.title.trim()));
check('there is one main landmark, a labelled navigation and a labelled inspector', await E(() => document.querySelectorAll('main, [role=main]').length === 1 && !!document.querySelector('nav[aria-label]') && !!document.querySelector('aside[aria-label]')));
check('the dashboard title is a heading', await E(() => !!document.querySelector('h1, h2')));
const unnamed = await E(() => {
  const name = (n) => (n.getAttribute('aria-label') || (n.getAttribute('aria-labelledby') && document.getElementById(n.getAttribute('aria-labelledby'))?.textContent) || n.textContent || n.getAttribute('title') || n.getAttribute('alt') || '').trim();
  return [...document.querySelectorAll('button, [role=button], a[href], input:not([type=hidden]), select, textarea')].filter((n) => !name(n) && !(n.labels && n.labels.length) && !n.closest('label')).map((n) => n.outerHTML.slice(0, 80));
});
check('every button, link and field has an accessible name', unnamed.length === 0, unnamed.join(' | '));
check('nothing clickable is a bare div / span', await E(() => ![...document.querySelectorAll('div, span, li')].some((n) => getComputedStyle(n).cursor === 'pointer' && !n.closest('button, a, label, select, summary, [data-widget]') && !n.getAttribute('role') && n.tabIndex < 0)));
check('images have alternative text (or are decorative)', await E(() => ![...document.querySelectorAll('img')].some((i) => i.getAttribute('alt') === null)));
check('status messages are announced politely (live region)', await E(() => !!document.querySelector('.ed-status[aria-live], .ed-status[role=status], [role=status]')));

// ---- dialogs: name, focus in, trapped, Escape closes, focus returns
const openers = {
  settings: () => page.click('button[aria-label="Dashboard settings"]'),
  pages: () => page.click('.ed-btn--pages'),
  add: () => E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click()),
  export: async () => { await page.click('[data-k=more]'); await page.click('[data-k=export]'); },
  import: async () => { await page.click('[data-k=more]'); await page.click('[data-k=import]'); },
};
for (const [name, open] of Object.entries(openers)) {
  await E(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  await settle(150);
  if (name === 'settings' || name === 'pages' || name === 'add') await page.focus(name === 'settings' ? 'button[aria-label="Dashboard settings"]' : name === 'pages' ? '.ed-btn--pages' : 'button:has-text("Add")').catch(() => {});
  await open(); await settle(500);
  const d = await E(() => { const x = document.querySelector('dialog[open]'); if (!x) return null; const label = x.getAttribute('aria-label') || (x.getAttribute('aria-labelledby') && document.getElementById(x.getAttribute('aria-labelledby'))?.textContent) || x.querySelector('h1,h2,h3')?.textContent || ''; return { label: label.trim(), inside: x.contains(document.activeElement) }; });
  check(`${name}: a modal dialog opens, with an accessible name`, !!d && d.label.length > 0, JSON.stringify(d));
  if (!d) continue;
  check(`${name}: keyboard focus moves into the dialog`, d.inside);
  let leaked = false;   // (activeElement = body means the browser's own UI, which a native modal dialog also cycles through)
  for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); if (await E(() => { const d = document.querySelector('dialog[open]'), a = document.activeElement; return !!a && a !== document.body && a !== document.documentElement && !d?.contains(a); })) leaked = true; }
  check(`${name}: Tab never reaches the page behind the dialog`, !leaked);
  await page.keyboard.press('Escape'); await settle(300);
  check(`${name}: Escape closes it`, !(await E(() => !!document.querySelector('dialog[open]'))));
  if (name === 'settings' || name === 'pages') check(`${name}: focus returns to the control that opened it`, await E((n) => { const a = document.activeElement; return n === 'settings' ? a?.getAttribute('aria-label') === 'Dashboard settings' : a?.classList.contains('ed-btn--pages'); }, name));
}

// ---- keyboard-only editing and navigation
const firstId = await E(() => window.editor.getPage().items.find((i) => !i.parent).id);
check('canvas items are keyboard focusable and named', await E((id) => { const n = document.querySelector(`[data-grid-id="${id}"]`); return n.tabIndex >= 0 && !!(n.getAttribute('aria-label') || n.textContent.trim()); }, firstId));
await E((id) => document.querySelector(`[data-grid-id="${id}"]`).focus(), firstId); await settle(150);
check('focusing an item selects it', await E((id) => document.querySelector('.ed-sel') && !document.querySelector('.ed-sel').hidden, firstId));
const before = await E((id) => JSON.stringify(window.editor.getPage().items.find((i) => i.id === id).layout.desktop), firstId);
await page.keyboard.press('ArrowDown'); await settle(250);
const afterMove = await E((id) => JSON.stringify(window.editor.getPage().items.find((i) => i.id === id).layout.desktop), firstId);
check('arrow keys move the item', before !== afterMove);
await page.keyboard.press('Control+z'); await settle(250);
check('Ctrl+Z undoes it from the keyboard', (await E((id) => JSON.stringify(window.editor.getPage().items.find((i) => i.id === id).layout.desktop), firstId)) === before);
await page.keyboard.press('Escape'); await settle(150);
const esc = await E((id) => ({ hidden: document.querySelector('.ed-sel').hidden, focus: document.activeElement === document.querySelector(`[data-grid-id="${id}"]`), active: (document.activeElement.className || document.activeElement.tagName).toString().slice(0, 40) }), firstId);
check('Escape deselects (focus stays on the item)', esc.hidden && esc.focus, JSON.stringify(esc));
const dock = await E(() => [...document.querySelectorAll('nav[aria-label] button, nav[aria-label] a')].map((b) => ({ name: (b.getAttribute('aria-label') || b.textContent).trim(), cur: b.getAttribute('aria-current') || b.getAttribute('aria-pressed') })));
check('the page navigation is made of buttons/links with names and a current-page marker', dock.length > 1 && dock.every((d) => d.name) && dock.some((d) => d.cur === 'page' || d.cur === 'true'), JSON.stringify(dock).slice(0, 200));
const other = await E(() => { const b = [...document.querySelectorAll('nav[aria-label] button, nav[aria-label] a')].find((x) => !(x.getAttribute('aria-current') === 'page' || x.getAttribute('aria-pressed') === 'true')); b.focus(); return window.editor.getPage().id; });
await page.keyboard.press('Enter'); await settle(500);
check('Enter on a navigation item switches the page', (await E(() => window.editor.getPage().id)) !== other);

// ---- reduced motion: every stylesheet that animates also has a reduced-motion rule
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const css = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { if (e.name.startsWith('.') || ['tests', 'node_modules'].includes(e.name)) return; const p = path.join(d, e.name); e.isDirectory() ? walk(p) : p.endsWith('.css') && css.push(p); });
['components', 'assets'].forEach((d) => walk(path.join(root, d)));
const unguarded = css.filter((f) => { const s = fs.readFileSync(f, 'utf8'); return /@keyframes|animation\s*:/.test(s) && !/prefers-reduced-motion/.test(s); }).map((f) => path.relative(root, f));
check('every shared stylesheet with animation has a prefers-reduced-motion rule', unguarded.length === 0, unguarded.join(', '));
check('no page errors', errors.length === 0, errors.join('|'));
await T.close();
console.log('finished');
