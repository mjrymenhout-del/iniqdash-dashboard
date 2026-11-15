/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Dashboard editor bootstrap.
   ON THE INIQDASH SERVER (signed in): dashboards are stored on the server (api/dashboards.php — the authoritative copy,
   the same on every device). The editor opens ?d=<id>, else the dashboard this browser had open last, else the most
   recently saved one. With no dashboard on the server yet, the built-in sample (dashboards/maison.js, or the test
   fixture with ?dashboard=test) is shown UNSAVED: the first Save stores it on the server. A dashboard saved in this
   browser before server storage is offered once for copying to the server (never copied automatically, never over an
   existing server dashboard, the browser copy is kept).
   OPENED AS A LOCAL FILE (no server): as before — the built-in dashboard and a browser-local store. */
(function () {
  'use strict';
  const R = window.MaisonRegistry, M = window.MaisonModel;

  /* which built-in dashboard: the main one, or the test fixture (?dashboard=test, remembered for the tab) */
  const q0 = new URLSearchParams(location.search);
  let which = q0.get('dashboard');
  try { if (which) sessionStorage.setItem('iniqdash.dashboard', which); else which = sessionStorage.getItem('iniqdash.dashboard'); } catch (e) { /* storage unavailable */ }
  const fixture = which === 'test';
  const DEMO = (window.IniqDashboards || {})[fixture ? 'test' : (which === 'showcase' ? 'showcase' : 'maison')];

  const demo = () => {
    const r = M.validate(structuredClone(DEMO), R);
    if (!r.ok) throw new Error(`Demo configuration is invalid: ${r.errors.join('; ')}`);
    return r.model;
  };
  const LEGACY_KEYS = [['iniqdash.dashboard.v1', 'Dashboard from this browser'], ['maison.template.dashboard.v1', 'Test dashboard from this browser']];
  const vw = window.innerWidth;
  const q = new URLSearchParams(location.search);
  const bp = ['desktop', 'tablet', 'mobile'].includes(q.get('bp')) ? q.get('bp') : vw >= 1000 ? 'desktop' : vw >= 700 ? 'tablet' : 'mobile';
  // a sticky page header above the editor (none in the working editor: its compact header scrolls away)
  const nav = document.querySelector('[data-showroom-nav]'), host = document.querySelector('[data-editor]');
  if (nav) new ResizeObserver(() => host.style.setProperty('--ed-sticky-top', `${nav.offsetHeight}px`)).observe(nav);
  // "IniqDash / Maison": the dashboard's application id, as a name
  const appName = (m) => String(m?.app?.id || '').replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const setHeader = (name) => { if (window.IniqHeader) window.IniqHeader.setName(name); };
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* unavailable */ } } };
  const onServer = document.querySelector('meta[name="iniqdash-server"]')?.content === '1' && window.IniqDashStore && window.IniqServerStore;
  /* THE APPLICATION (the site root) opens VIEWING the dashboard — editor.html stays the classic editor page (direct links, tests);
     ?view=1 forces the viewing mode anywhere, ?edit=1 opens straight into editing */
  const viewer = (!/editor\.html$/.test(location.pathname) || q.get('view') === '1') && q.get('edit') !== '1';
  /* URL OPTIONS for a wall tablet or a kiosk (any combination): ?page=<page id or name> opens that page, ?noedit hides every way into the
     editor on this screen (no corner button, no Shift + E), ?fit=screen shows the whole page without scrolling. Nothing is stored. */
  function urlOptions() {
    const e = window.editor;
    if (!e) return;
    const want = (q.get('page') || '').trim().toLowerCase();
    if (want) { const pg = (e.getModel().pages || []).find((p) => p.id.toLowerCase() === want || String(p.name).toLowerCase() === want); if (pg) e.go(pg.id); }
    if (q.has('noedit') && e.editAccess && e.editAccess()) e.editAccess().setMode('locked');
    if (q.get('fit') === 'screen' && e.setFit) { e.setFit(true); addEventListener('resize', () => e.setFit(true)); }
  }

  if (!onServer) {
    /* ---- local file / demo: the browser-local store, exactly as before ---- */
    const store = M.LocalStore(fixture ? 'maison.template.dashboard.v1' : 'iniqdash.dashboard.v1');
    let initial = demo(), status = fixture ? 'Test dashboard · not saved' : 'Not saved yet';
    const saved = store.load();
    if (saved) {
      const r = M.parse(saved, R);
      if (r.ok) { initial = r.model; status = 'Saved version loaded'; } else status = 'Saved version invalid · built-in shown';
    }
    window.editor = window.MaisonEditor.create({ mount: host, initial, demo, store, status, breakpoint: bp, breakpointForced: q.has('bp'), viewer });
    if (q.get('edit') === '1') window.editor.setEditing(true);
    urlOptions();
    setHeader(appName(window.editor.getModel()));
    /* A public demo deployment (static files, no server) opts in with <meta name="iniqdash-demo" content="1">: it says plainly that
       everything is simulated and stays in this browser. The page is otherwise unchanged (no server, no Home Assistant, no account). */
    if (document.querySelector('meta[name="iniqdash-demo"]')) {
      const b = document.createElement('div');
      b.className = 'ed-demo-note'; b.setAttribute('role', 'note'); b.dataset.k = 'demo-note';
      b.textContent = 'Demo — everything you see is simulated. Nothing here is connected to a real home, and your changes stay in this browser (More → Reset restores the sample).';
      host.before(b);
    }
    return;
  }

  /* ---- on the server: server storage is authoritative ---- */
  const DS = window.IniqDashStore;
  // the live dashboard: an unlinked widget that shows demo data carries a small "Demo" tag (never in showrooms / local files)
  if (R.demoMarker) R.demoMarker(true);
  /** a loading problem is shown as it is — never replaced by an empty or sample dashboard that could be saved over it */
  function fatal(title, text, id) {
    host.replaceChildren();
    const box = document.createElement('section');
    box.className = 'ed-fatal'; box.setAttribute('role', 'alert');
    const h = document.createElement('h2'); h.textContent = title;
    const p = document.createElement('p'); p.textContent = text;
    const again = document.createElement('a'); again.className = 'ed-btn ed-btn--primary'; again.href = location.pathname + location.search; again.textContent = 'Try again';
    const other = document.createElement('a'); other.className = 'ed-btn'; other.href = `${location.pathname}?d=none`; other.textContent = 'Open another dashboard';
    box.append(h, p, again, ...(id ? [other] : []));
    host.append(box);
  }
  const go = (id) => { location.href = `${location.pathname}?d=${encodeURIComponent(id)}`; };
  function emptyModel() {
    const r = M.validate({ version: M.VERSION, app: { id: 'dashboard', startPage: 'home', navigation: { ...M.DOCK_DEFAULT } },
      pages: [{ id: 'home', name: 'Home', nav: true, items: [] }], popups: [], notifications: { templates: [], rules: [] } }, R);
    return r.ok ? r.model : demo();
  }
  // dashboards saved in this browser before server storage (offered once each; the browser copy is never removed)
  function legacy() {
    return LEGACY_KEYS.map(([key, label]) => {
      const mark = ls.get(`iniqdash.migrated.${key}`);
      let later = null; try { later = sessionStorage.getItem(`iniqdash.migrated.${key}`); } catch (e) { /* unavailable */ }
      if (mark || later) return null;
      const text = ls.get(key);
      if (!text) return null;
      const r = M.parse(text, R);
      return r.ok ? { key, label, model: r.model } : null;
    }).filter(Boolean);
  }

  let settings = { default: null, editButton: 'corner', gallery: null };
  (async () => {
    const lst = await DS.list();
    if (!lst.ok) return fatal('Your dashboards could not be loaded', `${DS.message(lst)} Nothing was changed.`);
    const all = lst.dashboards;
    const asked = q.get('d');
    settings = { default: null, editButton: 'corner', gallery: null, ...(lst.settings || {}) };
    let id = asked && DS.ID.test(asked) ? asked : null;
    // which dashboard: the one asked for (?d=), else the DEFAULT DASHBOARD (the application setting — when it still exists), else the
    // one this browser had open last, else the most recently saved. A missing default simply falls through (no redirect, no loop).
    if (!id && asked !== 'none' && !fixture) {
      const last = ls.get('iniqdash.lastDashboard');
      id = settings.default && all.some((d) => d.id === settings.default) ? settings.default
        : last && all.some((d) => d.id === last) ? last
        : all.length ? [...all].sort((a, b) => String(b.updated).localeCompare(String(a.updated)))[0].id : null;
    }
    let entry = null, initial, status;
    if (id) {
      const r = await DS.get(id);
      if (!r.ok) {
        if (r.error === 'not_found' && asked) return fatal('This dashboard does not exist', 'It may have been deleted on another device. Open another dashboard from the list.', id);
        return fatal('This dashboard could not be opened', `${DS.message(r)} Nothing was changed.`, id);
      }
      const v = M.validate(r.dashboard, R);
      if (!v.ok) {
        // links to a popup / page / template the dashboard does not have: offer the REPAIR (the user chooses per link); the saved
        // copy stays untouched until the repaired dashboard is saved. Anything else wrong: shown as it is.
        const fixable = (M.brokenReferences(r.dashboard).length || M.layoutIssues(r.dashboard, R).length) && (() => { const t = structuredClone(r.dashboard); M.brokenReferences(t).forEach((x) => x.clear()); M.layoutIssues(t, R).forEach((x) => x.fix()); return M.validate(t, R).ok; })();
        if (!fixable) return fatal('This saved dashboard cannot be shown', `It does not pass validation (${v.errors.slice(0, 2).join('; ')}). It was left untouched on the server.`, id);
        return repairScreen(r, v.errors);
      }
      entry = r; initial = v.model; status = `Saved on the server · ${r.name}`;
      ls.set('iniqdash.lastDashboard', r.id);
      if (q.get('d') !== r.id) history.replaceState(null, '', `${location.pathname}?d=${r.id}`);
    } else {
      initial = demo();
      status = all.length ? 'Built-in sample · not saved' : 'Built-in sample · not saved yet (Save stores it on the server)';
    }
    start(entry, initial, status, all, false);
    // NO DASHBOARD on this server (e.g. all were deleted): the editor shows the built-in SAMPLE — say so plainly and offer a truly
    // blank dashboard, so the sample's pages and widgets never become "my new dashboard" by accident
    if (!entry && !all.length && !fixture) {
      const b = document.createElement('div');
      b.className = 'ed-start-note'; b.setAttribute('role', 'note'); b.dataset.k = 'start-note';
      const t = document.createElement('span'); t.textContent = 'There is no dashboard on this server yet. This is the built-in sample (example pages and widgets) — saving it stores the sample as your dashboard.';
      const blank = document.createElement('button'); blank.type = 'button'; blank.className = 'ed-btn ed-btn--primary'; blank.dataset.k = 'start-blank'; blank.textContent = 'Start with a blank dashboard';
      blank.addEventListener('click', async () => {
        blank.disabled = true;
        const r = await DS.create('My dashboard', emptyModel());
        if (!r.ok) { blank.disabled = false; t.textContent = DS.message(r); return; }
        go(r.entry.id);
      });
      b.append(t, blank);
      // or the INIQDASH DEMO: the official five-page demonstration dashboard of a simulated home (no Home Assistant needed), added as a new dashboard
      {
        const demo = document.createElement('button'); demo.type = 'button'; demo.className = 'ed-btn'; demo.dataset.k = 'start-iniqdash-demo'; demo.textContent = 'Open the INIQDASH demo';
        demo.title = 'Home, Lights, Energy, Rooms and Security of a simulated home — no Home Assistant needed, nothing reaches a real device';
        demo.addEventListener('click', async () => {
          demo.disabled = true;
          const demoModel = window.IniqDemoPackage ? await window.IniqDemoPackage.load('assets/demo/iniqdash-demo') : null;
          if (!demoModel) { demo.disabled = false; t.textContent = 'The INIQDASH demo could not be loaded from this server.'; return; }
          const r = await DS.create('INIQDASH demo', demoModel, { unique: true });
          if (!r.ok) { demo.disabled = false; t.textContent = DS.message(r); return; }
          go(r.entry.id);
        });
        b.append(demo);
      }
      host.before(b);
    }
    /** a saved dashboard with broken links: what is wrong, where, and a choice per link — then the editor on the repaired copy, UNSAVED */
    function repairScreen(r, errors) {
      host.replaceChildren(window.IniqRepair.view({ model: r.dashboard, title: `“${r.name}” needs a repair before it can open`,
        intro: `Something in it does not pass the check (${errors[0]}). Below is each problem and what the repair does. The saved dashboard was left untouched on the server.`,
        applyText: 'Open the repaired dashboard (not saved yet)',
        onApply: (fixed) => {
          const v2 = M.validate(fixed, R);
          if (!v2.ok) return fatal('This saved dashboard cannot be shown', `It still does not pass validation (${v2.errors.slice(0, 2).join('; ')}). It was left untouched on the server.`, r.id);
          host.replaceChildren();
          ls.set('iniqdash.lastDashboard', r.id);
          start(r, v2.model, `Repaired · not saved yet — Save stores the repaired “${r.name}”`, all, true);
        } }));
      const other = document.createElement('a'); other.className = 'ed-btn'; other.href = `${location.pathname}?d=none`; other.textContent = 'Open another dashboard'; other.dataset.k = 'repair-other';
      host.querySelector('.ed-repair__btns').prepend(other);
    }
  })();
  function start(entry, initial, status, all, unsaved) {
    const store = window.IniqServerStore({ entry, sampleName: fixture ? 'Test dashboard' : (appName(initial) || 'My dashboard') });
    const dashboards = {
      list: DS.list, get: DS.get, rename: DS.rename, duplicate: DS.duplicate, remove: DS.remove, message: DS.message,
      /** the application settings (default dashboard, Edit control) — read at start, changed through the server */
      settings: () => ({ ...settings }),
      setSettings: async (patch) => { const r = await DS.settings(patch); if (r.ok) { settings = { ...settings, ...r.settings }; if (window.editor && patch.editButton) window.editor.setEditButton(settings.editButton); } return r; },
      create: (name, model, o) => DS.create(name, model, o),
      empty: emptyModel,
      open: (target) => go(target),
      afterDeleteCurrent: () => { ls.set('iniqdash.lastDashboard', ''); location.href = `${location.pathname}`; },
      markLegacy: (key, v) => { if (v === 'later') { try { sessionStorage.setItem(`iniqdash.migrated.${key}`, 'later'); } catch (e) { /* unavailable */ } } else ls.set(`iniqdash.migrated.${key}`, v); },
    };
    window.editor = window.MaisonEditor.create({
      mount: host, initial, demo, store, status, breakpoint: bp, breakpointForced: q.has('bp'), dashboards, legacy: legacy(), unsaved, viewer, editButton: settings.editButton,
      onSaved: (e, created) => {
        ls.set('iniqdash.lastDashboard', e.id);
        if (created) history.replaceState(null, '', `${location.pathname}?d=${e.id}`);
        setHeader(e.name);
      },
      onRenamed: (e) => setHeader(e.name),
    });
    if (q.get('edit') === '1') window.editor.setEditing(true);
    urlOptions();
    setHeader(entry ? entry.name : appName(window.editor.getModel()));
  }
})();
