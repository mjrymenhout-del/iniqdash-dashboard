/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Schema form — renders the configuration fields a component declares in the registry.
   ONE form system for Add and Edit (no per-widget forms).

   MaisonForm.create({ type, config, onChange(config) }) → {        type: a widget type or an application
                                                                    definition (MaisonRegistry.DEFS: popup, notification)
     el,                 the form element
     value()             a copy of the draft config
     errors()            [{ key, message }] for the current draft (registry.validateConfig)
     showErrors(list?)   display messages next to their fields (+ a summary); [] clears
   }
   The form edits a DRAFT copy. It never touches the dashboard model: the caller decides when to
   apply (Apply) or drop (Cancel) it. All text goes through textContent / .value (never markup);
   icon previews use the component's own static icon markup.
   ========================================================================== */
(function (global) {
  'use strict';

  const R = () => global.MaisonRegistry;
  const HEX = /^#[0-9a-fA-F]{6}$/;                       // a custom colour: exactly #rrggbb
  const GROUPS = [
    ['identity', 'Identity', 'What is this?'],
    ['capability', 'Capabilities', 'What can it do or show? Controls only exist when switched on.'],
    ['actions', 'Actions', 'One section per action: what it shows and what it does.'],
    ['data', 'Demo data', 'Values and state — later supplied by Home Assistant.'],
    ['appearance', 'Appearance', 'How it looks.'],
    ['interactions', 'Interactions', 'What a tap, a double tap and a long press on the widget do.'],
    ['visibility', 'Visibility', 'Show or hide the widget from a Home Assistant state.'],
  ];
  let uid = 0;
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

  /* ---- IniqDash User Assets: upload one image (PNG / JPEG / WebP). The SERVER validates and stores it and answers with
     the reference the dashboard keeps ("api/asset.php?id=…"); signed-in session + CSRF token + same origin (gate.php). */
  const UPLOAD_MAX = 5 * 1024 * 1024;                   // the server's limit (server/UserAssets.php MAX_BYTES), checked first here
  const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const UPLOAD_MSG = {
    unsupported_type: 'Unsupported file: use a PNG, JPEG or WebP image',
    bad_dimensions: 'This image is too large in pixels (max 12000 px a side)',
    too_large: 'File too large: at most 5 MB',
    signed_out: 'Your session has expired — sign in again, then upload',
    upload_failed: 'Upload failed — please try again',
  };
  /* IMAGE LIBRARIES (IMAGE OWNERSHIP = WIDGET TYPE): the images uploaded for a widget type — api/asset_library.php?scope=<type>.
     References only; one request per type per page (refreshed after an upload). */
  const LIB = new Map();
  function loadLibrary(scope, force) {
    if (force) LIB.delete(scope);
    if (!LIB.has(scope)) {
      LIB.set(scope, fetch(`api/asset_library.php?scope=${encodeURIComponent(scope)}`, { credentials: 'same-origin', cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).then((d) => (d && d.ok && Array.isArray(d.items) ? d.items.map((x) => x && x.ref).filter((x) => typeof x === 'string' && /^api\/asset\.php\?id=[0-9a-f]{32}$/.test(x)) : []))
        .catch(() => { LIB.delete(scope); return []; }));
    }
    return LIB.get(scope);
  }
  function adoptImage(scope, ref) {
    LIB.delete(scope);
    return fetch('api/asset_library.php', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="iniqdash-csrf"]')?.content || '' }, body: JSON.stringify({ scope, ref }) }).catch(() => null);
  }
  async function uploadImage(file, scope = null) {
    if (!UPLOAD_TYPES.includes(file.type)) return { ok: false, message: UPLOAD_MSG.unsupported_type };
    if (file.size > UPLOAD_MAX) return { ok: false, message: UPLOAD_MSG.too_large };
    const fd = new FormData();
    fd.append('file', file, 'upload');                  // the original file name is not sent
    if (scope) fd.append('scope', scope);              // the widget type it is for: its image library
    let res;
    try {
      res = await fetch('api/asset_upload.php', { method: 'POST', body: fd, credentials: 'same-origin', cache: 'no-store',
        headers: { 'X-CSRF-Token': document.querySelector('meta[name="iniqdash-csrf"]')?.content || '' } });
    } catch (e) { return { ok: false, message: UPLOAD_MSG.upload_failed }; }
    if (res.status === 401 || res.status === 403) return { ok: false, message: UPLOAD_MSG.signed_out };
    let d = null;
    try { d = await res.json(); } catch (e) { /* not JSON: a server / proxy error page — never shown */ }
    if (res.ok && d && d.ok && typeof d.ref === 'string' && /^api\/asset\.php\?id=[0-9a-f]{32}$/.test(d.ref)) return { ok: true, ref: d.ref };
    const code = (d && typeof d.error === 'string' && UPLOAD_MSG[d.error]) ? d.error : res.status === 413 ? 'too_large' : res.status === 415 ? 'unsupported_type' : 'upload_failed';
    return { ok: false, message: UPLOAD_MSG[code] };
  }

  /* ---- THE SHARED SLIDER + NUMBER CONTROL (every continuous visual quantity: icon / value / label / text size, button size, gap,
     padding, tab height…): a range slider for fast visual adjustment + an editable number for an exact value + its unit (the number is
     typed without the unit). One implementation — every configurator uses it through the 'range' field type.
       rangeControl({ id, label, min, max, step, unit, auto, autoValue(), onInput(value) }) → { el, set(value), value() }
     · dragging the slider / typing a valid number calls onInput AT ONCE (the preview follows live); the two stay in sync
     · min / max / step are enforced: a typed value is used while it is within range, and normalised (clamped, rounded to the
       step) when the field is left or Enter is pressed; anything that is not a number restores the current value
     · auto (a label, e.g. 'Automatic'): the value may be absent — then the widget's own size applies (shown as the slider position
       autoValue() and the number field's placeholder); an "Auto" button returns to it. onInput(undefined) = automatic.
     · keyboard: the slider's arrows / Page / Home / End and the number's arrows (native); touch and mouse drag (native range). */
  function rangeControl({ id, label = 'Value', min = 0, max = 100, step = 1, unit = '', auto = null, autoValue = null, onInput } = {}) {
    const dec = (String(step).split('.')[1] || '').length;
    const norm = (n) => Math.min(max, Math.max(min, Number((Math.round((n - min) / step) * step + min).toFixed(dec))));
    let cur;
    const slider = h('input', { id, type: 'range', class: 'ef-range__s', min, max, step, 'aria-label': label });
    const num = h('input', { type: 'number', class: 'ef-range__n', min, max, step, inputmode: 'decimal', 'aria-label': `${label}${unit ? ` (${unit})` : ''}`, 'data-k': 'range-num' });
    const resetBtn = auto ? h('button', { type: 'button', class: 'ef-range__auto', 'data-k': 'range-auto', title: `Back to ${auto.toLowerCase()}` }, h('span', { text: 'Auto' })) : null;
    const el = h('div', { class: 'ef-range ef-range--num', 'data-range': '' }, [slider, h('span', { class: 'ef-range__box' }, [num, unit ? h('span', { class: 'ef-range__u', text: unit, 'aria-hidden': 'true' }) : null]), resetBtn]);
    const fallback = () => { const a = autoValue ? autoValue() : null; return typeof a === 'number' && Number.isFinite(a) ? norm(a) : min; };
    const paint = () => {
      slider.value = String(cur ?? fallback());
      if (document.activeElement !== num) num.value = cur === undefined ? '' : String(cur);
      num.placeholder = cur === undefined && auto ? `Auto · ${fallback()}` : '';
      el.dataset.auto = String(cur === undefined && !!auto);
      if (resetBtn) resetBtn.hidden = cur === undefined;
    };
    const emit = (v) => { cur = v; paint(); if (onInput) onInput(v); };
    slider.addEventListener('input', () => emit(norm(Number(slider.value))));
    num.addEventListener('input', () => {
      const t = num.value.trim();
      if (t === '') return;
      const n = Number(t);
      if (Number.isFinite(n) && n >= min && n <= max) { cur = n; slider.value = String(n); if (onInput) onInput(n); }   // live while typing (in range)
    });
    const settle = () => {
      const t = num.value.trim(), n = Number(t);
      if (t === '' && auto) emit(undefined);
      else if (t !== '' && Number.isFinite(n)) emit(norm(n));
      else paint();                                    // not a number: back to the current value
    };
    num.addEventListener('change', settle);
    num.addEventListener('blur', settle);
    num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); settle(); } });
    if (resetBtn) resetBtn.addEventListener('click', () => emit(undefined));
    paint();
    return { el, set: (v) => { cur = typeof v === 'number' && Number.isFinite(v) ? v : undefined; paint(); }, value: () => cur };
  }

  function create({ type, config, onChange, area = null, context = null, scope: ownScope = null, previewer = null }) {   // previewer(config, avail, maxH) → { el, height }: the host's drawing of the WHOLE configuration (the configure dialog's Live preview)   // scope: the image library a definition-object form uses (a host's widget type)   // context: what a collection's item editor knows of its parent (f.context)
    // type: a type name, or a definition object { fields, groups? } (e.g. a collection's item editor)
    const reg = R(), T = type && typeof type === 'object' ? type : (reg.schemaOf ? reg.schemaOf(type) : reg.TYPES[type]);
    let draft = structuredClone(config || {});
    if (T.normalize) draft = T.normalize(draft);
    const HAx = global.IniqHA;
    const wType = typeof type === 'string' && HAx && HAx.enabled && HAx.enabled() && HAx.capabilities && HAx.bindings && HAx.bindings[type] ? type : null;
    const rows = [];          // { f, wrap, refresh() }
    /* AREA CONTEXT: a field of type 'area' with context: true (e.g. a Room's Home Assistant Area) — every entity list of this form opens on
       that area first ("Show all entities" leaves it). Only a convenience: no entity is ever restricted or chosen by it. */
    const areaF = T.fields.find((f) => f && f.type === 'area' && f.context);
    const ctxArea = () => (area ? area() : areaF && reg.isShown(areaF, draft) ? reg.fieldValue(areaF, draft) || null : null);   // area: the parent form's (an item editor)
    const touched = new Set();
    const summary = h('div', { class: 'ef-summary', role: 'alert', hidden: true });
    const form = h('div', { class: 'ef' }, [summary]);

    const commit = (f, v) => {
      if (f.set) f.set(draft, v);
      else reg.setPath(draft, f.key, v);
      touched.add(f.key);
      sync();
      onChange && onChange(structuredClone(draft));
    };

    /* sections: fieldsets — or, for a type that asks for it (accordion: true), collapsible sections: the first open,
       the others closed ('all': every one open — a property inspector). Which one is open is editor state only (never stored in the widget configuration). */
    let firstAcc = true;
    (T.groups || GROUPS).forEach(([g, title, hint]) => {
      const fields = T.fields.filter((f) => (f.group || 'data') === g);
      if (!fields.length) return;
      let set;
      if (T.accordion) {
        set = h('details', { class: `ef-group ef-group--acc ef-group--${g}`, 'data-group': g, open: firstAcc || T.accordion === 'all' }, [
          h('summary', { class: 'ef-acc__h' }, [h('span', { class: 'ef-acc__t', text: title }), hint ? h('span', { class: 'ef-acc__hint', text: hint }) : null])]);
        firstAcc = false;
      } else set = h('fieldset', { class: `ef-group ef-group--${g}` }, [h('legend', { text: title }), h('p', { class: 'ef-hint', text: hint })]);
      // fields that share a `section` (e.g. "Action 3") are grouped in a collapsible block
      let sec = null, secName = null;
      fields.forEach((f) => {
        const row = fieldRow(f); rows.push(row);
        if (!f.section) { secName = null; set.append(row.wrap); return; }
        if (f.section !== secName) {
          secName = f.section;
          sec = h('div', { class: 'ef-section__body' });
          set.append(h('details', { class: 'ef-section', open: !set.querySelector('.ef-section') }, [h('summary', { class: 'ef-section__h', text: f.section }), sec]));
        }
        sec.append(row.wrap);
      });
      form.append(set);
    });

    function fieldRow(f) {
      const id = `ef-${++uid}`;
      const msg = h('p', { class: 'ef-err', id: `${id}-err`, hidden: true });
      const label = h('label', { class: `ef-label${f.srLabel ? ' ef-label--sr' : ''}`, for: id, text: `${f.label}${f.required ? '' : ''}` });
      const help = f.help ? h('p', { class: 'ef-help', text: f.help }) : null;
      const wrap = h('div', { class: `ef-field ef-field--${f.type}${f.half ? ' ef-field--half' : ''}`, 'data-key': f.key });
      const val = () => reg.fieldValue(f, draft);
      let control, refresh = () => {};
      const empty = (v) => (f.optional ? undefined : v);

      switch (f.type) {
        case 'boolean': {
          control = h('button', { type: 'button', class: 'ef-switch', id, role: 'switch', 'aria-checked': String(!!val()), onclick: () => commit(f, !val()) }, [h('span', { class: 'ef-switch__k' })]);
          refresh = () => control.setAttribute('aria-checked', String(!!val()));
          wrap.classList.add('ef-field--inline');
          break;
        }
        case 'select': {
          control = h('select', { id, onchange: (e) => commit(f, e.target.value) });
          refresh = () => {
            const opts = reg.optionsOf(f, draft, context), v = val();
            const sig = opts.map((o) => `${o.value}\u0001${o.label}`).join('|');
            if (control.dataset.sig !== sig) { control.replaceChildren(...opts.map((o) => h('option', { value: o.value, text: o.label }))); control.dataset.sig = sig; }
            if (f.optionsFrom && opts.length && !opts.some((o) => o.value === v)) {   // e.g. a removed preset
              reg.setPath(draft, f.key, opts[0].value); control.value = opts[0].value; return;
            }
            control.value = v ?? '';
            if (v === undefined && opts.length) control.selectedIndex = -1;
          };
          break;
        }
        case 'number': {
          control = h('input', { id, type: 'number', inputmode: 'decimal', min: f.min, max: f.max, step: f.step || (f.integer ? 1 : 'any'), placeholder: f.placeholder,
            oninput: (e) => { const t = e.target.value.trim(); commit(f, t === '' ? empty('') : Number(t)); } });
          refresh = () => { const v = val(); if (document.activeElement !== control) control.value = v ?? ''; };
          break;
        }
        case 'range': {   // a CONTINUOUS visual quantity: the shared Slider + editable Number + unit (rangeControl) — live while dragging
          const rc = rangeControl({ id, label: f.label, min: f.min ?? 0, max: f.max ?? 100, step: f.step ?? 1, unit: f.unit || '', auto: f.auto || null,
            autoValue: () => (typeof f.autoValue === 'function' ? f.autoValue(draft) : f.autoValue), onInput: (v) => commit(f, v) });
          control = rc.el;
          refresh = () => rc.set(val());
          break;
        }
        case 'icon': {
          const icons = (f.icons && f.icons()) || null;
          if (!icons) {   // no previews available → a plain select
            control = h('select', { id, onchange: (e) => commit(f, e.target.value || (f.optional ? undefined : e.target.value)) });
            refresh = () => { const opts = reg.optionsOf(f, draft, context); const sig = JSON.stringify(opts); if (control.dataset.sig !== sig) { control.dataset.sig = sig; control.replaceChildren(...opts.map((o) => h('option', { value: o.value, text: o.label }))); } control.value = val() ?? ''; };
            break;
          }
          control = h('div', { class: 'ef-icons', role: 'radiogroup', id, 'aria-label': f.label });
          const opts = reg.optionsOf(f, draft, context);
          opts.forEach((o) => {
            const b = h('button', { type: 'button', class: 'ef-icon', role: 'radio', 'aria-label': o.value === '' ? 'No icon' : o.label, title: o.value === '' ? 'None' : o.label,
              onclick: () => commit(f, o.value === '' ? (f.optional ? undefined : '') : o.value) });
            if (o.value === '') b.append(h('span', { class: 'ef-icon__none', text: '—' }));
            else b.innerHTML = icons[o.value] || '';   // component-owned static SVG markup
            b.dataset.value = o.value;
            control.append(b);
          });
          // roving arrow keys inside the radiogroup
          control.addEventListener('keydown', (e) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
            const bs = [...control.children], i = bs.indexOf(document.activeElement);
            if (i < 0) return;
            e.preventDefault();
            const n = bs[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + bs.length) % bs.length];
            n.focus(); n.click();
          });
          refresh = () => { const v = val() ?? ''; [...control.children].forEach((b) => { const on = b.dataset.value === v; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }); if (![...control.children].some((b) => b.tabIndex === 0) && control.firstChild) control.firstChild.tabIndex = 0; };
          break;
        }
        case 'image': {
          /* the current image (thumbnail) · packaged images (the widget's own assets: picks) · Upload image (fields with
             upload: true, on the IniqDash server: IniqDash User Assets, api/asset_upload.php) · or an address typed in */
          const cur = h('img', { class: 'ef-img__thumb', alt: '' });
          const none = h('span', { class: 'ef-img__none', text: 'No image' });
          const curBox = h('div', { class: 'ef-img__cur', 'aria-hidden': 'true' }, [cur, none]);
          const input = h('input', { id, type: 'text', inputmode: 'url', spellcheck: 'false', placeholder: 'or an address: assets/img/… or https://…', 'aria-label': `${f.label}: address`,
            oninput: (e) => commit(f, e.target.value.trim() ? e.target.value.trim() : empty('')) });
          const picks = h('div', { class: 'ef-picks', role: 'group', 'aria-label': `${f.label}: packaged images` }, [
            h('button', { type: 'button', class: 'ef-pick ef-pick--none', 'aria-label': 'No image', onclick: () => { input.value = ''; commit(f, empty('')); } }, h('span', { text: 'None' })),
            ...(f.picks || []).map((src) => h('button', { type: 'button', class: 'ef-pick', 'aria-label': `Use ${src.split('/').pop()}`, onclick: () => { input.value = src; commit(f, src); } }, h('img', { src, alt: '' }))),
          ]);
          const canUpload = !!f.upload && document.querySelector('meta[name="iniqdash-server"]')?.content === '1';
          let up = null;
          if (canUpload) {
            const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, 'data-upload': f.key });
            const btn = h('button', { type: 'button', class: 'ef-mini ef-upload__btn', 'data-upload-btn': f.key, onclick: () => file.click() }, h('span', { text: 'Upload image' }));
            const status = h('p', { class: 'ef-upload__status', role: 'status', 'aria-live': 'polite' });
            file.addEventListener('change', async () => {
              const fl = file.files && file.files[0];
              file.value = '';
              if (!fl) return;
              btn.disabled = true; status.dataset.state = 'busy'; status.textContent = 'Uploading…';
              const r = await uploadImage(fl);
              btn.disabled = false;
              if (r.ok) { status.dataset.state = 'ok'; status.textContent = 'Uploaded'; input.value = r.ref; commit(f, r.ref); }
              else { status.dataset.state = 'error'; status.textContent = r.message; }
            });
            up = h('div', { class: 'ef-upload' }, [btn, file, status]);
          }
          control = h('div', { class: 'ef-image' }, [h('div', { class: 'ef-img__row' }, [curBox, h('div', { class: 'ef-img__choices' }, [picks, up])]), input]);
          refresh = () => {
            const v = val() ?? '';
            if (document.activeElement !== input) input.value = v;
            [...picks.querySelectorAll('.ef-pick')].forEach((b, i) => b.setAttribute('aria-pressed', String(i === 0 ? !v : f.picks[i - 1] === v)));
            const show = v && reg.SAFE_URL.test(v);
            if (show) { if (cur.getAttribute('src') !== v) cur.setAttribute('src', v); } else cur.removeAttribute('src');
            cur.hidden = !show; none.hidden = !!show;
          };
          break;
        }
        case 'artwork': {
          /* the shared IMAGE / ARTWORK picker (registry F.artwork): one visual selector — None · the widget type's built-in artworks ·
             the widget type's IMAGE LIBRARY (every image uploaded for this widget type, by any of its instances) · Upload (the secure
             IniqDash User Assets). IMAGE OWNERSHIP = WIDGET TYPE: the library is scoped by the form's widget type (scope), so every
             Light sees the Light uploads and no other type does. Every choice is a tile with its thumbnail and a plain name; no
             path or identifier is ever shown. 'none' is literally no image. */
          const canUpload = !!f.upload && document.querySelector('meta[name="iniqdash-server"]')?.content === '1';
          const scopeOf = typeof type === 'string' ? type : ownScope, scope = canUpload && typeof scopeOf === 'string' && /^[a-z][a-z0-9._-]{0,63}$/.test(scopeOf) ? scopeOf : null;
          const builtins = f.builtins || [];
          const tiles = h('div', { class: 'ef-art', role: 'group', id, 'aria-label': f.label });
          const tile = (kind, label, thumb, onclick, extra = {}) => h('button', { type: 'button', class: `ef-art__t ef-art__t--${kind}`, 'data-k': `art-${kind}`, 'aria-pressed': 'false', 'aria-label': label, onclick, ...extra }, [
            h('span', { class: 'ef-art__th', 'aria-hidden': 'true' }, thumb), h('span', { class: 'ef-art__l', text: label }), h('span', { class: 'ef-art__ok', 'aria-hidden': 'true', text: '✓' })]);
          const noneTile = tile('none', 'None', h('span', { class: 'ef-art__x', text: '×' }), () => commit(f, 'none'));
          const bTiles = builtins.map((b) => { const t = tile('builtin', b.label, h('img', { src: b.value, alt: '', loading: 'lazy' }), () => commit(f, b.value)); t.dataset.value = b.value; return t; });
          const libBox = h('div', { class: 'ef-art__lib', role: 'presentation' });          // the widget type's uploaded images
          let lib = [], adopted = '';
          const ownImg = h('img', { alt: '' });
          const ownTile = tile('own', 'Your image', ownImg, () => {});                      // an older configuration's own address
          const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, 'data-upload': f.key });
          const upTile = canUpload ? tile('upload', 'Upload', h('span', { class: 'ef-art__plus', text: '+' }), () => file.click(), { 'aria-pressed': null }) : null;
          if (upTile) upTile.removeAttribute('aria-pressed');
          tiles.append(noneTile, ...bTiles, libBox, ownTile, ...(upTile ? [upTile] : []));
          const status = h('p', { class: 'ef-art__status', role: 'status', 'aria-live': 'polite' });
          const change = canUpload ? h('button', { type: 'button', class: 'ef-mini', 'data-k': 'art-change', onclick: () => file.click() }, h('span', { text: 'Change' })) : null;
          const remove = h('button', { type: 'button', class: 'ef-mini', 'data-k': 'art-remove', onclick: () => commit(f, 'none') }, h('span', { text: 'Remove' }));
          const actions = h('div', { class: 'ef-art__acts' }, [...(change ? [change] : []), remove]);
          const drawLib = () => {
            libBox.replaceChildren(...lib.map((ref, i) => { const t = tile('lib', 'Uploaded image', h('img', { src: ref, alt: '', loading: 'lazy' }), () => commit(f, ref)); t.dataset.value = ref; t.setAttribute('aria-label', `Uploaded image ${i + 1}`); return t; }));
            refresh();
          };
          const reload = (force) => { if (scope) loadLibrary(scope, force).then((l) => { lib = l; adopted = ''; drawLib(); }); };
          file.addEventListener('change', async () => {
            const fl = file.files && file.files[0];
            file.value = '';
            if (!fl) return;
            [upTile, change].forEach((b) => { if (b) b.disabled = true; });
            status.dataset.state = 'busy'; status.textContent = 'Uploading…';
            const r = await uploadImage(fl, scope);
            [upTile, change].forEach((b) => { if (b) b.disabled = false; });
            if (r.ok) { status.dataset.state = 'ok'; status.textContent = ''; if (!lib.includes(r.ref)) lib = [...lib, r.ref]; LIB.delete(scope); commit(f, r.ref); drawLib(); }
            else { status.dataset.state = 'error'; status.textContent = r.message; }
          });
          control = h('div', { class: 'ef-artwork' }, [tiles, actions, status, file]);
          refresh = () => {
            const v = val() || 'none';
            const upl = reg.USER_ASSET && reg.USER_ASSET.test(v);
            // an uploaded image this widget already shows that its type's library does not list yet (uploaded before libraries
            // existed): it joins the library — nothing is uploaded again
            if (upl && scope && !lib.includes(v) && adopted !== v) { adopted = v; lib = [...lib, v]; adoptImage(scope, v); setTimeout(drawLib, 0); }
            const own = v !== 'none' && !builtins.some((b) => b.value === v) && !upl;
            noneTile.setAttribute('aria-pressed', String(v === 'none'));
            bTiles.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.value === v)));
            [...libBox.children].forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.value === v)));
            // an older configuration's own image address (not an upload): its thumbnail and a plain name, never its path
            ownTile.hidden = !own; ownTile.setAttribute('aria-pressed', String(own));
            if (own && reg.SAFE_URL.test(v)) { if (ownImg.getAttribute('src') !== v) ownImg.src = v; } else ownImg.removeAttribute('src');
            if (upl && !scope && !libBox.querySelector('[aria-pressed="true"]')) { lib = [v]; setTimeout(drawLib, 0); }   // no library (local): the chosen upload
            actions.hidden = !upl;
          };
          reload(false);
          break;
        }
        case 'list': {
          const fixed = f.options ? (typeof f.options === 'function' ? f.options() : f.options) : null;
          if (fixed) {   // choose from known values (checkbox chips)
            control = h('div', { class: 'ef-chips', role: 'group', id, 'aria-label': f.label });
            fixed.forEach((o) => control.append(h('button', { type: 'button', class: 'ef-chip', 'aria-pressed': 'false', 'data-value': o, text: o,
              onclick: () => { const cur = val() || []; commit(f, cur.includes(o) ? cur.filter((x) => x !== o) : fixed.filter((x) => x === o || cur.includes(x))); } })));
            refresh = () => { const cur = val() || []; [...control.children].forEach((b) => b.setAttribute('aria-pressed', String(cur.includes(b.dataset.value)))); };
            break;
          }
          // free entries: one text input per entry + add / remove
          control = h('div', { class: 'ef-list', id });
          const write = () => { const v = [...control.querySelectorAll('input')].map((i) => i.value); commit(f, v.length ? v : (f.optional ? [] : [])); };
          const entry = (text) => {
            const inp = h('input', { type: 'text', value: text, maxlength: '40', 'aria-label': `${f.label} entry`, oninput: write });
            const row = h('div', { class: 'ef-list__row' }, [inp, h('button', { type: 'button', class: 'ef-mini', 'aria-label': `Remove ${text || 'entry'}`, onclick: () => { row.remove(); write(); } }, h('span', { text: '×' }))]);
            return row;
          };
          const add = h('button', { type: 'button', class: 'ef-mini ef-mini--add', onclick: () => { const r = entry(''); control.insertBefore(r, add); r.querySelector('input').focus(); write(); } }, h('span', { text: '+ Add' }));
          (val() || []).forEach((t) => control.append(entry(t)));
          control.append(add);
          break;
        }
        case 'corners': {  // per-corner shape + radius (common capability; see components/widget-kit)
          const K = ['tl', 'tr', 'bl', 'br'], NAMES = { tl: 'Top left', tr: 'Top right', bl: 'Bottom left', br: 'Bottom right' };
          // no per-corner value yet: every corner starts as the widget's own (legacy) radius
          const current = () => {
            const v = val();
            if (v && typeof v === 'object') return K.reduce((o, k) => ({ ...o, [k]: { shape: v[k]?.shape === 'concave' ? 'concave' : 'normal', r: Number.isFinite(v[k]?.r) ? v[k].r : 0 } }), {});
            const r0 = Number(typeof f.fallback === 'function' ? f.fallback(draft) : f.fallbackKey ? reg.getPath(draft, f.fallbackKey) : 0);
            return K.reduce((o, k) => ({ ...o, [k]: { shape: 'normal', r: Number.isFinite(r0) ? r0 : 0 } }), {});
          };
          const set = (k, patch) => { const c = current(); c[k] = { ...c[k], ...patch }; commit(f, c); };
          const parts = {};
          const cells = K.map((k) => {
            const shape = h('select', { 'aria-label': `${NAMES[k]} corner shape`, 'data-corner': k, 'data-part': 'shape', onchange: (e) => set(k, { shape: e.target.value }) },
              [h('option', { value: 'normal', text: 'Normal' }), h('option', { value: 'concave', text: 'Concave' })]);
            const out = h('output', { class: 'ef-range__v' });
            const r = h('input', { type: 'range', min: 0, max: f.max || 100, step: 1, 'aria-label': `${NAMES[k]} corner radius`, 'data-corner': k, 'data-part': 'r', oninput: (e) => set(k, { r: Number(e.target.value) }) });
            parts[k] = { shape, r, out };
            return h('div', { class: 'ef-corner', 'data-corner': k }, [h('span', { class: 'ef-corner__n', text: NAMES[k] }), shape, h('div', { class: 'ef-range' }, [r, out])]);
          });
          const reset = h('button', { type: 'button', class: 'ef-mini ef-corners__reset', text: 'Use one radius', title: 'Remove the per-corner settings (the widget’s own corner radius applies again)',
            onclick: () => commit(f, undefined) });
          control = h('div', { class: 'ef-corners', id, role: 'group', 'aria-label': f.label }, [h('div', { class: 'ef-corners__grid' }, cells), reset]);
          refresh = () => { const c = current(); K.forEach((k) => { parts[k].shape.value = c[k].shape; parts[k].r.value = c[k].r; parts[k].out.textContent = String(c[k].r); }); reset.hidden = !val(); };
          break;
        }
        case 'area': {   // a Home Assistant AREA from HA's own area registry: the id is stored, HA's name is shown (an area HA no longer has stays visible as such)
          control = h('select', { id, onchange: (e) => commit(f, e.target.value || undefined) });
          let areas = null;
          refresh = () => {
            const v = val() || '', list = areas || [];
            const opts = [['', areas ? (f.empty || 'No area') : 'Loading areas…'], ...list.map((a) => [a.id, a.name])];
            if (v && !list.some((a) => a.id === v)) opts.push([v, areas ? `${v} (not in Home Assistant now)` : v]);
            const sig = JSON.stringify(opts);
            if (control.dataset.sig !== sig) { control.dataset.sig = sig; control.replaceChildren(...opts.map(([value, text]) => h('option', { value, text }))); }
            control.value = v;
          };
          if (global.IniqHA && global.IniqHA.areas) global.IniqHA.areas().then((l) => { areas = l; refresh(); }, () => { areas = []; refresh(); });
          break;
        }
        case 'mdi': {   // a Material Design Icon — the shared IniqIcons picker (a compact field; a searchable list while choosing): "mdi:<name>" or none
          control = global.IniqIcons ? global.IniqIcons.picker({ value: val() || '', label: f.label, onPick: (v) => commit(f, v || undefined) }) : h('p', { class: 'ef-help', text: 'Icons are not available.' });
          refresh = () => { if (control.iconPicker) control.iconPicker.set(val() || ''); };
          break;
        }
        case 'color': {   // a colour from a fixed list of design-token NAMES (f.options) as swatches; '' = the widget's own default.
          // f.custom: one more swatch, "Custom", opens the system colour picker — the value is then a plain "#rrggbb" (never any other CSS)
          control = h('div', { class: 'ef-icons ef-colors', role: 'radiogroup', id, 'aria-label': f.label });
          ['', ...(f.options || [])].forEach((v) => {
            const b = h('button', { type: 'button', class: 'ef-icon', role: 'radio', 'aria-label': v || 'Default colour', title: v || 'Default', onclick: () => commit(f, v || undefined) },
              h('span', { class: `ef-swatch${v ? '' : ' ef-swatch--none'}`, style: v ? `background: var(--${v})` : null }));   // an allow-listed token name
            b.dataset.value = v;
            control.append(b);
          });
          let pick = null, customB = null;
          if (f.custom) {
            pick = h('input', { type: 'color', class: 'ef-colors__pick', tabindex: '-1', 'aria-hidden': 'true', 'data-k': 'color-pick' });
            pick.addEventListener('input', () => { if (HEX.test(pick.value)) commit(f, pick.value.toLowerCase()); });
            customB = h('button', { type: 'button', class: 'ef-icon ef-icon--custom', role: 'radio', 'aria-label': 'Custom colour', title: 'Custom colour', 'data-k': 'color-custom',
              onclick: () => { const v = val(); if (HEX.test(v || '')) pick.value = v; pick.click(); } }, [h('span', { class: 'ef-swatch ef-swatch--custom' }), pick]);
            customB.dataset.value = '#custom';
            control.append(customB);
          }
          roving(control);
          refresh = () => {
            const v = val() ?? '', hex = HEX.test(v);
            [...control.children].forEach((b) => { const on = hex ? b === customB : b.dataset.value === v; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
            if (customB) { const sw = customB.querySelector('.ef-swatch'); sw.style.background = hex ? v : ''; customB.title = hex ? `Custom colour ${v}` : 'Custom colour'; if (hex && document.activeElement !== pick) pick.value = v; }
          };
          break;
        }
        case 'place9': {   // a STRUCTURED 3 × 3 PLACEMENT (top / centre / bottom × left / centre / right): one compact grid, the choice named
          // beside it; arrow keys move in two dimensions. The value is "<row>-<column>" (the field's get / set map it to its own storage)
          const ROW = ['top', 'center', 'bottom'], COL = ['left', 'center', 'right'];
          const nameOf = (v) => { const [r, c] = v.split('-'); return r === 'center' && c === 'center' ? 'Centre' : `${r === 'center' ? 'Centre' : r[0].toUpperCase() + r.slice(1)} ${c === 'center' ? 'centre' : c}`; };
          const grid = h('div', { class: 'ef-place__grid', role: 'radiogroup', id, 'aria-label': f.label });
          const named = h('span', { class: 'ef-place__name', 'aria-hidden': 'true' });
          ROW.forEach((r) => COL.forEach((c) => {
            const v = `${r}-${c}`;
            grid.append(h('button', { type: 'button', role: 'radio', class: 'ef-place__c', 'data-place': v, 'aria-label': nameOf(v), title: nameOf(v), onclick: () => commit(f, v) }, h('span', { class: 'ef-place__dot', 'aria-hidden': 'true' })));
          }));
          grid.addEventListener('keydown', (e) => {
            const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
            if (!d) return;
            const bs = [...grid.children], i = bs.indexOf(document.activeElement);
            if (i < 0) return;
            e.preventDefault();
            const r = Math.min(2, Math.max(0, Math.floor(i / 3) + d[0])), c = Math.min(2, Math.max(0, (i % 3) + d[1]));
            bs[r * 3 + c].focus(); bs[r * 3 + c].click();
          });
          control = h('div', { class: 'ef-place' }, [grid, named]);
          refresh = () => { const v = val() || 'center-left'; [...grid.children].forEach((b) => { const on = b.dataset.place === v; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }); named.textContent = nameOf(v); };
          break;
        }
        case 'collection': {   // an ordered list edited ONE ITEM AT A TIME: compact rows + Add; Add / Edit open the item editor (renderCollection)
          control = h('div', { class: 'ef-col', id, 'data-col': f.key });
          refresh = () => renderCollection(control, f);
          break;
        }
        case 'infoslots': {   // INFORMATION: up to f.max lines, each one more REAL value from another HA entity
          control = h('div', { class: 'ef-info', id, 'data-k': 'info' });
          refresh = () => renderInfo(control, f);
          break;
        }
        case 'copysettings': {  // a reusable (Widget Studio) widget's COPY SETTINGS: what THIS copy sets differently (a name, a picture, an icon,
          // a colour…) — each one the exposed component field itself (its kind, options, limits: f.fields(draft)), stored as { <setting id>: value }
          control = h('div', { class: 'ef-copy', id, 'data-k': 'copy-settings' });
          let sig = '', sub = null;
          refresh = () => {
            const list = typeof f.fields === 'function' ? f.fields(draft) : [], now = sig;
            sig = JSON.stringify(list.map((x) => [x.key, x.type, x.label]));
            if (now === sig && sub) return;
            sub = list.length ? create({ type: { fields: list.map((x) => ({ ...x, group: 'copy' })), groups: [['copy', '', '']] }, config: val() || {}, scope: ownScope, area, context,
              onChange: (v) => { const o = {}; Object.entries(v || {}).forEach(([k, x]) => { if (x !== undefined && x !== null && x !== '') o[k] = x; }); commit(f, o); } }) : null;
            control.replaceChildren(...(sub ? [sub.el] : []));
          };
          break;
        }
        case 'entityslots': {   // the SOURCE GROUPS of a reusable (Widget Studio) widget: ONE entity per group — its name, the properties it
          // provides, the existing picker (narrowed to the group's HA family) — stored as { <group id>: entity } in THIS copy's configuration
          control = h('div', { class: 'ef-slots', id, 'data-k': 'entity-slots' });
          let sig = '';
          refresh = () => {
            const list = typeof f.slots === 'function' ? f.slots(draft) : [], now = sig;
            sig = JSON.stringify(list);
            if (now === sig && control.childElementCount) return;              // the same slots: the pickers stay as they are
            if (!global.IniqHA || !global.IniqHA.picker) { control.replaceChildren(h('p', { class: 'ef-help', text: 'Home Assistant is available when IniqDash runs on its server.' })); return; }
            // a chosen entity that cannot give what the slot's components read is NAMED (a warning, never silently accepted)
            const warns = [];
            const paintWarn = () => warns.forEach(([sl, el]) => { const t = typeof f.warn === 'function' ? f.warn(draft, sl.id, (val() || {})[sl.id] || '') : ''; el.textContent = t; el.hidden = !t; });
            control.replaceChildren(...list.map((sl) => {
              const warn = h('small', { class: 'ef-slot__w', role: 'status', 'data-k': 'slot-warning', hidden: true });
              warns.push([sl, warn]);
              const pick = global.IniqHA.picker({ domains: sl.domains || null, value: (val() || {})[sl.id] || '', label: sl.label, clear: 'Clear',
                empty: sl.family ? `Choose a ${sl.family.toLowerCase()} entity…` : 'No entity chosen',
                onPick: (e) => { const m = { ...(val() || {}) }; if (e) m[sl.id] = e.id; else delete m[sl.id]; commit(f, m); paintWarn(); } });
              // a SOURCE GROUP may supply several of the widget's properties: named, so one choice is clearly enough
              const gives = Array.isArray(sl.provides) && sl.provides.length ? h('small', { class: 'ef-slot__p', 'data-k': 'slot-provides', text: `Provides: ${sl.provides.join(', ')}` }) : null;
              return h('div', { class: `ef-slot${sl.required ? ' is-required' : ''}`, 'data-slot': sl.label }, [
                h('span', { class: 'ef-slot__l', text: sl.required ? sl.label : `${sl.label} (optional)` }), gives, pick, warn]);
            }));
            paintWarn();
            if (global.IniqBinding && global.IniqBinding.onAttributes && !control.__watch) {
              control.__watch = global.IniqBinding.onAttributes(() => { if (!control.isConnected) { control.__watch(); return; } paintWarn(); });
            }
          };
          break;
        }
        case 'entity': {   // a real Home Assistant entity (IniqHA picker); only shown when the server provides HA
          control = global.IniqHA && global.IniqHA.picker
            ? global.IniqHA.picker({ domains: f.domains || null, deviceClasses: f.deviceClasses || null, value: val() || '', label: f.label, describe: f.describe || null, note: f.note || null, ...(f.empty ? { empty: f.empty } : {}), ...(f.clear !== undefined ? { clear: f.clear } : {}), area: ctxArea,
              ...(typeof f.related === 'function' ? { related: () => f.related(draft) } : {}),
              onPick: (e) => { if (e && f.onPick) f.onPick(draft, e); commit(f, e ? e.id : undefined); } })
            : h('p', { class: 'ef-help', text: 'Home Assistant is available when IniqDash runs on its server.' });
          control.id = id;
          // the linked entity's capabilities, read-only (what HA reports / what IniqDash offers / not yet in IniqDash)
          const box = f.key === 'entity' && wType ? h('div', { class: 'ef-caps', 'data-k': 'ha-caps', 'aria-live': 'polite', hidden: true }) : null;
          // and EVERY value Home Assistant reports for the selected entity (shared inspector, collapsed; any entity field)
          const insp = global.IniqHA && global.IniqHA.picker && global.IniqHA.inspector ? global.IniqHA.inspector({ entity: val() || '' }) : null;
          if (box || insp) {
            control = h('div', { class: 'ef-entity' }, [control, box, insp]);
            refresh = () => { if (box) renderCaps(box); if (insp) insp.setEntity(val() || ''); };
          }
          break;
        }
        default: {   // text
          control = h('input', { id, type: 'text', maxlength: f.maxLength, placeholder: f.placeholder,
            oninput: (e) => {
              const t = e.target.value;
              if (f.numeric && t.trim() !== '' && Number.isFinite(Number(t))) commit(f, Number(t));
              else commit(f, t === '' && f.optional ? undefined : t);
            } });
          refresh = () => { const v = val(); if (document.activeElement !== control) control.value = v ?? ''; };
        }
      }
      if (control.matches('input, select, button[role=switch]')) control.setAttribute('aria-describedby', `${id}-err`);
      if (f.required) wrap.classList.add('is-required');
      wrap.append(...[label, control, help, msg].filter(Boolean));
      return { f, wrap, msg, refresh };
    }

    /* ---- the linked Home Assistant entity: its state is read through the shared layer (the same poll the widgets use) and
       the form is redrawn as soon as it arrives or its capabilities change — the dialog stays open */
    let ent = { id: null, un: null }, unStatus = null, capSig = '', seen = false, timer = 0;
    const capsNow = () => (wType && draft.entity ? HAx.capabilities(wType, draft) : null);
    const sigNow = () => { const fx = capsNow(); return `${rows.map((r) => (reg.isShown(r.f, draft, context) ? 1 : 0)).join('')}|${fx ? `${fx.state}${JSON.stringify(fx.summary || null)}` : ''}`; };
    const onEntity = () => { if (seen && !form.isConnected) return stopWatching(); if (sigNow() !== capSig) sync(); };
    function stopWatching() { if (ent.un) ent.un(); ent = { id: null, un: null }; if (unStatus) unStatus(); unStatus = null; clearInterval(timer); timer = 0; slotSubs.forEach((u) => u()); slotSubs.clear(); colSubs.forEach((m) => m.forEach((u) => u())); colSubs.clear(); if (editing) editing.close(); }
    function watchEntity() {
      const id = wType ? (draft.entity || null) : null;
      if (id === ent.id) return;
      if (ent.un) ent.un();
      ent = { id, un: null };
      if (!id) return;
      if (!unStatus) unStatus = HAx.onStatus(onEntity);
      // a closed dialog stops watching (the form has no explicit end)
      if (!timer) timer = setInterval(() => { if (form.isConnected) seen = true; else if (seen) stopWatching(); }, 3000);
      ent.un = HAx.subscribe(id, onEntity);
    }
    /* ---- Information slots (common capability): add / remove / reorder lines; each line = an entity (the shared picker, with
       same-device suggestions first), your own optional label, and what to show (its state, or one of the values IniqDash
       already reads for that entity). The current real value is shown read-only. Nothing is guessed or calculated. */
    const slotSubs = new Map();            // entity → unsubscribe (the SAME shared poll as the widgets)
    let infoSig = '';
    const slotList = (f) => { const v = reg.fieldValue(f, draft); return Array.isArray(v) ? v.map((x) => ({ ...x })) : []; };
    function renderInfo(box, f) {
      const S = HAx && HAx.slots, list = slotList(f), max = f.max || 3, noun = f.rowLabel || 'Line', addText = f.addLabel || 'Add information';
      if (!S || !HAx.picker) { box.replaceChildren(h('p', { class: 'ef-help', text: 'Information comes from Home Assistant when IniqDash runs on its server.' })); return; }
      const write = (next) => commit(f, next.length ? next : undefined);
      // follow every slot entity (and only those) through the shared subscribe
      const want = new Set(list.map((x) => x.entity).filter(Boolean));
      slotSubs.forEach((u, ent) => { if (!want.has(ent)) { u(); slotSubs.delete(ent); } });
      // (marked first: subscribe answers at once for an entity already known, and that answer redraws — it must not subscribe again)
      want.forEach((ent) => { if (!slotSubs.has(ent)) { slotSubs.set(ent, () => {}); slotSubs.set(ent, HAx.subscribe(ent, () => { if (box.isConnected) renderInfo(box, f); })); } });
      if (want.size && !timer) timer = setInterval(() => { if (form.isConnected) seen = true; else if (seen) stopWatching(); }, 3000);
      const sig = JSON.stringify(list.map((x) => [x.id, x.entity, x.value || 'state']));
      if (sig !== infoSig || !box.firstChild) {       // structure changed: rebuild (typing a label never rebuilds)
        infoSig = sig;
        const rows = list.map((x, i) => {
          const pick = HAx.picker({ value: x.entity || '', label: `${f.rowLabel || 'Information'} ${i + 1} entity`, clear: false, empty: 'Choose an entity', area: ctxArea,
            related: draft.entity ? () => HAx.related(draft.entity) : null,
            onPick: (e) => { const n = slotList(f); n[i] = { ...n[i], entity: e ? e.id : '', value: 'state' }; write(n); } });
          const lab = h('input', { type: 'text', class: 'ef-info__label', 'data-k': 'info-label', maxlength: 24, placeholder: 'Label (optional), e.g. Phone', 'aria-label': `Information ${i + 1} label`,
            oninput: (ev) => { const n = slotList(f); const t = ev.target.value; if (t.trim()) n[i].label = t; else delete n[i].label; write(n); } });
          lab.value = x.label || '';
          const sel = h('select', { class: 'ef-info__value', 'data-k': 'info-value', 'aria-label': `Information ${i + 1}: what to show`,
            onchange: (ev) => { const n = slotList(f); n[i].value = ev.target.value; write(n); } });
          const btn = (k, text, on, dis) => h('button', { type: 'button', class: 'ef-info__btn', 'data-k': k, disabled: dis, onclick: on }, h('span', { text }));
          const move = (d) => () => { const n = slotList(f); const j = i + d; [n[i], n[j]] = [n[j], n[i]]; write(n); };
          return h('div', { class: 'ef-info__row', 'data-slot': x.id }, [
            h('div', { class: 'ef-info__head' }, [h('b', { text: `${noun} ${i + 1}` }),
              btn('info-up', 'Up', move(-1), i === 0), btn('info-down', 'Down', move(1), i === list.length - 1),
              btn('info-remove', 'Remove', () => { const n = slotList(f); n.splice(i, 1); write(n); })]),
            pick, h('div', { class: 'ef-info__pair' }, [lab, sel]), h('p', { class: 'ef-info__now', 'data-k': 'info-now' }),
            x.entity && HAx.inspector ? HAx.inspector({ entity: x.entity }) : null]);
        });
        const add = h('button', { type: 'button', class: 'ef-info__add', 'data-k': 'info-add', disabled: list.length >= max,
          onclick: () => { const n = slotList(f), used = new Set(n.map((x) => x.id)); let k = 1; while (used.has(`i${k}`)) k++; n.push({ id: `i${k}`, entity: '', value: 'state' }); write(n); } },
          h('span', { text: list.length >= max ? `At most ${max} ${noun.toLowerCase() === 'line' ? 'lines' : 'entries'}` : addText }));
        box.replaceChildren(...rows, add);
      }
      // in place: the choices for "what to show" and the current real value of every line
      list.forEach((x, i) => {
        const row = box.querySelector(`.ef-info__row[data-slot="${x.id}"]`);
        if (!row) return;
        const e = x.entity ? HAx.get(x.entity) : null, known = x.entity ? HAx.known(x.entity) : false;
        const sel = row.querySelector('select'), cur = x.value || 'state';
        const opts = S.sources(e);
        if (!opts.some((o) => o.value === cur)) opts.push({ value: cur, label: `${cur.replace(/_/g, ' ')} (not reported now)` });
        if (sel.dataset.sig !== JSON.stringify(opts)) { sel.dataset.sig = JSON.stringify(opts); sel.replaceChildren(...opts.map((o) => h('option', { value: o.value, text: o.label }))); }
        sel.value = cur;
        sel.disabled = !x.entity;
        const it = x.entity ? S.item(x, e, known) : null;
        row.querySelector('.ef-info__now').textContent = !x.entity ? 'Choose an entity for this line'
          : it.state === 'loading' ? 'Reading the value from Home Assistant…' : it.state === 'missing' ? 'Home Assistant has no entity with this id'
          : it.state === 'absent' ? 'Not reported by this entity right now' : `Now: ${it.line || it.text}`;
      });
    }

    /** arrow keys move (and choose) inside a radiogroup of buttons */
    function roving(g) {
      g.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        const bs = [...g.children], i = bs.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault();
        const n = bs[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + bs.length) % bs.length];
        n.focus(); n.click();
      });
    }

    /* ---- CONFIG COLLECTION (field type 'collection'): an ordered list whose items are edited one at a time.
       The field (the widget's schema) declares:
         get(config) → [item…] / set(config, [item…])   how the list is read and written (the stored format stays the widget's)
         fields: [field…]          the item's own fields (any form field type: entity, select, text, icon, color…), keys relative to the item
         create(list) → item        a new, unsaved item          summary(item, i, ha) → { icon (svg), color (token), title, sub, value }
         itemLabel / addLabel / max   entityOf(item) → entity id (live values in the rows)   itemErrors(item) → [{ key, message }]
       The form does the rest: compact rows (icon · title / entity · live value · Edit · ⋮ Move up / Move down / Remove), and ONE item
       editor at a time: a compact MODAL (a native <dialog>: the backdrop, the focus trap and Esc are the browser's) floating above the
       configuration, which stays as it is behind it — no preview, no page of its own. A draft: Save applies it, Cancel / Esc leave
       everything as it was; an added item exists only once saved. The item editor is this same form (MaisonForm) for the item's fields
       (half: true — two short fields share a row), with this form's area context, so the entity picker, "Show all entities" and the
       Home Assistant values inspector work exactly as everywhere. */
    const colSubs = new Map();             // collection key → Map(entity → unsubscribe) (live values in the rows)
    let editing = null;                    // the open item editor { close }
    function renderCollection(box, f) {
      const list = reg.fieldValue(f, draft) || [], H = HAx && HAx.enabled && HAx.enabled() ? HAx : null;
      if (H && f.entityOf) {
        const want = new Set(list.map(f.entityOf).filter(Boolean));
        if (!colSubs.has(f.key)) colSubs.set(f.key, new Map());
        const subs = colSubs.get(f.key);
        subs.forEach((u, e) => { if (!want.has(e)) { u(); subs.delete(e); } });
        // (marked first: subscribe answers at once for a known entity, and that answer redraws)
        want.forEach((e) => { if (!subs.has(e)) { subs.set(e, () => {}); subs.set(e, H.subscribe(e, () => { if (box.isConnected) paintRows(box, f); })); } });
        if (want.size && !timer) timer = setInterval(() => { if (form.isConnected) seen = true; else if (seen) stopWatching(); }, 3000);
      }
      // the rows are rebuilt only when the list changed: a refresh caused by ANOTHER field (e.g. a number committed as the pointer goes
      // down on "+ Add") must not replace the button under the pointer — that click would be lost
      const sig = JSON.stringify(list);
      if (box.__rowsSig === sig && box.childElementCount) return;
      box.__rowsSig = sig;
      paintRows(box, f);
    }
    const ha = {
      get: (id) => (HAx && HAx.get ? HAx.get(id) : null), known: (id) => !!(HAx && HAx.known && HAx.known(id)),
      name: (id) => { const e = HAx && HAx.get ? HAx.get(id) : null; return e && e.name ? e.name : ''; },
    };
    function paintRows(box, f) {
      const list = reg.fieldValue(f, draft) || [], max = f.max || 8, noun = f.itemLabel || 'item';
      const menuOf = (i) => {
        const btn = h('button', { type: 'button', class: 'ef-col__more', 'data-k': 'col-menu', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `More for ${noun} ${i + 1}` }, h('span', { text: '⋮', 'aria-hidden': 'true' }));
        const item = (k, text, dis, run) => h('button', { type: 'button', role: 'menuitem', class: 'ef-col__mi', 'data-cmd': k, disabled: dis, tabindex: '-1', onclick: () => { close(); run(); } }, h('span', { text }));
        const move = (d) => () => { const n = list.slice(); [n[i], n[i + d]] = [n[i + d], n[i]]; commit(f, n); box.querySelector(`[data-index="${i + d}"] [data-k=col-menu]`)?.focus(); };
        // f.movable(item) / f.removable(item) → false: a row that keeps its place / cannot be removed (e.g. a widget's primary control)
        const mov = (j) => !f.movable || (f.movable(list[j]) !== false), canMove = (d) => mov(i) && i + d >= 0 && i + d < list.length && mov(i + d);
        const menu = h('div', { class: 'ef-col__menu', role: 'menu', 'aria-label': `${noun} ${i + 1}`, hidden: true }, [
          mov(i) ? item('up', 'Move up', !canMove(-1), move(-1)) : null, mov(i) ? item('down', 'Move down', !canMove(1), move(1)) : null,
          f.removable && f.removable(list[i]) === false ? null : item('remove', 'Remove', false, () => { const n = list.slice(); n.splice(i, 1); commit(f, n); (box.querySelector(`[data-index="${Math.min(i, n.length - 1)}"] [data-k=col-edit]`) || box.querySelector('[data-k=col-add]'))?.focus(); })]);
        const items = () => [...menu.querySelectorAll('button:not(:disabled)')];
        const outside = (e) => { if (!menu.contains(e.target) && e.target !== btn) close(); };
        function close(focus) { if (menu.hidden) return; menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside, true); if (focus) btn.focus(); }
        btn.addEventListener('click', () => { if (!menu.hidden) return close(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); document.addEventListener('pointerdown', outside, true); items()[0]?.focus(); });
        menu.addEventListener('keydown', (e) => {
          const bs = items(), j = bs.indexOf(document.activeElement);
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
          else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); bs[(j + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus(); }
          else if (e.key === 'Tab') close();
        });
        return h('span', { class: 'ef-col__menuwrap' }, [btn, menu]);
      };
      const rowsEl = list.map((x, i) => {
        const sm = (f.summary && f.summary(x, i, ha)) || {};
        const ic = h('span', { class: 'ef-col__ic', 'aria-hidden': 'true' });
        // the widget's own static SVG, or an "mdi:…" icon (drawn by the shared icon layer); an allow-listed token name
        if (sm.icon && /^mdi:/.test(sm.icon)) { ic.dataset.mdi = sm.icon; if (global.IniqIcons) global.IniqIcons.fill(ic); } else if (sm.icon) ic.innerHTML = sm.icon;
        if (sm.icon && sm.color) ic.style.color = `var(--${sm.color})`;
        const title = sm.title || `${noun[0].toUpperCase()}${noun.slice(1)} ${i + 1}`;
        return h('li', { class: 'ef-col__row', 'data-index': String(i) }, [ic,
          h('span', { class: 'ef-col__txt' }, [h('b', { class: 'ef-col__t', text: title }), sm.sub ? h('small', { class: 'ef-col__s', text: sm.sub }) : null]),
          sm.value ? h('span', { class: 'ef-col__v', 'data-k': 'col-value', text: sm.value }) : null,
          h('button', { type: 'button', class: 'ef-col__edit', 'data-k': 'col-edit', 'aria-label': `Edit ${title}`, onclick: (e) => openItem(f, i, e.currentTarget) }, h('span', { text: 'Edit' })),
          (f.removable && f.removable(x) === false && f.movable && f.movable(x) === false) ? null : menuOf(i)]);
      });
      // f.canAdd(list, config) → false: nothing more can be added (no Add button at all, e.g. a fixed list of the widget's own controls)
      const add = f.canAdd && f.canAdd(list, draft) === false ? null : h('button', { type: 'button', class: 'ef-col__add', 'data-k': 'col-add', disabled: list.length >= max, onclick: (e) => openItem(f, null, e.currentTarget) },
        h('span', { text: list.length >= max ? `At most ${max}` : (f.addLabel || `+ Add ${noun}`) }));
      const had = box.contains(document.activeElement) ? document.activeElement.closest('[data-index]')?.dataset.index : null;
      box.replaceChildren(...(rowsEl.length ? [h('ul', { class: 'ef-col__list', 'aria-label': f.label }, rowsEl)] : []), ...(add ? [add] : []));
      if (had !== null && had !== undefined) box.querySelector(`[data-index="${had}"] [data-k=col-edit]`)?.focus();   // a live redraw keeps the place
    }
    /** the ITEM EDITOR: a compact modal above the form until Save / Cancel (index null: a new item, created only by Save) */
    function openItem(f, index, opener) {
      if (editing) return;
      const noun = f.itemLabel || 'item', isNew = index === null;
      const list = reg.fieldValue(f, draft) || [];
      let item = isNew ? (f.create ? f.create(list, draft) : {}) : structuredClone(list[index]);
      // the item editor's own sections (f.groups, e.g. Information: Content · Presentation · Icon · Position — a section with nothing to
      // show for the item, such as Icon without an icon, disappears); without them one plain list of fields
      const def = Array.isArray(f.groups) ? { fields: f.fields, groups: f.groups } : { fields: f.fields.map((x) => ({ ...x, group: 'item' })), groups: [['item', '', '']] };
      let unE = null, eId = null, previewing = false;
      /* LIVE PREVIEW: every change in the item editor is shown at once by the configuration's preview (the form's onChange with the item
         in place — the form's own draft is untouched); Save commits it, Cancel shows the configuration as it was again */
      const preview = () => {
        if (!onChange) return;
        const n = list.slice(); if (isNew) n.push(item); else n[index] = item;
        const c = structuredClone(draft);
        if (f.set) f.set(c, structuredClone(n)); else reg.setPath(c, f.key, structuredClone(n));
        previewing = true; onChange(c);
      };
      // f.context(config) → what the item editor may know of the configuration (e.g. what the linked entity can do) — passed to its fields'
      // when(item, context) / optionsFrom(item, context); never stored in the item
      /* LIVE PREVIEW INSIDE THE ITEM EDITOR: this editor is a modal over the configuration and hides its Live preview — so the editor draws
         that preview itself: the host's previewer (the configure dialog's own drawing of the widget: the real renderer, its size) with the
         UNSAVED item in place, redrawn on every change, the edited element outlined (f.previewFocus(item) → a selector inside the widget).
         Without a host previewer, a collection may draw its own (f.preview(item, configuration, context) → an element). Design-only: the
         stage is inert (no gesture reaches the widget), nothing is stored; the previous drawing is disposed when replaced or closed. */
      const ictx = f.context ? f.context(draft) : null;
      const hasPv = !!previewer || typeof f.preview === 'function';
      const pvBox = hasPv ? h('div', { class: 'ef-sub__pv', 'data-k': 'item-preview', hidden: true }) : null;
      const pvStage = pvBox ? h('div', { class: 'ef-sub__pv-stage', inert: true }) : null;
      /* WHOLE WIDGET | THIS ELEMENT: the same real drawing, either all of it or zoomed onto the edited element (its previewFocus) — so a
         dial, a button or an information item is seen at a readable size while it is edited. Design-only, like the whole preview. */
      let pvZoom = false;
      const pvMode = pvBox && typeof f.previewFocus === 'function' ? h('div', { class: 'ef-sub__pv-mode', role: 'group', 'aria-label': 'Preview', hidden: true }, [
        h('button', { type: 'button', class: 'ef-sub__pv-m', 'data-k': 'item-preview-whole', 'aria-pressed': 'true', text: 'Whole widget', onclick: () => { pvZoom = false; paintPreview(); } }),
        h('button', { type: 'button', class: 'ef-sub__pv-m', 'data-k': 'item-preview-element', 'aria-pressed': 'false', text: 'This element', onclick: () => { pvZoom = true; paintPreview(); } })]) : null;
      if (pvBox) pvBox.append(h('div', { class: 'ef-sub__pv-h' }, [h('span', { class: 'ef-sub__pv-l', text: 'Preview' }), pvMode]), pvStage);
      const dispose = (n) => { if (!n) return; try { if (typeof n.dispose === 'function') n.dispose(); else if (typeof n.stop === 'function') n.stop(); } catch (e) { /* gone */ } };
      const withItem = () => { const n = list.slice(); if (isNew) n.push(item); else n[index] = item; const c = structuredClone(draft); if (f.set) f.set(c, structuredClone(n)); else reg.setPath(c, f.key, structuredClone(n)); return c; };
      const paintPreview = () => {
        if (!pvBox) return;
        let next = null, height = null;
        try {
          // measured VISIBLE (a hidden preview measures 0 — the whole widget was then scaled for 520 px and spilled out of a narrow editor)
          const wasHidden = pvBox.hidden; pvBox.hidden = false;
          const avail = Math.max(120, (pvStage.clientWidth || pvBox.clientWidth || 520) - 2);
          if (previewer) {
            const v = previewer(withItem(), avail, 320);
            next = v && v.el; height = v && v.height;
            // the host draws at the widget's LOGICAL size, scaled: its layout box is still the logical size. It sits in a box of exactly
            // its SCALED size (top-left origin), so nothing of it can stick out of the editor — and it is centred like before.
            if (next && next.style && next.style.width) {
              const sc = typeof v.scale === 'number' ? v.scale : (Number((/scale\(([\d.]+)\)/.exec(next.style.transform || '') || [])[1]) || 1);
              const lw = parseFloat(next.style.width) || 0, lh = parseFloat(next.style.height) || (height || 0) / sc;
              next.style.transformOrigin = '0 0';
              const fit = h('div', { class: 'ef-sub__pv-fit' }, next);
              Object.assign(fit.style, { width: `${Math.round(lw * sc)}px`, height: `${Math.round(lh * sc)}px` });
              Object.defineProperty(fit, 'dispose', { value: () => dispose(next) });
              next = fit; height = lh * sc;
            }
          } else next = f.preview(structuredClone(item), structuredClone(draft), ictx);
          pvBox.hidden = wasHidden;
        } catch (e) { console.error(e); next = null; }
        [...pvStage.children].forEach(dispose);
        pvStage.replaceChildren(...(next ? [next] : []));
        pvStage.style.height = height ? `${Math.ceil(height) + 2}px` : '';
        pvBox.hidden = !next;
        // the edited element, outlined (where the collection says which one it is)
        const sel = next && typeof f.previewFocus === 'function' ? f.previewFocus(item) : null;
        const target = sel ? next.querySelector(sel) : null;
        if (pvMode) {
          pvMode.hidden = !target;
          pvMode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.k === 'item-preview-element') === (pvZoom && !!target))));
        }
        pvStage.dataset.zoom = pvZoom && target ? 'element' : '';
        if (target && pvZoom) {
          // zoomed onto the element: the drawing is moved and scaled so the element fills the stage (at most 4×); nothing else changes
          // measured once the widget has laid itself out (its own fit runs after it is placed)
          const zoom = (tries) => {
            if (!target.isConnected || !next.isConnected) return;
            const r = target.getBoundingClientRect(), o0 = next.getBoundingClientRect();
            if (!r.width || !r.height) { if (tries > 0) requestAnimationFrame(() => zoom(tries - 1)); return; }
            const sw = Math.max(120, pvStage.clientWidth - 8), z = Math.max(1, Math.min(4, sw / r.width, 300 / r.height));
            next.style.transformOrigin = '0 0';
            next.style.transform = `translate(${(-(r.left - o0.left) * z + (sw - r.width * z) / 2).toFixed(1)}px, ${(-(r.top - o0.top) * z + 4).toFixed(1)}px) scale(${z.toFixed(3)})`;
            pvStage.style.height = `${Math.ceil(r.height * z) + 8}px`;
            next.dataset.zoom = z.toFixed(3);
          };
          requestAnimationFrame(() => requestAnimationFrame(() => zoom(10)));
          return;
        }
        if (target) requestAnimationFrame(() => {
          if (!target.isConnected) return;
          const r = target.getBoundingClientRect(), o0 = pvStage.getBoundingClientRect();
          if (!r.width || !r.height) return;
          const mark = h('span', { class: 'ef-sub__pv-focus', 'data-k': 'item-preview-focus', 'aria-hidden': 'true' });
          Object.assign(mark.style, { left: `${r.left - o0.left - 3}px`, top: `${r.top - o0.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
          pvStage.append(mark);
        });
      };
      const sub = create({ type: def, config: item, area: ctxArea, context: ictx, onChange: (c) => { item = c; follow(); preview(); paintPreview(); } });
      let pvResize = null;
      // the item's entity is followed while the editor is open (its value choices / live state appear as soon as HA answers)
      function follow() {
        const e = f.entityOf ? f.entityOf(item) : null;
        if (e === eId) return;
        if (unE) unE(); unE = null; eId = e;
        if (e && HAx && HAx.enabled && HAx.enabled()) { let first = true; unE = HAx.subscribe(e, () => { if (first) { first = false; return; } sub.refresh(); }); sub.refresh(); }
      }
      follow();
      const msg = h('p', { class: 'ef-sub__err', role: 'alert', hidden: true });
      const done = (apply) => {
        if (apply) {
          const errs = [...sub.errors(), ...((f.itemErrors && f.itemErrors(item)) || [])];
          if (errs.length) { sub.showErrors(errs); msg.hidden = false; msg.textContent = errs.map((e) => e.message).join(' · '); return; }
          const n = list.slice();
          if (isNew) n.push(item); else n[index] = item;
          close();
          commit(f, n);
          (form.querySelector(`[data-col="${f.key}"] [data-index="${isNew ? n.length - 1 : index}"] [data-k=col-edit]`) || opener)?.focus();
          return;
        }
        close();
        if (previewing && onChange) onChange(structuredClone(draft));        // Cancel: the preview shows the saved configuration again
        (opener && opener.isConnected ? opener : form.querySelector(`[data-col="${f.key}"] [data-k=col-add]`))?.focus();
      };
      const remove = !isNew && !(f.removable && f.removable(list[index]) === false) ? h('button', { type: 'button', class: 'ef-sub__btn ef-sub__btn--danger', 'data-k': 'sub-remove', onclick: () => {
        const n = list.slice(); n.splice(index, 1); close(); commit(f, n); form.querySelector(`[data-col="${f.key}"] [data-k=col-add]`)?.focus(); } }, h('span', { text: 'Remove' })) : null;
      const el = h('dialog', { class: `ef-sub${Array.isArray(f.groups) ? ' ef-sub--grouped' : ''}`, 'aria-labelledby': `${f.key}-sub-t`, 'data-k': 'item-editor' }, [
        h('header', { class: 'ef-sub__head' }, [h('h3', { class: 'ef-sub__t', id: `${f.key}-sub-t`, text: `${isNew ? 'Add' : 'Edit'} ${noun}` })]),
        pvBox,
        h('div', { class: 'ef-sub__body' }, [sub.el, msg]),
        h('div', { class: 'ef-sub__foot' }, [remove, h('span', { class: 'ef-sub__gap' }),
          h('button', { type: 'button', class: 'ef-sub__btn', 'data-k': 'sub-cancel', onclick: () => done(false) }, h('span', { text: 'Cancel' })),
          h('button', { type: 'button', class: 'ef-sub__btn ef-sub__btn--primary', 'data-k': 'sub-save', onclick: () => done(true) }, h('span', { text: 'Save' }))])]);
      // Esc (the dialog's cancel) cancels THIS editor only — the configuration behind it stays open (an open entity list takes its own Esc first)
      el.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
      // the GLOBAL DISMISSAL RULE (a click outside this editor closes neither it nor the configuration behind it)
      if (global.MaisonConfigure && global.MaisonConfigure.guard) global.MaisonConfigure.guard(el); else el.setAttribute('closedby', 'closerequest');
      function close() { if (unE) unE(); unE = null; if (pvResize) pvResize.disconnect(); pvResize = null; if (pvStage) { [...pvStage.children].forEach(dispose); pvStage.replaceChildren(); } if (el.open) el.close(); el.remove(); editing = null; }
      editing = { close };
      (form.isConnected ? form : document.body).append(el);
      el.showModal();
      paintPreview();
      if (pvBox && typeof ResizeObserver === 'function') { let w0 = pvStage.clientWidth; pvResize = new ResizeObserver(() => { if (pvStage.clientWidth !== w0) { w0 = pvStage.clientWidth; paintPreview(); } }); pvResize.observe(pvStage); }
      (el.querySelector('.ef-field input, .ef-field select, .ef-field button') || el.querySelector('button'))?.focus();
    }

    function renderCaps(box) {
      const fx = capsNow();
      box.replaceChildren();
      box.hidden = !fx;
      if (!fx) return;
      const line = (label, items) => box.append(h('p', { class: 'ef-caps__l' }, [h('b', { text: `${label}: ` }), h('span', { text: items.join(' · ') })]));
      const say = (text, tone) => box.append(h('p', { class: `ef-caps__l${tone ? ` ef-caps__l--${tone}` : ''}`, text }));
      if (fx.state === 'loading') return say('Reading what this entity can do…');
      if (fx.state === 'lost') return say(`What this entity can do is not known yet — ${fx.message}.`, 'warn');
      if (fx.state === 'missing') return say('Home Assistant has no entity with this id.', 'warn');
      const sm = fx.summary;
      if (!sm) { box.hidden = true; return; }
      if (sm.supports.length) line('This entity supports', sm.supports);
      if (sm.available.length) line('Available in IniqDash', sm.available);
      if (sm.missing.length) line('Not yet available in IniqDash', sm.missing);
      if (sm.note) say(sm.note, 'warn');
      box.hidden = !box.childNodes.length;
    }

    /** visibility (capability-driven) + values */
    function sync() {
      watchEntity();
      rows.forEach((r) => { const show = reg.isShown(r.f, draft, context); r.wrap.hidden = !show; if (show) r.refresh(); });
      capSig = sigNow();
      form.querySelectorAll('.ef-section').forEach((d) => { d.hidden = ![...d.querySelectorAll('.ef-field')].some((w) => !w.hidden); });
      form.querySelectorAll('.ef-group').forEach((fs) => { fs.hidden = ![...fs.querySelectorAll('.ef-field')].some((w) => !w.hidden); });
      showErrors(errors().filter((e) => touched.has(e.key)), true);
    }
    function errors() { return reg.validateConfig(type, draft, { form: true }); }
    function showErrors(list = errors(), quiet) {
      rows.forEach((r) => { r.msg.hidden = true; r.msg.textContent = ''; r.wrap.classList.remove('is-invalid'); });
      list.forEach((e) => {
        const r = rows.find((x) => x.f.key === e.key && !x.wrap.hidden) || null;
        if (r) {
          r.msg.hidden = false; r.msg.textContent = e.message; r.wrap.classList.add('is-invalid');
          if (!quiet) for (let d = r.wrap.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.setAttribute('open', '');   // every enclosing section
        }
      });
      if (quiet) { summary.hidden = true; return; }
      summary.hidden = !list.length;
      summary.textContent = list.length ? `Please fix ${list.length === 1 ? 'one problem' : `${list.length} problems`}: ${list.map((e) => e.message).join(' · ')}` : '';
      const first = form.querySelector('.is-invalid input, .is-invalid select, .is-invalid button');
      if (first && list.length) first.focus();
    }
    sync();
    return { el: form, value: () => structuredClone(draft), errors, showErrors, refresh: () => sync() };
  }

  global.MaisonForm = { rangeControl, create };
})(window);
