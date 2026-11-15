/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqRepair — repair a dashboard whose links point at a popup, page or notification template it does not have, or whose widgets run past
   the right edge of their grid (MaisonModel.layoutIssues — moved left so they fit).

   IniqRepair.view({ model, title, intro, applyText, cancelText, onApply(model), onCancel }) → HTMLElement
     model     the dashboard as stored / as edited (never changed: the repair works on a copy)
     For every broken reference (MaisonModel.brokenReferences) it names WHERE it is (page / popup, widget, what it does, the
     missing target) and offers: Remove the link (the harmless choice the editor makes when a popup / page is deleted) or one of
     the dashboard's own popups / pages / templates instead. Nothing else in the dashboard changes. onApply receives the repaired
     copy — the caller decides what happens with it (the editor opens it unsaved; nothing is stored until the user saves).
   ========================================================================== */
(function (global) {
  'use strict';
  const M = () => global.MaisonModel;
  const h = (tag, attrs = {}, kids = []) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => { if (v === null || v === undefined || v === false) return; if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); });
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => { if (c) el.append(c); });
    return el;
  };
  const KIND = { popup: 'popup', page: 'page', template: 'notification template' };

  function view({ model, title = 'Repair this dashboard', intro = '', applyText = 'Open the repaired dashboard', cancelText = null, onApply, onCancel } = {}) {
    const draft = structuredClone(model);
    const R = global.MaisonRegistry;
    const issues = [...M().brokenReferences(draft), ...M().layoutIssues(draft, R)];
    const targets = {
      popup: (draft.popups || []).map((p) => ({ id: p.id, name: p.name || p.id })),
      page: (draft.pages || []).map((p) => ({ id: p.id, name: p.name || p.id })),
      template: ((draft.notifications || {}).templates || []).map((t) => ({ id: t.id, name: t.name || t.id })),
    };
    const choice = issues.map(() => 'remove');
    const rows = issues.map((x, i) => {
      const sel = h('select', { 'data-k': 'repair-choice', 'data-index': String(i), 'aria-label': `Repair: ${x.name} — ${x.label}`, onchange: (e) => { choice[i] = e.target.value; } }, x.kind === 'layout'
        ? [h('option', { value: 'remove', text: 'Move it left so it fits' })]
        : [h('option', { value: 'remove', text: x.kind === 'template' ? 'Remove this rule' : 'Remove the link (does nothing)' }),
          ...targets[x.kind].map((t) => h('option', { value: `to:${t.id}`, text: `Open ${KIND[x.kind]} “${t.name}” instead` }))]);
      const where = x.where === 'popup-settings' ? `Popup “${x.ownerName}” · its settings` : x.where === 'rule' ? 'Notifications' : `${x.where === 'page' ? 'Page' : 'Popup'} “${x.ownerName}” · ${x.type} “${x.name}”`;
      return h('li', { class: 'ed-repair__row', 'data-k': 'repair-issue', 'data-path': x.path }, [
        h('div', { class: 'ed-repair__what' }, [h('b', { text: where }), h('span', { text: x.kind === 'layout' ? `${x.label}: it runs past the right edge of the grid (${x.ref}).` : `${x.label}: the ${KIND[x.kind]} “${x.ref}” does not exist in this dashboard.` }), h('code', { text: x.path })]),
        sel,
      ]);
    });
    const err = h('p', { class: 'ed-repair__err', role: 'alert', hidden: true });
    const apply = h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'repair-apply', onclick: () => {
      const fixed = structuredClone(model), list = [...M().brokenReferences(fixed), ...M().layoutIssues(fixed, R)];
      // the same issues, in the same order (the copy is read the same way); a relink sets the target, else the harmless clear / the fit
      list.forEach((x, i) => { const c = choice[i] || 'remove'; if (x.kind === 'layout') x.fix(); else if (c.startsWith('to:')) x.set(c.slice(3)); else x.clear(); });
      if (M().brokenReferences(fixed).length || M().layoutIssues(fixed, R).length) { err.hidden = false; err.textContent = 'Some problems could not be repaired.'; return; }
      onApply && onApply(fixed);
    } }, h('span', { text: applyText }));
    const box = h('section', { class: 'ed-repair', 'data-k': 'repair', role: 'region', 'aria-label': title }, [
      h('h2', { text: title }),
      intro ? h('p', { class: 'ed-hint', text: intro }) : null,
      h('ol', { class: 'ed-repair__list' }, rows),
      h('p', { class: 'ed-hint', text: 'Everything else in the dashboard stays exactly as it is. Nothing is stored until you save.' }),
      err,
      h('div', { class: 'ed-repair__btns' }, [cancelText ? h('button', { type: 'button', class: 'ed-btn', 'data-k': 'repair-cancel', onclick: () => onCancel && onCancel() }, h('span', { text: cancelText })) : null, apply]),
    ]);
    box.issues = issues.length;
    return box;
  }

  global.IniqRepair = { view };
})(window);
