/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Image Widget V1 — a picture that fills the widget's own box.
   MaisonImage.create(config) → HTMLElement (.im), with el.image = { getState(), setState(patch) }
   config = {
     id, name (alt text / caption)
     src:       a local asset (assets/…), an https:// address or an embedded image — validated by the
                registry; with Home Assistant: IniqDash's own picture endpoint (api/ha_img.php),
                never Home Assistant's address or token
     fit:       'cover' | 'contain'
     position:  'center' | 'top' | 'bottom' | 'left' | 'right'
     caption:   true → the name over the picture
     surface:   true → card background behind 'contain' pictures
     available: true
     slides:    PHOTO FRAME — more pictures after src (each validated like src); shown in turn every `interval` seconds
                (5–3600, default 10) with a cross-fade, in order or shuffled (shuffle: true). Paused while the page is hidden
                or the widget is off screen. A picture that fails is skipped. An entity's picture never rotates.
   }
   A picture that cannot be loaded shows a quiet placeholder instead of a broken image.
   ========================================================================== */
(function (global) {
  'use strict';

  const PH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5.5-5.5 4 4 2.5-2.5 4.5 4.5"/></svg>';
  const POS = { center: '50% 50%', top: '50% 0%', bottom: '50% 100%', left: '0% 50%', right: '100% 50%' };

  function create(config) {
    let s = { fit: 'cover', position: 'center', caption: false, surface: true, available: true, ...(config || {}) };
    const root = document.createElement('figure');
    root.className = 'im';
    if (s.id) root.dataset.imageId = s.id;
    root.innerHTML = `<img class="im__img" alt="" decoding="async" draggable="false"><img class="im__img im__next" alt="" decoding="async" draggable="false" aria-hidden="true"><div class="im__ph">${PH}<span></span></div><figcaption class="im__cap"></figcaption>`;
    const $ = (q) => root.querySelector(q);
    const img = $('.im__img:not(.im__next)'), nxt = $('.im__next');
    let shown = '';
    img.addEventListener('load', () => { root.dataset.img = 'ok'; });
    img.addEventListener('error', () => { root.dataset.img = 'none'; $('.im__ph span').textContent = 'Image not available'; });
    function render() {
      root.dataset.fitMode = s.fit === 'contain' ? 'contain' : 'cover';
      root.dataset.surface = String(s.surface !== false);
      root.dataset.caption = String(!!s.caption);
      root.style.setProperty('--im-pos', POS[s.position] || POS.center);
      $('.im__cap').textContent = s.name || '';
      img.alt = s.name || '';
      const src = s.available === false ? '' : String(s.src || '');
      if (!src) { root.dataset.img = 'none'; shown = ''; img.removeAttribute('src'); $('.im__ph span').textContent = s.available === false ? 'Unavailable' : 'No image'; return; }
      if (src !== shown) { shown = src; root.dataset.img = 'loading'; $('.im__ph span').textContent = 'Loading…'; img.src = src; }
    }
    // ---- the photo frame: the next picture loads in the hidden layer, then fades in and becomes the shown one
    let idx = 0, order = [], timer = 0, seen = false;
    const pics = () => (s.available === false || s.entity ? [] : [s.src, ...(Array.isArray(s.slides) ? s.slides : [])].filter((x) => typeof x === 'string' && x));
    const every = () => Math.max(5, Math.min(3600, Number(s.interval) || 10)) * 1000;
    const reorder = () => { const n = pics().length; order = [...Array(n).keys()]; if (s.shuffle) for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } };
    function advance() {
      const list = pics();
      if (list.length < 2) return;
      if (!root.isConnected) { if (seen) { clearInterval(timer); timer = 0; } return; }
      seen = true;
      if (document.hidden || root.closest('dialog')) return;
      const r = root.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || r.width === 0) return;
      idx = (idx + 1) % list.length;
      if (idx === 0 && s.shuffle) reorder();
      const src = list[order[idx] ?? idx];
      nxt.onload = () => { nxt.classList.add('im__in'); setTimeout(() => { shown = src; img.src = src; nxt.classList.remove('im__in'); root.dataset.slide = String(idx); }, 900); };
      nxt.onerror = () => { nxt.onload = null; };
      nxt.src = src;
    }
    function slides() {
      clearInterval(timer); timer = 0;
      root.dataset.frame = String(pics().length > 1);
      if (pics().length > 1) { reorder(); timer = setInterval(advance, every()); }
    }
    root.setAttribute('role', 'img');
    render();
    slides();
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w, h) => (w < 140 || h < 90 ? 'mini' : 'full') });
    root.image = {
      getState: () => ({ src: shown, loaded: root.dataset.img === 'ok', slide: idx, count: pics().length }),
      setState(patch) { const again = patch && ('slides' in patch || 'interval' in patch || 'shuffle' in patch || 'src' in patch); s = { ...s, ...patch }; render(); if (again) { idx = 0; slides(); } },
      next: advance,
    };
    return root;
  }

  function constraints() { return { minW: { desktop: 1, tablet: 1, mobile: 1 }, minH: 1 }; }

  global.MaisonImage = { create, constraints };
})(window);
