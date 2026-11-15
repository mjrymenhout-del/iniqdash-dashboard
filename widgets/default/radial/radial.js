/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Radial Action Menu V1 — a compact tile whose centre control expands into a ring of 4, 6 or 8
   action segments. One component for all three counts.

   MaisonRadial.create(config) → HTMLElement (.rm), with
     el.radial = { getState(), setState(patch), open(), close(), activate(index, opts), destroy() }

   config = {
     id, name,
     count:      any whole number 2–8           (anything else → 8); the ring is divided evenly
     float:      true = a free-floating centre button (no tile chrome) — placement is the host's job
     actions:    [{ label?, title?, icon, type, page?, enabled, confirm, keepOpen, on? }, …]
                 only the first `count` are shown. `type` is opaque to the component, except
                 'toggle', whose segment keeps a local on/off (active) state.
                 title = accessible name when there is no label (the host may provide it).
     icons:      { name: svgMarkup }            static icon set supplied by the host
     available:  true
     confirmTimeout: 4000                       ms an armed confirmation waits for the second press
     overlayRoot: document.body                 where the expanded ring is rendered (default: the body, or the
                                                open modal dialog the tile is in — see below)
     onAction:   (request, meta) => void
                 request = { index, action: { …copy }, active }   meta = { source: 'pointer' | 'keyboard' | 'api' }
   }
   The component never executes anything: it REPORTS the request (the application decides what a
   type means — demo, navigate to a page, later Home Assistant services). setState() never calls
   onAction.

   Geometry: each action is an annular sector (360° / count, a constant px gap between sectors)
   drawn as a real button clipped to its sector (clip-path: path()), so the hit area IS the
   segment. Icons sit at the middle of the sector; labels appear only when the allocation is wide
   (config.ring sets the ring size instead of the widget's width: a corner button can open a large, labelled ring)
   enough. The ring size follows the widget's OWN width: compact < 200px, standard < 360px, wide.

   Temporary overflow: the open ring is rendered in an overlay layer (a fixed-position element in
   overlayRoot, above everything) centred on the collapsed control. Nothing in the grid moves,
   nothing is clipped by the grid cell or a container, and closing removes the overlay entirely.
   A transparent backdrop catches the outside click (it closes the ring and does not reach the
   widget underneath).

   Keyboard: Enter / Space on the centre opens (focus goes to the first enabled segment); arrows
   move around the ring (clockwise: → ↓, anticlockwise: ← ↑), Home / End; Enter / Space activates;
   Escape closes. Confirmation: first press arms the segment, a second press on it runs it; another
   segment, Escape or an outside click cancels.
   ========================================================================== */
(function (global) {
  'use strict';

  const COUNTS = [2, 3, 4, 5, 6, 7, 8];
  const NS = 'http://www.w3.org/2000/svg';
  const GENERIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/></svg>';
  const CENTRE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="4.5" r="1.6"/><circle cx="12" cy="19.5" r="1.6"/><circle cx="4.5" cy="12" r="1.6"/><circle cx="19.5" cy="12" r="1.6"/></svg>';
  const CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
  const TIERS = { compact: { depth: 66, labels: false }, standard: { depth: 78, labels: 6 }, wide: { depth: 96, labels: 8 } };
  let uid = 0;

  /** annular sector path (clockwise from a0 to a1, radians), constant px gap on both arcs */
  function sector(cx, cy, r0, r1, a0, a1, gap) {
    const go = gap / 2 / r1, gi = gap / 2 / r0;
    const A = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
    const large = a1 - a0 - 2 * go > Math.PI ? 1 : 0;
    return `M${A(r1, a0 + go)} A${r1} ${r1} 0 ${large} 1 ${A(r1, a1 - go)} L${A(r0, a1 - gi)} A${r0} ${r0} 0 ${large} 0 ${A(r0, a0 + gi)} Z`;
  }

  function create(config) {
    let s = { name: 'Quick actions', count: 8, actions: [], icons: {}, available: true, confirmTimeout: 4000, ...(config || {}) };
    const id = `rm-${++uid}`;
    let open = false, armed = null, tArm = null, ring = null, lastKey = false, opener = 'pointer';
    let active = (s.actions || []).map((a) => !!(a && a.on));

    const root = document.createElement('article');
    root.className = 'rm';
    if (s.id) root.dataset.radialId = s.id;
    root.innerHTML = `<div class="rm__in">
      <button type="button" class="rm__centre" aria-haspopup="menu" aria-expanded="false" aria-controls="${id}-ring">
        <span class="rm__centre-ic">${CENTRE}</span>
      </button>
      <span class="rm__id"><span class="rm__name"></span><span class="rm__meta"></span></span></div>`;
    const centre = root.querySelector('.rm__centre');

    const count = () => (COUNTS.includes(Number(s.count)) ? Number(s.count) : 8);
    const list = () => Array.from({ length: count() }, (_, i) => ({ ...(s.actions[i] || {}), enabled: s.actions[i] ? s.actions[i].enabled !== false : false }));
    const nameOf = (a, i) => String(a.label || a.title || `Action ${i + 1}`);
    const usable = (a) => s.available !== false && a.enabled;
    // config.ring ('compact' | 'standard' | 'wide') fixes the ring's size — e.g. a small floating button that opens a large, labelled ring
    const tier = () => { if (TIERS[s.ring]) return s.ring; const w = root.offsetWidth || 0; return w >= 360 ? 'wide' : w >= 200 ? 'standard' : 'compact'; };
    const iconOf = (name) => (s.icons && s.icons[name]) || GENERIC;

    function renderTile() {
      root.dataset.open = String(open);
      root.dataset.available = String(s.available !== false);
      root.dataset.count = String(count());
      root.classList.toggle('rm--float', !!s.float);
      root.querySelector('.rm__name').textContent = s.name || 'Quick actions';
      root.querySelector('.rm__meta').textContent = s.available === false ? 'Unavailable' : `${count()} actions`;
      centre.disabled = s.available === false;
      centre.setAttribute('aria-expanded', String(open));
      centre.setAttribute('aria-label', `${s.name || 'Quick actions'}: ${open ? 'close' : 'open'} the ${count()}-action menu`);
    }

    /* ---------------- the expanded ring (overlay) */
    function build() {
      const t = TIERS[tier()], n = count(), acts = list();
      const cw = centre.offsetWidth || 56;
      const rc = Math.max(24, Math.min(42, cw / 2));        // overlay centre = the tile's centre control
      const r0 = rc + 10, r1 = r0 + t.depth, D = Math.ceil(2 * r1 + 8), c = D / 2;
      const showLabels = t.labels && n <= t.labels;
      const box = document.createElement('div');
      box.className = 'rm-overlay';
      box.innerHTML = `<div class="rm-backdrop"></div>`;
      const wheel = document.createElement('div');
      wheel.className = 'rm-ring';
      wheel.id = `${id}-ring`;
      wheel.setAttribute('role', 'menu');
      wheel.setAttribute('aria-label', s.name || 'Quick actions');
      wheel.dataset.count = String(n);
      wheel.dataset.tier = tier();
      wheel.dataset.labels = String(!!showLabels);
      wheel.style.width = wheel.style.height = `${D}px`;
      wheel.style.setProperty('--rm-rc', `${rc}px`);
      const step = (2 * Math.PI) / n;
      acts.forEach((a, i) => {
        const a0 = -Math.PI / 2 - step / 2 + i * step, a1 = a0 + step, mid = (a0 + a1) / 2;
        const d = sector(c, c, r0, r1, a0, a1, 6);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'rm-seg';
        b.dataset.index = String(i);
        b.dataset.type = String(a.type || '');
        b.setAttribute('role', a.type === 'toggle' ? 'menuitemcheckbox' : 'menuitem');
        b.tabIndex = -1;
        b.style.clipPath = `path('${d}')`;
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'rm-seg__shape');
        svg.setAttribute('viewBox', `0 0 ${D} ${D}`);
        svg.setAttribute('aria-hidden', 'true');
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', d);
        svg.append(p);
        const rm = (r0 + r1) / 2 + (showLabels && a.label ? 6 : 0);
        const ic = document.createElement('span');
        ic.className = 'rm-seg__ic';
        ic.setAttribute('aria-hidden', 'true');
        ic.innerHTML = iconOf(a.icon);                      // static markup from the host's icon set
        ic.style.left = `${c + rm * Math.cos(mid)}px`;
        ic.style.top = `${c + rm * Math.sin(mid) - (showLabels && a.label ? 9 : 0)}px`;
        b.append(svg, ic);
        if (showLabels && a.label) {
          const lb = document.createElement('span');
          lb.className = 'rm-seg__label';
          lb.textContent = a.label;
          lb.style.left = `${c + rm * Math.cos(mid)}px`;
          lb.style.top = `${c + rm * Math.sin(mid) + 13}px`;
          lb.style.maxWidth = `${Math.max(48, Math.min(96, step * rm - 14))}px`;
          lb.setAttribute('aria-hidden', 'true');
          b.append(lb);
        }
        b.addEventListener('click', () => { const src = lastKey ? 'keyboard' : 'pointer'; lastKey = false; activate(i, { source: src }); });
        wheel.append(b);
      });
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'rm-ring__centre';
      close.style.width = close.style.height = `${rc * 2}px`;
      close.innerHTML = `<span class="rm-ring__close">${CLOSE}</span><span class="rm-ring__hint" aria-live="polite"></span>`;
      close.addEventListener('click', () => { lastKey = false; closeMenu(true); });
      wheel.append(close);
      box.append(wheel);
      box.querySelector('.rm-backdrop').addEventListener('pointerdown', (e) => { e.preventDefault(); closeMenu(false); });
      box.addEventListener('keydown', onRingKey);
      box.addEventListener('keydown', () => { lastKey = true; }, true);
      box.addEventListener('pointerdown', () => { lastKey = false; }, true);
      return { box, wheel, centre: close, D };
    }
    function position() {
      if (!ring) return;
      const r = centre.getBoundingClientRect();
      const sc = centre.offsetWidth ? r.width / centre.offsetWidth : 1;     // the tile may sit in a scaled preview
      const half = (ring.D / 2) * sc, m = 6;
      let x = r.left + r.width / 2, y = r.top + r.height / 2;
      x = Math.min(Math.max(x, half + m), Math.max(half + m, window.innerWidth - half - m));
      y = Math.min(Math.max(y, half + m), Math.max(half + m, window.innerHeight - half - m));
      ring.wheel.style.left = `${x - ring.D / 2}px`;
      ring.wheel.style.top = `${y - ring.D / 2}px`;
      ring.wheel.style.transform = sc !== 1 ? `scale(${sc})` : '';
    }
    function renderRing() {
      if (!ring) return;
      const acts = list();
      ring.wheel.querySelectorAll('.rm-seg').forEach((b) => {
        const i = Number(b.dataset.index), a = acts[i];
        const ok = usable(a);
        b.setAttribute('aria-disabled', String(!ok));
        b.classList.toggle('is-disabled', !ok);
        b.classList.toggle('is-active', !!active[i]);
        b.classList.toggle('is-armed', armed === i);
        if (a.type === 'toggle') b.setAttribute('aria-checked', String(!!active[i]));
        b.setAttribute('aria-label', `${armed === i ? 'Confirm: ' : ''}${nameOf(a, i)}${a.confirm && armed !== i ? ' (asks for confirmation)' : ''}${ok ? '' : ' (disabled)'}`);
      });
      const hint = ring.centre.querySelector('.rm-ring__hint');
      hint.textContent = armed !== null ? 'Press again' : '';   // inside the centre, in place of the close icon
      ring.wheel.classList.toggle('is-arming', armed !== null);
      ring.centre.setAttribute('aria-label', armed !== null ? `Cancel and close ${s.name || 'menu'}` : `Close ${s.name || 'menu'}`);
    }

    /* ---------------- open / close */
    function openMenu(source = 'pointer') {
      if (open || s.available === false || !root.isConnected) return false;
      open = true; armed = null; opener = source;
      ring = build();
      // the overlay layer: the page body, or — inside a modal dialog (e.g. an editor preview) — the dialog,
      // because a modal dialog sits in the browser's top layer above anything appended to the body
      const host = s.overlayRoot || root.closest('dialog[open]') || document.body;
      host.append(ring.box);
      // on the page body the ring is outside the themed dashboard: it takes the dashboard's theme (MaisonTheme's active theme)
      if (host === document.body && global.MaisonTheme && global.MaisonTheme.scope) global.MaisonTheme.scope(ring.box);
      position();
      renderRing(); renderTile();
      requestAnimationFrame(() => ring && ring.box.classList.add('is-in'));
      document.addEventListener('keydown', onDocKey, true);
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onScroll);
      const first = ring.wheel.querySelector('.rm-seg:not(.is-disabled)');
      if (source === 'keyboard' && first) focusSeg(first); else ring.centre.focus({ preventScroll: true });
      return true;
    }
    function closeMenu(returnFocus) {
      if (!open) return false;
      open = false; armed = null; clearTimeout(tArm);
      document.removeEventListener('keydown', onDocKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      if (ring) ring.box.remove();
      ring = null;
      renderTile();
      if (returnFocus && root.isConnected) centre.focus({ preventScroll: true });
      return true;
    }
    function onScroll(e) { if (ring && e && e.target && ring.box.contains(e.target)) return; closeMenu(false); }

    /* ---------------- activation */
    function disarm() { armed = null; clearTimeout(tArm); renderRing(); }
    /** @returns false (blocked) | 'confirm' (armed) | true (reported) */
    function activate(i, { source = 'api', skipConfirm = false } = {}) {
      const a = list()[i];
      if (!a || !usable(a)) return false;
      if (a.confirm && armed !== i && !skipConfirm) {
        armed = i; clearTimeout(tArm);
        tArm = setTimeout(disarm, s.confirmTimeout);
        renderRing();
        return 'confirm';
      }
      armed = null; clearTimeout(tArm);
      if (a.type === 'toggle') active[i] = !active[i];
      const { title, ...action } = a;
      if (typeof s.onAction === 'function') s.onAction({ index: i, action, active: !!active[i] }, { source });
      // a tile removed by the request (e.g. it switched the page) never leaves an orphan overlay
      if (!a.keepOpen || !root.isConnected) closeMenu(source === 'keyboard' && root.isConnected);
      else { renderRing(); flash(i); }
      return true;
    }
    function flash(i) {
      const b = ring && ring.wheel.querySelector(`.rm-seg[data-index="${i}"]`);
      if (!b) return;
      b.classList.remove('is-done'); void b.offsetWidth; b.classList.add('is-done');
      setTimeout(() => b.classList.remove('is-done'), 500);
    }

    /* ---------------- keyboard */
    const segs = () => (ring ? [...ring.wheel.querySelectorAll('.rm-seg')] : []);
    function focusSeg(b) { segs().forEach((x) => { x.tabIndex = x === b ? 0 : -1; }); b.focus({ preventScroll: true }); }
    function onDocKey(e) {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    }
    function onRingKey(e) {
      const all = segs(), en = all.filter((b) => !b.classList.contains('is-disabled'));
      const cur = all.indexOf(document.activeElement);
      const move = (dir) => {
        if (!en.length) return;
        if (cur < 0) { focusSeg(dir > 0 ? en[0] : en[en.length - 1]); return; }
        for (let k = 1; k <= all.length; k++) {
          const b = all[(cur + dir * k + all.length * 2) % all.length];
          if (!b.classList.contains('is-disabled')) { focusSeg(b); return; }
        }
      };
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Home' && en.length) { e.preventDefault(); focusSeg(en[0]); }
      else if (e.key === 'End' && en.length) { e.preventDefault(); focusSeg(en[en.length - 1]); }
      else if (e.key === 'Tab') {                    // keep focus inside the open ring
        e.preventDefault();
        const order = [ring.centre, ...en];
        const at = order.indexOf(document.activeElement);
        const next = order[(at + (e.shiftKey ? -1 : 1) + order.length) % order.length];
        if (next === ring.centre) ring.centre.focus(); else focusSeg(next);
      }
    }

    /* ---------------- the tile */
    centre.addEventListener('keydown', (e) => { lastKey = e.key === 'Enter' || e.key === ' '; });
    centre.addEventListener('pointerdown', () => { lastKey = false; });
    centre.addEventListener('click', () => { const src = lastKey ? 'keyboard' : 'pointer'; lastKey = false; if (open) closeMenu(true); else openMenu(src); });

    renderTile();
    root.radial = {
      getState: () => ({ open, armed, count: count(), active: list().map((_, i) => !!active[i]), available: s.available !== false }),
      /** External update. Never calls onAction. */
      setState(patch = {}) {
        const { open: o, active: act, ...rest } = patch;
        s = { ...s, ...rest };
        if (rest.actions) active = rest.actions.map((a, i) => (act === undefined && active[i] !== undefined ? active[i] : !!(a && a.on)));
        if (Array.isArray(act)) act.forEach((v, i) => { active[i] = !!v; });
        else if (act && typeof act === 'object') Object.keys(act).forEach((k) => { active[Number(k)] = !!act[k]; });
        if (s.available === false) closeMenu(false);
        if (o === true) openMenu('api'); else if (o === false) closeMenu(false);
        if (open && (rest.actions || rest.count !== undefined)) { const was = open; closeMenu(false); if (was) openMenu('api'); }
        renderTile(); renderRing();
      },
      open: () => openMenu('api'),
      close: () => closeMenu(false),
      activate: (i, opts = {}) => activate(i, { ...opts, source: 'api' }),
      destroy: () => closeMenu(false),
    };
    return root;
  }

  /** Smallest usable tile: 2 × 2 (the centre control keeps a ≥ 48px target). */
  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 }; }

  global.MaisonRadial = { create, constraints, COUNTS };
})(window);
