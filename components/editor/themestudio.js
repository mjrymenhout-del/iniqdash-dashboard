/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   THEME STUDIO — the dashboard's visual theme designer (data model: components/theme/theme.js).

   IniqThemeStudio.create(ctx) → { openGallery(), openEditor(id), importTheme(text), exportTheme(t), preview(id), cancelPreview(), apply(id) }
     ctx = { root, app(): the dashboard's app object (themes, theme), mutate(label, fn), applyAppTheme(), surfaces(): [the elements the
             dashboard theme is applied on], say(text), R (MaisonRegistry), svg(name), uniqueId(list, name), overrides(): [{ id, name, page }],
             clearOverride(id) }

   GALLERY   every theme as a card: a thumbnail drawn WITH the theme (a small dashboard), its name, Dark / Light, its palette and
             Preview · Apply · Duplicate (+ Edit · Rename · Export · Delete for your own). Built-in themes are read-only — duplicate
             one to customise it. IniqDash Original is the look with no theme at all (deleting app.theme), so it is always exact and
             always recoverable. PREVIEW shows a theme on the real dashboard with a bar "Previewing … · Apply · Cancel": nothing is
             stored, Cancel puts the applied theme back.
   EDITOR    three panes, like the widget / popup / notification editors: the properties in collapsible sections (the shared form:
             colour, image, slider + number, select controls) · a realistic live preview built from real components (navigation dock,
             device cards, panel, button, toggles, slider, text, status) at desktop / tablet / mobile width · a panel about the
             selected element. Click anything in the preview → its section opens and the properties that colour it are listed.
             Focus a property → every element it changes is outlined in the preview (measured, not guessed: the property is set to a
             probe value for an instant and the computed styles are compared). Changes show at once (preview and, unless switched
             off, the dashboard); the header says which theme is edited and whether there are unsaved changes; Cancel restores.
   ========================================================================== */
(function (global) {
  'use strict';
  const T = () => global.MaisonTheme;
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
  const PROBE = '#ff00fe', PROBE2 = '#00ff01';
  const KEYS = ['id', 'name', 'base', 'dark', 'tokens', 'look', 'background'];
  /** a theme's stored form (only valid parts; tokens always present) */
  const stored = (t) => { const c = T().clean(t) || {}; const o = {}; KEYS.forEach((k) => { if (c[k] !== undefined) o[k] = structuredClone(c[k]); }); o.tokens = o.tokens || {}; return o; };
  const body = (t) => { const o = stored(t); delete o.id; delete o.name; delete o.base; return o; };     // what the form edits

  function create(ctx) {
    const A = () => ctx.app();
    const LIB = () => { const a = A(); a.themes = Array.isArray(a.themes) ? a.themes : []; return a.themes; };
    const builtins = () => T().BUILTINS;
    const builtin = (id) => builtins().find((b) => b.id === id) || null;
    const own = (id) => LIB().find((t) => t.id === id) || null;
    const byId = (id) => own(id) || builtin(id);
    const appliedId = () => (A().theme && A().theme.id) || 'iniqdash';
    const appliedName = () => { const t = A().theme; if (!t) return builtin('iniqdash').name; return (byId(t.id) || t).name || t.id; };
    const css = () => getComputedStyle(document.documentElement);
    const tokenValue = (t, k) => (t.tokens && t.tokens[k]) || css().getPropertyValue(`--${k}`).trim();

    /* ---------------------------------------------------------------- apply / preview on the dashboard */
    function onDashboard(theme) { T().setActive(theme, ctx.surfaces()); }
    function apply(id) {
      const t = byId(id); if (!t) return false;
      ctx.mutate(id === 'iniqdash' ? 'IniqDash Original' : 'apply theme', () => { if (id === 'iniqdash') delete A().theme; else A().theme = { ...stored(t), id: t.id, name: t.name }; });
      ctx.applyAppTheme();
      ctx.say(id === 'iniqdash' ? 'IniqDash Original — the dashboard\'s own look' : `Theme “${t.name}” applied to the whole dashboard`);
      return true;
    }
    let pbar = null;
    function cancelPreview(silent) {
      if (!pbar) return;
      pbar.remove(); pbar = null; ctx.applyAppTheme();
      if (!silent) ctx.say(`Preview ended — back to “${appliedName()}”`);
    }
    /** show a theme on the real dashboard without applying it: a bar says so and offers Apply / Cancel (Escape = Cancel) */
    function preview(id, back) {
      const t = byId(id); if (!t) return;
      cancelPreview(true);
      onDashboard(id === 'iniqdash' ? null : t);
      const done = (applyIt) => { const b = back; if (applyIt) { pbar.remove(); pbar = null; apply(id); } else cancelPreview(); if (b) b(); };
      pbar = h('div', { class: 'tsg-pbar', role: 'region', 'aria-label': 'Theme preview', 'data-k': 'theme-preview-bar' }, [
        h('span', { class: 'tsg-pbar__t' }, [h('b', { text: `Previewing “${t.name}”` }), h('span', { text: ` — not applied. Your dashboard uses “${appliedName()}”.` })]),
        h('button', { type: 'button', class: 'ed-btn', 'data-k': 'theme-preview-cancel', onclick: () => done(false) }, h('span', { text: 'Cancel' })),
        h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'theme-preview-apply', onclick: () => done(true) }, h('span', { text: 'Apply this theme' })),
      ]);
      pbar.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(false); });
      ctx.root.append(pbar);
      pbar.querySelector('[data-k="theme-preview-apply"]').focus();
    }

    /* ---------------------------------------------------------------- library */
    function add(base, name) {
      const lib = LIB();
      if (lib.length >= 20) { ctx.say('A dashboard holds at most 20 themes', 'warn'); return null; }
      const root = String(name || 'My theme').replace(/[<>]/g, '').slice(0, 54).trim() || 'My theme';
      let nm = root, n = 2;
      while (lib.some((t) => t.name === nm) || builtins().some((b) => b.name === nm)) nm = `${root} ${n++}`;
      const t = { ...body(base || {}), id: ctx.uniqueId([...lib, ...builtins()], nm), name: nm };
      if (base && base.id && builtin(base.id)) t.base = base.id; else if (base && base.base) t.base = base.base;
      ctx.mutate('add theme', () => { lib.push(t); });
      return t;
    }
    function remove(id) {
      const t = own(id); if (!t) return;
      ctx.mutate('delete theme', () => { A().themes = LIB().filter((x) => x !== t); });
    }
    function rename(id, name) {
      const t = own(id), nm = String(name || '').trim();
      if (!t || !nm || nm.length > 60 || /[<>]/.test(nm)) return 'A name of 1–60 characters, without < or >';
      if (LIB().some((x) => x !== t && x.name === nm) || builtins().some((b) => b.name === nm)) return 'Another theme already has this name';
      ctx.mutate('rename theme', () => { t.name = nm; if (A().theme && A().theme.id === t.id) A().theme.name = nm; });
      return '';
    }
    function exportTheme(t) {
      // only the theme's own values: an image is an IniqDash asset REFERENCE (no server path, no credential, no file)
      const blob = new Blob([JSON.stringify({ format: 'iniqdash-theme', version: 2, theme: { ...stored(t), id: t.id, name: t.name } }, null, 2)], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `${t.id}.iniqdash-theme.json` });
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
      ctx.say(`Exported “${t.name}”`);
    }
    /** an imported file: { format: 'iniqdash-theme', theme } or a plain theme — refused unless EVERY part is valid (no CSS, no
        script, no outside address, no unknown property); the server checks it again on save */
    function importTheme(text) {
      let d; try { d = JSON.parse(String(text)); } catch (e) { return { ok: false, message: 'Not a theme file (not valid JSON).' }; }
      const th = d && d.format === 'iniqdash-theme' ? d.theme : d;
      const errs = T().check(th, 'theme');
      if (errs.length) return { ok: false, message: `Not imported: ${errs[0]}` };
      const t = add(th, th.name || 'Imported theme');
      return t ? { ok: true, theme: t } : { ok: false, message: 'Not imported: the library is full (20 themes).' };
    }

    /* ---------------------------------------------------------------- thumbnails: a small dashboard drawn with the theme */
    function thumb(t) {
      const card = (cls, kids) => h('i', { class: `tsg-th__card ${cls || ''}` }, kids);
      const el = h('div', { class: 'tsg-th', 'aria-hidden': 'true' }, [
        h('i', { class: 'tsg-th__nav' }, [h('i', { class: 'is-on' }), h('i'), h('i')]),
        h('i', { class: 'tsg-th__canvas' }, [
          h('i', { class: 'tsg-th__title' }),
          card('', [h('i', { class: 'tsg-th__l1' }), h('i', { class: 'tsg-th__l2' }), h('i', { class: 'tsg-th__btn' })]),
          card('', [h('i', { class: 'tsg-th__l1' }), h('i', { class: 'tsg-th__track' }, h('i'))]),
          card('tsg-th__card--wide', [h('i', { class: 'tsg-th__l2' }), h('i', { class: 'tsg-th__dots' }, [h('i', { class: 'is-ok' }), h('i', { class: 'is-warn' }), h('i', { class: 'is-bad' })])]),
        ]),
      ]);
      if (t.id !== 'iniqdash') T().apply(el, t);
      return el;
    }
    const palette = (t) => h('span', { class: 'tsg-pal', 'aria-label': 'Palette' }, ['page-bg', 'device-surface-mid', 'text-primary', 'accent', 'success', 'warning', 'danger']
      .map((k) => h('i', { title: `${T().LABEL[k] || k}: ${tokenValue(t, k)}`, style: `background:${tokenValue(t, k)}` })));

    /* ---------------------------------------------------------------- gallery */
    let gallery = null;
    function openGallery(note) {
      if (gallery && gallery.dlg.open) gallery.close(false);
      const shell = global.MaisonConfigure.modal({ mount: ctx.root, cls: 'is-edit ed-dlg--tgal', title: 'Themes', cancelText: 'Close' });
      gallery = shell;
      const msg = h('p', { class: 'ed-hint tsg-msg', 'data-k': 'themes-msg', role: 'status', 'aria-live': 'polite', text: note || '' });
      const head = h('div', { class: 'tsg-head' });
      const builtGrid = h('div', { class: 'tsg-grid', 'data-k': 'themes-builtin' });
      const ownGrid = h('ol', { class: 'tsg-grid', 'data-k': 'themes-list' });
      const overrides = h('div', { class: 'tsg-ovr', 'data-k': 'theme-overrides' });
      const reopen = (m) => openGallery(m);
      const B = (label, k, fn, cls = 'ed-btn ed-btn--sm', t = null) => h('button', { type: 'button', class: cls, 'data-k': k, 'aria-label': t ? `${label} ${t.name}` : label, onclick: fn }, h('span', { text: label }));
      const cardOf = (t, isBuiltin) => {
        const applied = appliedId() === t.id, dark = T().isDark(t);
        const nameBox = h('span', { class: 'tsg-card__name' }, [h('b', { text: t.name })]);
        const btns = h('span', { class: 'tsg-card__btns' }, [
          B('Preview', 'theme-preview', () => { shell.close(false); preview(t.id, () => reopen(appliedId() === t.id ? `Applied “${t.name}”` : `Back to “${appliedName()}”`)); }, 'ed-btn ed-btn--sm', t),
          B(applied ? 'Applied' : 'Apply', 'theme-apply', () => { apply(t.id); fill(); msg.textContent = `Applied “${t.name}”`; }, applied ? 'ed-btn ed-btn--sm is-on' : 'ed-btn ed-btn--sm ed-btn--primary', t),
          B('Duplicate', 'theme-duplicate', () => { const c = add(t, `${t.name} copy`); if (c) { fill(); msg.textContent = `Duplicated as “${c.name}” — Edit it to make it yours`; } }, 'ed-btn ed-btn--sm', t),
          ...(isBuiltin ? [] : [
            B('Edit', 'theme-edit', () => { shell.close(false); openEditor(t.id); }, 'ed-btn ed-btn--sm', t),
            B('Rename', 'theme-rename', () => {
              const inp = h('input', { type: 'text', value: t.name, maxlength: '60', 'data-k': 'theme-rename-input', 'aria-label': `New name for ${t.name}` });
              const ok = () => { const e = rename(t.id, inp.value); if (e) { msg.textContent = e; inp.focus(); return; } fill(); msg.textContent = `Renamed to “${t.name}”`; };
              inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fill(); } });
              nameBox.replaceChildren(inp); inp.focus(); inp.select();
            }, 'ed-btn ed-btn--sm', t),
            B('Export', 'theme-export', () => exportTheme(t), 'ed-btn ed-btn--sm', t),
            (() => { const del = h('button', { type: 'button', class: 'ed-mini-btn ed-mini-btn--danger', 'data-k': 'theme-delete', 'aria-label': `Delete ${t.name}`, title: 'Delete (press twice)' }, ctx.svg('trash'));
              del.addEventListener('click', () => ctx.confirmStep(del, '', () => { remove(t.id); fill(); msg.textContent = `Deleted “${t.name}”${applied ? ' — the dashboard keeps its look until you apply another theme' : ''}`; }, true)); return del; })(),
          ]),
        ]);
        return h(isBuiltin ? 'div' : 'li', { class: `tsg-card${applied ? ' is-applied' : ''}`, 'data-theme': t.id, 'data-builtin': String(isBuiltin) }, [
          thumb(t),
          h('span', { class: 'tsg-card__meta' }, [nameBox,
            h('span', { class: 'tsg-tags' }, [h('span', { class: `tsg-tag tsg-tag--${dark ? 'dark' : 'light'}`, 'data-k': 'theme-kind', text: dark ? 'Dark' : 'Light' }),
              h('span', { class: 'tsg-tag', text: isBuiltin ? 'Built-in · read-only' : 'Yours' }), applied ? h('span', { class: 'tsg-tag tsg-tag--on', text: 'Applied' }) : null]),
            palette(t)]),
          btns]);
      };
      function fill() {
        head.replaceChildren(...[h('p', { class: 'tsg-applied', 'data-k': 'themes-applied' }, [h('span', { text: 'Your dashboard uses ' }), h('b', { text: appliedName() })]),
          appliedId() !== 'iniqdash' ? B('Back to IniqDash Original', 'theme-default', () => { apply('iniqdash'); fill(); msg.textContent = 'Back to IniqDash Original'; }) : null].filter(Boolean));
        builtGrid.replaceChildren(...builtins().map((t) => cardOf(t, true)));
        ownGrid.replaceChildren(...LIB().map((t) => cardOf(t, false)));
        if (!LIB().length) ownGrid.replaceChildren(h('li', { class: 'ed-hint tsg-empty', text: 'No themes of your own yet. Duplicate a built-in theme (or start a new one) — then edit it in the Theme Studio.' }));
        const ov = ctx.overrides();
        overrides.replaceChildren(...(ov.length ? [h('h4', { text: 'Widget overrides' }), h('p', { class: 'ed-hint', text: 'These widgets carry theme colours of their own, which win over the dashboard theme for that widget only.' }),
          h('ul', {}, ov.map((o) => h('li', {}, [h('span', { text: `${o.name} · ${o.page}` }), B('Use Theme Default', 'theme-override-reset', () => { ctx.clearOverride(o.id); fill(); msg.textContent = `“${o.name}” follows the theme again`; }, 'ed-btn ed-btn--sm')])))] : []));
      }
      const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'data-k': 'theme-import-file' });
      file.addEventListener('change', async () => { const f = file.files && file.files[0]; file.value = ''; if (!f) return; const r = importTheme(await f.text()); msg.textContent = r.ok ? `Imported “${r.theme.name}”` : r.message; fill(); });
      fill();
      shell.body.append(h('div', { class: 'tsg' }, [
        h('p', { class: 'ed-hint', text: 'A theme sets the dashboard\'s colours, cards, typography, controls and background. Preview one on your dashboard before applying it; IniqDash Original is always one click away.' }),
        head,
        h('div', { class: 'tsg-tools' }, [
          h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'theme-new', onclick: () => { const t = add(builtin('iniqdash'), 'My theme'); if (t) { shell.close(false); openEditor(t.id); } } }, [ctx.svg('plus'), h('span', { text: 'New theme' })]),
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'theme-import', onclick: () => file.click() }, h('span', { text: 'Import…' })), file]),
        msg,
        h('h4', { class: 'tsg-h', text: 'Built-in themes' }), builtGrid,
        h('h4', { class: 'tsg-h', text: 'My themes' }), ownGrid,
        overrides,
      ]));
      shell.foot.append(h('button', { type: 'button', class: 'ed-btn', onclick: () => shell.close(false) }, h('span', { text: 'Done' })));
      return shell.dlg;
    }

    /* ---------------------------------------------------------------- the EDITOR */
    const REGION = {   // what a click in the preview selects → the section it opens
      canvas: ['Dashboard background', 'page'], nav: ['Navigation', 'nav'], navActive: ['Selected page', 'nav'], card: ['Card', 'surfaces'], panel: ['Panel / container', 'surfaces'],
      button: ['Button', 'controls'], control: ['Control button', 'controls'], slider: ['Slider', 'controls'], heading: ['Heading', 'text'], text: ['Text', 'text'], status: ['Status', 'status'],
    };
    function stage() {
      const R = ctx.R, icons = (R.icons && R.icons()) || {};
      const real = (type, cfg, tsel, label, cls = '') => {
        const box = h('div', { class: `tst-tile tst-tile--${type} ${cls}`, 'data-tsel': tsel, 'data-tlabel': label });
        try { box.append(R.instantiate(type, R.previewSafe(type, R.fullConfig(type, cfg)))); } catch (e) { box.append(h('div', { class: 'tst-miss', text: label })); }
        return box;
      };
      const dock = global.MaisonApp.createDock({ items: [['home', 'Home'], ['lights', 'Lights'], ['climate', 'Climate'], ['energy', 'Energy']].map(([id, label]) => ({ id, label, icon: icons[id] || icons.home || '' })), active: 'home', label: 'Preview pages' });
      dock.dataset.tsel = 'nav'; dock.dataset.tlabel = 'Navigation';
      const cur = dock.querySelector('[aria-current="page"]'); if (cur) { cur.dataset.tsel = 'navActive'; cur.dataset.tlabel = 'Selected page'; }
      const panel = global.MaisonContainer.create({ title: 'Living room', subtitle: '3 lights on · 21 °C', status: { text: 'All good', tone: 'success' }, content: [h('p', { class: 'tst-panel__txt', 'data-tsel': 'text', 'data-tlabel': 'Secondary text', text: 'Panel text in the secondary colour.' })] });
      panel.dataset.tsel = 'panel'; panel.dataset.tlabel = 'Panel / container';
      const head = h('header', { class: 'tst-head' }, [h('h2', { class: 'ed-dash-title', 'data-tsel': 'heading', 'data-tlabel': 'Dashboard heading', text: 'Home' }),
        h('p', { class: 'tst-sub', 'data-tsel': 'text', 'data-tlabel': 'Secondary text', text: 'Good morning · 4 devices on' })]);
      const states = h('div', { class: 'tst-states', 'data-tsel': 'status', 'data-tlabel': 'Status colours' }, [['success', 'Active'], ['neutral', 'Inactive'], ['info', 'Info'], ['warning', 'Warning'], ['danger', 'Error'], ['neutral', 'Unavailable']]
        .map(([tone, label]) => h('span', { class: 'tst-state', style: `--tst-c: var(--${tone})`, 'data-tsel': 'status', 'data-tlabel': `Status: ${label}` }, [h('i'), h('span', { text: label })])));
      // controls: the shared control buttons (on / off, button and switch styles), the shared slider, a primary action
      const cb = (on, style, icon, label) => { const b = global.IniqControls.button({ label }); b.control.update({ icon, style, size: 42, color: 'accent' }, { on }); b.tabIndex = -1; return b; };
      const sl = global.IniqSlider.create({ label: 'Preview slider' }); sl.slider.update({ value: 65, min: 0, max: 100 }); sl.tabIndex = -1;
      const controls = h('div', { class: 'tst-controls', 'data-tsel': 'card', 'data-tlabel': 'Controls card' }, [
        h('div', { class: 'tst-controls__row' }, [cb(true, 'filled', 'mdi:lightbulb', 'On'), cb(false, 'filled', 'mdi:lightbulb-outline', 'Off'), cb(true, 'switch', 'mdi:power', 'Switch on'), cb(false, 'switch', 'mdi:power', 'Switch off')]),
        h('div', { class: 'tst-controls__slider', 'data-tsel': 'slider', 'data-tlabel': 'Slider' }, sl),
        h('div', { class: 'tst-controls__row' }, [h('span', { class: 'tst-pbtn', 'data-tsel': 'button', 'data-tlabel': 'Primary button (accent)', text: 'Primary' }), h('span', { class: 'tst-sbtn', 'data-tsel': 'button', 'data-tlabel': 'Secondary button', text: 'Secondary' })]),
      ]);
      const grid = h('div', { class: 'tst-grid' }, [
        real('light', { name: 'Desk lamp' }, 'card', 'Light card'),
        real('climate', { name: 'Living room' }, 'card', 'Climate card', 'tst-tile--tall'),
        real('button', { text: 'Evening', action: 'none' }, 'button', 'Button'),
        real('sensor', { name: 'Humidity' }, 'card', 'Sensor card'),
        h('div', { class: 'tst-tile' }, controls),
        h('div', { class: 'tst-tile tst-tile--panel' }, panel),
        h('div', { class: 'tst-tile tst-tile--wide' }, states),
      ]);
      const canvas = h('div', { class: 'tst-canvas', 'data-tsel': 'canvas', 'data-tlabel': 'Dashboard background' }, [head, grid]);
      const hl = h('div', { class: 'tst-hl', 'aria-hidden': 'true' });
      const pv = h('div', { class: 'tst-pv', 'data-k': 'theme-preview', 'data-size': 'desktop' }, [h('div', { class: 'tst-shell' }, [dock, canvas]), hl]);
      // tag what the shared controls / sliders are, so a click names them
      pv.querySelectorAll('.iqc-btn').forEach((n) => { n.dataset.tsel = 'control'; n.dataset.tlabel = 'Control button'; });

      return { pv, hl, canvas };
    }

    let editing = null;
    function openEditor(id) {
      const t = own(id);
      if (!t) { const b = builtin(id); if (b) ctx.say(`“${b.name}” is built in (read-only) — duplicate it to customise it`, 'warn'); return null; }
      if (editing && editing.dlg.open) editing.close(true);
      cancelPreview(true);
      const M = T(), R = ctx.R;
      const saved = () => JSON.stringify(body(t));
      let draft = body(t), live = true, selKey = null;
      const nameIn = h('input', { type: 'text', value: t.name, maxlength: '60', 'data-k': 'theme-name', 'aria-label': 'Theme name' });
      const titleEl = h('h3', { 'data-k': 'theme-editing' });
      const state = h('span', { class: 'tst-state-chip', 'data-k': 'theme-dirty', role: 'status' });
      const titles = h('div', { class: 'ecfg-titles tst-titles' }, [titleEl, state, h('span', { class: 'tst-applied', 'data-k': 'theme-applied-note' })]);
      const shell = global.MaisonConfigure.modal({ mount: ctx.root, cls: 'is-edit ed-dlg--tstudio', titles, onCancel: () => { ctx.applyAppTheme(); ctx.say(`Closed without saving — “${t.name}” is unchanged`); } });
      editing = shell;
      const form = global.MaisonForm.create({ type: 'theme', config: draft, onChange: (c) => { draft = c; refresh(); } });
      const err = h('p', { class: 'ef-err', role: 'alert', hidden: true });
      const { pv, hl, canvas } = stage();
      const sizes = h('div', { class: 'tst-sizes', role: 'group', 'aria-label': 'Preview size' }, [['desktop', 'Desktop'], ['tablet', 'Tablet'], ['mobile', 'Mobile']].map(([v, l]) =>
        h('button', { type: 'button', class: `ed-btn ed-btn--sm${v === 'desktop' ? ' is-on' : ''}`, 'data-k': `theme-size-${v}`, 'aria-pressed': String(v === 'desktop'), onclick: (e) => {
          pv.dataset.size = v; sizes.querySelectorAll('button').forEach((b) => { b.classList.toggle('is-on', b === e.currentTarget); b.setAttribute('aria-pressed', String(b === e.currentTarget)); }); requestAnimationFrame(() => highlight(selKey)); } }, h('span', { text: l }))));
      const liveBtn = h('button', { type: 'button', class: 'ed-btn ed-btn--sm is-on', 'data-k': 'theme-live', 'aria-pressed': 'true', title: 'Show the unsaved theme on your dashboard too', onclick: () => {
        live = !live; liveBtn.classList.toggle('is-on', live); liveBtn.setAttribute('aria-pressed', String(live)); liveBtn.querySelector('span').textContent = live ? 'Also on my dashboard' : 'Preview only'; if (live) onDashboard(draftTheme()); else ctx.applyAppTheme(); } }, h('span', { text: 'Also on my dashboard' }));
      const info = h('aside', { class: 'tst-info', 'data-k': 'theme-info', 'aria-label': 'Selected element' });
      const contrast = h('p', { class: 'ecfg-pv__note tst-contrast', 'data-k': 'theme-contrast', role: 'status' });
      shell.body.append(h('div', { class: 'tst' }, [
        h('div', { class: 'tst-props' }, [h('label', { class: 'ef-field ef-field--text tst-name' }, [h('span', { class: 'ef-label', text: 'Theme name' }), nameIn]), err, form.el]),
        h('div', { class: 'tst-centre' }, [h('div', { class: 'tst-bar' }, [sizes, liveBtn, h('span', { class: 'ed-hint', text: 'Click anything in the preview to find its properties.' })]),
          h('div', { class: 'tst-pvwrap' }, pv), contrast]),
        info,
      ]));
      const draftTheme = () => ({ ...draft, id: t.id, name: nameIn.value.trim() || t.name });
      function refresh() {
        M.clear(pv); M.apply(pv, draftTheme());
        if (live) onDashboard(draftTheme());
        const dirty = JSON.stringify(body(draftTheme())) !== saved() || (nameIn.value.trim() && nameIn.value.trim() !== t.name);
        titleEl.textContent = `Theme Studio · editing “${nameIn.value.trim() || t.name}”`;
        state.textContent = dirty ? 'Unsaved changes' : 'Saved'; state.dataset.dirty = String(!!dirty);
        shell.dlg.querySelector('[data-k="theme-applied-note"]').textContent = appliedId() === t.id ? 'Applied to this dashboard' : `Your dashboard uses “${appliedName()}” — Cancel returns to it`;
        const val = (k) => tokenValue(draftTheme(), k);
        const pairs = [['Text on cards', 'text-primary', 'device-surface-mid'], ['Text on the page', 'text-primary', 'page-bg'], ['Secondary text on cards', 'text-secondary', 'device-surface-mid'], ['Text on the accent', 'accent-on', 'accent']];
        contrast.textContent = `Readability (WCAG contrast): ${pairs.map(([l, a, b]) => { const r = M.contrast(val(a), val(b)); return `${l} ${r === null ? '—' : `${r}:1${r < 4.5 ? ' ⚠' : ''}`}`; }).join(' · ')}`;
        contrast.dataset.warn = String(/⚠/.test(contrast.textContent));
        if (selKey) requestAnimationFrame(() => highlight(selKey, true));
      }
      nameIn.addEventListener('input', refresh);

      /* ---- AFFECTED ELEMENTS: set one property to a probe value, compare every element's computed look, put it back */
      const PROPS = ['color', 'background-color', 'background-image', 'border-top-color', 'box-shadow', 'outline-color', 'fill', 'stroke', 'font-family', 'font-weight', 'font-size', 'border-top-left-radius', 'backdrop-filter', 'opacity', 'text-shadow'];
      const ownText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || e instanceof SVGElement;
      const read = (els) => els.map((e) => { const c = getComputedStyle(e); return PROPS.map((p, i) => (i === 0 && !ownText(e) ? '' : c.getPropertyValue(p))).join('|'); });
      const probeOf = (key) => {
        const d = structuredClone(draftTheme()), L = d.look || (d.look = {}), cur = (k) => L[k];
        if (key.startsWith('tokens.')) { const k = key.slice(7); d.tokens = { ...(d.tokens || {}), [k]: tokenValue(draftTheme(), k).toLowerCase() === PROBE ? PROBE2 : PROBE }; return d; }
        const flip = { 'look.radius': () => { L.radius = (cur('radius') ?? 16) > 20 ? 2 : 31; }, 'look.borderWidth': () => { L.borderWidth = cur('borderWidth') === 3 ? 0 : 3; },
          'look.shadow': () => { L.shadow = cur('shadow') === 'none' ? 'strong' : 'none'; }, 'look.shadowStrength': () => { L.shadowStrength = (cur('shadowStrength') ?? 100) > 50 ? 0 : 150; L.shadow = L.shadow || 'standard'; },
          'look.surfaceAlpha': () => { L.surfaceAlpha = (cur('surfaceAlpha') ?? 100) > 60 ? 45 : 100; }, 'look.blur': () => { L.blur = cur('blur') ? 0 : 12; }, 'look.glass': () => { L.glass = !cur('glass'); },
          'look.font': () => { L.font = cur('font') === 'mono' ? 'serif' : 'mono'; }, 'look.titleWeight': () => { L.titleWeight = (cur('titleWeight') ?? 700) >= 700 ? 500 : 800; },
          'look.textScale': () => { L.textScale = (cur('textScale') ?? 1) > 1 ? 0.9 : 1.15; }, 'look.glow': () => { L.glow = cur('glow') ? 0 : 80; } };
        if (flip[key]) { flip[key](); return d; }
        return null;
      };
      function affected(key) {
        if (/^(background\.|bg)/.test(key)) return [canvas];
        const probe = probeOf(key); if (!probe) return [];
        const els = [pv, ...pv.querySelectorAll('*')].filter((e) => !hl.contains(e));
        pv.classList.add('is-probing');
        const a = read(els); M.clear(pv); M.apply(pv, probe); const b = read(els); M.clear(pv); M.apply(pv, draftTheme());
        pv.classList.remove('is-probing');
        const set = els.filter((e, i) => a[i] !== b[i]).filter((e) => { const r = e.getBoundingClientRect(); return r.width >= 4 && r.height >= 4; });
        return set.filter((e) => !set.some((o) => o !== e && o !== pv && o.contains(e)));    // the outermost changed elements
      }
      function draw(els, cls) {
        const base = pv.getBoundingClientRect();
        els.forEach((e) => { const r = e.getBoundingClientRect(); hl.append(h('i', { class: cls, style: `left:${r.left - base.left}px;top:${r.top - base.top}px;width:${r.width}px;height:${r.height}px` })); });
      }
      let selEl = null;
      function highlight(key, quiet) {
        hl.replaceChildren();
        if (selEl && selEl.isConnected) draw([selEl], 'is-sel');
        if (!key) return 0;
        const els = affected(key);
        draw(els.filter((e) => e !== pv), 'is-hit');
        pv.dataset.affected = String(els.length);
        if (!quiet) affectInfo(key, els.length);
        return els.length;
      }
      const fieldOf = (key) => form.el.querySelector(`[data-key="${CSS.escape(key)}"]`);
      const labelOf = (key) => { const f = fieldOf(key); const l = f && f.querySelector('.ef-label'); return (l && l.textContent) || key; };
      function reveal(key) {
        const f = fieldOf(key); if (!f) return;
        const d = f.closest('details'); if (d) d.open = true;
        f.scrollIntoView({ block: 'center', behavior: 'smooth' });
        f.classList.add('is-flash'); setTimeout(() => f.classList.remove('is-flash'), 1200);
        selKey = key; highlight(key);
      }
      function affectInfo(key, n) {
        const tok = key.startsWith('tokens.') ? key.slice(7) : null;
        const box = info.querySelector('.tst-info__prop') || h('div', { class: 'tst-info__prop' });
        box.replaceChildren(h('h4', { text: 'Selected property' }), h('p', { class: 'tst-info__name', 'data-k': 'theme-selected-prop', text: labelOf(key) }),
          h('p', { class: 'ed-hint', text: tok ? T().USES[tok] || '' : (fieldOf(key) && fieldOf(key).querySelector('.ef-help') || {}).textContent || '' }),
          h('p', { class: 'tst-info__count', 'data-k': 'theme-affected', text: n ? `Outlined in the preview: ${n} place${n === 1 ? '' : 's'} it changes.` : 'Nothing in this preview uses it.' }));
        if (!box.isConnected) info.append(box);
      }
      /* ---- CLICK TO SELECT: what was clicked, its section, and the properties that colour it */
      function select(target) {
        const regionEl = target.closest('[data-tsel]') || canvas, region = regionEl.dataset.tsel, [rname, section] = REGION[region] || REGION.canvas;
        selEl = regionEl === pv ? canvas : regionEl;
        const d = form.el.querySelector(`details[data-group="${section}"]`); if (d) { d.open = true; d.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
        // which properties change THIS element (or the clicked part of it)
        const els = [target, regionEl].filter((x, i, a) => a.indexOf(x) === i);
        pv.classList.add('is-probing');
        const a = read(els), hits = [];
        const keys = [...M.TOKENS.map((k) => `tokens.${k}`), 'look.radius', 'look.shadow', 'look.borderWidth', 'look.font', 'look.surfaceAlpha'];
        keys.forEach((key) => { const p = probeOf(key); if (!p) return; M.clear(pv); M.apply(pv, p); if (read(els).some((v, i) => v !== a[i])) hits.push(key); });
        M.clear(pv); M.apply(pv, draftTheme());
        pv.classList.remove('is-probing');
        if (region === 'canvas') hits.unshift('background.image', 'bgGradient');
        selKey = null; highlight(null);
        const list = h('ul', { class: 'tst-info__list', 'data-k': 'theme-element-props' }, hits.filter((k) => fieldOf(k)).map((k) => {
          const tok = k.startsWith('tokens.') ? k.slice(7) : null, v = tok ? (draft.tokens && draft.tokens[tok]) : null;
          return h('li', {}, h('button', { type: 'button', class: 'tst-info__row', 'data-key': k, onclick: () => reveal(k) }, [
            tok ? h('i', { class: 'tst-info__sw', style: `background:${tokenValue(draftTheme(), tok)}` }) : h('i', { class: 'tst-info__sw tst-info__sw--look' }),
            h('span', { text: labelOf(k) }), h('small', { text: tok ? (v ? 'custom' : 'theme default') : '' })]));
        }));
        const top = h('div', { class: 'tst-info__sel' }, [h('h4', { text: 'Selected element' }), h('p', { class: 'tst-info__name', 'data-k': 'theme-selected', text: regionEl.dataset.tlabel || rname }),
          h('p', { class: 'ed-hint', text: `Section: ${rname === 'Dashboard background' ? 'Dashboard background' : (form.el.querySelector(`details[data-group="${section}"] .ef-acc__t`) || {}).textContent || section}. Its properties:` }), list]);
        info.replaceChildren(top);
      }
      pv.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); select(e.target); }, true);
      ['pointerdown', 'pointerup', 'dblclick', 'contextmenu', 'input', 'change'].forEach((ev) => pv.addEventListener(ev, (e) => { e.stopPropagation(); if (ev !== 'pointerdown') e.preventDefault(); }, true));
      form.el.addEventListener('focusin', (e) => { const f = e.target.closest('[data-key]'); if (f && f.dataset.key !== selKey) { selKey = f.dataset.key; highlight(selKey); } });
      form.el.addEventListener('click', (e) => { const f = e.target.closest('.ef-field[data-key]'); if (f && f.dataset.key !== selKey) { selKey = f.dataset.key; highlight(selKey); } });
      info.append(h('div', { class: 'tst-info__sel' }, [h('h4', { text: 'Selected element' }), h('p', { class: 'ed-hint', text: 'Click a card, a button, the navigation or the background in the preview.' })]));

      /* ---- Save / Cancel */
      const save = (andApply) => {
        const e = form.errors(), nm = nameIn.value.trim();
        if (!nm || nm.length > 60 || /[<>]/.test(nm)) { err.hidden = false; err.textContent = 'The theme needs a name of 1–60 characters, without < or >.'; nameIn.focus(); return; }
        if (LIB().some((x) => x !== t && x.name === nm) || builtins().some((b) => b.name === nm)) { err.hidden = false; err.textContent = 'Another theme already has this name.'; nameIn.focus(); return; }
        if (e.length) { form.el.querySelectorAll('details.ef-group--acc').forEach((d) => { if (e.some((x) => d.querySelector(`[data-key="${CSS.escape(x.key)}"]`))) d.open = true; }); form.showErrors(e); return; }
        const v = body({ ...form.value(), id: t.id });
        ctx.mutate('edit theme', () => {
          KEYS.forEach((k) => { if (!['id', 'name', 'base'].includes(k)) delete t[k]; });
          Object.assign(t, v, { name: nm });
          if (A().theme && A().theme.id === t.id) A().theme = { ...stored(t), id: t.id, name: t.name };          // the applied one follows
        });
        shell.close(false);
        if (andApply) apply(t.id); else ctx.applyAppTheme();
        ctx.say(`Saved theme “${t.name}”${appliedId() === t.id ? ' — the dashboard shows it' : ` — not applied (your dashboard uses “${appliedName()}”)`}`);
      };
      shell.foot.append(
        h('button', { type: 'button', class: 'ed-btn', 'data-k': 'def-cancel', onclick: () => shell.close(true) }, h('span', { text: 'Cancel' })),
        h('button', { type: 'button', class: 'ed-btn', 'data-k': 'theme-save', onclick: () => save(false) }, h('span', { text: 'Save' })),
        h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'apply-def', onclick: () => save(true) }, h('span', { text: appliedId() === t.id ? 'Save' : 'Save & apply' })));
      if (appliedId() === t.id) shell.foot.querySelector('[data-k="theme-save"]').remove();
      refresh();
      shell.dlg.studio = { highlight: (k) => { selKey = k; return highlight(k); }, select: (sel) => { const n = pv.querySelector(sel); if (n) select(n); return !!n; } };
      return shell.dlg;
    }

    return { openGallery, openEditor, importTheme, exportTheme, preview, cancelPreview, apply, add };
  }
  global.IniqThemeStudio = { create };
})(window);
