/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqArtwork — the shared IMAGE component: one picture in its own box. It shows only what the configuration names, through the same
   allow-list every IniqDash image location passes (a shared asset, a widget package's own asset, an uploaded IniqDash User Asset
   "api/asset.php?id=…", or https) — never a data: URL, never a path outside those. Which images a widget may pick (its widget type's
   IMAGE LIBRARY and built-in artworks) is the configuration's business (the shared artwork picker, registry F.artwork).

   IniqArtwork.render({ image, fit: 'cover' | 'contain', radius: px, opacity: %, focusX / focusY: % (the CROP's focal point: which part
     of the picture stays in view — 50/50 the centre), zoom: % (100–400: crops in further around the focal point) }) → <div class="iqa">
     (no image: an empty frame)
   ========================================================================== */
(function (global) {
  'use strict';

  const SAFE = /^(?!.*\.\.)(assets\/[A-Za-z0-9._\/-]+|widgets\/(default|custom)\/[a-z0-9][a-z0-9-]*\/(?:[a-z0-9][a-z0-9-]*\/)?assets\/[A-Za-z0-9._\/-]+|api\/asset\.php\?id=[0-9a-f]{32}|https:\/\/[^\s"'<>()]+)$/;
  const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

  function render(c = {}) {
    const el = document.createElement('div');
    el.className = 'iqa';
    el.dataset.fit = c.fit === 'contain' ? 'contain' : 'cover';
    el.style.setProperty('--iqa-r', `${num(c.radius, 0, 200, 12)}px`);
    el.style.setProperty('--iqa-o', String(num(c.opacity, 0, 100, 100) / 100));
    const src = typeof c.image === 'string' && SAFE.test(c.image) ? c.image : null;
    if (src) {
      const img = document.createElement('img');
      img.className = 'iqa__img'; img.alt = ''; img.decoding = 'async'; img.draggable = false; img.src = src;
      // CROP: the focal point stays in view (object-position) and the zoom scales the picture around it — inside the frame (overflow hidden)
      const fx = num(c.focusX, 0, 100, 50), fy = num(c.focusY, 0, 100, 50), z = num(c.zoom, 100, 400, 100);
      if (fx !== 50 || fy !== 50) img.style.objectPosition = `${fx}% ${fy}%`;
      if (z !== 100) { img.style.transformOrigin = `${fx}% ${fy}%`; img.style.transform = `scale(${z / 100})`; }
      img.addEventListener('error', () => { el.dataset.empty = ''; img.remove(); });
      el.append(img);
    } else el.dataset.empty = '';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  global.IniqArtwork = Object.freeze({ render, SAFE });
  if (global.IniqComponents) global.IniqComponents.define('image', { name: 'Image', category: 'visual', module: 'IniqArtwork.render', render: (c) => render(c),
    contract: { image: 'an allowed image location (the widget type’s image library, a built-in artwork, an uploaded User Asset)', fit: "'cover' | 'contain'", radius: 'px', opacity: '%', focusX: '%', focusY: '%', zoom: '% (100–400)' },
    capabilities: ['picture', 'fit', 'crop (focal point + zoom)', 'corner radius', 'opacity'], state: 'none (a picture)',
    compose: { defaults: { image: 'none', fit: 'cover', radius: 12 }, data: {}, box: { w: 160, h: 100 }, min: { w: 16, h: 16 }, editor: {},
      resize: { mode: 'fill', aspect: 'free' },                    // FILL: the picture IS its box (cover / contain inside it)
      scale: null,                                                 // nothing to scale: Shift + resize is a resize (the box is the picture)
      render: (c) => render(c) } });
})(window);
