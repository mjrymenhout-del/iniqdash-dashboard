/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Media Player Widget V1 — a generic media_player (speaker, TV, receiver, display, network player).

   MaisonMedia.create(config) → HTMLElement (.mw), with el.media = { getState(), setState(patch) }

   config = {
     id, name:      'kitchen-speaker', 'Kitchen Speaker'      (the device)
     subtitle:      'Kitchen'                                 (optional)
     state:         'playing' | 'paused' | 'idle' | 'off' | 'unavailable' | 'unknown'
     available:     true
     title:         'Evening Tide'          (current media, optional)
     artist:        'Demo Artist'           (optional; any secondary media line)
     artwork:       'url'                   (optional — album/programme art; a failure falls back)
     volume:        0…100                   (with capabilities.volume)
     source:        'Radio'   sources: ['Radio', 'Spotify', 'TV']     (with capabilities.source)
     icon:          'speaker' | 'tv' | 'receiver' | raw SVG   (shown when there is no artwork)
     muted:         false                   (with capabilities.mute)
     capabilities:  { playPause: true, volume: false, source: false, previous: false, next: false, mute: false }
                    previous / next / mute only when the device supports them (Home Assistant
                    supported_features) — never assumed
     onChange:      (next, prev, { source: 'playPause'|'volume'|'source'|'mute'|'previous'|'next'|'shuffle'|'repeat' }) => void   — user only
     variant:       'artwork' (default: the card above) | 'compact' (one row) | 'minibar' (a thin bar: play, title — artist, progress)
     position / duration / positionUpdatedAt:  playback position (s) as of that moment (ms), and the duration (s) — a progress
                    line appears ONLY with both; while playing it advances from those real values (no other source)
     shuffle: true | false   repeat: 'off' | 'all' | 'one'   capabilities.shuffle / .repeat: only when the player supports them
   }
   next/prev = { state, volume, source, muted }; 'previous' / 'next' are requests (state unchanged). setState() (external, later HA) never calls onChange.
   ========================================================================== */
(function (global) {
  'use strict';

  const S = (d, w = 1.9) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    speaker: S('<rect x="6" y="3" width="12" height="18" rx="3"/><circle cx="12" cy="14.5" r="3.2"/><circle cx="12" cy="7.3" r="1"/>'),
    tv: S('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8.5 20.5h7"/>'),
    receiver: S('<rect x="2.8" y="7" width="18.4" height="10" rx="2"/><circle cx="16.5" cy="12" r="2.4"/><path d="M6 10.5h5M6 13.5h3"/>'),
    generic: S('<circle cx="12" cy="12" r="8.5"/><path d="M10 9l5 3-5 3z"/>'),
  };
  const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.9l10-6.4a1 1 0 0 0 0-1.7l-10-6.4A1 1 0 0 0 8 5.6z"/></svg>';
  const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>';
  const VOL = S('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M17.8 6.7a7.3 7.3 0 0 1 0 10.6"/>');
  const VOL_OFF = S('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>');
  const PREV = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="6" width="2.4" height="12" rx="1"/><path d="M18.5 6.9v10.2a.9.9 0 0 1-1.4.8L9.6 12.8a1 1 0 0 1 0-1.6l7.5-5.1a.9.9 0 0 1 1.4.8z"/></svg>';
  const NEXT = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="16.6" y="6" width="2.4" height="12" rx="1"/><path d="M5.5 6.9v10.2a.9.9 0 0 0 1.4.8l7.5-5.1a1 1 0 0 0 0-1.6L6.9 6.1a.9.9 0 0 0-1.4.8z"/></svg>';
  const STATES = ['playing', 'paused', 'idle', 'off'];
  const LABEL = { playing: 'Playing', paused: 'Paused', idle: 'Idle', off: 'Off', unavailable: 'Unavailable', unknown: 'Unknown' };

  const stateOf = (s) => {
    if (s.available === false) return 'unavailable';
    const v = String(s.state ?? '').toLowerCase();
    return STATES.includes(v) ? v : v === 'unknown' ? 'unknown' : 'unavailable';
  };
  const caps = (s) => ({ playPause: true, volume: false, source: false, previous: false, next: false, mute: false, shuffle: false, repeat: false, power: false, ...(s.capabilities || {}) });
  const POWER = S('<path d="M12 4v7.5"/><path d="M7 7.3a7 7 0 1 0 10 0"/>', 2.1);
  const SHUFFLE = S('<path d="M3 7h3.5c5 0 6 10 11 10H21M3 17h3.5c1.8 0 3-1.3 4-2.8M14 8.8c.9-1 2-1.8 3.5-1.8H21"/><path d="m19 5 2 2-2 2M19 15l2 2-2 2"/>', 1.9);
  const REPEAT = S('<path d="M4 11V9.5A2.5 2.5 0 0 1 6.5 7H19M19 7l-2.5-2.5M19 7l-2.5 2.5M20 13v1.5a2.5 2.5 0 0 1-2.5 2.5H5M5 17l2.5-2.5M5 17l2.5 2.5"/>', 1.9);
  const fmtT = (sec) => { const t = Math.max(0, Math.floor(sec)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
  const clampV = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

  function create(config) {
    let s = { available: true, sources: [], ...(config || {}) };
    const c = caps(s);
    const root = document.createElement('article');
    root.className = 'mw';
    if (s.id) root.dataset.mediaId = s.id;
    root.dataset.caps = ['playPause', c.volume && 'volume', c.source && 'source'].filter(Boolean).join(' ');
    root.innerHTML = `
      <div class="mw__backdrop" aria-hidden="true"></div>
      <div class="mw__in">
        <div class="mw__art"><img alt="" decoding="async" draggable="false"><span class="mw__icon"></span></div>
        <div class="mw__dev"><span class="mw__dev-name"></span><span class="mw__state"><span class="mw__eq" aria-hidden="true"><i></i><i></i><i></i></span><b></b></span></div>
        <div class="mw__media"><h3 class="mw__title"></h3><p class="mw__artist"></p><div class="iq-media-prog" hidden><span class="iq-media-prog__bar"><i></i></span><span class="iq-media-prog__t"></span></div></div>
        <div class="mw__ctrls"></div>
      </div>`;
    const $ = (q) => root.querySelector(q);
    const img = $('.mw__art img'), ctrls = $('.mw__ctrls');
    img.addEventListener('error', () => { root.dataset.art = 'failed'; $('.mw__backdrop').style.backgroundImage = ''; });

    let play = null, vol = null, src = null, prevB = null, nextB = null, muteB = null;
    const skip = (cls, icon, label, request) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `mw__skip ${cls}`;
      b.innerHTML = icon;
      b.setAttribute('aria-label', `${label} · ${s.name || 'media player'}`);
      b.addEventListener('click', () => {
        if (request === 'power') {                       // on / off: the one control that also works while the player is off
          if (stateOf(s) === 'unavailable' || stateOf(s) === 'unknown') return;
          const on = stateOf(s) !== 'off';
          return typeof s.onChange === 'function' ? s.onChange({ ...pick(), power: !on }, pick(), { source: 'power' }) : change({ state: on ? 'off' : 'idle' }, 'power');
        }
        if (!['playing', 'paused', 'idle'].includes(stateOf(s))) return;
        if (request === 'shuffle') return change({ shuffle: !s.shuffle }, 'shuffle');
        if (request === 'repeat') return change({ repeat: { off: 'all', all: 'one', one: 'off' }[s.repeat || 'off'] }, 'repeat');
        emit(pick(), request);
      });
      return b;
    };
    if (c.previous) { prevB = skip('mw__skip--prev', PREV, 'Previous', 'previous'); ctrls.appendChild(prevB); }
    if (c.playPause) {
      play = document.createElement('button');
      play.type = 'button';
      play.className = 'mw__play';
      play.addEventListener('click', () => {
        const st = stateOf(s);
        if (!['playing', 'paused', 'idle'].includes(st)) return;
        change({ state: st === 'playing' ? 'paused' : 'playing' }, 'playPause');
      });
      ctrls.appendChild(play);
    }
    if (c.next) { nextB = skip('mw__skip--next', NEXT, 'Next', 'next'); ctrls.appendChild(nextB); }
    // shuffle / repeat: only a player that supports them; shown in the card (not in the compact presentations)
    let shufB = null, repB = null, powB = null;
    if (c.power) { powB = skip('iq-media-opt iq-media-opt--power', POWER, 'Power', 'power'); ctrls.prepend(powB); }
    if (c.shuffle) {
      shufB = skip('iq-media-opt iq-media-opt--shuffle', SHUFFLE, 'Shuffle', 'shuffle');
      ctrls.appendChild(shufB);
    }
    if (c.repeat) { repB = skip('iq-media-opt iq-media-opt--repeat', REPEAT, 'Repeat', 'repeat'); ctrls.appendChild(repB); }
    if (c.volume || c.mute) {
      vol = document.createElement(c.volume ? 'label' : 'div');
      vol.className = 'mw__vol';
      vol.innerHTML = `${c.mute ? `<button type="button" class="mw__vol-i mw__mute" aria-pressed="false">${VOL}</button>` : `<span class="mw__vol-i">${VOL}</span>`}${c.volume ? '<input type="range" min="0" max="100" step="1"><b class="mw__vol-v"></b>' : ''}`;
      if (c.mute) {
        muteB = vol.querySelector('.mw__mute');
        muteB.setAttribute('aria-label', `Mute ${s.name || 'media player'}`);
        muteB.addEventListener('click', (e) => { e.preventDefault(); if (['playing', 'paused', 'idle'].includes(stateOf(s))) change({ muted: !s.muted }, 'mute'); });
      }
    }
    if (c.volume) {
      const r = vol.querySelector('input');
      r.setAttribute('aria-label', `${s.name || 'Media player'} volume`);
      let from = null;
      r.addEventListener('pointerdown', () => { from = pick(); });
      r.addEventListener('input', () => { if (!from) from = pick(); s = { ...s, volume: clampV(r.value) }; render(); });
      r.addEventListener('change', () => { const p = from || pick(); from = null; if (p.volume !== s.volume) emit(p, 'volume'); });
    }
    if (vol) ctrls.appendChild(vol);
    if (c.source && s.sources.length) {
      src = document.createElement('label');
      src.className = 'mw__src';
      src.innerHTML = '<span class="mw__src-k">Source</span><select></select>';
      const sel = src.querySelector('select');
      sel.setAttribute('aria-label', `${s.name || 'Media player'} source`);
      s.sources.forEach((o) => { const op = document.createElement('option'); op.value = o; op.textContent = o; sel.appendChild(op); });
      sel.addEventListener('change', () => change({ source: sel.value }, 'source'));
      ctrls.appendChild(src);
    }

    const pick = () => ({ state: stateOf(s), volume: c.volume ? clampV(s.volume) : null, source: c.source ? s.source ?? null : null, muted: c.mute ? !!s.muted : null, shuffle: c.shuffle ? !!s.shuffle : null, repeat: c.repeat ? s.repeat || 'off' : null });
    function emit(prev, source) { if (typeof s.onChange === 'function') s.onChange(pick(), prev, { source }); }
    function change(patch, source) { const prev = pick(); s = { ...s, ...patch }; render(); emit(prev, source); }

    /* progress: ONLY from the real position + duration Home Assistant reports (position as of position_updated_at; advancing only while playing) */
    const elapsed = () => {
      const d = Number(s.duration), p = Number(s.position);
      if (!(d > 0) || !Number.isFinite(p) || s.position === null || s.position === undefined) return null;
      const since = stateOf(s) === 'playing' && Number.isFinite(Number(s.positionUpdatedAt)) ? (Date.now() - Number(s.positionUpdatedAt)) / 1000 : 0;
      return { at: Math.max(0, Math.min(d, p + Math.max(0, since))), of: d };
    };
    function paintProgress() {
      const e = ['playing', 'paused'].includes(stateOf(s)) ? elapsed() : null;
      root.querySelectorAll('.iq-media-prog').forEach((pg) => {
        pg.hidden = !e;
        if (e) { pg.querySelector('i').style.width = `${((e.at / e.of) * 100).toFixed(2)}%`; const t = pg.querySelector('.iq-media-prog__t'); if (t) t.textContent = `${fmtT(e.at)} / ${fmtT(e.of)}`; }
      });
      root.dataset.hasProgress = e ? 'true' : 'false';
    }
    let tick = 0;
    function schedule() {
      clearInterval(tick); tick = 0;
      if (stateOf(s) === 'playing' && elapsed()) tick = setInterval(() => { if (!root.isConnected) { clearInterval(tick); tick = 0; return; } if (!document.hidden) paintProgress(); }, 1000);
    }

    /* ---- the other presentations (compact / minibar): their own block; the card above is the Artwork variant ---- */
    const variant = ['compact', 'minibar'].includes(s.variant) ? s.variant : 'artwork';
    root.dataset.mwVariant = variant;
    let alt = null;
    if (variant !== 'artwork') {
      const a = document.createElement('div');
      a.className = `iq-media-alt iq-media-alt--${variant}`;
      a.innerHTML = `<span class="iq-media-alt__art"><img alt="" decoding="async" draggable="false"><span class="iq-media-alt__icon"></span></span>
        <div class="iq-media-alt__txt"><b class="iq-media-alt__title"></b><span class="iq-media-alt__sub"></span></div>
        <span class="iq-media-alt__ctl"></span>
        <span class="iq-media-prog iq-media-prog--line" hidden><span class="iq-media-prog__bar"><i></i></span></span>`;
      const ctl = a.querySelector('.iq-media-alt__ctl');
      const mk = (cls, icon, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = `iq-media-btn ${cls}`; b.innerHTML = icon; b.dataset.iqControl = ''; b.setAttribute('aria-label', `${label} · ${s.name || 'media player'}`); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); ctl.append(b); return b; };
      const act = { prev: c.previous && variant === 'compact' ? mk('iq-media-btn--prev', PREV, 'Previous', () => { if (['playing', 'paused', 'idle'].includes(stateOf(s))) emit(pick(), 'previous'); }) : null,
        play: c.playPause ? mk('iq-media-btn--play', PLAY, 'Play', () => { const st = stateOf(s); if (['playing', 'paused', 'idle'].includes(st)) change({ state: st === 'playing' ? 'paused' : 'playing' }, 'playPause'); }) : null,
        next: c.next && variant === 'compact' ? mk('iq-media-btn--next', NEXT, 'Next', () => { if (['playing', 'paused', 'idle'].includes(stateOf(s))) emit(pick(), 'next'); }) : null };
      alt = { root: a, act, img: a.querySelector('img') };
      alt.img.addEventListener('error', () => { a.dataset.art = 'no'; });
      root.querySelector('.mw__in').hidden = true;
      root.querySelector('.mw__backdrop').hidden = true;
      root.append(a);
    }

    function render() {
      const st = stateOf(s);
      const on = ['playing', 'paused', 'idle'].includes(st);
      root.dataset.state = st;
      root.dataset.hasMedia = s.title ? 'true' : 'false';
      // artwork: optional; without it a device icon (no empty frame); a failed load falls back too
      if (s.artwork) {
        if (img.getAttribute('src') !== s.artwork) { root.dataset.art = 'yes'; img.src = s.artwork; $('.mw__backdrop').style.backgroundImage = `url("${s.artwork}")`; }
      } else { root.dataset.art = 'none'; img.removeAttribute('src'); $('.mw__backdrop').style.backgroundImage = ''; }
      $('.mw__icon').innerHTML = ICONS[s.icon] || (String(s.icon || '').trim().startsWith('<svg') ? s.icon : ICONS.generic);

      $('.mw__dev-name').textContent = [s.name || 'Media player', s.subtitle].filter(Boolean).join(' · ');
      $('.mw__dev-name').title = $('.mw__dev-name').textContent;   // the device line may shorten with an ellipsis
      $('.mw__state b').textContent = LABEL[st];
      const showMedia = (st === 'playing' || st === 'paused') && s.title;
      $('.mw__title').textContent = showMedia ? s.title : st === 'idle' ? 'Nothing playing' : st === 'off' ? 'Switched off' : LABEL[st];
      $('.mw__title').title = $('.mw__title').textContent;
      $('.mw__artist').textContent = showMedia && s.artist ? s.artist : '';
      $('.mw__artist').hidden = !(showMedia && s.artist);
      root.dataset.hasArtist = showMedia && s.artist ? 'true' : 'false';

      if (play) {
        const playing = st === 'playing';
        play.innerHTML = playing ? PAUSE : PLAY;
        play.disabled = !on;
        play.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${s.name || 'media player'}`);
        play.setAttribute('aria-pressed', String(playing));
      }
      if (vol && c.volume) {
        const r = vol.querySelector('input'), v = clampV(s.volume);
        if (document.activeElement !== r) r.value = v;
        r.style.setProperty('--v', v / 100);
        r.disabled = !on;
        r.setAttribute('aria-valuetext', `${v}%`);
        vol.querySelector('.mw__vol-v').textContent = `${v}`;
      }
      if (muteB) {
        muteB.innerHTML = s.muted ? VOL_OFF : VOL;
        muteB.setAttribute('aria-pressed', String(!!s.muted));
        muteB.disabled = !on;
      }
      [prevB, nextB].forEach((b) => { if (b) b.disabled = !on; });
      if (powB) { powB.setAttribute('aria-pressed', String(st !== 'off')); powB.disabled = st === 'unavailable' || st === 'unknown'; }
      if (shufB) { shufB.setAttribute('aria-pressed', String(!!s.shuffle)); shufB.disabled = !on; shufB.dataset.on = s.shuffle ? 'true' : 'false'; }
      if (repB) { const r = s.repeat || 'off'; repB.setAttribute('aria-pressed', String(r !== 'off')); repB.setAttribute('aria-label', `Repeat: ${r} · ${s.name || 'media player'}`); repB.disabled = !on; repB.dataset.mode = r; }
      if (alt) {
        const a = alt.root, ok = on;
        a.dataset.state = st;
        a.querySelector('.iq-media-alt__title').textContent = showMedia ? s.title : st === 'idle' ? 'Nothing playing' : st === 'off' ? 'Switched off' : LABEL[st];
        a.querySelector('.iq-media-alt__sub').textContent = showMedia && s.artist ? s.artist : (s.name || '');
        a.dataset.art = s.artwork ? 'yes' : 'no';
        if (s.artwork && alt.img.getAttribute('src') !== s.artwork) alt.img.src = s.artwork;
        a.querySelector('.iq-media-alt__icon').innerHTML = ICONS[s.icon] || ICONS.generic;
        if (alt.act.play) { alt.act.play.innerHTML = st === 'playing' ? PAUSE : PLAY; alt.act.play.disabled = !ok; alt.act.play.setAttribute('aria-label', `${st === 'playing' ? 'Pause' : 'Play'} · ${s.name || 'media player'}`); }
        [alt.act.prev, alt.act.next].forEach((b) => { if (b) b.disabled = !ok; });
      }
      paintProgress(); schedule();
      if (src) {
        const sel = src.querySelector('select');
        if (s.source && !s.sources.includes(s.source)) {   // an unexpected source from the device is still shown
          const op = document.createElement('option'); op.value = op.textContent = s.source; sel.appendChild(op);
        }
        sel.value = s.source || '';
        sel.disabled = !on;
      }
    }

    render();
    root.media = {
      getState: pick,
      /** External update (later: Home Assistant). Never calls onChange. */
      setState(patch) { s = { ...s, ...patch }; render(); },
    };
    return root;
  }

  /** Smallest usable area.
      Play/pause only: minW 2, minH 3 (artwork/icon, title, play button fit a 153px tile).
      With volume or source: the slider and source picker need ≥ 276px → minW 3 desktop, 4 tablet/mobile;
      minH 3 with one of them, 4 with both. { span: 'wide' } (≥ 560px) → minH 3. */
  function constraints(config, opts = {}) {
    const c = caps(config || {});
    const rich = c.volume || c.source;
    const minW = rich ? { desktop: 3, tablet: 4, mobile: 4 } : { desktop: 2, tablet: 2, mobile: 2 };
    const minH = opts.span === 'wide' ? 3 : c.volume && c.source ? 4 : 3;
    if (config && config.variant === 'compact') return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 };
    if (config && config.variant === 'minibar') return { minW: { desktop: 3, tablet: 3, mobile: 4 }, minH: 1 };
    return { minW, minH };
  }

  global.MaisonMedia = { create, constraints, ICONS };
})(window);
