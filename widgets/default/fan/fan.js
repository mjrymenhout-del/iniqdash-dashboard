/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Fan Widget V1 — power, optional speed (0–100 in steps), optional preset.

   MaisonFan.create(config) → HTMLElement (.fw), with el.fan = { getState(), setState(patch) }

   config = {
     id, name, subtitle
     state:         'on' | 'off'           (anything else / available:false → unavailable or unknown)
     available:     true
     speed:         0…100                  (with capabilities.speed)
     speedStep:     20                     (HA percentage_step: 33.33 → a 3-speed fan; default 20 → 5)
     preset:        'Normal'               (with capabilities.preset)
     presets:       ['Normal', 'Quiet', 'Boost']   — from configuration, never assumed
     oscillating:   true | false           (optional, display only — shown in the state line when given)
     direction:     'forward' | 'reverse'  (optional, display only)
     capabilities:  { power: true, speed: false, preset: false }
     onChange:      (next, prev, { source: 'power'|'speed'|'preset' }) => void   — user only
   }
   setState() = external update (Home Assistant); it never calls onChange.

   Built from the shared visual primitives (components/widget-visuals): the rotor is a visual LAYER (rotate while the
   confirmed state is on; speed sets the pace), the speed arc a ProgressRing, and power / speed / preset a ControlStrip
   (capability-filtered; a narrow tile offers the presets in a Flyout).
   ========================================================================== */
(function (global) {
  'use strict';

  const POWER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><path d="M12 4v7.5"/><path d="M7 7.3a7 7 0 1 0 10 0"/></svg>';
  /** rotor drawn in a 100×100 box: hub + five swept blades */
  const ROTOR = (() => {
    const blade = 'M50 50 C 44 36, 40 22, 48 9 C 58 13, 61 30, 55 48 Z';
    const edge = 'M48 9 C 40 22, 44 36, 50 49';   // the leading edge catches the light
    const blades = [0, 72, 144, 216, 288].map((a) => `<g transform="rotate(${a} 50 50)"><path d="${blade}"/><path class="fw__edge" d="${edge}"/></g>`).join('');
    return `<svg class="fw__rotor-svg" viewBox="0 0 100 100" aria-hidden="true"><g class="fw__blades">${blades}</g><circle class="fw__hub" cx="50" cy="50" r="10"/><circle class="fw__hub-cap" cx="50" cy="50" r="4"/></svg>`;
  })();
  /** the protective grille (static, over the turning blades) and the pedestal the housing stands on */
  const GRILLE = (() => {
    const rings = [44, 34, 24, 15].map((r) => `<circle cx="50" cy="50" r="${r}"/>`).join('');
    const spokes = Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return `M${(50 + Math.cos(a) * 13).toFixed(1)} ${(50 + Math.sin(a) * 13).toFixed(1)}L${(50 + Math.cos(a) * 45).toFixed(1)} ${(50 + Math.sin(a) * 45).toFixed(1)}`; }).join('');
    return `<svg class="fw__grille" viewBox="0 0 100 100" aria-hidden="true"><g class="fw__wire">${rings}<path d="${spokes}"/></g></svg>`;
  })();
  const STAND = '<svg class="fw__stand" viewBox="0 0 100 44" preserveAspectRatio="xMidYMin meet" aria-hidden="true"><rect class="fw__neck" x="46" y="0" width="8" height="30" rx="3"/><ellipse class="fw__base" cx="50" cy="36" rx="30" ry="6"/><ellipse class="fw__base-top" cx="50" cy="34.5" rx="24" ry="3.6"/></svg>';
  const LABEL = { on: 'On', off: 'Off', unavailable: 'Unavailable', unknown: 'Unknown' };

  function stateOf(s) {
    if (s.available === false) return 'unavailable';
    const v = String(s.state ?? '').toLowerCase();
    return v === 'on' || v === 'off' ? v : v === 'unknown' ? 'unknown' : 'unavailable';
  }
  const caps = (s) => ({ power: true, speed: false, preset: false, ...(s.capabilities || {}) });

  function create(config) {
    let s = { available: true, speedStep: 20, presets: [], ...(config || {}) };
    const c = caps(s);
    const steps = Math.max(1, Math.round(100 / (Number(s.speedStep) || 20)));
    const stepPct = 100 / steps;
    const snap = (v) => Math.max(stepPct, Math.min(100, Math.round((Number(v) || 0) / stepPct) * stepPct));
    const fmtPct = (v) => `${Math.round(v)}%`;
    const V = global.IniqVisuals;
    const name = s.name || 'Fan';

    const root = document.createElement('article');
    root.className = 'fw';
    if (s.id) root.dataset.fanId = s.id;
    root.dataset.caps = ['power', c.speed && 'speed', c.preset && 'preset'].filter(Boolean).join(' ');
    root.innerHTML = `
      <div class="fw__in">
        <div class="fw__rotor">${STAND}${ROTOR}${GRILLE}</div>
        <div class="fw__id"><h3 class="fw__name"></h3><p class="fw__sub"></p><p class="fw__state"><b class="fw__state-t"></b><span class="fw__state-x"></span></p></div>
      </div>`;
    const $ = (q) => root.querySelector(q);
    const inner = $('.fw__in');

    /* ---- shared visual primitives (components/widget-visuals) ----
       DEVICE visuals — the turning rotor, the level ring, the "on" colours — show the CONFIRMED state: what Home Assistant
       reported (setState), or, for an unlinked demo fan, its own state. A press never spins the rotor before HA confirms.
       The CONTROLS show the press at once (feedback) and wait, marked pending, for the confirmation. */
    const rotor = $('.fw__rotor');
    const level = V ? V.ring({ label: `${name} speed`, thickness: 0.022, gap: 0, tone: 'accent' }) : null;
    if (level) { level.el.classList.add('fw__level'); rotor.prepend(level.el); }
    const motion = V ? V.layers([{ target: $('.fw__rotor-svg'), rules: [
      // speed sets the pace when the fan reports one; a power-only fan turns at a steady medium pace
      { when: { state: 'on', available: true }, animate: { type: 'rotate', duration: c.speed ? { from: 'speed', range: [0, 100], to: [2.6, 0.4] } : 1.3 } },
    ] }]) : null;
    const strip = V ? V.controlStrip({
      name, placement: 'inline', host: root, caps: { power: true, speed: c.speed, preset: c.preset && s.presets.length > 0 },
      controls: [
        { id: 'power', kind: 'toggle', label: 'power', icon: 'power', requires: ['power'], text: { on: 'On', off: 'Off' },
          classes: { root: 'fw__power', icon: 'fw__power-i', text: 'fw__power-t' } },
        { id: 'speed', kind: 'slider', label: 'speed', requires: ['speed'], steps, min: 0, max: 100,
          classes: { root: 'fw__speed', seg: 'fw__seg', value: 'fw__pct' } },
        { id: 'preset', kind: 'select', label: 'Preset', requires: ['preset'], options: s.presets, priority: 1,
          classes: { root: 'fw__presets', chip: 'fw__chip', trigger: 'fw__cycle', triggerKey: 'fw__cycle-k', triggerValue: 'fw__cycle-v' } },
      ],
      onAction(id, value, { commit }) {
        if (!live()) return;
        if (id === 'power') set({ state: value ? 'on' : 'off' }, 'power', true);
        else if (id === 'speed') set({ speed: value, state: 'on' }, 'speed', commit);
        else if (id === 'preset') set({ preset: value }, 'preset', true);
      },
    }) : null;
    if (strip) inner.append(strip.el);
    rotor.dataset.iqControl = '';                                    // its own control: never a card gesture (common interactions)
    rotor.addEventListener('click', () => { const p = strip && strip.control('power'); if (p) p.click(); });   // tapping the rotor = power (mouse/touch convenience)

    const live = () => ['on', 'off'].includes(stateOf(s));
    const pick = () => ({ state: stateOf(s), speed: c.speed ? s.speed : null, preset: c.preset ? s.preset : null });
    // the confirmed state (device visuals): HA's last report when linked; the fan's own state when it is a demo
    const linked = () => typeof s.onChange === 'function';
    let confirmed = pick();
    function emit(prev, source) { if (linked()) s.onChange(pick(), prev, { source }); }
    function set(patch, source, commit) {
      const prev = pick();
      s = { ...s, ...patch };
      if (c.speed && patch.speed !== undefined) s.speed = snap(patch.speed);
      const changed = JSON.stringify(prev) !== JSON.stringify(pick());
      if (!linked()) confirmed = pick();
      render();
      if (commit && changed) { if (linked() && strip) strip.pending(source, true); emit(prev, source); }
    }

    function render() {
      const st = stateOf(s), on = st === 'on', ok = live();
      const cf = confirmed, cOn = cf.state === 'on';
      root.dataset.state = cf.state;                                  // device colours: the confirmed state
      root.dataset.hasSub = s.subtitle ? 'true' : 'false';
      $('.fw__name').textContent = name;
      $('.fw__sub').textContent = s.subtitle || '';
      $('.fw__sub').hidden = !s.subtitle;
      $('.fw__state-t').textContent = LABEL[cf.state];
      const extra = cOn ? [c.speed && cf.speed ? fmtPct(cf.speed) : '', c.preset ? cf.preset : '', s.oscillating === true ? 'Oscillating' : '', s.direction === 'reverse' ? 'Reverse' : ''].filter(Boolean).join(' · ') : '';
      $('.fw__state-x').textContent = extra ? ` · ${extra}` : '';

      const view = { state: cf.state, available: ['on', 'off'].includes(cf.state), speed: c.speed ? (cf.speed || stepPct) : null };
      if (motion) motion.update(view);
      // the ring: the confirmed speed (a fan without speed: a full ring while on); off → the track only
      if (level) level.update({ value: !view.available ? null : cOn ? (c.speed ? (cf.speed || stepPct) : 100) : 0, available: view.available });
      if (strip) strip.update({ available: ok, active: on, power: on, speed: on ? (s.speed || stepPct) : null, preset: s.preset ?? null });
    }

    render();
    root.fan = {
      getState: pick,
      /** the confirmed visual state (what the device visuals show) — Home Assistant's last report when linked */
      getConfirmed: () => ({ ...confirmed }),
      /** External update (Home Assistant). Never calls onChange. */
      setState(patch) {
        s = { ...s, ...patch };
        if (c.speed && patch.speed !== undefined) s.speed = snap(patch.speed);
        confirmed = pick();
        render();
        if (strip) strip.update({ available: live(), active: stateOf(s) === 'on', power: stateOf(s) === 'on', speed: stateOf(s) === 'on' ? (s.speed || stepPct) : null, preset: s.preset ?? null }, { confirmed: true });
      },
    };
    return root;
  }

  /** Smallest usable area. minW 2. minH depends on capabilities and on the span the layout gives it:
        compact tile (< 260px):  power 3 · + speed 4 · + speed + preset 5
        { span: 'standard' } (≥ 260px): 3, or 4 with speed + preset
        { span: 'wide' } (≥ 480px): 2 for power only, otherwise 3 */
  function constraints(config, opts = {}) {
    const c = caps(config || {});
    const extra = (c.speed ? 1 : 0) + (c.preset ? 1 : 0);
    const minH = opts.span === 'wide' ? (extra ? 3 : 2) : opts.span === 'standard' ? (extra === 2 ? 4 : 3) : 3 + extra;
    return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH };
  }

  global.MaisonFan = { create, constraints };
})(window);
