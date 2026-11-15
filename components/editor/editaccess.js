/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqEditAccess — the DISCREET way into the editor while a dashboard is being viewed (the application's normal mode).

     IniqEditAccess.create({ onEdit, mode: 'corner' | 'always', signOut: true }) → { el, setMode(mode), reveal(), hide(), destroy() }

   'corner' (the default):
     · mouse   — rest the pointer in the top-right corner for 2 s → "Edit dashboard" fades in; it fades out a moment after the
                 pointer leaves (never while it is over the control).
     · touch   — press and hold the top-right corner for 2 s → it appears (and stays a few seconds). Moving more than 12 px, lifting
                 the finger or scrolling cancels; nothing is prevented, so a widget in that corner still works normally.
     · keyboard — the control is ALWAYS in the tab order (first): focusing it shows it (Tab from the page start); Shift + E also
                 focuses it. Screen readers always find "Edit dashboard".
   'always': always visible.
   Hidden means: transparent and click-through (pointer-events none) — not removed, so keyboard and assistive technology reach it.
   Sign out sits beside it (the page's CSRF form to logout.php), so a viewer never needs the editor's header to leave.
   ========================================================================== */
(function (global) {
  'use strict';
  const HOLD = 2000, ZONE = 96, SLOP = 12, LINGER = 1400, TOUCH_STAY = 6000;

  function create({ onEdit, mode = 'corner', signOut = true } = {}) {
    const root = document.createElement('div');
    root.className = 'iqea';
    const modeOf = (m) => (m === 'always' || m === 'locked' ? m : 'corner');   // locked (?noedit, a wall tablet): no way into the editor here
    root.dataset.mode = modeOf(mode);
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Dashboard controls');
    const edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'iqea__edit'; edit.dataset.k = 'edit-dashboard';
    edit.setAttribute('aria-label', 'Edit dashboard');
    edit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/></svg><span>Edit dashboard</span>';
    edit.addEventListener('click', () => { hide(true); if (onEdit) onEdit(); });
    root.append(edit);
    const csrf = document.querySelector('meta[name="iniqdash-csrf"]');
    if (signOut && csrf) {
      const f = document.createElement('form');
      f.method = 'post'; f.action = 'logout.php'; f.className = 'iqea__out';
      const t = document.createElement('input'); t.type = 'hidden'; t.name = 'csrf'; t.value = csrf.content;
      const b = document.createElement('button'); b.type = 'submit'; b.className = 'iqea__signout'; b.dataset.k = 'sign-out'; b.textContent = 'Sign out';
      f.append(t, b); root.append(f);
    }
    let timer = 0, leave = 0, press = null, shown = false;
    const inCorner = (x, y) => x >= innerWidth - ZONE && y <= ZONE;
    function reveal() { if (root.dataset.mode === 'locked') return; clearTimeout(leave); shown = true; root.dataset.shown = 'true'; }
    function hide(now) {
      clearTimeout(timer); timer = 0;
      if (now) { clearTimeout(leave); shown = false; delete root.dataset.shown; return; }
      clearTimeout(leave);
      leave = setTimeout(() => { if (!root.matches(':hover') && !root.contains(document.activeElement)) { shown = false; delete root.dataset.shown; } }, LINGER);
    }
    /* mouse: a 2-second rest in the corner */
    function onMove(e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (root.dataset.mode === 'always' || root.dataset.mode === 'locked') return;
      if (inCorner(e.clientX, e.clientY)) { if (!timer && !shown) timer = setTimeout(() => { timer = 0; reveal(); }, HOLD); }
      else { clearTimeout(timer); timer = 0; if (shown && !root.contains(e.target)) hide(false); }
    }
    /* touch: a 2-second press in the corner; movement, release or a scroll cancels */
    function onDown(e) {
      if (e.pointerType === 'mouse' || root.dataset.mode !== 'corner' || !inCorner(e.clientX, e.clientY)) return;
      press = { x: e.clientX, y: e.clientY, id: e.pointerId, t: setTimeout(() => { press = null; reveal(); clearTimeout(leave); leave = setTimeout(() => { if (!root.contains(document.activeElement)) hide(true); }, TOUCH_STAY); }, HOLD) };
    }
    const cancelPress = () => { if (press) { clearTimeout(press.t); press = null; } };
    function onPMove(e) { if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) cancelPress(); }
    function onKey(e) {
      if (root.dataset.mode !== 'locked' && e.key === 'E' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') && !document.activeElement?.isContentEditable) {
        e.preventDefault(); edit.focus();
      }
    }
    root.addEventListener('focusin', () => reveal());
    root.addEventListener('focusout', () => setTimeout(() => { if (!root.contains(document.activeElement)) hide(false); }, 0));
    root.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && shown) hide(false); });
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointermove', onPMove, { passive: true });
    ['pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, cancelPress, { passive: true }));
    window.addEventListener('scroll', cancelPress, { passive: true, capture: true });
    document.addEventListener('keydown', onKey);
    return {
      el: root, edit, reveal, hide: () => hide(true),
      setMode(m) { root.dataset.mode = modeOf(m); },
      /** the corner-gesture state (tests) */
      shown: () => root.dataset.mode === 'always' || !!shown,
      destroy() {
        cancelPress(); clearTimeout(timer); clearTimeout(leave);
        document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerdown', onDown); document.removeEventListener('pointermove', onPMove);
        ['pointerup', 'pointercancel'].forEach((t) => document.removeEventListener(t, cancelPress));
        window.removeEventListener('scroll', cancelPress, { capture: true }); document.removeEventListener('keydown', onKey);
        root.remove();
      },
    };
  }
  global.IniqEditAccess = Object.freeze({ create, HOLD, ZONE });
})(window);
