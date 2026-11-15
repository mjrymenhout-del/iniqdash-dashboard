/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// THE GENERATOR WITH REAL-WORLD NAMES (real server, real editor): a discovery answer shaped like a big, messy installation —
//   17 areas (accented, very long, with < >), entity names longer than any label allows, duplicate names, special characters, one area
//   with 80 devices of every kind. Checks:
//   1  every generated widget is valid on its own (the same validator as saving) and the whole dashboard is valid
//   2  long names: a row label is left out (the row shows Home Assistant's full name) — never cut into an invalid one; widget names are
//      cut to their limit; nothing contains < or >
//   3  saved through the server, reopened in the editor: every page renders; an edit (move + rename) is saved and survives a reload
//   4  "Add a page for an area" with the same names adds a valid page
//   5  a generation that genuinely cannot succeed (a widget type that is not installed) stops with a clear message — nothing is created
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const LONG = 'Capteur de température et d’humidité du placard technique au sous-sol';   // 70 characters
const areas = [['cave', 'Cave à vin <privée> & cellier du sous-sol de la maison principale'], ['salon', 'Salon'], ['cuisine', 'Cuisine'], ['sdb', 'Salle de bain — étage'],
  ['ch1', 'Chambre parentale'], ['ch2', 'Chambre d’amis'], ['bureau', 'Bureau'], ['garage', 'Garage'], ['jardin', 'Jardin'], ['terrasse', 'Terrasse'],
  ['grenier', 'Grenier'], ['buanderie', 'Buanderie'], ['entree', 'Entrée'], ['couloir', 'Couloir'], ['wc', 'WC'], ['piscine', 'Piscine 🏊'], ['atelier', 'Atelier']];
const E = (id, domain, name, areaId, dc = null, state = 'on') => ({ id, domain, name, state, unit: null, dc, area: null, areaId });
const ents = [];
// the "Cave" area: long names, duplicates, special characters, every kind
ents.push(E('sensor.cave_temp', 'sensor', `Cave à vin ${LONG}`, 'cave', 'temperature', '12.4'), E('sensor.cave_hum', 'sensor', `${LONG} (humidité)`, 'cave', 'humidity', '71'));
ents.push(E('binary_sensor.cave_door', 'binary_sensor', 'Porte de la cave <principale> vers l’escalier du garage', 'cave', 'door', 'off'), E('binary_sensor.cave_leak', 'binary_sensor', 'Détecteur de fuite d’eau sous la chaudière à condensation', 'cave', 'moisture', 'off'));
for (let i = 0; i < 3; i++) ents.push(E(`light.cave_${i}`, 'light', 'Lampe', 'cave'));              // three lights with the SAME name
ents.push(E('switch.cave_pump', 'switch', 'Pompe de relevage des eaux usées — sous-sol (circuit 2)', 'cave'));
// "Atelier": 80 devices of every kind
const kinds = [['light', null], ['switch', null], ['fan', null], ['cover', null], ['lock', null], ['media_player', null], ['camera', null], ['vacuum', null], ['climate', null], ['alarm_control_panel', null],
  ['sensor', 'power'], ['sensor', 'battery'], ['sensor', 'temperature'], ['binary_sensor', 'motion'], ['binary_sensor', 'window'], ['input_boolean', null]];
for (let i = 0; i < 80; i++) { const [d, dc] = kinds[i % kinds.length]; ents.push(E(`${d}.atelier_${i}`, d, `Atelier ${d.replace(/_/g, ' ')} numéro ${i} — ${'très long nom '.repeat(3)}`, 'atelier', dc, dc ? '42' : 'on')); }
areas.slice(1, 16).forEach(([id, name], i) => ents.push(E(`light.${id}_main`, 'light', `${name} plafonnier`, id), E(`sensor.${id}_t`, 'sensor', `${name} température`, id, 'temperature', String(19 + i / 10))));
ents.push(E('person.a', 'person', 'Anaïs-Marie de la Fontaine-Saint-Exupéry', null, null, 'home'), E('weather.home', 'weather', 'Météo — Maison principale (prévisions locales)', null, null, 'sunny'));
ents.push(E('light.loose', 'light', 'Lampe sans pièce', null));
const discovered = { ok: true, configured: true, connected: true, entities: ents, areas: areas.map(([id, name]) => ({ id, name })) };

let L, B;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1000 } });
  const p = B.page, ev = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);

  // ---- 1 · 2
  const g = await ev((d) => {
    const R = window.MaisonRegistry, M = window.MaisonModel;
    const r = window.IniqGenerate.dashboard(d, R, { other: true });
    const v = M.validate(structuredClone(r.dashboard), R);
    const items = r.dashboard.pages.flatMap((pg) => pg.items.map((it) => ({ pg: pg.id, it })));
    // each widget on its own, through the same validator
    const single = items.map(({ it }) => M.validate({ version: 3, app: { id: 'x', startPage: 'p', navigation: {} }, pages: [{ id: 'p', name: 'P', nav: true, items: [{ ...it, id: 'w' }] }, ...r.dashboard.pages.map((x) => ({ id: x.id, name: x.name, nav: true, items: [] }))] }, R)).filter((x) => !x.ok).map((x) => x.errors[0]);
    const json = JSON.stringify(r.dashboard);
    const cave = r.dashboard.pages.find((pg) => /^cave/.test(pg.id));
    const rows = cave.items.filter((i) => i.type === 'entitylist').flatMap((i) => i.config.rows);
    const read = cave.items.find((i) => i.type === 'readings');
    return { ok: v.ok, errors: v.ok ? [] : v.errors.slice(0, 3), single, pages: r.dashboard.pages.length, widgets: r.widgets, markup: /[<>]/.test(json.replace(/"(entity|id)":"[^"]*"/g, '')),
      caveName: cave.name, rowLabels: rows.map((x) => x.label || null), readLabels: read.config.items.map((x) => x.label || null), names: items.map(({ it }) => it.config.name).filter(Boolean),
      atelier: r.dashboard.pages.find((pg) => pg.id === 'atelier').items.length, model: v.ok ? v.model : null };
  }, discovered);
  check('1 · a big, messy installation (17 areas, 80 devices in one room, long / accented / duplicate names): every widget is valid on its own and the dashboard is valid',
    g.ok && g.single.length === 0 && g.pages === 19 && g.atelier > 20, JSON.stringify({ errors: g.errors, single: g.single.slice(0, 3), pages: g.pages, atelier: g.atelier }));
  check('2 · long names: row labels over 24 characters are left out (the row shows Home Assistant\'s full name), short ones kept; widget names ≤ 60; no < or > anywhere',
    g.rowLabels.every((l) => l === null || l.length <= 24) && g.rowLabels.includes(null) && g.readLabels.every((l) => l === null || l.length <= 24) && g.names.every((n) => n.length <= 60) && !g.markup && g.caveName.length <= 60 && !/[<>]/.test(g.caveName),
    JSON.stringify({ rows: g.rowLabels, read: g.readLabels, cave: g.caveName }));

  // ---- 3 · save through the server, reopen, edit, reload
  const cr = await (await me.post('/api/dashboards.php', { action: 'create', name: 'Generated (messy)', dashboard: g.model })).json();
  await p.goto(`${L.base}/editor.html?d=${cr.entry.id}`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(800);
  const m = await ev(() => window.editor.getModel());
  const rendered = [];
  for (const pg of m.pages) { await ev((id) => window.editor.go(id), pg.id); await wait(500); rendered.push([pg.items.length, await ev(() => document.querySelectorAll('.ed-canvas .mg__item').length)]); }
  await ev((id) => window.editor.go(id), m.pages.find((x) => /^cave/.test(x.id)).id); await wait(800);
  const tips = await ev(() => [...document.querySelectorAll('.ed-canvas .iq-elist b')].map((b) => ({ t: b.textContent, title: b.title })));
  check('3b · rendered rows carry their complete name as a tooltip (a name cut on screen can still be read in full)', tips.length >= 2 && tips.every((x) => x.t && x.title === x.t), JSON.stringify(tips.slice(0, 4)));
  await ev(() => { window.editor.go('salon'); window.editor.setEditing(true); }); await wait(600);
  const first = await ev(() => window.editor.getPage().items[0].id);
  await ev((id) => { const md = window.editor.getModel(); const it = md.pages.find((x) => x.id === 'salon').items.find((i) => i.id === id); it.config.name = 'Mon plafonnier'; it.layout.desktop.y = (it.layout.desktop.y || 1) + 20; const r = window.editor.setModel(md); if (!r.ok) throw new Error(r.errors.join()); }, first);
  const saved = await ev(() => window.editor.save());
  await p.reload(); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(600);
  const back = await ev((id) => window.editor.getModel().pages.find((x) => x.id === 'salon').items.find((i) => i.id === id).config.name, first);
  check('3 · saved through the server and reopened: every page renders all its widgets; an edit (rename + move) is saved and survives a reload',
    cr.ok && rendered.every(([want, have]) => want === have) && saved && back === 'Mon plafonnier', JSON.stringify({ cr: cr.ok || cr.error, rendered: rendered.filter(([a, b]) => a !== b), saved, back }));

  // ---- 4 · a page for the messy area, through the same rules
  const pg = await ev((d) => { const md = window.editor.getModel(); const ids = new Set(md.pages.flatMap((x) => x.items.map((i) => i.id))), pids = new Set(md.pages.map((x) => x.id));
    const r = window.IniqGenerate.areaPage(d, 'cave', window.MaisonRegistry, ids, pids); md.pages.push(r.page); const v = window.MaisonModel.validate(md, window.MaisonRegistry);
    return { ok: v.ok, errors: v.ok ? [] : v.errors.slice(0, 2), id: r.page.id, n: r.page.items.length, name: r.page.name }; }, discovered);
  check('4 · "Page for an area" with the same messy names gives a page the dashboard accepts', pg.ok && pg.n > 3 && pg.name.length <= 60 && /-2$/.test(pg.id), JSON.stringify(pg));

  // ---- 5 · a generation that cannot succeed: a widget type that is not installed → a clear message, nothing created
  const before = (await (await me.send('GET', '/api/dashboards.php')).json()).dashboards.length;
  const fail = await ev((d) => { const R = window.MaisonRegistry; const fake = { ...R, TYPES: { ...R.TYPES } }; delete fake.TYPES.lock; try { window.IniqGenerate.dashboard(d, fake, {}); return 'no error'; } catch (e) { return e.message; } }, discovered);
  const after = (await (await me.send('GET', '/api/dashboards.php')).json()).dashboards.length;
  check('5 · when a widget genuinely cannot be made valid, generation stops with a message naming the room and the problem — no dashboard is created',
    /could not be generated/.test(fail) && /Atelier/.test(fail) && /lock/.test(fail) && after === before, fail.slice(0, 300));
  // ---- 5b · the same through the editor's Generate dialog: a generator failure is shown in the dialog, nothing is created, nothing changes page
  const url0 = p.url();
  const frozen = await ev(() => Object.isFrozen(window.IniqGenerate));
  await ev(() => { const T = window.MaisonRegistry.TYPES; window.__rt = T.roomtile; delete T.roomtile; window.__restore = () => { T.roomtile = window.__rt; }; });   // the Home page's room tiles cannot be made
  await p.click('[data-k=more]'); await p.click('[data-k=dashboards]'); await p.waitForSelector('[data-k=dash-generate]'); await p.click('[data-k=dash-generate]');
  await p.waitForSelector('[data-k=gen-sim]', { timeout: 15000 }); await p.click('[data-k=gen-sim]'); await p.waitForSelector('[data-k=gen-area]', { timeout: 15000 });
  await p.selectOption('[data-k=gen-style]', 'simple'); await wait(500);
  // the wizard's preview already says it (Create is disabled until the problem is gone) — pressing it changes nothing
  const disabled = await E(() => document.querySelector('[data-k=gen-create]').disabled);
  if (!disabled) await p.click('[data-k=gen-create]');
  await wait(1500);
  const dlg = await ev(() => [...document.querySelectorAll('.ed-gen, [class*=gen]')].map((x) => x.textContent).join(' '));
  const after2 = (await (await me.send('GET', '/api/dashboards.php')).json()).dashboards.length;
  const navigated = await ev(() => typeof window.__restore !== 'function'); if (!navigated) await ev(() => window.__restore());
  check('5b · in the Generate dialog, a failed generation shows the reason, creates nothing and stays on the current dashboard', frozen && /could not be generated/.test(dlg) && /Room tile|roomtile/.test(dlg) && after2 === before && p.url() === url0, JSON.stringify({ after2, before, navigated, url0, url: p.url(), dlg: dlg.slice(0, 200) }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('generate-robust test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
