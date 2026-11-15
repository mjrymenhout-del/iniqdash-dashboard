/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Button Widget V1 — a general-purpose, designable button.

   MaisonButton.create(config) → HTMLElement (.bw), with
     el.button = { getState(), setState(patch), press(opts) }

   config = {
     id,
     text, secondary, value, unit        content (plain text; shown according to the layout)
     icon:     name in `icons`           image: assets/… or https://… (safe paths only)
     shape:    'rect' | 'square' | 'round' | 'pill'
     layout:   'centered' | 'icon-top' | 'icon-left' | 'icon-right' | 'image-top' | 'background' | 'value' | 'icon-only'
     action:   'none' | 'demo' | 'popup' | 'navigate' | 'toggle' | 'ha'   (what a press REQUESTS;
                                          'ha' = a Home Assistant entity, handled by the IniqHA binding)
     popup, page                          the target of 'popup' / 'navigate'
     on:       false                      local display state (shown as active) — independent of the action;
                                          a 'toggle' action flips it
     available: true
     icons:    { name: svgMarkup }        the host's static icon set
     onPress:  (request, meta) => void    request = { action: { type, popup?, page?, label }, on }
                                          meta = { source: 'pointer' | 'keyboard' | 'api' }
   }
   The component never executes anything: it reports the request (action 'none' reports nothing).
   setState() never calls onPress. The presentation follows the widget's OWN width (container
   queries): narrow buttons drop the secondary text, very small ones keep the icon / value only.
   ========================================================================== */
(function (global) {
  'use strict';

  const SHAPES = ['rect', 'square', 'round', 'pill'];
  const LAYOUTS = ['centered', 'icon-top', 'icon-left', 'icon-right', 'image-top', 'background', 'value', 'icon-only'];
  const ACTIONS = ['none', 'demo', 'popup', 'navigate', 'toggle', 'ha'];
  const SAFE_IMG = /^(?!.*\.\.)(assets\/[A-Za-z0-9._\/-]+|widgets\/(default|custom)\/[a-z0-9][a-z0-9-]*\/(?:[a-z0-9][a-z0-9-]*\/)?assets\/[A-Za-z0-9._\/-]+|api\/asset\.php\?id=[0-9a-f]{32}|https:\/\/[^\s"'<>()]+|data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+)$/;
  const GENERIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/></svg>';

  function create(config) {
    let s = { text: 'Button', secondary: '', value: '', unit: '', icon: '', image: '', shape: 'rect', layout: 'icon-left', action: 'demo', on: false, available: true, icons: {}, ...(config || {}) };
    const root = document.createElement('article');
    root.className = 'bw';
    if (s.id) root.dataset.buttonId = s.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bw__b';
    root.append(btn);
    let lastKey = false;

    const one = (v, list, d) => (list.includes(v) ? v : d);
    function render() {
      const layout = one(s.layout, LAYOUTS, 'icon-left'), shape = one(s.shape, SHAPES, 'rect'), action = one(s.action, ACTIONS, 'demo');
      root.dataset.layout = layout; root.dataset.shape = shape; root.dataset.action = action;
      root.dataset.on = String(!!s.on); root.dataset.available = String(s.available !== false);
      btn.disabled = s.available === false || action === 'none';
      btn.classList.toggle('is-static', action === 'none');
      if (action === 'toggle') btn.setAttribute('aria-pressed', String(!!s.on)); else btn.removeAttribute('aria-pressed');
      btn.setAttribute('aria-label', [s.text, s.value !== '' && s.value != null ? `${s.value}${s.unit ? ` ${s.unit}` : ''}` : '', s.secondary].filter(Boolean).join(' · ') || 'Button');
      btn.replaceChildren();
      const add = (cls, text) => { const e = document.createElement('span'); e.className = cls; if (text !== undefined) e.textContent = text; btn.append(e); return e; };
      const useImg = (layout === 'image-top' || layout === 'background') && s.image && SAFE_IMG.test(s.image);
      if (layout === 'background') btn.style.backgroundImage = useImg ? `linear-gradient(180deg, rgba(10,11,14,.1), rgba(10,11,14,.78)), url("${s.image}")` : '';
      else btn.style.backgroundImage = '';
      if (useImg && layout === 'image-top') { const im = document.createElement('img'); im.className = 'bw__img'; im.alt = ''; im.src = s.image; btn.append(im); }
      if (['centered', 'icon-top', 'icon-left', 'icon-right', 'icon-only', 'value'].includes(layout) && (s.icon || layout === 'icon-only')) add('bw__icon').innerHTML = (s.icons && s.icons[s.icon]) || GENERIC;   // static markup from the host's icon set
      const txt = layout === 'icon-only' ? null : add('bw__txt');
      if (txt) {
        if (layout === 'value') { const v = document.createElement('span'); v.className = 'bw__value'; v.textContent = s.value === '' || s.value == null ? '—' : String(s.value); if (s.unit) { const u = document.createElement('small'); u.textContent = s.unit; v.append(u); } txt.append(v); }
        const t = document.createElement('span'); t.className = 'bw__text'; t.textContent = s.text || ''; txt.append(t);
        if (s.secondary && layout !== 'value') { const t2 = document.createElement('span'); t2.className = 'bw__sec'; t2.textContent = s.secondary; txt.append(t2); }
      }
    }
    function press(source = 'api') {
      const action = one(s.action, ACTIONS, 'demo');
      if (s.available === false || action === 'none') return false;
      if (action === 'toggle') { s.on = !s.on; render(); }
      root.classList.remove('is-pressed'); void root.offsetWidth; root.classList.add('is-pressed');
      setTimeout(() => root.classList.remove('is-pressed'), 260);
      const req = { type: action, label: s.text || '' };
      if (action === 'popup') req.popup = s.popup;
      if (action === 'navigate') req.page = s.page;
      if (typeof s.onPress === 'function') s.onPress({ action: req, on: !!s.on }, { source });
      return true;
    }
    btn.addEventListener('keydown', (e) => { lastKey = e.key === 'Enter' || e.key === ' '; });
    btn.addEventListener('pointerdown', () => { lastKey = false; });
    btn.addEventListener('click', () => { const src = lastKey ? 'keyboard' : 'pointer'; lastKey = false; press(src); });
    render();
    root.button = {
      getState: () => ({ on: !!s.on, available: s.available !== false, action: s.action, layout: s.layout, shape: s.shape }),
      /** External update (display / state). Never calls onPress. */
      setState(patch = {}) { s = { ...s, ...patch }; render(); },
      press: () => press('api'),
    };
    return root;
  }

  /** Smallest usable area: 1 × 1 (icon only / value), everywhere. */
  function constraints() { return { minW: { desktop: 1, tablet: 1, mobile: 1 }, minH: 1 }; }

  global.MaisonButton = { create, constraints, SHAPES, LAYOUTS, ACTIONS };
})(window);
