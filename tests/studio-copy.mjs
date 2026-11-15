/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// WIDGET STUDIO — REUSABLE DESIGN FEATURES, through the Maison demo's Room card (one Studio widget, fourteen copies):
//   COPY SETTINGS (a definition exposes component keys; each copy sets its own name / photo / icon / tile colours; values checked)
//   SHOW WHEN + OPTIONAL source groups (a chip appears only where the copy has that sensor)
//   visual properties: linear gradient fill, custom shadow, backdrop blur, image crop (focus + zoom), text font (Poppins) / wrap / shadow
//   bundled widgets (a dashboard package installs its Studio widgets into My Widgets, in a collection), save → reopen in Studio
//   the theme's page frame (panel, icon-only navigation, padding, title size) and the Rooms geometry at the reference viewport
//   server validation of the new definition parts; the simulated home only (the configured Home Assistant is never contacted)
// Real PHP server + a FAKE live Home Assistant (tests/lib/live.mjs) whose request log proves the isolation.
import fs from 'node:fs';
import { live } from './lib/live.mjs';
import { check, playwright } from './lib/harness.mjs';

let L, browser;
try {
  L = await live();
  const me = L.client(); await me.login();
  browser = await playwright().chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1906, height: 933 }, timezoneId: 'Europe/Paris', locale: 'en-GB', extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' } });
  const p = await ctx.newPage(); const errors = [];
  p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${L.base}/login.php`); await p.fill('input[name=user]', 'admin'); await p.fill('input[name=password]', 'correct horse battery staple');
  await Promise.all([p.waitForNavigation(), p.click('button[type=submit]')]);
  // the Maison demo package (a test fixture: a dashboard + the Studio widgets it is built from) installed the way a demo package is:
  // its widgets into My Widgets first (installBundle), then the dashboard as a new one
  await p.waitForFunction(() => window.IniqStudioLibrary, null, { timeout: 20000 });
  const pkg = { dash: JSON.parse(fs.readFileSync(new URL('./fixtures/maison-demo.json', import.meta.url), 'utf8')), bundle: JSON.parse(fs.readFileSync(new URL('./fixtures/maison-demo.widgets.json', import.meta.url), 'utf8')) };
  const installed = await p.evaluate(async (x) => window.IniqStudioLibrary.installBundle(x.dash, x.bundle), pkg);
  if (!installed.ok) throw new Error(`installBundle: ${JSON.stringify(installed).slice(0, 200)}`);
  const demoId = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Maison demo', dashboard: installed.dashboard })).json()).entry.id;
  await p.goto(`${L.base}/?d=${demoId}`);
  await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 }); await wait(2500);
  const n0 = L.haCalls.length;                         // (the page before it showed the built-in LIVE sample: its requests are expected)

  // ---- bundled widgets: the Room card is an ordinary My Widgets definition, in a "Maison demo" collection
  const lib = (await (await me.send('GET', '/api/studio_widgets.php')).json());
  const room = (lib.widgets || []).find((w) => w.definition.meta.name === 'Room card');
  const col = (lib.collections || []).find((c) => c.name === 'Maison demo');
  check('bundled widgets: the demo installed "Room card" into My Widgets, in a "Maison demo" collection', !!room && !!col && room.definition.meta.collection === col.id, JSON.stringify((lib.widgets || []).map((w) => w.definition.meta.name)));
  const dash = (await (await me.send('GET', `/api/dashboards.php?id=${demoId}`)).json()).dashboard;
  const cards = dash.pages.find((x) => x.id === 'rooms').items;
  check('the Rooms page: 14 copies of that ONE definition (no inline components), each with its own settings', cards.length === 14 && cards.every((c) => c.type === 'studio' && c.config.definition === room.id && !c.config.components && c.config.settings), JSON.stringify(cards[0].config).slice(0, 200));

  // ---- viewing the Rooms page at the reference viewport
  await p.goto(`${L.base}/?d=${demoId}`);
  await p.waitForFunction(() => window.editor && window.editor.viewing && window.IniqHA.simulated(), null, { timeout: 20000 });
  await E(() => window.editor.go('rooms')); await wait(2500); await E(() => document.fonts.ready);
  const geo = await E(() => Object.fromEntries(['r-0', 'r-1', 'r-5', 'r-6', 'r-12'].map((id) => { const r = document.querySelector(`[data-grid-id="${id}"]`).getBoundingClientRect(); return [id, [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]]; })));
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 2);
  check('GEOMETRY at 1906 × 933: cards 272 × 240 at the measured reference positions (x 119 / 411 / 1579, y 126 / 386 / 646, ±2 px)',
    near(geo['r-0'], [119, 126, 272, 240]) && near(geo['r-1'], [411, 126, 272, 240]) && near(geo['r-5'], [1579, 126, 272, 240]) && near(geo['r-6'], [119, 386, 272, 240]) && near(geo['r-12'], [119, 646, 272, 240]), JSON.stringify(geo));
  const look = await E(() => {
    const c = (id) => document.querySelector(`[data-grid-id="${id}"] .stw`);
    const node = (id, cid) => c(id).querySelector(`.stw__c[data-cid="${cid}"]`);
    const txt = (id, cid) => node(id, cid)?.textContent.trim();
    const img = (id) => node(id, 'image-overlay-1').querySelector('img')?.getAttribute('src');
    const tile = getComputedStyle(node('r-1', 'shape-4').querySelector('.iqel-shape__s'));
    const chip = getComputedStyle(node('r-1', 'shape-2').querySelector('.iqel-shape__s'));
    const canvas = document.querySelector('.ed-canvas'), label = document.querySelector('.mnav__label');
    return { names: ['r-1', 'r-2', 'r-7'].map((id) => txt(id, 'text-1')), subs: ['r-1', 'r-2'].map((id) => txt(id, 'text-2')), imgs: ['r-1', 'r-2'].map(img),
      tileBg: tile.backgroundImage, chipBlur: chip.backdropFilter, temp: txt('r-1', 'text-7'), hum: txt('r-1', 'text-3'),
      humAbsentCuisine: node('r-2', 'shape-2').hasAttribute('data-absent') && node('r-2', 'text-3').hasAttribute('data-absent'), humShownChambre: !node('r-1', 'shape-2').hasAttribute('data-absent'),
      tempAbsentCuisine: node('r-2', 'text-7').hasAttribute('data-absent'), lightsAll: node('r-0', 'shape-3').hasAttribute('data-absent'),
      font: getComputedStyle(node('r-1', 'text-1').firstElementChild).fontFamily, poppins: document.fonts.check('600 17px Poppins'),
      wrapLines: Math.round(node('r-7', 'text-1').querySelector('.iqtx__t').getBoundingClientRect().height / 19),
      tempShadow: getComputedStyle(node('r-1', 'text-7').firstElementChild).textShadow,
      pad: getComputedStyle(canvas).paddingLeft, radius: getComputedStyle(canvas).borderTopLeftRadius, labelHidden: label ? label.getBoundingClientRect().width <= 1 : null,
      title: getComputedStyle(document.querySelector('.ed-dash-title')).fontSize, titleFont: getComputedStyle(document.querySelector('.ed-dash-title')).fontFamily };
  });
  check('COPY SETTINGS: each copy shows its own name, subtitle and photo (one definition)', look.names.join('|') === 'Chambre|Cuisine|Salle à manger' && look.subs.join('|') === 'Lights • Climate|Lights • Switches'
    && look.imgs[0] === 'assets/demo/rooms/bedroom.svg' && look.imgs[1] === 'assets/demo/rooms/kitchen.svg', JSON.stringify(look));
  check('GRADIENT fill (tile) and BACKDROP BLUR (chip) are drawn', /linear-gradient/.test(look.tileBg) && /blur\(8px\)/.test(look.chipBlur), `${look.tileBg} · ${look.chipBlur}`);
  check('BINDINGS: the Chambre card shows its sensors from the simulated home (20.8°, 62%)', look.temp === '20.8°' && look.hum === '62%', `${look.temp} ${look.hum}`);
  check('SHOW WHEN + OPTIONAL sources: no humidity chip / temperature where the copy has no such sensor; shown where it has', look.humAbsentCuisine && look.tempAbsentCuisine && look.humShownChambre && look.lightsAll, JSON.stringify(look));
  check('TYPOGRAPHY: Poppins is loaded and used (text element font + dashboard theme font); long names wrap (2 lines); temperature has a text shadow',
    /Poppins/.test(look.font) && look.poppins && /Poppins/.test(look.titleFont) && look.wrapLines === 2 && look.tempShadow !== 'none', JSON.stringify({ f: look.font, w: look.wrapLines, s: look.tempShadow, p: look.poppins, t: look.titleFont }));
  check('PAGE FRAME (theme look): 31 px padding, 24 px corners, icon-only navigation (names kept for assistive tech), 26 px title', look.pad === '31px' && look.radius === '24px' && look.labelHidden === true && look.title === '26px', JSON.stringify(look));

  // ---- the shared renderers: custom shadow, crop, value checks
  const unit = await E(() => {
    const IC = window.IniqComponents, S = window.MaisonStudioWidget;
    const sh = IC.get('shape').compose.render({ shape: 'rounded', fill: '#112233', shadow: 'custom', shadowY: 6, shadowBlur: 18, shadowColor: '#000000', shadowOpacity: 50, fillMode: 'radial', fill2: '#445566' }, {}, {});
    document.body.append(sh); const s = getComputedStyle(sh.querySelector('.iqel-shape__s')); const out = { shadow: s.boxShadow, bg: s.backgroundImage }; sh.remove();
    const a = window.IniqArtwork.render({ image: 'assets/demo/rooms/bedroom.svg', focusX: 20, focusY: 70, zoom: 150 }).querySelector('img');
    const f = (type, extra = {}) => ({ type, ...extra });
    return { ...out, pos: a.style.objectPosition, tf: a.style.transform,
      okText: S.copySettingValue(f('text'), 'Master bedroom'), badText: S.copySettingValue(f('text'), '<img onerror=x>'), okIcon: S.copySettingValue(f('mdi'), 'mdi:sofa'), badIcon: S.copySettingValue(f('mdi'), 'javascript:x'),
      badImage: S.copySettingValue(f('artwork'), 'https://evil.example/x.png" onload="'), badImage2: S.copySettingValue(f('artwork'), 'data:image/png;base64,AAAA'), okColour: S.copySettingValue(f('color'), '#ff9a3c'), badColour: S.copySettingValue(f('color'), 'red; background:url(x)'),
      range: S.copySettingValue(f('range', { min: 0, max: 10 }), 99) };
  });
  check('CUSTOM SHADOW and RADIAL gradient on a shape', /rgba\(0, 0, 0, 0\.5\).*6px 18px|6px 18px/.test(unit.shadow) && /radial-gradient/.test(unit.bg), `${unit.shadow} · ${unit.bg}`);
  check('IMAGE CROP: focal point and zoom (object-position 20% 70%, scale 1.5)', unit.pos === '20% 70%' && /scale\(1\.5\)/.test(unit.tf), `${unit.pos} ${unit.tf}`);
  check('a copy\'s values are CHECKED against the exposed field (no markup, no foreign icon / image / CSS; numbers clamped)', unit.okText === 'Master bedroom' && unit.badText === null && unit.okIcon === 'mdi:sofa' && unit.badIcon === null
    && unit.badImage === null && unit.badImage2 === null && unit.okColour === '#ff9a3c' && unit.badColour === null && unit.range === 10, JSON.stringify(unit));

  // ---- CONFIGURE a copy: "This copy" shows the exposed settings (the components' own field kinds); a change is saved with the dashboard
  await p.goto(`${L.base}/editor.html?d=${demoId}`); await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 }); await wait(800);
  const conf = await E(() => {
    const it = window.editor.getModel().pages.find((x) => x.id === 'rooms').items.find((i) => i.id === 'r-1');
    let last = null; const f = window.MaisonForm.create({ type: 'studio', config: it.config, onChange: (c) => { last = c; } });
    document.body.append(f.el);
    const box = f.el.querySelector('[data-k=copy-settings]');
    const labels = box ? [...box.querySelectorAll('.ef-label')].map((l) => l.textContent.trim()) : [];
    const kinds = box ? [...box.querySelectorAll('.ef-field')].map((x) => x.className.match(/ef-field--(\w+)/)[1]) : [];
    const name = box && box.querySelector('.ef-field[data-key="k0000a001"] input'); if (name) { name.value = 'Master bedroom'; name.dispatchEvent(new Event('input', { bubbles: true })); name.dispatchEvent(new Event('change', { bubbles: true })); }
    const slots = window.IniqStudioLibrary.slots(it.config.definition);
    f.el.remove();
    return { labels, kinds, value: last && last.settings && last.settings.k0000a001, slotsOptional: slots.every((s) => s.required === false), nSlots: slots.length };
  });
  check('CONFIGURE a copy: "This copy" lists the settings with the components\' own field kinds; every source group is optional', ['Room name', 'Subtitle', 'Photo', 'Icon', 'Tile colour'].every((l) => conf.labels.includes(l))
    && conf.kinds.includes('artwork') && conf.kinds.includes('mdi') && conf.kinds.includes('color') && conf.value === 'Master bedroom' && conf.slotsOptional && conf.nSlots === 3, JSON.stringify(conf));
  await E(() => { window.editor.setEditing(true); const m = window.editor.getModel(); const it = m.pages.find((x) => x.id === 'rooms').items.find((i) => i.id === 'r-1'); it.config.settings.k0000a001 = 'Master bedroom'; const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join()); });
  const saved = await E(() => window.editor.save());
  const back = (await (await me.send('GET', `/api/dashboards.php?id=${demoId}`)).json()).dashboard.pages.find((x) => x.id === 'rooms').items.find((i) => i.id === 'r-1');
  await E(() => window.editor.go('rooms')); await wait(1200);
  const shown = await E(() => document.querySelector('[data-grid-id="r-1"] .stw__c[data-cid="text-1"]')?.textContent.trim());
  check('…saved with the dashboard (normal persistence) and drawn: "Master bedroom" on that copy only', saved && back.config.settings.k0000a001 === 'Master bedroom' && shown === 'Master bedroom', `${shown} ${JSON.stringify(back.config.settings).slice(0, 80)}`);

  // ---- WIDGET STUDIO: reopen the definition, save it again — settings, show-when and optional sources survive (reopen & edit)
  await p.click('[data-k=studio]').catch(() => {}); await p.waitForSelector('dialog.wst[open]', { timeout: 15000 });
  const S = 'dialog.wst[open]';
  await E(({ S, id }) => document.querySelector(S).studio.load(`def:${id}`), { S, id: room.id }); await wait(500);
  const st = await E((S) => { const s = document.querySelector(S).studio.state(); return { n: s.def.components.length, settings: (s.def.settings || []).length, sw: s.def.components.filter((x) => x.showWhen).length, opt: s.def.slots.filter((x) => x.optional).length }; }, S);
  await E(({ S }) => { const s = document.querySelector(S).studio; s.select('text-1'); }, { S }); await wait(300);
  const copySwitch = await E((S) => [...document.querySelectorAll(`${S} [data-k=wst-copyset]`)].map((b) => [b.dataset.key, b.getAttribute('aria-checked')]), S);
  const showSel = await E((S) => document.querySelector(`${S} [data-k=wst-showwhen]`)?.value, S);
  const r = await E((S) => document.querySelector(S).studio.save(), S);
  const again = (await (await me.send('GET', '/api/studio_widgets.php')).json()).widgets.find((w) => w.id === room.id);
  check('STUDIO reopen + edit: the Room card opens with its 17 components, 7 copy settings, 9 "show when" and 3 optional sources; "Each copy sets" shows Text as exposed',
    st.n === 17 && st.settings === 7 && st.sw === 9 && st.opt === 3 && copySwitch.some(([k, v]) => k === 'text' && v === 'true') && showSel === '', JSON.stringify({ st, copySwitch, showSel }));
  check('…saved again: the server keeps settings, show-when and optional sources (revision 2)', r && r.ok && again.revision === 2 && again.definition.settings.length === 7 && again.definition.components.filter((x) => x.showWhen).length === 9
    && again.definition.slots.every((x) => x.optional === true), JSON.stringify(r).slice(0, 200));

  // ---- SERVER validation of the new parts
  const bad = async (mut) => { const d = structuredClone(again.definition); mut(d); const res = await (await me.post('/api/studio_widgets.php', { action: 'save', id: null, definition: d })).json(); return res.ok ? 'accepted' : res.detail || res.error; };
  const v1 = await bad((d) => { d.settings.push({ id: 'k0000ffff', label: 'Ghost', component: 'text-99', key: 'text' }); });
  const v2 = await bad((d) => { d.components[2].showWhen = { property: 'p99999999' }; });
  const v3 = await bad((d) => { d.slots[0].optional = false; });
  const v4 = await bad((d) => { d.settings[0].label = '<b>x</b>'; });
  check('SERVER refuses a setting on a missing component, show-when on an unknown property, optional ≠ true, markup in a label', [v1, v2, v3, v4].every((x) => x !== 'accepted'), JSON.stringify([v1, v2, v3, v4]));

  check('ISOLATION: the configured Home Assistant received nothing from the demo (view, configure, Studio)', L.haCalls.length === n0, JSON.stringify(L.haCalls.slice(n0).map((c) => c.url)).slice(0, 300));
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('studio-copy test ran', false, e.stack);
} finally {
  if (browser) await browser.close();
  if (L) await L.close();
}
console.log('finished');
