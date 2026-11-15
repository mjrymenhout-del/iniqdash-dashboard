/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Camera Widget V1 — a still camera image that refreshes; no NVR, recordings, timeline or PTZ.

   MaisonCamera.create(config) → HTMLElement (.cam), with el.camera = { getState(), setState(patch) }
   config = {
     id, name, subtitle
     image:      URL of the current snapshot (demo: an asset; Home Assistant: IniqDash's own
                 api/ha_cam.php — never Home Assistant's address or a token)
     state:      'idle' | 'streaming' | 'recording' | 'unavailable' | 'unknown'
     available:  true
     fit:        'cover' | 'contain'     how the image fills the widget
     showName:   true                    name + status over the image
     variant:    'picture' (default) | 'doorbell'    the same camera, presented for a front door: the status of the doorbell, motion,
                 door lock and battery as chips over the picture, when the owner mapped those entities (Doorbell is NOT a widget type)
     chips:      [{ key, label, text, tone: 'alert' | null }]   resolved by the binding from Home Assistant — shown as given;
                 a chip with tone 'alert' that is the doorbell marks the card as ringing
     expandable: true                    a button opens the picture larger (it refreshes there while open)
     variant 'ptz':  PTZ controls over the picture — tilt up / down, pan left / right, zoom in / out, a position-preset list, spotlight and
                     privacy toggles, motion and recording indicators. ptz = { controls: { <role>: true } — only MAPPED entities (the binding;
                     Home Assistant has no universal PTZ service), preset: { options, value }, spotlight / privacy / motion: true | false | null
                     (Home Assistant's state) }. A press → haAction(role, value) (the binding's secure call on that entity); nothing is shown as
                     done until Home Assistant reports it. Privacy on needs a second press. Not linked: every control, labelled Demo — nothing sent.
   }
   setState({ image }) loads the new picture first and swaps it in when it has arrived (no flash
   of an empty frame); a failed load keeps the previous picture and marks it as stale.
   Responsive (MaisonFit): the image always fills the widget's own box; the overlay text, dot and
   padding scale with it, and the smallest boxes keep only the status dot.
   ========================================================================== */
(function (global) {
  'use strict';

  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const CAM = S('<path d="M3.5 7.5h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z"/><path d="m16.5 11 5-3v8l-5-3"/>');
  const LABEL = { idle: 'Idle', streaming: 'Live', recording: 'Recording', unavailable: 'Unavailable', unknown: 'Unknown' };

  function stateOf(s) {
    if (s.available === false) return 'unavailable';
    const v = String(s.state ?? 'idle').toLowerCase();
    return LABEL[v] ? v : 'idle';
  }

  function create(config) {
    let s = { state: 'idle', available: true, fit: 'cover', showName: true, ...(config || {}) };
    const root = document.createElement('article');
    root.className = 'cam';
    if (s.id) root.dataset.cameraId = s.id;
    root.innerHTML = `
      <div class="cam__in">
        <div class="cam__view"><img class="cam__img" alt="" decoding="async" draggable="false"><div class="cam__ph">${CAM}<span></span></div></div>
        <div class="cam__chips" hidden></div>
        <button type="button" class="cam__expand" aria-label="Enlarge picture" hidden data-iq-control="">${S('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>')}</button>
        <div class="cam__bar"><span class="cam__name"></span><span class="cam__upd"></span><span class="cam__info"></span><span class="cam__status"><i class="cam__dot" aria-hidden="true"></i><b></b></span></div>
      </div>`;
    const $ = (q) => root.querySelector(q);
    let img = $('.cam__img');
    let shown = '', loading = null, okAt = 0;
    const variant = ['doorbell', 'ptz'].includes(s.variant) ? s.variant : 'picture';
    root.dataset.variant = variant;
    /* ---- PTZ: the controls over the picture (the shared control button) */
    const C = global.IniqControls;
    let ptzEl = null, ptzArmed = false, tPriv = 0, tMsg = 0;
    const DEMO_PTZ = { demo: true, controls: { tiltUp: true, tiltDown: true, panLeft: true, panRight: true, zoomIn: true, zoomOut: true, preset: true, spotlight: true, privacy: true, motion: true },
      preset: { options: ['Gate', 'Driveway', 'Garden'], value: 'Gate', available: true }, spotlight: false, privacy: false, motion: true };
    const ptzOf = () => (s.ptz && typeof s.ptz === 'object' ? s.ptz : (s.entity ? { controls: {} } : DEMO_PTZ));
    const ptzSay = (t) => { const m = ptzEl && ptzEl.querySelector('.cam__ptz-msg'); if (!m) return; m.textContent = t; clearTimeout(tMsg); if (t) tMsg = setTimeout(() => { m.textContent = ''; }, 3500); };
    async function ptzPress(role, value) {
      const P = ptzOf();
      if (role === 'privacy' && !P.privacy && !ptzArmed) { ptzArmed = true; clearTimeout(tPriv); tPriv = setTimeout(() => { ptzArmed = false; paintPtz(); }, 4000); paintPtz(); ptzSay('Press again to turn privacy mode on'); return; }
      ptzArmed = false; clearTimeout(tPriv);
      if (P.demo) {                                             // a demo: the controls answer locally — nothing is sent anywhere
        if (role === 'spotlight' || role === 'privacy') s = { ...s, ptz: { ...P, [role]: !P[role] } };
        if (role === 'preset') s = { ...s, ptz: { ...P, preset: { ...P.preset, value } } };
        paintPtz(); ptzSay('Demo — nothing sent'); return;
      }
      if (typeof s.haAction !== 'function') return;
      ptzSay('Sending…');
      const r = await s.haAction(role, value);
      ptzSay(r && r.ok ? (['spotlight', 'privacy', 'preset'].includes(role) ? 'Sent — waiting for Home Assistant' : 'Sent') : `Not sent${r && r.error ? ` (${String(r.error).replace(/_/g, ' ')})` : ''}`);
      paintPtz();
    }
    const MOVE = [['tiltUp', 'mdi:chevron-up', 'Tilt up'], ['panLeft', 'mdi:chevron-left', 'Pan left'], ['panRight', 'mdi:chevron-right', 'Pan right'], ['tiltDown', 'mdi:chevron-down', 'Tilt down'],
      ['zoomIn', 'mdi:plus', 'Zoom in'], ['zoomOut', 'mdi:minus', 'Zoom out']];
    function paintPtz() {
      if (variant !== 'ptz') return;
      const P = ptzOf(), has = (r) => !!(P.controls && P.controls[r]), off = stateOf(s) === 'unavailable';
      if (!ptzEl) {
        ptzEl = document.createElement('div'); ptzEl.className = 'cam__ptz';
        ptzEl.innerHTML = '<div class="cam__pad" role="group" aria-label="Pan and tilt"></div><div class="cam__zoom" role="group" aria-label="Zoom"></div><div class="cam__ptzbar"><select class="cam__preset" aria-label="Position preset"></select><span class="cam__toggles"></span><span class="cam__ind"></span><span class="cam__ptz-msg" role="status" aria-live="polite"></span></div>';
        root.querySelector('.cam__in').append(ptzEl);
        ptzEl.querySelector('.cam__preset').addEventListener('change', (e) => { e.stopPropagation(); if (e.target.value) ptzPress('preset', e.target.value); });
      }
      const btn = (role, icon, label, on) => { const b = C ? C.button({ label, onPress: () => ptzPress(role) }) : Object.assign(document.createElement('button'), { type: 'button' });
        if (!C) b.addEventListener('click', () => ptzPress(role));
        b.dataset.role = role; b.classList.add('cam__ptzb');
        if (C) b.control.update({ icon, style: on ? 'filled' : 'soft', shape: 'circle', size: 36, iconSize: 20, color: role === 'privacy' ? 'warning' : 'accent' }, { on: !!on, disabled: off });
        else { b.textContent = label; b.disabled = off; }
        return b; };
      const pad = ptzEl.querySelector('.cam__pad'), zoom = ptzEl.querySelector('.cam__zoom');
      pad.replaceChildren(...MOVE.slice(0, 4).filter(([r]) => has(r)).map(([r, i, l]) => btn(r, i, l)));
      zoom.replaceChildren(...MOVE.slice(4).filter(([r]) => has(r)).map(([r, i, l]) => btn(r, i, l)));
      pad.hidden = !pad.children.length; zoom.hidden = !zoom.children.length;
      const sel = ptzEl.querySelector('.cam__preset');
      if (has('preset') && P.preset) {
        const sig = JSON.stringify(P.preset.options);
        if (sel.dataset.sig !== sig) { sel.dataset.sig = sig; sel.replaceChildren(Object.assign(document.createElement('option'), { value: '', textContent: 'Preset…' }), ...P.preset.options.map((o) => Object.assign(document.createElement('option'), { value: o, textContent: o }))); }
        sel.value = P.preset.options.includes(P.preset.value) ? P.preset.value : '';
        sel.disabled = off || P.preset.available === false; sel.hidden = false;
      } else sel.hidden = true;
      ptzEl.querySelector('.cam__toggles').replaceChildren(...[['spotlight', 'mdi:lightbulb-on-outline', 'Spotlight'], ['privacy', 'mdi:eye-off-outline', 'Privacy mode']].filter(([r]) => has(r))
        .map(([r, i, l]) => { const b = btn(r, i, `${l}: ${P[r] === true ? 'on' : P[r] === false ? 'off' : 'unknown'}${r === 'privacy' && ptzArmed ? ' — press again' : ''}`, P[r] === true); b.dataset.state = P[r] === true ? 'on' : P[r] === false ? 'off' : 'unknown'; if (r === 'privacy' && ptzArmed) b.classList.add('is-armed'); return b; }));
      const ind = [];
      if (has('motion')) ind.push([P.motion === true ? 'Motion' : P.motion === false ? 'No motion' : 'Motion unknown', P.motion === true ? 'alert' : '']);
      if (stateOf(s) === 'recording') ind.push(['Recording', 'rec']);
      if (P.demo) ind.push(['Demo', '']);
      ptzEl.querySelector('.cam__ind').replaceChildren(...ind.map(([t, tone]) => { const i = document.createElement('span'); i.className = 'cam__chip'; if (tone) i.dataset.tone = tone; i.textContent = t; return i; }));
      ptzEl.hidden = !Object.keys(P.controls || {}).length && stateOf(s) !== 'recording';
    }
    const updText = () => (okAt ? `Updated ${new Date(okAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '');

    /* ---- the enlarged picture: a modal dialog; a Home Assistant snapshot (IniqDash's own api/ha_cam.php) refreshes every 3 s while it is
       open and the tab is visible — a demo / other picture is shown as it is ---- */
    function enlarge() {
      if (!shown) return;
      const dlg = document.createElement('dialog');
      dlg.className = 'iq-cam-lightbox';
      dlg.setAttribute('aria-label', `${s.name || 'Camera'} picture`);
      const big = document.createElement('img');
      big.alt = ''; big.src = shown;
      const bar = document.createElement('div'); bar.className = 'iq-cam-lightbox__bar';
      const cap = document.createElement('span'); cap.textContent = [s.name || 'Camera', updText()].filter(Boolean).join(' · ');
      const x = document.createElement('button'); x.type = 'button'; x.textContent = 'Close'; x.addEventListener('click', () => dlg.close());
      bar.append(cap, x); dlg.append(big, bar);
      const live = /(^|\/)api\/ha_cam\.php\?/.test(shown);
      let t = 0;
      const tick = () => { if (!document.hidden && live) { const u = shown.replace(/([?&])t=\d+/, `$1t=${Date.now()}`); const probe = new Image(); probe.onload = () => { big.src = u; cap.textContent = [s.name || 'Camera', updText()].filter(Boolean).join(' · '); }; probe.src = u; } };
      if (live) t = setInterval(tick, 3000);
      dlg.addEventListener('close', () => { clearInterval(t); dlg.remove(); });
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      document.body.append(dlg);
      dlg.showModal();
    }
    $('.cam__expand').addEventListener('click', (e) => { e.stopPropagation(); enlarge(); });

    /** load the next picture off-screen, then swap (keeps the old one on failure) */
    function load(url) {
      if (!url || url === shown || url === loading) return;
      loading = url;
      const probe = new Image();
      probe.alt = '';
      probe.decoding = 'async';
      probe.onload = () => {
        if (loading !== url) return;
        // swap in the very element that loaded it: the picture is never fetched twice
        // (snapshots are served with no-store, so a second <img src> would hit the server again)
        loading = null; shown = url; okAt = Date.now();
        probe.className = img.className; probe.alt = img.alt; probe.draggable = false;
        img.replaceWith(probe); img = probe;
        root.dataset.img = 'ok';
        root.dispatchEvent(new CustomEvent('camera:loaded'));
        $('.cam__expand').hidden = s.expandable === false || stateOf(s) === 'unavailable';
        $('.cam__upd').textContent = variant === 'doorbell' ? updText() : '';
      };
      probe.onerror = () => {
        if (loading !== url) return;
        loading = null;
        root.dataset.img = shown ? 'stale' : 'none';
        root.dispatchEvent(new CustomEvent('camera:loaded'));
      };
      probe.src = url;
    }

    function render() {
      const st = stateOf(s);
      root.dataset.state = st;
      root.dataset.fitMode = s.fit === 'contain' ? 'contain' : 'cover';
      root.dataset.showName = s.showName === false ? 'false' : 'true';
      $('.cam__name').textContent = [s.name || 'Camera', s.subtitle].filter(Boolean).join(' · ');
      $('.cam__status b').textContent = LABEL[st];
      // linked: Information slots — e.g. a separate motion binary_sensor ("Motion Detected"); never a camera attribute
      const info = Array.isArray(s.infoItems) ? s.infoItems.map((x) => x && x.line).filter(Boolean).join(' · ') : '';
      $('.cam__info').textContent = info;
      $('.cam__info').hidden = !info;
      // doorbell: chips over the picture (only what Home Assistant says for the mapped entities); a ringing doorbell marks the card
      const chips = variant === 'doorbell' && Array.isArray(s.chips) ? s.chips : [];
      const box = $('.cam__chips');
      box.replaceChildren(...chips.map((c) => { const i = document.createElement('span'); i.className = 'cam__chip'; i.dataset.key = c.key; if (c.tone) i.dataset.tone = c.tone; i.textContent = `${c.label}: ${c.text}`; return i; }));
      box.hidden = !chips.length;
      root.dataset.ringing = chips.some((c) => c.key === 'ring' && c.tone === 'alert') ? 'true' : 'false';
      $('.cam__upd').textContent = variant === 'doorbell' ? updText() : '';
      $('.cam__ph span').textContent = st === 'unavailable' ? 'Camera unavailable' : 'No image';
      root.setAttribute('aria-label', `${s.name || 'Camera'}: ${LABEL[st]}${chips.length ? `. ${chips.map((c) => `${c.label} ${c.text}`).join(', ')}` : ''}`);
      $('.cam__expand').hidden = s.expandable === false || !shown || st === 'unavailable';
      paintPtz();
      if (!s.image) { root.dataset.img = 'none'; shown = ''; img.removeAttribute('src'); }
      else load(s.image);
    }

    root.setAttribute('role', 'img');
    root.dataset.img = 'none';
    render();
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w, h) => (w < 180 || h < 110 ? 'mini' : 'full') });
    root.camera = {
      getState: () => ({ state: stateOf(s), image: shown || null }),
      /** external update (Home Assistant through IniqHA, or demo) */
      setState(patch) { s = { ...s, ...patch }; render(); },
      busy: () => loading !== null,
    };
    return root;
  }

  /** Smallest usable area: 2 × 2 (the picture with a status dot). */
  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 }; }

  global.MaisonCamera = { create, constraints, LABEL };
})(window);
