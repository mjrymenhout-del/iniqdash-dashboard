/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// THEME STUDIO V2 — the visual theme designer through the real editor UI (More → Themes…), real PHP server, FAKE Home Assistant
// (tests/lib/live.mjs — not a real Home Assistant).
//   gallery (six built-ins, read-only, thumbnails drawn with each theme, Dark / Light, palette) · Preview is not Apply (bar · Cancel
//   restores) · Apply · back to IniqDash Original (pixel-identical) · Duplicate → edit in the three-pane Studio (properties · live
//   preview of real components · selected element) · click to select · affected elements outlined · live + Unsaved · desktop / tablet /
//   mobile preview · Cancel · Save & apply · rename · inheritance (a widget's own theme wins; Use Theme Default) · export / import
//   (validated) · delete · save + reload.
import fs from 'node:fs';
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1000 } }); const page = B.page;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(1000);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, n) }); };
  const G = 'dialog[open].ed-dlg--tgal', S = 'dialog[open].ed-dlg--tstudio';
  const frameTok = (k) => E((k) => getComputedStyle(document.querySelector('.ed-frame')).getPropertyValue(`--${k}`).trim(), k);
  const model = () => E(() => window.editor.getModel());
  // a widget with its OWN theme (it keeps its accent whatever the dashboard theme)
  await E(() => { const m = window.editor.getModel(); m.pages[0].items.push({ id: 'own', type: 'sensor', parent: null, config: { name: 'Own accent', theme: { tokens: { accent: '#ff00aa' } } }, layout: { desktop: { x: 1, y: 40, w: 3, h: 3 }, tablet: { x: 1, y: 40, w: 3, h: 3 }, mobile: { w: 2, h: 3 } } }); const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join()); });
  await wait(700);
  const accent0 = await frameTok('accent');
  // differing pixels of two screenshots (decoded in the page)
  const pxDiff = (a, b) => E(async ([x, y]) => { const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = `data:image/png;base64,${s}`; });
    const [i, j] = await Promise.all([load(x), load(y)]); if (i.width !== j.width || i.height !== j.height) return 1e9;
    const px = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
    const A = px(i), B2 = px(j); let n = 0; for (let p = 0; p < A.length; p += 4) if (A[p] !== B2[p] || A[p + 1] !== B2[p + 1] || A[p + 2] !== B2[p + 2]) n++; return n; }, [a.toString('base64'), b.toString('base64')]);
  const clipOf = async () => { const r = await E(() => { const b = document.querySelector('.ed-frame').getBoundingClientRect(); return { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.min(b.width, 1400), height: Math.min(b.height, 700) }; }); return r; };
  await E(() => document.querySelectorAll('.ed-toast').forEach((t) => { t.hidden = true; })); await wait(200);
  const dash0 = await page.screenshot({ clip: await clipOf() });

  // ---------------------------------------------------------------- the gallery
  await page.click('[data-k=more]'); await page.click('[data-k=themes]'); await page.waitForSelector(G); await wait(500);
  const gal = await E((G) => [...document.querySelectorAll(`${G} [data-k=themes-builtin] .tsg-card`)].map((c) => ({ id: c.dataset.theme, name: c.querySelector('.tsg-card__name b').textContent, kind: c.querySelector('[data-k=theme-kind]').textContent,
    pal: c.querySelectorAll('.tsg-pal i').length, btns: [...c.querySelectorAll('button')].map((b) => b.dataset.k), thumb: (() => { const t = c.querySelector('.tsg-th'), cv = t.querySelector('.tsg-th__canvas'), cd = t.querySelector('.tsg-th__card'), n = t.querySelector('.tsg-th__nav');
      const s = (x, p) => getComputedStyle(x)[p]; return [s(cv, 'backgroundColor'), s(cv, 'backgroundImage').slice(0, 60), s(cd, 'backgroundImage').slice(0, 120), s(n, 'backgroundColor'), s(t.querySelector('.tsg-th__btn'), 'backgroundColor'), s(cd, 'borderTopLeftRadius')].join('|'); })(),
    applied: c.classList.contains('is-applied') })), G);
  await shot('ts2-gallery.png');
  check('GALLERY: the six built-in themes — IniqDash Original, Midnight Ember, Azure Home, Mint Garden, Slate & Peach, Minimal Light — each with its Dark / Light classification and palette; the Original applied',
    JSON.stringify(gal.map((g) => g.name)) === JSON.stringify(['IniqDash Original', 'Midnight Ember', 'Azure Home', 'Mint Garden', 'Slate & Peach', 'Minimal Light']) && JSON.stringify(gal.map((g) => g.kind)) === JSON.stringify(['Dark', 'Dark', 'Light', 'Light', 'Light', 'Light'])
      && gal.every((g) => g.pal === 7) && gal[0].applied, JSON.stringify(gal.map((g) => [g.name, g.kind, g.pal, g.applied])));
  check('BUILT-INS ARE READ-ONLY: Preview · Apply · Duplicate — no Edit, Rename or Delete', gal.every((g) => g.btns.includes('theme-preview') && g.btns.includes('theme-apply') && g.btns.includes('theme-duplicate') && !g.btns.includes('theme-edit') && !g.btns.includes('theme-delete')), JSON.stringify(gal.map((g) => g.btns)));
  check('SIX VISIBLY DIFFERENT THUMBNAILS (each drawn with its own theme: page, cards, navigation, accent, corners)', new Set(gal.map((g) => g.thumb)).size === 6, JSON.stringify(gal.map((g) => g.thumb)));

  // ---------------------------------------------------------------- Preview is not Apply; Cancel restores
  await page.click(`${G} .tsg-card[data-theme="azure-home"] [data-k=theme-preview]`); await page.waitForSelector('[data-k=theme-preview-bar]'); await wait(500);
  const pv = { accent: await frameTok('accent'), bar: await E(() => document.querySelector('[data-k=theme-preview-bar]').textContent), applied: (await model()).app.theme, gallery: !!(await page.$(G)) };
  await shot('ts2-preview-bar.png');
  check('PREVIEW shows Azure Home on the real dashboard with a bar ("Previewing … not applied") — nothing is applied or stored', pv.accent === '#1a62e8' && /Previewing “Azure Home”/.test(pv.bar) && /not applied/.test(pv.bar) && pv.applied === undefined && !pv.gallery, JSON.stringify(pv));
  await page.click('[data-k=theme-preview-cancel]'); await page.waitForSelector(G); await wait(500);
  check('CANCEL: back to the applied theme (the original accent), the bar is gone, the gallery returns', (await frameTok('accent')) === accent0 && !(await page.$('[data-k=theme-preview-bar]')));
  await page.click(`${G} .tsg-card[data-theme="mint-garden"] [data-k=theme-preview]`); await page.waitForSelector('[data-k=theme-preview-apply]'); await wait(300);
  await page.click('[data-k=theme-preview-apply]'); await page.waitForSelector(G); await wait(500);
  check('PREVIEW → APPLY: Mint Garden is the dashboard theme now', (await model()).app.theme.id === 'mint-garden' && (await frameTok('accent')) === '#18864f' && /Mint Garden/.test(await E((G) => document.querySelector(`${G} [data-k=themes-applied]`).textContent, G)));
  // back to the untouched original — the very same pixels as before any theme
  await page.click(`${G} [data-k=theme-default]`); await wait(500);
  await page.click(`${G} .ecfg-foot button`); await wait(500);
  await E(() => document.querySelectorAll('.ed-toast').forEach((t) => { t.hidden = true; })); await wait(200);
  const dash1 = await page.screenshot({ clip: await clipOf() });
  if (SHOTS) { fs.writeFileSync(path.join(SHOTS, 'ts2-orig-before.png'), dash0); fs.writeFileSync(path.join(SHOTS, 'ts2-orig-after.png'), dash1); }
  check('BACK TO INIQDASH ORIGINAL: no theme stored, no theme value on the dashboard — the same pixels as before any theme (live clock: the demo media progress bar may advance a few pixels; tests/theme-original.mjs compares with a frozen clock)', (await model()).app.theme === undefined && (await frameTok('accent')) === accent0 && (Buffer.compare(dash0, dash1) === 0 || (await pxDiff(dash0, dash1)) <= 40), String(await pxDiff(dash0, dash1)));

  // ---------------------------------------------------------------- duplicate a built-in → edit it in the Studio
  await E(() => window.editor.openThemes()); await page.waitForSelector(G);
  await page.click(`${G} .tsg-card[data-theme="midnight-ember"] [data-k=theme-duplicate]`); await wait(300);
  const mine = await E((G) => [...document.querySelectorAll(`${G} [data-k=themes-list] .tsg-card`)].map((c) => ({ id: c.dataset.theme, name: c.querySelector('.tsg-card__name b').textContent, edit: !!c.querySelector('[data-k=theme-edit]') })), G);
  check('DUPLICATE a built-in: "Midnight Ember copy" in My themes, editable (the built-in itself stays read-only)', mine.length === 1 && mine[0].name === 'Midnight Ember copy' && mine[0].edit, JSON.stringify(mine));
  await page.click(`${G} [data-k=themes-list] [data-k=theme-edit]`); await page.waitForSelector(S); await wait(900);
  const st = await E((S) => { const d = document.querySelector(S); return { title: d.querySelector('[data-k=theme-editing]').textContent, chip: d.querySelector('[data-k=theme-dirty]').textContent, note: d.querySelector('[data-k=theme-applied-note]').textContent,
    sections: [...d.querySelectorAll('.tst-props details.ef-group--acc')].map((x) => x.dataset.group), widgets: [...d.querySelectorAll('.tst-pv [data-widget]')].map((w) => w.dataset.widget),
    nav: !!d.querySelector('.tst-pv .mnav__b[aria-current="page"]'), ctl: d.querySelectorAll('.tst-pv .iqc-btn').length, slider: !!d.querySelector('.tst-pv .tst-controls__slider input[type=range]'), panel: !!d.querySelector('.tst-pv .mc'), states: d.querySelectorAll('.tst-pv .tst-state').length,
    info: !!d.querySelector('[data-k=theme-info]'), accent: getComputedStyle(d.querySelector('.tst-pv')).getPropertyValue('--accent').trim() }; }, S);
  await shot('ts2-studio.png');
  check('THE STUDIO: "editing “Midnight Ember copy”", Saved, the dashboard\'s own theme named (Cancel returns to it); properties in 12 collapsible sections · a live preview of REAL components (dock, light / climate / button / sensor cards, panel, control buttons, slider, status) · a selected-element panel',
    /editing “Midnight Ember copy”/.test(st.title) && st.chip === 'Saved' && /IniqDash Original/.test(st.note) && st.sections.length === 12 && ['identity', 'page', 'image', 'nav', 'surfaces', 'borders', 'text', 'accent', 'controls', 'status', 'light', 'effects'].every((g) => st.sections.includes(g))
      && ['light', 'climate', 'button', 'sensor'].every((w) => st.widgets.includes(w)) && st.nav && st.ctl >= 4 && st.slider && st.panel && st.states === 6 && st.info && st.accent === '#ff7a1a', JSON.stringify(st));
  // click to select
  const sel = async (q) => { await E(([S, q]) => document.querySelector(S).studio.select(q), [S, q]); await wait(250); return E((S) => { const d = document.querySelector(S); return { name: (d.querySelector('[data-k=theme-selected]') || {}).textContent, open: [...d.querySelectorAll('.tst-props details.ef-group--acc[open]')].map((x) => x.dataset.group), props: [...d.querySelectorAll('[data-k=theme-element-props] .tst-info__row')].map((r) => r.dataset.key) }; }, S); };
  let s1 = await sel('.tst-canvas');
  check('CLICK THE PREVIEW BACKGROUND → Dashboard background: its section opens, its properties are listed (page colour, gradient, image)', s1.name === 'Dashboard background' && s1.open.includes('page') && s1.props.includes('tokens.page-bg') && s1.props.includes('background.image'), JSON.stringify(s1));
  s1 = await sel('.tst-tile--light .lw');
  check('CLICK A CARD → Cards & panels: the card surface, its border, corners and shadow are listed (measured on the element)', s1.name === 'Light card' && s1.open.includes('surfaces') && ['tokens.device-surface-mid', 'tokens.card-border', 'look.radius', 'look.shadow'].every((k) => s1.props.includes(k)), JSON.stringify(s1));
  s1 = await sel('.tst-pbtn');
  check('CLICK A BUTTON → Controls: the accent and the text on the accent are listed', /Primary button/.test(s1.name) && s1.open.includes('controls') && s1.props.includes('tokens.accent') && s1.props.includes('tokens.accent-on'), JSON.stringify(s1));
  await shot('ts2-select.png');
  // a property → what it changes, outlined
  const hit = async (k) => { const n = await E(([S, k]) => document.querySelector(S).studio.highlight(k), [S, k]); await wait(150);
    return E(([S, n]) => { const d = document.querySelector(S), base = d.querySelector('.tst-pv').getBoundingClientRect();
      const boxes = [...d.querySelectorAll('.tst-hl .is-hit')].map((b) => b.getBoundingClientRect());
      const over = (q) => { const r = d.querySelector(q).getBoundingClientRect(); return boxes.some((b) => b.left <= r.left + 2 && b.right >= r.right - 2 && b.top <= r.top + 2 && b.bottom >= r.bottom - 2); };
      return { n, boxes: boxes.length, nav: over('.tst-pv .mnav__b[aria-current="page"]'), btn: over('.tst-pbtn'), sec: over('.tst-sub'), card: over('.tst-tile--light .lw'), base: !!base, count: (d.querySelector('[data-k=theme-affected]') || {}).textContent }; }, [S, n]); };
  const hA = await hit('tokens.accent');
  check('ACCENT → the selected page and the primary button are outlined in the preview (and counted)', hA.nav && hA.btn && hA.boxes >= 3 && /Outlined in the preview: \d+ places?/.test(hA.count), JSON.stringify(hA));
  await shot('ts2-affected-accent.png');
  const hS = await hit('tokens.text-secondary');
  check('SECONDARY TEXT → the secondary labels (e.g. the subtitle) are outlined — not the primary button', hS.sec && !hS.btn && hS.boxes >= 3, JSON.stringify(hS));
  const hC = await hit('tokens.device-surface-mid');
  check('CARD SURFACE → the cards are outlined', hC.card && !hC.nav, JSON.stringify(hC));
  // live edit → unsaved, on the preview and the dashboard
  await E((S) => { const f = document.querySelector(`${S} [data-key="tokens.accent"]`); f.closest('details').open = true; const p = f.querySelector('[data-k=color-pick]'); p.value = '#22c55e'; p.dispatchEvent(new Event('input', { bubbles: true })); }, S); await wait(300);
  const lv = await E((S) => ({ pv: getComputedStyle(document.querySelector(`${S} .tst-pv`)).getPropertyValue('--accent').trim(), chip: document.querySelector(`${S} [data-k=theme-dirty]`).textContent }), S);
  check('LIVE: a new accent shows at once in the preview AND on the dashboard; the header says "Unsaved changes"', lv.pv === '#22c55e' && (await frameTok('accent')) === '#22c55e' && lv.chip === 'Unsaved changes', JSON.stringify(lv));
  // sizes
  const sz = {};
  for (const v of ['tablet', 'mobile', 'desktop']) { await page.click(`${S} [data-k=theme-size-${v}]`); await wait(200); sz[v] = await E((S) => { const p = document.querySelector(`${S} .tst-pv`); return [Math.round(p.getBoundingClientRect().width), getComputedStyle(p.querySelector('.tst-grid')).gridTemplateColumns.split(' ').length]; }, S); }
  check('DESKTOP / TABLET / MOBILE preview: narrower, 3 → 2 → 1 columns', sz.desktop[1] === 3 && sz.tablet[1] === 2 && sz.mobile[1] === 1 && sz.mobile[0] <= 380 && sz.tablet[0] <= 720 && sz.desktop[0] > sz.tablet[0], JSON.stringify(sz));
  await page.click(`${S} [data-k=def-cancel]`); await wait(500);
  const lib1 = (await model()).app.themes;
  check('CANCEL: nothing stored (the copy keeps Midnight Ember\'s accent), the dashboard is back to IniqDash Original', lib1[0].tokens.accent === '#ff7a1a' && (await frameTok('accent')) === accent0, JSON.stringify(lib1.map((t) => t.tokens.accent)));

  // ---------------------------------------------------------------- edit → Save & apply
  await E((id) => window.editor.themeStudio().openEditor(id), lib1[0].id); await page.waitForSelector(S); await wait(700);
  await page.fill(`${S} [data-k=theme-name]`, 'Ember home');
  await E((S) => { const f = document.querySelector(`${S} [data-key="tokens.accent"]`); f.closest('details').open = true; const p = f.querySelector('[data-k=color-pick]'); p.value = '#e2552b'; p.dispatchEvent(new Event('input', { bubbles: true })); }, S);
  await E((S) => { const f = document.querySelector(`${S} [data-key="look.radius"]`); f.closest('details').open = true; const n = f.querySelector('input[type=number]'); n.value = '26'; n.dispatchEvent(new Event('input', { bubbles: true })); }, S); await wait(300);
  await page.click(`${S} [data-k=apply-def]`); await wait(700);
  const ap = (await model()).app;
  const rad = await E(() => { const w = document.querySelector('.ed-frame .lw, .ed-frame .cw, .ed-frame .sw'); return w && getComputedStyle(w).borderTopLeftRadius; });
  check('SAVE & APPLY: the theme is stored (renamed "Ember home", accent, corner radius 26) and the dashboard shows it — cards with 26 px corners', ap.themes[0].name === 'Ember home' && ap.themes[0].tokens.accent === '#e2552b' && ap.themes[0].look.radius === 26 && ap.theme.id === ap.themes[0].id && (await frameTok('accent')) === '#e2552b' && rad === '26px', JSON.stringify({ t: ap.themes[0].look, rad }));
  // inheritance: a widget's own theme wins; Use Theme Default
  const own = () => E(() => getComputedStyle(document.querySelector('.ed-frame [data-grid-id="own"] [data-widget]')).getPropertyValue('--accent').trim());
  check('INHERITANCE: a widget\'s own theme wins over the dashboard theme for that widget only', (await own()) === '#ff00aa');
  await E(() => window.editor.openThemes()); await page.waitForSelector(G); await wait(300);
  const ov = await E((G) => [...document.querySelectorAll(`${G} [data-k=theme-overrides] li`)].map((l) => l.textContent), G);
  await page.click(`${G} [data-k=theme-override-reset]`); await wait(500);
  check('USE THEME DEFAULT: the gallery lists the widget override; resetting it makes that widget follow the theme (its own colour removed)', ov.length === 1 && /Own accent/.test(ov[0]) && (await own()) === '#e2552b' && !(await model()).pages[0].items.find((i) => i.id === 'own').config.theme, JSON.stringify(ov));
  // rename in the gallery
  await page.click(`${G} [data-k=themes-list] [data-k=theme-rename]`); await page.fill(`${G} [data-k=theme-rename-input]`, 'Ember evening'); await page.press(`${G} [data-k=theme-rename-input]`, 'Enter'); await wait(300);
  check('RENAME: the library and the applied theme carry the new name', (await model()).app.themes[0].name === 'Ember evening' && (await model()).app.theme.name === 'Ember evening');

  // ---------------------------------------------------------------- export / import (validated)
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${G} [data-k=themes-list] [data-k=theme-export]`)]);
  const dir = fs.mkdtempSync('/tmp/iqtheme-'), file = path.join(dir, 'theme.json'); await dl.saveAs(file);
  const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
  await page.setInputFiles(`${G} [data-k=theme-import-file]`, file); await wait(400);
  const bads = { css: { name: 'Evil', tokens: {}, css: 'body{}' }, url: { name: 'Evil', tokens: { accent: 'url(https://x.example/a.png)' } }, img: { name: 'Evil', background: { image: 'https://x.example/a.png' } },
    script: { name: 'Evil', look: { font: '"x";}</style><script>alert(1)</script>' } }, prop: { name: 'Evil', look: { zoom: 3 } } };
  const msgs = {};
  for (const [k, th] of Object.entries(bads)) { const f = path.join(dir, `${k}.json`); fs.writeFileSync(f, JSON.stringify({ format: 'iniqdash-theme', version: 2, theme: th })); await page.setInputFiles(`${G} [data-k=theme-import-file]`, f); await wait(300); msgs[k] = await E((G) => document.querySelector(`${G} [data-k=themes-msg]`).textContent, G); }
  const names = (await model()).app.themes.map((t) => t.name);
  check('EXPORT (version 2: tokens, look, background) → IMPORT it back ("Ember evening 2")', exported.format === 'iniqdash-theme' && exported.version === 2 && exported.theme.look.radius === 26 && JSON.stringify(names) === JSON.stringify(['Ember evening', 'Ember evening 2']), JSON.stringify({ names, look: exported.theme.look }));
  check('IMPORT REFUSES CSS, url(), an outside image, script in a value and unsupported properties — nothing added', Object.values(msgs).every((m) => /^Not imported/.test(m)) && names.length === 2, JSON.stringify(msgs));
  // delete (press twice); built-ins cannot be deleted
  await E((G) => { const b = document.querySelector(`${G} .tsg-card[data-theme$="-2"] [data-k=theme-delete]`) || [...document.querySelectorAll(`${G} [data-k=themes-list] [data-k=theme-delete]`)].pop(); b.click(); b.click(); }, G); await wait(300);
  check('DELETE (a user theme, press twice) — the applied one stays', JSON.stringify((await model()).app.themes.map((t) => t.name)) === JSON.stringify(['Ember evening']) && (await model()).app.theme.name === 'Ember evening');
  await shot('ts2-gallery-mine.png');
  await page.click(`${G} .ecfg-foot button`); await wait(300);

  // ---------------------------------------------------------------- save + reload
  check('SAVE (the server accepts the library and the applied theme)', await E(() => window.editor.save()));
  await page.reload(); await page.waitForFunction(() => window.editor); await wait(1500);
  const re = (await model()).app;
  check('RELOAD: the theme library and the applied theme survive; the dashboard shows it', re.theme && re.theme.name === 'Ember evening' && re.theme.look.radius === 26 && re.themes.length === 1 && (await frameTok('accent')) === '#e2552b');
  await E(() => window.editor.themeStudio().apply('iniqdash')); await wait(300);
  check('BACK TO THE ORIGINAL at any time (the library stays)', (await model()).app.theme === undefined && (await frameTok('accent')) === accent0 && (await model()).app.themes.length === 1);
  check('no Home Assistant service call', !L.haCalls.some((x) => /\/api\/services\//.test(x.url)));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
