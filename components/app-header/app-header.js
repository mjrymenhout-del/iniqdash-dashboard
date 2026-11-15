/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Application header — one compact line above the editor: "IniqDash / <dashboard>" and, when the page is
   served by the IniqDash server (signed in), Sign out. Nothing else: the editor below starts right away.

   <div data-app-header></div>  +  IniqHeader.setName('Maison')
   Sign out is the same form the showroom navigation used: it POSTs the page's CSRF token to
   logout.php and the server destroys the session. Local demo files have no CSRF meta → no button.
   ========================================================================== */
(function (global) {
  'use strict';

  function build(mount) {
    if (mount.classList.contains('iqh')) return;          // already built (setName may run first)
    mount.classList.add('iqh');
    mount.setAttribute('role', 'banner');
    mount.innerHTML = '<p class="iqh__id"><svg class="iqh__mark" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="7" fill="var(--accent)"/><path d="M8 17V8.5M12 17V7M16 17v-5.5" stroke="var(--accent-on)" stroke-width="2.4" stroke-linecap="round"/></svg><b class="iqh__brand">IniqDash</b><span class="iqh__sep" aria-hidden="true">/</span><span class="iqh__name"></span></p>';
    const csrf = document.querySelector('meta[name="iniqdash-csrf"]');
    if (csrf) {
      const f = document.createElement('form');
      f.className = 'iqh__out';
      f.method = 'post';
      f.action = 'logout.php';
      const t = document.createElement('input');
      t.type = 'hidden'; t.name = 'csrf'; t.value = csrf.content;
      const b = document.createElement('button');
      b.type = 'submit'; b.className = 'iqh__out-b'; b.textContent = 'Sign out';
      f.append(t, b);
      mount.appendChild(f);
    }
  }
  function init() { document.querySelectorAll('[data-app-header]').forEach(build); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  global.IniqHeader = {
    /** the dashboard's name after the brand ("IniqDash / Maison"); plain text */
    setName(name) {
      document.querySelectorAll('[data-app-header]').forEach((m) => {
        if (!m.querySelector('.iqh__name')) build(m);
        m.querySelector('.iqh__name').textContent = String(name || '');
        m.querySelector('.iqh__sep').hidden = !name;
      });
    },
  };
})(window);
