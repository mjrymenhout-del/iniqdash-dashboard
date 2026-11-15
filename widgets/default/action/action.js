/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Action Widget V1 — press to REQUEST an action (scene, script, button entity, "open gate"…).
   No persistent ON/OFF: it rests in 'ready', may show running / done / failed, and returns to rest.

   MaisonAction.create(config) → HTMLElement (.aw), with
     el.action = { getState(), setState(patch), activate(opts) }

   config = {
     id, name, subtitle
     icon:                  'moon' | 'gate' | 'vacuum' | 'scene' | 'bell' | 'restart' | 'script' | raw SVG
     status:                'ready' | 'running' | 'done' | 'failed' | 'unavailable'   (execution status)
     available:             true
     requiresConfirmation:  false   — consequential actions need a second, deliberate press
     confirmTimeout:        4000    — ms the confirmation stays armed
     resetAfter:            2500    — ms after which done / failed return to ready (null = stay)
     runningTimeout:        15000   — safety: a request nobody answers returns to ready
     look:                  'button' (default) | 'scene' — a scene card (large round icon in iconColor, name, subtitle) | 'pill' — a capsule: round icon + name
     iconColor:             'orange' | 'pink' | 'yellow' | 'green' | 'blue' | 'purple' | '#rrggbb' (scene card)
     onActivate:            (request, { source: 'user'|'keyboard'|'api' }) => void
                            request = { id, name } — the HA layer decides what to call
   }
   The component reports the request and shows 'running' at once; the real outcome comes back
   through setState({ status: 'done' | 'failed' }). setState() never calls onActivate.
   ========================================================================== */
(function (global) {
  'use strict';

  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  /** the scene card's icon colours (a light → deep gradient) */
  const SCENE_COLORS = { orange: ['#ffb062', '#fc7a22'], pink: ['#ff8fb0', '#ff4f7f'], yellow: ['#ffe07a', '#ffb92e'], green: ['#b4f56a', '#5fcf3a'], blue: ['#7fd6ff', '#2f9cf0'], purple: ['#c99bff', '#9248ff'] };
  const ICONS = {
    moon: S('<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/>'),
    gate: S('<path d="M3.5 20V8.5M20.5 20V8.5M3.5 10.5h17M3.5 15.5h17M7.8 10.5v9.5M12 10.5v9.5M16.2 10.5v9.5"/><path d="M3.5 8.5 12 4l8.5 4.5"/>'),
    vacuum: S('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v3"/>'),
    scene: S('<path d="m12 3.5 2.3 4.9 5.2.6-3.9 3.6 1.1 5.2L12 15.2 7.3 17.8l1.1-5.2L4.5 9l5.2-.6z"/>'),
    bell: S('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
    restart: S('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>'),
    script: S('<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5.5l-3 13"/>'),
    generic: S('<circle cx="12" cy="12" r="8.5"/><path d="m10 8.5 5 3.5-5 3.5z"/>'),
  };
  const MARK = {
    done: S('<path d="m6 12.5 4 4 8-9"/>'),
    failed: S('<path d="M12 7.5v6"/><path d="M12 16.8v.2"/>'),
  };
  const STATUS = ['ready', 'running', 'done', 'failed', 'unavailable'];
  const TEXT = { ready: '', running: 'Running…', done: 'Done', failed: 'Failed', unavailable: 'Unavailable', confirm: 'Press again to confirm' };

  function create(config) {
    let s = { status: 'ready', available: true, requiresConfirmation: false, confirmTimeout: 4000, resetAfter: 2500, runningTimeout: 15000, ...(config || {}) };
    let confirming = false, tConfirm = null, tReset = null, tRun = null;

    const root = document.createElement('article');
    root.className = 'aw';
    if (s.id) root.dataset.actionId = s.id;
    const sid = `aw-${Math.random().toString(36).slice(2, 8)}`;
    root.innerHTML = `
      <button type="button" class="aw__trigger" aria-describedby="${sid}">
        <span class="aw__glyph"><span class="aw__ring"></span><span class="aw__icon"></span><span class="aw__mark"></span></span>
        <span class="aw__id"><span class="aw__name"></span><span class="aw__sub"></span></span>
        <span class="aw__status" id="${sid}" aria-live="polite"><i class="aw__dot" aria-hidden="true"></i><span class="aw__status-t"></span></span>
        <span class="aw__go" aria-hidden="true"></span>
      </button>
      <button type="button" class="aw__cancel" aria-label="Cancel">${S('<path d="M7 7l10 10M17 7 7 17"/>')}</button>`;
    const $ = (q) => root.querySelector(q);
    const trigger = $('.aw__trigger'), cancel = $('.aw__cancel');
    root.style.setProperty('--aw-confirm', `${s.confirmTimeout}ms`);

    const statusOf = () => (s.available === false ? 'unavailable' : STATUS.includes(s.status) ? s.status : 'unavailable');
    const clearTimers = () => { clearTimeout(tConfirm); clearTimeout(tReset); clearTimeout(tRun); };

    function disarm() { confirming = false; clearTimeout(tConfirm); render(); }
    function run(source) {
      disarm();
      setStatus('running');
      if (typeof s.onActivate === 'function') s.onActivate({ id: s.id, name: s.name }, { source });
    }
    /** A press: arm the confirmation first when required, otherwise run. */
    function press(source, opts = {}) {
      const st = statusOf();
      if (st === 'unavailable' || st === 'running') return false;
      if (s.requiresConfirmation && !confirming && !opts.skipConfirm) {
        confirming = true;
        render();
        clearTimeout(tConfirm);
        tConfirm = setTimeout(disarm, s.confirmTimeout);
        return 'confirm';
      }
      run(source);
      return true;
    }
    function setStatus(st) {
      s = { ...s, status: st };
      clearTimeout(tReset); clearTimeout(tRun);
      if ((st === 'done' || st === 'failed') && s.resetAfter) tReset = setTimeout(() => setStatus('ready'), s.resetAfter);
      if (st === 'running' && s.runningTimeout) tRun = setTimeout(() => setStatus('ready'), s.runningTimeout);
      render();
    }

    let lastKey = false;
    trigger.addEventListener('keydown', () => { lastKey = true; });
    trigger.addEventListener('click', () => { const src = lastKey ? 'keyboard' : 'user'; lastKey = false; press(src); });
    cancel.addEventListener('click', () => { disarm(); trigger.focus(); });
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && confirming) { e.preventDefault(); disarm(); trigger.focus(); } });

    function render() {
      const st = statusOf();
      const shown = confirming ? 'confirm' : st;
      root.dataset.status = shown;
      root.dataset.hasSub = s.subtitle ? 'true' : 'false';
      // LOOK: 'button' (default) · 'scene' — a scene card: a large round icon filled with its colour, the name and subtitle below
      root.dataset.look = s.look === 'scene' || s.look === 'pill' ? s.look : 'button';
      const col = SCENE_COLORS[s.iconColor] || (/^#[0-9a-f]{6}$/i.test(s.iconColor || '') ? [s.iconColor, s.iconColor] : SCENE_COLORS.orange);
      root.style.setProperty('--aw-c1', col[0]); root.style.setProperty('--aw-c2', col[1]);
      // an MDI icon (mdi:…) from the shared icon library; else one of the built-in icons
      const ico = $('.aw__icon');
      if (/^mdi:[a-z0-9-]+$/.test(String(s.icon || '')) && global.IniqIcons) { ico.innerHTML = ''; ico.dataset.mdi = s.icon; global.IniqIcons.fill(ico); }
      else { delete ico.dataset.mdi; ico.innerHTML = ICONS[s.icon] || (String(s.icon || '').trim().startsWith('<svg') ? s.icon : ICONS.generic); }
      $('.aw__mark').innerHTML = MARK[st] || '';
      $('.aw__name').textContent = s.name || 'Action';
      $('.aw__sub').textContent = s.subtitle || '';
      $('.aw__sub').hidden = !s.subtitle;
      $('.aw__status-t').textContent = TEXT[shown];
      $('.aw__status').hidden = !TEXT[shown];
      $('.aw__go').textContent = confirming ? 'Confirm' : 'Run';
      trigger.disabled = st === 'unavailable';
      trigger.setAttribute('aria-disabled', String(st === 'unavailable' || st === 'running'));
      trigger.setAttribute('aria-label', `${confirming ? 'Confirm: ' : ''}${s.name || 'Action'}${s.subtitle ? ', ' + s.subtitle : ''}`);
      cancel.hidden = !confirming;
    }

    render();
    root.action = {
      getState: () => ({ status: statusOf(), confirming }),
      /** External update (later: Home Assistant reports the outcome). Never calls onActivate. */
      setState(patch) {
        const { status, ...rest } = patch;
        s = { ...s, ...rest };
        if (status !== undefined) setStatus(status); else render();
      },
      /** Programmatic press (e.g. a voice shortcut). Respects confirmation unless { skipConfirm: true }. */
      activate: (opts = {}) => press('api', opts),
      destroy: clearTimers,
    };
    return root;
  }

  /** Smallest usable area: minW 2, minH 2 (one line: icon, name, status) everywhere. */
  function constraints(c) { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: c && c.look === 'pill' ? 1 : 2 }; }   // a pill is one row tall

  global.MaisonAction = { create, constraints, ICONS };
})(window);
