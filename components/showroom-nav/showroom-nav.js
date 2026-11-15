/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Showroom navigation — development aid for the developer showroom (dev/) only.
   (Not Maison navigation, not dashboard navigation, not part of the widget system.)

   Each page only needs:
     <link rel="stylesheet" href="components/showroom-nav/showroom-nav.css">
     <div data-showroom-nav></div>
     <script src="components/showroom-nav/showroom-nav.js"></script>

   The page list lives HERE, in one place. The current page highlights itself.
   Very wide (≥ 1500px bar): one row of links. Otherwise a "Components · <page>" menu button opens a
   grouped list (Foundations / Tools / Widgets); Esc, a click outside or choosing a page closes it.
   ========================================================================== */
(function () {
  'use strict';

  // the DEVELOPER SHOWROOM (dev/, served only when the installation enables it — server/local.php 'dev_showroom' => true).
  // Only pages that exist are listed; the dashboard application itself is the site root.
  const PAGES = [
    { href: 'index.html', label: 'Grid', group: 'Foundations' },
    { href: '../', label: 'Dashboard', group: 'Application' },
  ];

  function currentFile() {
    const f = location.pathname.split('/').pop();
    return f === '' ? 'index.html' : f;
  }

  function build(mount) {
    const here = currentFile();
    const cur = PAGES.find((p) => p.href === here);
    const id = 'snav-list';
    mount.classList.add('snav');
    mount.setAttribute('role', 'navigation');
    mount.setAttribute('aria-label', 'Showroom pages');
    mount.innerHTML = `
      <div class="snav__bar">
        <span class="snav__brand">Maison<span> · components</span></span>
        <button type="button" class="snav__toggle" aria-expanded="false" aria-controls="${id}">
          <span class="snav__toggle-k">Components</span>
          <span class="snav__toggle-v"></span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <ul class="snav__list" id="${id}"></ul>
      </div>`;
    const list = mount.querySelector('.snav__list');
    let group = null;
    PAGES.forEach((p) => {
      if (p.group !== group) {                       // group labels (shown in the drop-down only)
        group = p.group;
        const g = document.createElement('li');
        g.className = 'snav__group';
        g.setAttribute('role', 'presentation');
        g.textContent = group;
        list.appendChild(g);
      }
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = p.href;
      a.textContent = p.label;
      if (p.href === here) a.setAttribute('aria-current', 'page');
      li.appendChild(a);
      list.appendChild(li);
    });
    const toggle = mount.querySelector('.snav__toggle');
    mount.querySelector('.snav__toggle-v').textContent = cur ? cur.label : '';
    // Served by the IniqDash server (signed in): a Sign out button. It POSTs the page's CSRF token;
    // the server destroys the session. Local demo files have no such meta, so no button.
    const csrf = document.querySelector('meta[name="iniqdash-csrf"]');
    if (csrf) {
      const f = document.createElement('form');
      f.className = 'snav__out';
      f.method = 'post';
      f.action = 'logout.php';
      const t = document.createElement('input');
      t.type = 'hidden'; t.name = 'csrf'; t.value = csrf.content;
      const b = document.createElement('button');
      b.type = 'submit'; b.className = 'snav__out-b'; b.textContent = 'Sign out';
      f.append(t, b);
      mount.querySelector('.snav__bar').appendChild(f);
    }

    const isOpen = () => mount.classList.contains('is-open');
    function open() {
      mount.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      (list.querySelector('[aria-current="page"]') || list.querySelector('a')).focus();
    }
    function close(returnFocus) {
      if (!isOpen()) return;
      mount.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      if (returnFocus) toggle.focus();
    }
    toggle.addEventListener('click', () => (isOpen() ? close(true) : open()));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { e.preventDefault(); close(true); } });
    document.addEventListener('pointerdown', (e) => { if (isOpen() && !mount.contains(e.target)) close(false); });
    // arrow keys move through the open menu
    list.addEventListener('keydown', (e) => {
      if (!isOpen() || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const links = [...list.querySelectorAll('a')];
      let i = links.indexOf(document.activeElement);
      i = e.key === 'Home' ? 0 : e.key === 'End' ? links.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      e.preventDefault();
      links[i].focus();
    });
    // if the bar becomes wide while the menu is open, the menu state no longer applies
    new ResizeObserver(() => { if (getComputedStyle(toggle).display === 'none') close(false); }).observe(mount);
  }

  function init() { document.querySelectorAll('[data-showroom-nav]').forEach(build); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.ShowroomNav = { PAGES };
})();
