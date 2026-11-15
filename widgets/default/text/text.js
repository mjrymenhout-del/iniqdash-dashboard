/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Text / Label Widget V1 — headings and labels ("Living Room", "Ground Floor", "Welcome Home"),
   or a live line from Home Assistant ("Outside Temperature · 12.4 °C").

   MaisonText.create(config) → HTMLElement (.tx), with el.text = { getState(), setState(patch) }
   config = {
     id
     primary:    main text                 secondary: optional second line
     align:      'left' | 'center' | 'right'
     size:       's' | 'm' | 'l' | 'xl'    (relative to the widget's own box — MaisonFit)
     emphasis:   'normal' | 'strong' | 'muted'
     surface:    true → card background; false → text directly on the dashboard
     tone:       'none' | 'unavailable'     (set by the HA binding)
   }
   PLAIN TEXT ONLY: everything is written with textContent — no HTML is ever interpreted.
   ========================================================================== */
(function (global) {
  'use strict';

  function create(config) {
    // TEMPLATES ({{ … }}, components/ha/template.js): linked → config.items holds the rendered lines (the binding re-renders on every
    // change); not linked → rendered once without live values ("—" where a value would be)
    const T = global.IniqTemplate;
    const lines = (p) => { if (p.items && typeof p.items === 'object') { const o = { ...p, primary: p.items.primary, secondary: p.items.secondary }; delete o.items; return o; }
      if (T && (T.has(p.primary) || T.has(p.secondary))) return { ...p, primary: T.render(p.primary || '', () => null), secondary: T.render(p.secondary || '', () => null) }; return p; };
    let s = lines({ primary: 'Label', secondary: '', align: 'left', size: 'm', emphasis: 'strong', surface: false, ...(config || {}) });
    const root = document.createElement('article');
    root.className = 'tx';
    if (s.id) root.dataset.textId = s.id;
    root.innerHTML = '<div class="tx__in"><p class="tx__p"></p><p class="tx__s"></p></div>';
    const $ = (q) => root.querySelector(q);
    function render() {
      root.dataset.align = ['left', 'center', 'right'].includes(s.align) ? s.align : 'left';
      // the text size: a number (its size at the reference box, the configurator's shared Slider + Number) or a former Small…Extra large
      if (typeof s.size === 'number' && Number.isFinite(s.size)) { root.dataset.size = 'n'; root.style.setProperty('--tx-size', String(Math.min(80, Math.max(10, s.size)))); }
      else { root.dataset.size = ['s', 'm', 'l', 'xl'].includes(s.size) ? s.size : 'm'; root.style.removeProperty('--tx-size'); }
      root.dataset.emphasis = ['normal', 'strong', 'muted'].includes(s.emphasis) ? s.emphasis : 'strong';
      root.dataset.surface = String(!!s.surface);
      root.dataset.tone = s.tone || 'none';
      $('.tx__p').textContent = String(s.primary ?? '');
      $('.tx__s').textContent = String(s.secondary ?? '');
      $('.tx__s').hidden = !s.secondary && s.secondary !== 0;
      root.setAttribute('aria-label', [s.primary, s.secondary].filter((x) => x !== '' && x !== undefined && x !== null).join(': '));
    }
    render();
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w, h) => (h < 70 ? 'line' : 'block') });
    root.text = {
      getState: () => ({ primary: s.primary, secondary: s.secondary }),
      setState(patch) { s = { ...s, ...lines({ ...(patch || {}) }) }; render(); },
    };
    return root;
  }

  function constraints() { return { minW: { desktop: 1, tablet: 1, mobile: 1 }, minH: 1 }; }

  global.MaisonText = { create, constraints };
})(window);
