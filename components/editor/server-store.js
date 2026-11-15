/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Server-side dashboard storage — browser side (api/dashboards.php; server/Dashboards.php).

   IniqDashStore                        the small API (signed-in session; CSRF token + same origin on changes)
     list()                → { ok, dashboards: [{ id, name, updated, revision }] }
     get(id)               → { ok, id, name, revision, updated, dashboard }
     create(name, model, { unique })   → { ok, entry }   (unique: "Name 2", "Name 3"… when the name is taken)
     save(id, revision, model)         → { ok, entry } | { ok: false, error: 'conflict', revision }
     rename(id, name) · duplicate(id) · remove(id)
     Every answer is { ok, error?, … }; network / session problems become error 'network' / 'signed_out'.

   IniqServerStore({ entry, sample })  the editor's store (same interface as MaisonModel.LocalStore, async):
     load()  → Promise<text|null>       the latest SERVER version (and its revision becomes the expected one)
     save(text) → Promise<{ ok, error?, entry? }>   expected revision sent; a newer server version → 'conflict'
     current() → { id, name, revision } | null (null: a built-in sample that is not saved yet; save() creates it)
     RECOVERY DRAFT (localStorage, this browser only): key iniqdash.draft.<id> (or .new) = { id, revision, savedAt,
       model }. It is only offered for the SAME dashboard AND the same server revision it was made from; a draft of
       an older revision (another device saved since) or of a deleted dashboard is never offered.
   ========================================================================== */
(function (global) {
  'use strict';

  const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content || '';
  const ID = /^d[0-9a-f]{16}$/;
  async function call(method, body, query) {
    let res;
    try {
      res = await fetch(`api/dashboards.php${query || ''}`, {
        method, credentials: 'same-origin', cache: 'no-store',
        headers: method === 'POST' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': meta('iniqdash-csrf') } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (e) { return { ok: false, error: 'network' }; }
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'signed_out' };
    try { return await res.json(); } catch (e) { return { ok: false, error: res.status === 413 ? 'too_large' : 'network' }; }
  }
  const D = {
    list: () => call('GET'),
    get: (id) => (ID.test(String(id)) ? call('GET', null, `?id=${encodeURIComponent(id)}`) : Promise.resolve({ ok: false, error: 'not_found' })),
    create: (name, model, { unique = false } = {}) => call('POST', { action: 'create', name, dashboard: model, ...(unique ? { unique: true } : {}) }),
    /** the application settings: { default: <dashboard id> | null, editButton: 'corner' | 'always' } (only the keys given change) */
    settings: (patch) => call('POST', { action: 'settings', ...patch }),
    save: (id, revision, model) => call('POST', { action: 'save', id, revision, dashboard: model }),
    rename: (id, name) => call('POST', { action: 'rename', id, name }),
    duplicate: (id) => call('POST', { action: 'duplicate', id }),
    remove: (id) => call('POST', { action: 'delete', id }),
    ID,
  };
  /** what a user can read for each error (no internals) */
  const MESSAGES = {
    network: 'The IniqDash server did not answer. Check your connection and try again.',
    signed_out: 'Your session has expired — sign in again (your changes are still here).',
    not_found: 'This dashboard no longer exists on the server (it may have been deleted on another device).',
    corrupt: 'This saved dashboard file cannot be read. It was left untouched on the server.',
    conflict: 'This dashboard was changed on another device. Reload the latest version before saving.',
    name_invalid: 'Use a name of 1–60 characters.',
    name_taken: 'Another dashboard already has this name.',
    invalid: 'The server refused this dashboard: it is not a valid dashboard.',
    too_large: 'This dashboard is too large to save (more than 2 MB). Uploaded images are stored separately — remove embedded data.',
    too_many: 'There are too many dashboards on this server (200).',
    storage_unavailable: 'The server has no private storage folder for dashboards. Run the setup tool (server/setup.php).',
    write_failed: 'The server could not write the dashboard (its private folder is not writable). Nothing was changed.',
    bad_request: 'The request was not understood. Reload the page and try again.',
  };
  const message = (r) => (r && MESSAGES[r.error]) || 'The server refused the request.';

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } };

  function IniqServerStore({ entry = null, sampleName = 'My dashboard' } = {}) {
    let cur = entry ? { id: entry.id, name: entry.name, revision: entry.revision } : null;
    const draftKey = () => `iniqdash.draft.${cur ? cur.id : 'new'}`;
    return {
      server: true,
      current: () => (cur ? { ...cur } : null),
      setName: (name) => { if (cur) cur.name = name; },
      /** the latest server version (Revert / Reload latest): its revision becomes the expected one */
      async load() {
        if (!cur) return null;
        const r = await D.get(cur.id);
        if (!r.ok) return { error: r.error, message: message(r) };
        cur = { id: r.id, name: r.name, revision: r.revision };
        return JSON.stringify(r.dashboard, null, 2);
      },
      /** explicit Save only: never automatic */
      async save(text) {
        let model;
        try { model = JSON.parse(text); } catch (e) { return { ok: false, error: 'invalid', message: MESSAGES.invalid }; }
        const r = cur ? await D.save(cur.id, cur.revision, model) : await D.create(sampleName, model, { unique: true });
        if (!r.ok) return { ok: false, error: r.error, message: message(r), revision: r.revision };
        const wasNew = !cur;
        cur = { id: r.entry.id, name: r.entry.name, revision: r.entry.revision };
        if (wasNew) lsDel('iniqdash.draft.new');
        return { ok: true, entry: r.entry, created: wasNew };
      },
      clear() { /* server dashboards are never erased by the editor's Reset */ },
      loadDraft() {
        const t = lsGet(draftKey());
        if (!t) return null;
        let d; try { d = JSON.parse(t); } catch (e) { lsDel(draftKey()); return null; }
        // only a draft of THIS dashboard made from THIS server revision; anything else is stale and dropped
        if (!d || (cur ? d.id !== cur.id || d.revision !== cur.revision : d.id !== null)) { lsDel(draftKey()); return null; }
        return JSON.stringify({ version: d.version, savedAt: d.savedAt, model: d.model });
      },
      saveDraft(text) {
        let d; try { d = JSON.parse(text); } catch (e) { return false; }
        return lsSet(draftKey(), JSON.stringify({ ...d, id: cur ? cur.id : null, revision: cur ? cur.revision : null }));
      },
      clearDraft() { lsDel(draftKey()); },
    };
  }

  global.IniqDashStore = { ...D, message, MESSAGES };
  global.IniqServerStore = IniqServerStore;
})(window);
