/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Shared helpers for the newer showroom pages (development aid, not part of any component):
   mounting demos, the onChange log line, and the SHOW GRID overlay. */
(function () {
  'use strict';
  const G = window.MaisonGrid;
  const mount = (key, node) => document.querySelector(`[data-demo="${key}"]`).appendChild(node);
  const logger = (el) => (text) => { if (el) el.textContent = text; };

  function overlay(firstGridSelector) {
    const btn = document.getElementById('toggle-grid'), readout = document.getElementById('bp-read');
    if (!btn) return;
    function label(gridRoot) {
      const grid = gridRoot.querySelector(':scope > .mg__grid'), cs = getComputedStyle(grid);
      const cols = parseInt(cs.getPropertyValue('--mg-cols'), 10), gap = parseFloat(cs.columnGap) || 0;
      const g = grid.getBoundingClientRect(), colStep = (g.width + gap) / cols, rowStep = 40 + (parseFloat(cs.rowGap) || 0);
      gridRoot.dataset.bp = `${G.breakpointOf(gridRoot)} · ${cols} col · ${Math.round(g.width)}px`;
      grid.querySelectorAll(':scope > .mg__item').forEach((it) => {
        const r = it.getBoundingClientRect();
        let b = it.querySelector(':scope > .gx-badge');
        if (!b) { b = document.createElement('span'); b.className = 'gx-badge'; it.appendChild(b); }
        b.textContent = `${it.dataset.gridId}  x${Math.round((r.left - g.left) / colStep) + 1} y${Math.round((r.top - g.top) / rowStep) + 1} · w${Math.round((r.width + gap) / colStep)} h${Math.round((r.height + gap) / rowStep)}`;
      });
    }
    function refresh() {
      const main = document.querySelector(firstGridSelector);
      if (main) readout.textContent = `${G.breakpointOf(main)} · ${getComputedStyle(main.firstElementChild).getPropertyValue('--mg-cols').trim()} columns`;
      if (document.body.classList.contains('show-grid')) document.querySelectorAll('.mg').forEach(label);
    }
    function set(on) {
      document.body.classList.toggle('show-grid', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'Hide grid' : 'Show grid';
      refresh();
    }
    btn.addEventListener('click', () => set(!document.body.classList.contains('show-grid')));
    new ResizeObserver(refresh).observe(document.querySelector('main'));
    set(new URLSearchParams(location.search).get('grid') === '1');
  }

  window.Showroom = { mount, logger, overlay };
})();
