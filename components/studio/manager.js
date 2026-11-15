/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   MANAGE WIDGETS — the user's collections and Widget Studio widgets, organised by the user (window.IniqWidgetManager.open({ mount })).

   Collections (left): IniqDash (built-in: cannot be renamed or deleted), the user's own (New, Rename, Delete…) and installed widget
   packages (code under widgets/custom: shown, not changed here). Widgets (right): the selected collection's Widget Studio widgets, each
   with how many saved dashboards place it; tick several to move them to another collection or delete them.

   SAFETY: a widget a saved dashboard places is never deleted — the server keeps it and says which dashboards use it (deleting a
   collection "with its widgets" moves those to IniqDash instead). Deleting asks first. Built-in widget TYPES (Light, Climate…) are part
   of IniqDash and are not listed here; Add widget → Organise can hide them from the gallery.
   Every change is made by the server; the library is then read again, so the gallery and Widget Studio show it at once.
   ========================================================================== */
(function (global) {
  'use strict';
  const h = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => c !== null && c !== undefined && n.append(c));
    return n;
  };
  const FIRST = { id: 'iniqdash', name: 'IniqDash' };
  const MSG = { name_taken: 'That name is already used', name_invalid: 'Use a name of 1–60 characters, without < or >', not_found: 'It no longer exists — the list was refreshed',
    storage_unavailable: 'The widget library cannot be written on this server', write_failed: 'The server could not save the change', demo: 'Available on an IniqDash server only' };
  const msgOf = (r) => MSG[r && r.error] || `Not done (${(r && r.error) || 'error'})`;

  function open({ mount, onChange } = {}) {
    const L = global.IniqStudioLibrary, C = global.MaisonConfigure;
    if (!L || !C) return null;
    const shell = C.modal({ mount: mount || document.body, cls: 'is-edit iq-wm', title: 'Manage widgets', cancelText: 'Close' });
    const { body, foot } = shell;
    let cur = FIRST.id;
    const ticked = new Set();
    const status = h('p', { class: 'iq-wm__status', role: 'status', 'data-k': 'wm-status' });
    const say = (t, warn) => { status.textContent = t; status.classList.toggle('is-warn', !!warn); };
    const packages = () => (global.MaisonRegistry && global.MaisonRegistry.collections ? global.MaisonRegistry.collections() : []).filter((c) => !c.virtual && !c.user);   // the installed package collections
    const widgetsIn = (cid) => L.list().filter((w) => (w.definition.meta.collection || FIRST.id) === cid);
    const cols = () => [{ ...FIRST, kind: 'first' }, ...L.collections().map((c) => ({ ...c, kind: 'mine' }))];
    const left = h('div', { class: 'iq-wm__cols', role: 'list', 'aria-label': 'Collections' });
    const right = h('div', { class: 'iq-wm__widgets' });
    const notice = h('div', { class: 'iq-wm__notice', 'data-k': 'wm-retired', hidden: true });
    const changed = () => { if (onChange) try { onChange(); } catch (e) { console.error(e); } };
    async function act(promise, done) {
      say('Working…');
      const r = await promise;
      if (r && r.ok === false) say(msgOf(r), true); else if (done) say(typeof done === 'function' ? done(r) : done);
      draw(); changed();
      return r;
    }

    function draw() {
      // ---- collections
      const list = cols();
      if (!list.some((c) => c.id === cur)) cur = FIRST.id;
      left.replaceChildren(...list.map((c) => {
        const n = widgetsIn(c.id).length;
        const row = h('div', { class: `iq-wm__col${c.id === cur ? ' is-current' : ''}`, role: 'listitem', 'data-col': c.id }, [
          h('button', { type: 'button', class: 'iq-wm__colname', 'aria-pressed': String(c.id === cur), 'data-k': 'wm-col', onclick: () => { cur = c.id; ticked.clear(); draw(); } }, [
            h('b', { text: c.name }), h('small', { text: `${n} widget${n === 1 ? '' : 's'}${c.kind === 'first' ? ' · built-in collection' : ''}` })]),
          c.kind === 'mine' ? h('div', { class: 'iq-wm__colact' }, [
            h('button', { type: 'button', class: 'ed-btn ed-btn--ghost', 'data-k': 'wm-rename', onclick: () => rename(c) }, h('span', { text: 'Rename' })),
            h('button', { type: 'button', class: 'ed-btn ed-btn--ghost', 'data-k': 'wm-delete-col', onclick: () => askDelete(c) }, h('span', { text: 'Delete…' })),
          ]) : null,
        ]);
        return row;
      }), ...packages().map((c) => h('div', { class: 'iq-wm__col is-package', role: 'listitem' }, [h('div', { class: 'iq-wm__colname' }, [h('b', { text: c.name }), h('small', { text: 'installed widget package (files on the server)' })])])),
      h('button', { type: 'button', class: 'ed-btn ed-btn--primary iq-wm__new', 'data-k': 'wm-new-col', onclick: create }, h('span', { text: 'New collection' })));

      // ---- widgets of the current collection
      const ws = widgetsIn(cur);
      [...ticked].forEach((id) => { if (!ws.some((w) => w.id === id)) ticked.delete(id); });
      const others = cols().filter((c) => c.id !== cur);
      const moveSel = h('select', { 'aria-label': 'Move the ticked widgets to', 'data-k': 'wm-move-to' }, others.map((c) => h('option', { value: c.id, text: c.name })));
      const bar = h('div', { class: 'iq-wm__bar' }, [
        h('label', { class: 'ed-check' }, [h('input', { type: 'checkbox', 'data-k': 'wm-all', checked: ws.length > 0 && ticked.size === ws.length, onchange: (e) => { ticked.clear(); if (e.target.checked) ws.forEach((w) => ticked.add(w.id)); draw(); } }), h('span', { text: ticked.size ? `${ticked.size} ticked` : 'Tick all' })]),
        h('span', { class: 'iq-wm__barsp' }),
        h('label', { class: 'iq-wm__move' }, [h('span', { text: 'Move to' }), moveSel]),
        h('button', { type: 'button', class: 'ed-btn', 'data-k': 'wm-move', disabled: !ticked.size || !others.length, onclick: () => act(L.moveWidgets([...ticked], moveSel.value), (r) => { const n = (r.moved || []).length; ticked.clear(); return `Moved ${n} widget${n === 1 ? '' : 's'}`; }) }, h('span', { text: 'Move' })),
        h('button', { type: 'button', class: 'ed-btn ed-btn--danger', 'data-k': 'wm-delete', disabled: !ticked.size, onclick: removeTicked }, h('span', { text: 'Delete…' })),
      ]);
      const name = (cols().find((c) => c.id === cur) || FIRST).name;
      right.replaceChildren(
        h('h4', { class: 'ed-sub', text: `${name} · ${ws.length} widget${ws.length === 1 ? '' : 's'}` }),
        ws.length ? bar : h('p', { class: 'ed-hint', text: cur === FIRST.id ? 'No Widget Studio widgets here yet. Widgets you make in Widget Studio are listed here; the built-in widget types (Light, Climate, …) are part of IniqDash.' : 'This collection is empty. Move widgets here from another collection, or save one from Widget Studio.' }),
        h('ul', { class: 'iq-wm__list', 'aria-label': `Widgets in ${name}` }, ws.map((w) => {
          const used = L.usedBy(w.id);
          return h('li', { class: 'iq-wm__w', 'data-w': w.id }, [
            h('label', { class: 'ed-check' }, [h('input', { type: 'checkbox', 'data-k': 'wm-tick', 'data-w': w.id, checked: ticked.has(w.id), onchange: (e) => { if (e.target.checked) ticked.add(w.id); else ticked.delete(w.id); draw(); } }),
              h('span', {}, [h('b', { text: w.definition.meta.name }), h('small', { text: w.definition.meta.description || '' })])]),
            used.length ? h('span', { class: 'iq-wm__used', 'data-k': 'wm-used', title: used.map((d) => d.name).join(', '), text: `on ${used.length} dashboard${used.length === 1 ? '' : 's'}` }) : h('span', { class: 'iq-wm__unused', text: 'not on a dashboard' }),
          ]);
        })),
      );
      // ---- the one-time clean-up of the retired example collections
      const rep = L.retiredReport();
      const done = rep && ((rep.collections || []).length || (rep.packages || []).length);
      notice.hidden = !done;
      if (done) {
        const lines = [...(rep.collections || []).map((c) => `“${c.name}”: ${c.deleted} widget${c.deleted === 1 ? '' : 's'} removed${c.kept && c.kept.length ? `, ${c.kept.length} kept in IniqDash because a dashboard uses ${c.kept.length === 1 ? 'it' : 'them'}` : ''}`),
          ...(rep.packages || []).map((p) => `package “${p.id}”: ${p.removed ? 'removed' : `kept — ${p.reason}`}`)];
        notice.replaceChildren(h('b', { text: 'Old example collections were cleaned up' }), h('ul', {}, lines.map((t) => h('li', { text: t }))));
      }
    }
    async function create() {
      const n = (global.prompt && global.prompt('Name of the new collection') || '').trim();
      if (!n) return;
      const r = await act(L.createCollection(n), `Collection “${n}” added`);
      if (r && r.ok && r.collection) { cur = r.collection.id; await L.refresh(); draw(); }
    }
    function rename(c) {
      const n = (global.prompt && global.prompt('New name of the collection', c.name) || '').trim();
      if (!n || n === c.name) return;
      act(L.renameCollection(c.id, n), `Renamed to “${n}”`);
    }
    /** delete a collection: only the collection (its widgets move to IniqDash) or the collection and its widgets */
    function askDelete(c) {
      const n = widgetsIn(c.id).length, used = widgetsIn(c.id).filter((w) => L.usedBy(w.id).length).length;
      const box = h('div', { class: 'iq-wm__ask', role: 'group', 'aria-label': `Delete ${c.name}`, 'data-k': 'wm-ask' }, [
        h('p', { text: `Delete the collection “${c.name}” (${n} widget${n === 1 ? '' : 's'})?` }),
        h('label', { class: 'ed-check' }, [h('input', { type: 'radio', name: 'wm-mode', value: 'keep', checked: true, 'data-k': 'wm-mode-keep' }), h('span', { text: `Delete the collection only — its widgets move to IniqDash` })]),
        h('label', { class: 'ed-check' }, [h('input', { type: 'radio', name: 'wm-mode', value: 'widgets', 'data-k': 'wm-mode-widgets' }),
          h('span', { text: `Delete the collection and its widgets${used ? ` — ${used} used on a dashboard ${used === 1 ? 'is' : 'are'} kept and moved to IniqDash` : ''}` })]),
        h('div', { class: 'iq-wm__askrow' }, [
          h('button', { type: 'button', class: 'ed-btn ed-btn--danger', 'data-k': 'wm-confirm-delete', onclick: () => { const mode = box.querySelector('input[name=wm-mode]:checked').value; box.remove();
            act(L.deleteCollection(c.id, mode), (r) => `Deleted “${c.name}”${mode === 'widgets' ? ` and ${(r.deleted || []).length} widget${(r.deleted || []).length === 1 ? '' : 's'}` : ''}${(r.kept || []).length ? ` — ${(r.kept || []).length} kept (on a dashboard)` : ''}`); } }, h('span', { text: 'Delete' })),
          h('button', { type: 'button', class: 'ed-btn', onclick: () => box.remove() }, h('span', { text: 'Cancel' })),
        ]),
      ]);
      left.querySelector(`[data-col="${c.id}"]`)?.append(box);
      box.querySelector('[data-k=wm-confirm-delete]').focus();
    }
    function removeTicked() {
      const ids = [...ticked], used = ids.filter((id) => L.usedBy(id).length);
      if (global.confirm && !global.confirm(`Delete ${ids.length} widget${ids.length === 1 ? '' : 's'}?${used.length ? ` ${used.length} on a dashboard will be kept.` : ''} This cannot be undone.`)) return;
      act(L.removeMany(ids), (r) => { ticked.clear(); const k = (r.kept || []).length; return `Deleted ${(r.deleted || []).length}${k ? ` · ${k} kept: used on ${[...new Set((r.kept || []).flatMap((x) => x.dashboards.map((d) => d.name)))].join(', ')}` : ''}`; });
    }

    body.append(h('p', { class: 'ed-hint', text: 'Your collections and the widgets you made in Widget Studio. A widget used on a dashboard is never deleted; the built-in widget types are part of IniqDash.' }),
      notice, h('div', { class: 'iq-wm__split' }, [left, right]), status);
    foot.append(h('button', { type: 'button', class: 'ed-btn', 'data-k': 'wm-close', onclick: () => shell.close(false) }, h('span', { text: 'Close' })));
    say('Loading…');
    L.refresh().then((r) => { say(r.ok ? '' : msgOf(r), !r.ok); draw(); });
    draw();
    return shell;
  }
  global.IniqWidgetManager = Object.freeze({ open });
})(window);
