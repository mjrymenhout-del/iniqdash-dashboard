/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqStudioLibrary — the reusable Widget Studio definitions and the user's COLLECTIONS (server/StudioWidgets.php, api/studio_widgets.php).
   The server puts them on the page as data (#iniqdash-studio-widgets, gate.php); a save updates this list at once (no reload, no
   restart). A DEFINITION is the source of truth for a widget's components; a dashboard INSTANCE (an item of type "studio" with
   config { definition: id }) only places it — so every instance follows the definition when it is saved again.

   IniqStudioLibrary.list() → [{ id, revision, created, updated, definition: { meta: { name, collection, category, description, icon }, canvas, slots (source groups):
     [{ id, label, family, preview? }], properties: [{ id, name, group, read, attribute? }], components } }]
   IniqStudioLibrary.get(id) → that entry | null
   IniqStudioLibrary.model(id) → { name, canvas, slots, components, meta } (what the Studio widget runtime draws) | null
   IniqStudioLibrary.slots(id) → [{ id, label, domains, required }]   the ENTITY SLOTS a placed copy assigns (its Configure)
   IniqStudioLibrary.save(id | null, revision | null, definition) → Promise<{ ok, entry?, error?, detail? }>   (null id: a new definition)
   IniqStudioLibrary.collections() → [{ id, name }]   the collections the user created (stable ids, server-side)
   IniqStudioLibrary.createCollection(name) → Promise<{ ok, collection?, error? }>   a new one, persisted at once
   IniqStudioLibrary.onChange(cb(id)) → unsubscribe   (a definition saved; a collection created: cb(null))
   ========================================================================== */
(function (global) {
  'use strict';

  const ID = /^w[0-9a-f]{16}$/;
  let entries = null, cols = null, usage = null, retired = null;
  const subs = new Set();
  function load() {
    if (entries) return entries;
    entries = new Map();
    try {
      const el = typeof document !== 'undefined' && document.getElementById('iniqdash-studio-widgets');
      const d = el ? JSON.parse(el.textContent || '{}') : {};
      (Array.isArray(d.widgets) ? d.widgets : []).forEach((w) => { if (w && ID.test(w.id) && w.definition && w.definition.meta) entries.set(w.id, w); });
      cols = (Array.isArray(d.collections) ? d.collections : []).filter((c) => c && /^c[0-9a-f]{12}$/.test(c.id) && typeof c.name === 'string');
    } catch (e) { /* no library on this page (local demo) */ }
    cols = cols || [];
    return entries;
  }
  /** an OLDER definition (components naming their entities directly) is presented in today's form: entity SLOTS whose preview is the old
      entity (IniqBinding.migrate) — a new copy never inherits it; the stored file changes only when Studio saves it again */
  const mig = (w) => (w && global.IniqBinding && global.IniqBinding.migrate ? { ...w, definition: global.IniqBinding.migrate(w.definition) } : w);
  const byName = (a, b) => String(a.definition.meta.name).localeCompare(String(b.definition.meta.name)) || a.id.localeCompare(b.id);
  const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content || '';

  async function post(body) {
    if (!meta('iniqdash-server')) return { ok: false, error: 'demo' };
    try {
      const r = await fetch('api/studio_widgets.php', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': meta('iniqdash-csrf') }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => null);
      return d && d.ok ? { ok: true, data: d } : { ok: false, error: (d && d.error) || `http_${r.status}`, data: d || null };
    } catch (e) { return { ok: false, error: 'server_unreachable' }; }
  }

  const API = {
    list: () => [...load().values()].sort(byName).map((w) => structuredClone(mig(w))),
    get: (id) => { const w = load().get(id); return w ? structuredClone(mig(w)) : null; },
    model(id) {
      const w = mig(load().get(id));
      if (!w) return null;
      const d = w.definition;
      return { name: d.meta.name, meta: structuredClone(d.meta), canvas: structuredClone(d.canvas), slots: structuredClone(d.slots || []), properties: structuredClone(d.properties || []), settings: structuredClone(d.settings || []), components: structuredClone(d.components || []) };
    },
    /** the entity slots a placed copy of this definition assigns: [{ id, label, domains, required }] */
    slots(id) { const w = mig(load().get(id)); return w && global.IniqBinding ? global.IniqBinding.slotsOf(w.definition) : []; },
    collections: () => { load(); return cols.map((c) => ({ ...c })).sort((a, b) => a.name.localeCompare(b.name)); },
    async createCollection(name) {
      const d = await post({ action: 'create_collection', name: String(name || '').trim() });
      if (!d.ok) return d;
      load(); cols.push(d.data.collection);
      subs.forEach((cb) => { try { cb(null); } catch (e) { console.error(e); } });
      return { ok: true, collection: { ...d.data.collection } };
    },
    async save(id, revision, definition) {
      if (!meta('iniqdash-server')) return { ok: false, error: 'demo' };
      try {
        const r = await fetch('api/studio_widgets.php', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': meta('iniqdash-csrf') },
          body: JSON.stringify({ action: 'save', id: id || null, ...(id ? { revision } : {}), definition }) });
        const d = await r.json().catch(() => null);
        if (!d || !d.ok) return { ok: false, error: (d && d.error) || `http_${r.status}`, detail: d && d.detail, revision: d && d.revision };
        load().set(d.widget.id, d.widget);
        subs.forEach((cb) => { try { cb(d.widget.id); } catch (e) { console.error(e); } });
        return { ok: true, entry: structuredClone(d.widget) };
      } catch (e) { return { ok: false, error: 'server_unreachable' }; }
    },
    /** DELETE a definition (safe: the server refuses while a saved dashboard places a copy — r.dashboards names them) */
    async remove(id, revision) {
      const r = await post({ action: 'delete', id, revision });
      if (!r.ok) return { ok: false, error: r.error, dashboards: (r.data && r.data.dashboards) || [], revision: r.data && r.data.revision };
      load().delete(id);
      subs.forEach((cb) => { try { cb(id); } catch (e) { console.error(e); } });
      return { ok: true };
    },
    /* ---- MANAGEMENT (Manage widgets): every change is made by the server, then the library is read again (refresh) so the gallery,
       Widget Studio and the manager show the same thing at once */
    /** read the library from the server again (widgets, collections, the clean-up report, and which dashboards place each widget) */
    async refresh() {
      if (!meta('iniqdash-server')) return { ok: false, error: 'demo' };
      try {
        const r = await fetch('api/studio_widgets.php?usage=1', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
        const d = await r.json().catch(() => null);
        if (!d || !d.ok) return { ok: false, error: (d && d.error) || `http_${r.status}` };
        load(); entries.clear();
        (d.widgets || []).forEach((w) => { if (w && ID.test(w.id) && w.definition && w.definition.meta) entries.set(w.id, w); });
        cols = (d.collections || []).filter((c) => c && /^c[0-9a-f]{12}$/.test(c.id) && typeof c.name === 'string');
        usage = d.usage || {}; retired = d.retired || null;
        subs.forEach((cb) => { try { cb(null); } catch (e) { console.error(e); } });
        return { ok: true };
      } catch (e) { return { ok: false, error: 'server_unreachable' }; }
    },
    /** the dashboards that place a copy of this widget (after refresh): [{ id, name }] */
    usedBy: (id) => (usage && usage[id] ? usage[id].map((d) => ({ ...d })) : []),
    /** the one-time clean-up of the retired example collections (after refresh): { at, collections, packages } | null */
    retiredReport: () => (retired ? structuredClone(retired) : null),
    async renameCollection(id, name) { const r = await post({ action: 'rename_collection', id, name: String(name || '').trim() }); if (r.ok) await API.refresh(); return r.ok ? { ok: true } : r; },
    /** mode 'keep' (its widgets move to `to`, default IniqDash) | 'widgets' (its widgets are deleted — those a dashboard places are kept and moved) */
    async deleteCollection(id, mode, to) { const r = await post({ action: 'delete_collection', id, mode, ...(to ? { to } : {}) }); await API.refresh(); return r.ok ? { ok: true, ...r.data } : r; },
    async moveWidgets(ids, to) { const r = await post({ action: 'move_widgets', ids, to }); await API.refresh(); return r.ok ? { ok: true, ...r.data } : r; },
    /** delete several widgets: each one a saved dashboard places is kept (kept: [{ id, dashboards }]) */
    async removeMany(ids) { const r = await post({ action: 'delete_widgets', ids }); await API.refresh(); return r.ok ? { ok: true, ...r.data } : r; },
    async retireExamples() { const r = await post({ action: 'retire_examples' }); await API.refresh(); return r.ok ? { ok: true, ...r.data } : r; },
    /** EXPORT: a portable file — { format: 'iniqdash-studio-widgets', version: 1, collection, widgets: [{ key, definition }] }. The
        collection is carried by NAME (ids differ between servers); key = the definition id, so a dashboard export can point at it. */
    exportFile(ids) {
      const ws = (ids || []).map((id) => load().get(id)).filter(Boolean);
      const colName = (c) => (API.collections().find((x) => x.id === c) || {}).name || null;
      return { format: 'iniqdash-studio-widgets', version: 1, exported: new Date().toISOString(),
        widgets: ws.map((w) => ({ key: w.id, collection: colName(w.definition.meta.collection), definition: structuredClone(w.definition) })) };
    },
    /** IMPORT a file made by exportFile: every widget saved as a NEW definition (nothing existing is replaced), in its collection by name
        (created when missing; else the given fallback collection id). → { ok, imported: [{ key, id, name }], failed: [{ name, error }] } */
    async importFile(file, fallbackCollection = null) {
      if (!file || file.format !== 'iniqdash-studio-widgets' || file.version !== 1 || !Array.isArray(file.widgets)) return { ok: false, error: 'not_a_studio_file', imported: [], failed: [] };
      const imported = [], failed = [];
      for (const w of file.widgets.slice(0, 64)) {
        const d = w && w.definition && typeof w.definition === 'object' ? structuredClone(w.definition) : null;
        const name = d && d.meta && typeof d.meta.name === 'string' ? d.meta.name : '(unnamed)';
        if (!d || !d.meta) { failed.push({ name, error: 'invalid' }); continue; }
        let col = null;
        if (typeof w.collection === 'string' && w.collection.trim()) {
          col = API.collections().find((c) => c.name.toLowerCase() === w.collection.trim().toLowerCase()) || null;
          if (!col) { const r = await API.createCollection(w.collection.trim()); col = r.ok ? r.collection : null; }
        }
        d.meta = { ...d.meta, collection: col ? col.id : (fallbackCollection || d.meta.collection) };
        const r = await API.save(null, null, d);
        if (r.ok) imported.push({ key: w.key || null, id: r.entry.id, name }); else failed.push({ name, error: r.detail || r.error });
      }
      return { ok: failed.length === 0, imported, failed };
    },
    /** a DASHBOARD PACKAGE's own widgets (e.g. the Maison demo: assets/demo/<name>.widgets.json = { collection: name, widgets: [{ key, definition }] }):
        each definition is saved as a NEW My Widgets definition in a collection of that name (created when missing, else the existing one),
        and the dashboard's studio items that reference a bundle key are pointed at the saved definition. Nothing existing is changed.
        → Promise<{ ok, dashboard?, saved?: [id…], error? }>  (no bundle → the dashboard unchanged) */
    async installBundle(dashboard, bundle) {
      const list0 = bundle && Array.isArray(bundle.widgets) ? bundle.widgets.filter((w) => w && ID.test(w.key) && w.definition && w.definition.meta) : [];
      if (!list0.length) return { ok: true, dashboard, saved: [] };
      let col = null;
      const name = typeof bundle.collection === 'string' && bundle.collection.trim() ? bundle.collection.trim().slice(0, 60) : 'Bundled widgets';
      const have = () => API.collections().find((c) => c.name.toLowerCase() === name.toLowerCase());
      col = have();
      if (!col) { const r = await API.createCollection(name); col = r.ok ? r.collection : have(); }
      if (!col) return { ok: false, error: 'collection' };
      const map = new Map(), saved = [];
      for (const w of list0) {
        const def = structuredClone(w.definition); def.meta = { ...def.meta, collection: col.id };
        const r = await API.save(null, null, def);
        if (!r.ok) return { ok: false, error: r.error, detail: r.detail };
        map.set(w.key, r.entry.id); saved.push(r.entry.id);
      }
      const d = structuredClone(dashboard);
      (d.pages || []).forEach((pg) => (pg.items || []).forEach((it) => { if (it && it.type === 'studio' && it.config && map.has(it.config.definition)) it.config.definition = map.get(it.config.definition); }));
      return { ok: true, dashboard: d, saved };
    },
    onChange(cb) { subs.add(cb); return () => subs.delete(cb); },
    ID,
  };
  global.IniqStudioLibrary = Object.freeze(API);

  /** a DEMO PACKAGE (data, fetched only when a user adds it): the dashboard (<base>.json) and, when the package has them, the Widget
      Studio widgets it is built from (<base>.widgets.json) — those are installed into My Widgets first (installBundle), so the
      demo's cards are ordinary, editable Studio widgets. → Promise<dashboard | null> */
  const getJson = async (url) => { try { const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  global.IniqDemoPackage = Object.freeze({
    async load(base = 'assets/demo/iniqdash-demo') {
      const dash = await getJson(`${base}.json`);
      if (!dash) return null;
      const bundle = await getJson(`${base}.widgets.json`);
      if (!bundle) return dash;
      const r = await API.installBundle(dash, bundle);
      return r.ok ? r.dashboard : null;
    },
  });
})(window);
