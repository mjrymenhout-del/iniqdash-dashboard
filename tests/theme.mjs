/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Theme data model: pure rules (allow-listed colour tokens, no CSS), layer resolution, model validation, server parity (PHP),
// application on the dashboard surface and on a widget, persistence through save / reload / export / import, safe fallback.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { start, check } from './lib/harness.mjs';
const T = createRequire(import.meta.url)('../components/theme/theme.js');

// ---- pure rules
check('a plain theme is valid', T.check({ id: 'midnight', name: 'Midnight', tokens: { accent: '#ff8800', 'page-bg': 'rgb(10, 12, 16)', danger: 'hsl(0 80% 60%)', 'accent-soft': 'rgba(255,136,0,.14)' } }).length === 0);
for (const [label, th] of [['url()', { tokens: { accent: 'url(https://evil.example/x)' } }], ['var()', { tokens: { accent: 'var(--danger)' } }], ['calc/expression', { tokens: { accent: 'calc(1px)' } }],
  ['declaration smuggling', { tokens: { accent: '#fff; background: url(x)' } }], ['unknown token', { tokens: { 'font-size': '#fff' } }], ['unknown key', { tokens: {}, css: 'a{}' }],
  ['bad id', { id: 'Bad Id!' }], ['markup in name', { name: '<b>x</b>' }], ['array tokens', { tokens: [] }], ['not an object', 'x']])
  check(`rejected: ${label}`, T.check(th).length > 0);
check('too many tokens are rejected', T.check({ tokens: Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`t${i}`, '#fff'])) }).length > 0);
// ---- V2: look + background — bounded numbers, named choices, asset references only
check('V2: a theme with a look and a background is valid', T.check({ id: 'x', name: 'X', dark: false, base: 'iniqdash', look: { font: 'rounded', titleWeight: 600, textScale: 1.05, radius: 20, borderWidth: 1, shadow: 'soft', shadowStrength: 80, surfaceAlpha: 80, blur: 8, glass: false, glow: 30 },
  background: { image: 'api/asset.php?id=0123456789abcdef0123456789abcdef', fit: 'contain', position: 'top-left', opacity: 70, overlay: '#000000', overlayAlpha: 30, blur: 4, attach: 'fixed', gradient: { from: '#112233', to: 'rgb(1, 2, 3)', angle: 135 } } }).length === 0);
for (const [label, th] of [['an outside image address', { background: { image: 'https://evil.example/a.png' } }], ['an embedded image', { background: { image: 'data:image/png;base64,AAAA' } }],
  ['a path with ..', { background: { image: 'assets/../server/x.png' } }], ['a server path', { background: { image: '/var/www/x.png' } }], ['an unknown look property', { look: { css: 'a{}' } }],
  ['a radius out of range', { look: { radius: 400 } }], ['an unknown font', { look: { font: 'Comic; }' } }], ['a CSS gradient string', { background: { gradient: 'linear-gradient(red, blue)' } }],
  ['url() in a gradient stop', { background: { gradient: { from: 'url(x)', to: '#fff' } } }], ['a non-boolean dark', { dark: 'yes' }], ['an unknown background property', { background: { repeat: 'x' } }]])
  check(`V2 rejected: ${label}`, T.check(th).length > 0);
check('V2: clean() keeps the valid look / background and drops the rest', JSON.stringify(T.clean({ look: { radius: 12, css: 'x', shadow: 'huge' }, background: { fit: 'cover', image: 'https://x/y.png' } })) === '{"look":{"radius":12},"background":{"fit":"cover"}}');
{ const L = T.lookProps(T.clean({ look: { radius: 10, shadow: 'none', borderWidth: 0 }, background: { image: 'assets/img/x.png', fit: 'stretch', opacity: 50 } }), () => '');
  check('V2: the look writes only fixed CSS from the numbers (radius, no shadow), the image as a quoted asset url', L.props['--radius-device'] === '10px' && !/rgba\(0, 0, 0/.test(L.props['--device-shadow']) && L.props['--theme-bg-image'] === 'url("assets/img/x.png")' && L.props['--theme-bg-size'] === '100% 100%' && L.props['--theme-bg-opacity'] === '0.5', JSON.stringify(L.props)); }
check('V2: classification — stored, else judged from the page colour, the original is dark', T.isDark({ dark: false }) === false && T.isDark({ tokens: { 'page-bg': '#f4f4f4' } }) === false && T.isDark({}) === true);
check('clean() drops invalid tokens and keeps valid ones (fallback to defaults)', JSON.stringify(T.clean({ tokens: { accent: 'javascript:1', danger: '#f00', bogus: '#000' } })) === '{"tokens":{"danger":"#f00"}}');
check('clean() of nothing valid is null', T.clean({ tokens: { accent: 'nope' } }) === null && T.clean(null) === null);
check('resolve(): defaults < dashboard < type < widget', JSON.stringify(T.resolve({ dashboard: { tokens: { accent: '#111', danger: '#222' } }, type: { tokens: { danger: '#333' } }, widget: { tokens: { accent: '#444' } } })) === '{"accent":"#444","danger":"#333"}');

// ---- server parity (the same refusals, independent of the editor)
const php = (model) => spawnSync('php', ['tests/checkmodel.php'], { input: JSON.stringify(model), encoding: 'utf8' });
const base = (theme, cfgTheme) => ({ version: 3, app: { id: 'a', startPage: 'p', navigation: {}, ...(theme ? { theme } : {}) }, pages: [{ id: 'p', name: 'P', nav: true, items: [{ id: 'i1', type: 'sensor', config: cfgTheme ? { theme: cfgTheme } : {}, layout: {} }] }] });
check('server accepts a valid dashboard theme', php(base({ id: 'x', tokens: { accent: '#fa0' } })).status === 0);
check('server accepts a valid widget theme', php(base(null, { tokens: { accent: '#fa0' } })).status === 0);
check('server refuses url() in a dashboard theme', php(base({ tokens: { accent: 'url(//evil/x)' } })).status === 1);
check('server refuses an unknown token', php(base({ tokens: { 'z-index': '#fff' } })).status === 1);
check('server refuses a bad widget theme', php(base(null, { tokens: { accent: 'expression(1)' } })).status === 1);
check('server refuses an unknown theme key', php(base({ css: 'x' })).status === 1);
check('server accepts a V2 theme (look + background with an uploaded image reference)', php(base({ id: 'v2', look: { radius: 18, shadow: 'soft', glass: true, textScale: 1.1 }, background: { image: 'api/asset.php?id=0123456789abcdef0123456789abcdef', fit: 'cover', overlay: '#000', overlayAlpha: 40, gradient: { from: '#000', to: '#fff', angle: 90 } }, tokens: { 'nav-active': '#fff' } })).status === 0);
check('server refuses an outside background image', php(base({ background: { image: 'https://evil.example/a.png' } })).status === 1);
check('server refuses an unknown look property', php(base({ look: { css: 'a{}' } })).status === 1);
check('server refuses a look value out of range', php(base({ look: { blur: 999 } })).status === 1);

// ---- the real editor
const S = await start([], { server: false });
const page = await S.page({ width: 1400, height: 900 });
await page.waitForTimeout(1500);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const getModel = () => page.evaluate(() => window.editor.getModel());
const importModel = async (m) => {
  await page.click('[data-k=more]').catch(() => {}); await page.click('[data-k=import]'); await page.waitForSelector('dialog[open] textarea');
  await page.fill('dialog[open] textarea', JSON.stringify(m)); await page.click('dialog[open] .ed-btn--primary:has-text("Import")'); await page.waitForTimeout(700);
  return page.$('dialog[open] .ed-errors li').then((x) => !x);
};
const m0 = await getModel();
const first = m0.pages[0].items.find((i) => i.type !== 'container' && !i.parent) || m0.pages[0].items[0];
const withTheme = structuredClone(m0);
withTheme.app.theme = { id: 'midnight', name: 'Midnight', tokens: { accent: '#12ab34', 'page-bg': '#010203' } };
withTheme.pages[0].items.find((i) => i.id === first.id).config.theme = { tokens: { accent: '#ab1234' } };
check('a model with dashboard + widget themes imports', await importModel(withTheme));
const css = (sel, prop) => page.evaluate(([s, p]) => { const n = document.querySelector(s); return n && getComputedStyle(n).getPropertyValue(p).trim(); }, [sel, prop]);
check('the dashboard surface carries the dashboard theme', (await css('.ed-frame', '--accent')) === '#12ab34' && (await css('.ed-frame', '--page-bg')) === '#010203');
check('the theme identity is on the surface', await page.evaluate(() => document.querySelector('.ed-frame').dataset.theme === 'midnight'));
check('the widget override wins on that widget only', (await css(`[data-grid-id="${first.id}"] > *`, '--accent')) === '#ab1234' || (await page.evaluate((id) => { const n = document.querySelector(`[data-grid-id="${id}"]`).querySelector('[style*="--accent"]'); return !!n && n.style.getPropertyValue('--accent') === '#ab1234'; }, first.id)));
const others = await page.evaluate(([id, ids]) => { const r = ids.filter((x) => x !== id).map((x) => document.querySelector(`[data-grid-id="${x}"]`)).filter(Boolean).map((n) => n.firstElementChild).filter(Boolean); return r.length > 0 && r.every((w) => getComputedStyle(w).getPropertyValue('--accent').trim() === '#12ab34'); }, [first.id, m0.pages[0].items.filter((i) => i.type !== 'container').map((i) => i.id)]);
check('other widgets keep the dashboard value', others);
await page.evaluate(() => window.editor.save()); await page.waitForTimeout(300);
await page.reload(); await page.waitForTimeout(1500);
const m1 = await getModel();
check('theme survives save / reload (dashboard and widget)', m1.app.theme && m1.app.theme.id === 'midnight' && m1.app.theme.tokens.accent === '#12ab34' && m1.pages[0].items.find((i) => i.id === first.id).config.theme.tokens.accent === '#ab1234');
check('and is applied again after reload', (await css('.ed-frame', '--accent')) === '#12ab34');
// export contains the theme (and nothing else new), import rejects an unsafe one without changing anything
const unsafe = structuredClone(m1); unsafe.app.theme = { tokens: { accent: 'url(https://evil.example/a.png)' } };
const before = JSON.stringify(await getModel());
check('an unsafe theme is refused on import', (await importModel(unsafe)) === false);
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
check('and nothing changed', JSON.stringify(await getModel()) === before);
// a dashboard without a theme is not styled by a previous one
const plain = structuredClone(m1); delete plain.app.theme; plain.pages[0].items.forEach((i) => delete i.config.theme);
await importModel(plain);
check('replacing it with a theme-less dashboard removes the theme from the surface', (await css('.ed-frame', '--accent')) !== '#12ab34' && !(await page.evaluate(() => document.querySelector('.ed-frame').dataset.theme)));
check('no page errors', errors.length === 0, errors.join('|'));
await S.close();
console.log('finished');
