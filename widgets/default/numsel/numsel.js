/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Number & Select Widget V1 — set a value (number.* / input_number.*) or choose an option (select.* / input_select.*).
   ONE widget: both are "choosing or setting a value". Home Assistant stays the source of truth.

   MaisonNumSel.create(config) → HTMLElement (.ns), with el.numsel = { getState(), getConfirmed(), setState(patch) }

   config = {
     id, name, subtitle
     kind:      'number' | 'select'                 (linked: from the entity's domain)
     variant:   number → 'slider' (default) | 'stepper' | 'compact'
                select → 'options' (default) | 'compact'     (resolved by the registry's shared Variant system)
     NUMBER     value, min, max, step, unit          (linked: HA's state, min / max / step / unit — never guessed)
     SELECT     option, options: [string]            (linked: HA's state and its options, exactly as reported)
     available: true                                 (false → unavailable / unknown: the controls are disabled)
     state:     HA's raw state, for its words ('unknown' / 'unavailable')
     readonly:  true when HA gives nothing to operate (a number without a range, a select without options)
     haSet(value) → Promise<{ ok, error? }>          linked only: the binding's secure request (IniqHA → api/ha_call.php;
                                                     the server checks the value against the entity and picks the service)
     infoItems: resolved Information slots (read-only lines)
   }
   setState() = external update (Home Assistant's CONFIRMED state); it never sends anything.

   Confirmed state: user intent → (pending) → secure action → HA → confirmed state → widget. A control may show the
   requested value at once, marked pending; the value shown as current only becomes it when HA reports it. A refusal,
   an unreachable server or no confirmation in time puts HA's last confirmed value back, with a short message.
   Repeated input (a held stepper, arrow keys, a dragged slider) is coalesced: one request per burst, never a flood.

   Presentation (MaisonFit, the widget's OWN box → data-fit-arr):
     slider    small: value + slider · standard: name, value, slider · large: + subtitle and the range under the slider
     stepper   small: − value + · standard: name, large value, − + · large: + the range
     compact   number: "Name   80 %" over − + (one row when very short) · select: name, current option ▾ (Flyout)
     options   chips while they fit the box (count and real label widths), otherwise the current option ▾ (Flyout)
   ========================================================================== */
(function (global) {
  'use strict';

  const NUM_VARIANTS = ['slider', 'stepper', 'compact'];
  const SEL_VARIANTS = ['options', 'compact'];
  const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
  const MINUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>';
  const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12M12 6v12"/></svg>';
  /** how long a sent value may wait for Home Assistant's confirmation before HA's last value is shown again */
  const CONFIRM_MS = 10000;
  /** coalescing: a stepper burst / keyboard steps are sent once input has paused this long; a slider release at once */
  const QUIET_MS = { stepper: 550, key: 420, release: 0 };
  const MSG = {
    preview: 'Preview — nothing is sent', out_of_range: 'Outside the range Home Assistant allows', off_step: 'Not on the entity’s step',
    not_an_option: 'Not one of the entity’s options', bad_value: 'Not a valid value', not_supported: 'This entity cannot be set',
    unavailable: 'Unavailable', unknown_entity: 'Entity not found', server_unreachable: 'IniqDash server unreachable',
    ha_unreachable: 'Home Assistant unreachable', ha_timeout: 'Home Assistant did not answer', ha_http: 'Refused by Home Assistant',
    signed_out: 'Signed out', no_confirm: 'No confirmation from Home Assistant',
  };

  const fin = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v)) ? null : Number(v));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  /** decimal places of a number (0.01 → 2, 0.5 → 1, 5 → 0, -2.5 → 1) */
  function decimalsOf(x) {
    if (x === null || !Number.isFinite(x)) return null;
    x = Math.abs(x);
    for (let d = 0; d <= 6; d++) if (Math.abs(x * 10 ** d - Math.round(x * 10 ** d)) < 1e-7) return d;
    return 6;
  }
  let measureCtx = null;
  /** the real width of a chip label in the chip font (canvas; a rough estimate where canvas is not available) */
  function textWidth(t) {
    try {
      if (!measureCtx) { measureCtx = document.createElement('canvas').getContext('2d'); measureCtx.font = '600 12.5px Inter, system-ui, sans-serif'; }
      return measureCtx.measureText(String(t)).width;
    } catch (e) { return String(t).length * 7; }
  }

  function create(config) {
    let s = { available: true, kind: 'number', options: [], ...(config || {}) };
    const kind = s.kind === 'select' ? 'select' : 'number';
    const variant = (kind === 'number' ? NUM_VARIANTS : SEL_VARIANTS).includes(s.variant) ? s.variant : (kind === 'number' ? 'slider' : 'options');
    const name = String(s.name || (kind === 'number' ? 'Value' : 'Option'));
    const V = global.IniqVisuals;
    const linked = () => typeof s.haSet === 'function';

    /* ---- number range: HA's (linked) or the demo's own — never guessed for a linked entity ---- */
    const min = fin(s.min), max = fin(s.max);
    const ranged = kind === 'number' && min !== null && max !== null && max > min;
    const step = fin(s.step) > 0 ? fin(s.step) : null;
    // shown / snapped precision: the step's, and the minimum's (the grid starts there: 0.5, 1.5, 2.5 …)
    const dec = step ? Math.max(decimalsOf(step), ranged ? decimalsOf(min) : 0) : 2;
    const snap = (v) => {
      if (!ranged) return v;
      const x = step ? min + Math.round((v - min) / step) * step : v;
      return clamp(Number(x.toFixed(step ? dec : 6)), min, max);
    };
    const unit = typeof s.unit === 'string' ? s.unit : '';
    const fmt = (v, withUnit = true) => {
      if (v === null) return '';
      const t = v.toLocaleString(undefined, step ? { minimumFractionDigits: dec, maximumFractionDigits: dec } : { maximumFractionDigits: 2 }).replace(/^-/, '−');
      return withUnit && unit ? (unit === '%' ? `${t}%` : `${t} ${unit}`) : t;
    };
    const options = kind === 'select' ? (Array.isArray(s.options) ? s.options.filter((o) => typeof o === 'string' && o !== '') : []) : [];

    const root = document.createElement('article');
    root.className = 'ns';
    if (s.id) root.dataset.nsId = s.id;
    root.dataset.kind = kind;
    root.dataset.variant = variant;
    root.innerHTML = `
      <div class="ns__in">
        <div class="ns__id"><h3 class="ns__name"></h3><p class="ns__sub"></p></div>
        <p class="ns__val" aria-live="polite"><b class="ns__num"></b><span class="ns__unit"></span></p>
        <div class="ns__ctl"></div>
        <p class="ns__range" aria-hidden="true"><span class="ns__lo"></span><span class="ns__hi"></span></p>
        <p class="ns__msg" role="status"></p>
        <p class="ns__info"></p>
      </div>`;
    const $ = (q) => root.querySelector(q);
    const ctl = $('.ns__ctl');

    /* ---- state: confirmed (HA / the demo's own) and shown (what the user is setting, until HA confirms) ---- */
    const cur = () => (kind === 'number' ? fin(s.value) : (typeof s.option === 'string' ? s.option : null));
    let confirmed = cur();
    let target = null;              // a value the user asked for, not yet confirmed (null: none)
    // where that request is: null · 'quiet' (input still coming) · 'sending' · 'awaiting' (accepted, waiting for HA's state)
    let phase = null, queued = null, quietT = 0, confirmT = 0, msgT = 0, message = '';
    let drag = null, lastKey = false;   // slider: the value being dragged (feedback only) · the last input was a key
    const usable = () => s.available !== false && !s.readonly && (kind === 'number' ? ranged && confirmed !== null : options.length > 0);
    const shown = () => (target !== null ? target : confirmed);

    function say(text, ms = 4000) {
      message = text || '';
      clearTimeout(msgT);
      if (message && ms) msgT = setTimeout(() => { message = ''; render(); }, ms);
      render();
    }
    function settle() { target = null; queued = null; phase = null; clearTimeout(confirmT); clearTimeout(quietT); setPending(false); }
    function setPending(on) {
      root.toggleAttribute('data-pending-state', on);
      [...ctl.querySelectorAll('[data-ctl], .ns__step, .ns__pick')].forEach((x) => { if (on) x.dataset.pending = ''; else delete x.dataset.pending; });
    }

    /** the user's intent → (coalesced) → the binding's secure request; a demo widget just takes the value */
    function request(v, quiet) {
      if (!usable()) return;
      v = kind === 'number' ? snap(v) : v;
      if (!linked()) { confirmed = v; target = null; render(); return; }
      target = v;
      setPending(true);
      render();
      clearTimeout(quietT);
      if (phase === 'sending') { queued = v; return; }                 // one request at a time: the latest intent follows
      if (quiet) { phase = 'quiet'; quietT = setTimeout(() => send(target), quiet); } else send(v);
    }
    async function send(v) {
      if (v === null) return;
      if (v === confirmed) { settle(); render(); return; }          // back where HA is: nothing to ask
      phase = 'sending';
      clearTimeout(confirmT);
      let r;
      try { r = await s.haSet(v); } catch (e) { r = { ok: false, error: 'server_unreachable' }; }
      if (phase !== 'sending') return;                              // settled meanwhile (HA's state already arrived)
      if (queued !== null && queued !== v) { const q = queued; queued = null; send(q); return; }   // the latest intent wins
      queued = null;
      if (!r || !r.ok) {
        const err = (r && r.error) || 'failed';
        settle();
        say(MSG[err] || 'Not accepted by Home Assistant', err === 'preview' ? 2500 : 4500);
        return;
      }
      // accepted: wait for HA's state (setState); no confirmation in time → HA's last confirmed value again
      phase = 'awaiting';
      if (confirmed === target) { settle(); render(); return; }
      confirmT = setTimeout(() => { if (target !== null) { settle(); say(MSG.no_confirm); } }, CONFIRM_MS);
    }

    /* ---- controls (shared primitives: components/widget-visuals) ---- */
    let slider = null, strip = null, fly = null, pick = null, minus = null, plus = null;
    if (kind === 'number' && variant === 'slider' && V && ranged) {
      slider = V.control({ id: 'value', kind: 'slider', label: 'value', min, max, step: step || (max - min) / 100, decimals: dec, unit: unit === '%' ? '%' : unit ? ` ${unit}` : '',
        classes: { root: 'ns__slider', fill: 'ns__fill', value: 'ns__sv' } }, {
        name,
        act(id, v, commit) {
          if (!usable()) return;
          if (!commit) { drag = snap(v); render(); return; }             // live feedback while moving: not sent
          drag = null;
          request(v, lastKey ? QUIET_MS.key : QUIET_MS.release);
        },
      });
      ctl.append(slider.el);
      slider.el.addEventListener('keydown', () => { lastKey = true; }, true);
      slider.el.addEventListener('pointerdown', () => { lastKey = false; }, true);
    }
    if (kind === 'number' && (variant === 'stepper' || variant === 'compact')) {
      const mk = (dir) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `ns__step ns__step--${dir < 0 ? 'minus' : 'plus'}`;
        b.dataset.iqControl = '';
        b.innerHTML = dir < 0 ? MINUS : PLUS;
        b.setAttribute('aria-label', `${name}: ${dir < 0 ? 'decrease' : 'increase'}`);
        holdRepeat(b, () => bump(dir));
        return b;
      };
      minus = mk(-1); plus = mk(1);
      ctl.append(minus, plus);
    }
    if (kind === 'select' && variant === 'options' && V) {
      strip = V.controlStrip({ name, placement: 'inline', caps: { select: true }, controls: [
        { id: 'option', kind: 'select', label: name, requires: ['select'], options: options.map((o) => ({ value: o, label: o })),
          classes: { root: 'ns__chips', chip: 'ns__chip', trigger: 'ns__pick', triggerKey: 'ns__pick-k', triggerValue: 'ns__pick-v' } },
      ], onAction(id, v) { request(v, 0); } });
      strip.el.classList.add('ns__strip');
      ctl.append(strip.el);
    }
    if (kind === 'select' && variant === 'compact') {
      pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'ns__pick ns__pick--compact';
      pick.dataset.iqControl = '';
      pick.innerHTML = `<span class="ns__pick-v"></span><span class="ns__pick-i" aria-hidden="true">${CHEVRON}</span>`;
      ctl.append(pick);
      if (V) {
        fly = V.flyout({ anchor: pick, label: name, options: options.map((o) => ({ value: o, label: o })), value: confirmed, onSelect: (v) => request(v, 0) });
        pick.addEventListener('click', () => { if (usable()) fly.toggle(); });
      }
    }
    // the stepper / compact value can also be stepped from the keyboard on the value itself (a spinbutton)
    const val = $('.ns__val');
    if (minus) {
      val.setAttribute('role', 'spinbutton');
      val.tabIndex = 0;
      val.dataset.iqControl = '';
      val.addEventListener('keydown', (e) => {
        const big = Math.max(step || 1, step ? Math.round((max - min) / 10 / step) * step : (max - min) / 10);
        const d = { ArrowUp: step || 1, ArrowRight: step || 1, ArrowDown: -(step || 1), ArrowLeft: -(step || 1), PageUp: big, PageDown: -big }[e.key];
        if (d !== undefined) { e.preventDefault(); if (usable()) request((shown() ?? min) + d, QUIET_MS.key); }
        else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); if (usable()) request(e.key === 'Home' ? min : max, QUIET_MS.key); }
      });
    }

    function bump(dir) {
      if (!usable()) return false;
      const base = shown() ?? min;
      const next = snap(base + dir * (step || (max - min) / 100));
      if (next === base) return false;                                // at the end of the range: nothing more to do
      request(next, QUIET_MS.stepper);
      return true;
    }
    /** a press = one step; held = repeated steps (accelerating), all coalesced into ONE request after the burst */
    function holdRepeat(b, fn) {
      let t = 0, n = 0, pointer = false;
      const stop = () => { clearTimeout(t); t = 0; };
      const tick = () => { if (!fn()) return stop(); n++; t = setTimeout(tick, n > 8 ? 60 : 130); };
      b.addEventListener('pointerdown', (e) => {
        if (b.disabled || e.button > 0) return;
        pointer = true; n = 0; fn();
        t = setTimeout(tick, 450);
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, stop));
      b.addEventListener('click', (e) => { if (pointer) { pointer = false; return; } if (e.detail === 0) fn(); });   // keyboard Enter / Space
    }

    /* ---- own size: the arrangement inside the variant ---- */
    /** chips only when ALL of them fit the box with the heading (real label widths, at most two rows, at most 8 options) */
    const chipsFit = (w, h) => {
      if (!options.length || options.length > 8) return false;
      const widths = options.map((o) => Math.min(textWidth(o), 220) + 30);
      const avail = w - 28;
      if (widths.some((x) => x > avail)) return false;
      let line = 0, rows = 1;
      widths.forEach((x) => { if (line && line + 6 + x > avail) { rows++; line = x; } else line += (line ? 6 : 0) + x; });
      if (rows > 2) return false;
      const note = s.available === false || cur() === null || !options.includes(cur());   // the current state is then shown in words too
      const need = 28 + 18 + (s.subtitle ? 16 : 0) + (note ? 26 : 0) + 8 + rows * 44 + (rows - 1) * 6;
      return h >= need;
    };
    function arrange(w, h) {
      if (kind === 'select') {
        if (variant === 'options' && chipsFit(w, h)) return h >= 200 ? 'chips-l' : 'chips';
        return h < 112 ? (w >= 240 ? 'row' : 'tight') : variant === 'compact' ? 'std' : 'menu';
      }
      // narrow: the value beside − + when it fits there, otherwise (and whenever there is the height) on its own line
      if (variant === 'compact') return w < 210 ? (h >= 120 || (w - 120) < String(fmt(cur())).length * 8 ? 'stack2' : 'stack') : h < 96 ? 'row' : 'std';
      if (variant === 'stepper') return h < 140 || w < 170 ? 'small' : h >= 220 && w >= 220 ? 'large' : 'std';
      if (h < 100 && w >= 260) return 'row';
      if (h < 112 && w < 220 && ranged) return 'mini';               // value + slider only (no slider: the name stays)
      return h < 118 || w < 150 ? 'small' : h >= 190 && w >= 240 ? 'large' : 'std';
    }
    if (global.MaisonFit) {
      global.MaisonFit.observe(root, { arrange: (w, h) => arrange(w, h), onChange: (info) => {
        if (strip) {
          strip.el.dataset.mode = /^chips/.test(info.arr) ? 'chips' : 'flyout';
          const f = strip.control('option')?.flyout; if (f && strip.el.dataset.mode === 'chips') f.close();
        }
      } });
    }

    function render() {
      const st = String(s.state ?? '').toLowerCase();
      const na = s.available === false;
      root.dataset.state = na ? (st === 'unknown' ? 'unknown' : 'unavailable') : 'ok';
      root.dataset.hasSub = s.subtitle ? 'true' : 'false';
      $('.ns__name').textContent = name;
      $('.ns__sub').textContent = s.subtitle || '';
      $('.ns__sub').hidden = !s.subtitle;
      const live = usable();
      const v = drag !== null ? drag : shown();
      const was = root.dataset.state;
      let num = '', u = '', note = '';
      if (na) num = st === 'unknown' ? 'Unknown' : 'Unavailable';
      else if (kind === 'number') {
        if (v === null) { num = s.state !== undefined && s.state !== null && s.state !== '' ? String(s.state) : '—'; note = 'Not a number'; }
        else { num = fmt(v, false); u = unit; }
        if (!ranged && !na) note = 'No range reported — read only';
      } else {
        num = v !== null ? v : '—';
        if (!options.length) note = 'No options reported';
        else if (v !== null && !options.includes(v)) note = 'Not one of the options';
      }
      $('.ns__num').textContent = num;
      $('.ns__unit').textContent = u;
      $('.ns__unit').hidden = !u;
      root.dataset.value = na || (kind === 'number' && v === null) ? 'none' : 'set';
      val.setAttribute('aria-label', `${name}: ${na ? num : kind === 'number' ? fmt(v) || num : num}${target !== null ? ' (waiting for Home Assistant)' : ''}`);
      if (minus) {
        val.setAttribute('aria-valuetext', kind === 'number' && v !== null ? fmt(v) : num);
        if (v !== null) val.setAttribute('aria-valuenow', String(v)); else val.removeAttribute('aria-valuenow');
        if (ranged) { val.setAttribute('aria-valuemin', String(min)); val.setAttribute('aria-valuemax', String(max)); }
        val.setAttribute('aria-disabled', String(!live));
        val.tabIndex = live ? 0 : -1;
        minus.disabled = !live || (v !== null && v <= min);
        plus.disabled = !live || (v !== null && v >= max);
      }
      const lo = $('.ns__lo'), hi = $('.ns__hi');
      lo.textContent = ranged ? fmt(min) : ''; hi.textContent = ranged ? fmt(max) : '';
      $('.ns__range').hidden = !ranged;
      if (slider) {
        slider.update({ available: live, active: true, value: v });
        slider.el.style.setProperty('--ns-f', v !== null && ranged ? String(clamp((v - min) / (max - min), 0, 1)) : '0');
      }
      if (strip) strip.update({ available: live, option: na ? num : v });   // unavailable: its words in the trigger, no stale option
      if (pick) {
        pick.querySelector('.ns__pick-v').textContent = num;
        pick.disabled = !live;
        pick.setAttribute('aria-label', `${name}: ${num}${note ? ` (${note})` : ''}. Choose`);
        if (fly) { fly.set({ value: v }); if (!live) fly.close(); }
      }
      const msg = message || (target !== null ? 'Waiting for Home Assistant…' : note);
      $('.ns__msg').textContent = msg;
      $('.ns__msg').hidden = !msg;
      root.dataset.msg = message ? 'alert' : target !== null ? 'pending' : note ? 'note' : 'none';
      root.style.setProperty('--ns-len', String(Math.max(2, num.length + (u ? u.length + 1 : 0))));
      if (was !== undefined && was !== root.dataset.state && global.MaisonFit && root.isConnected) global.MaisonFit.refresh(root);   // the room the state needs changed
      const info = Array.isArray(s.infoItems) ? s.infoItems.map((x) => x && x.line).filter(Boolean).join(' · ') : '';
      $('.ns__info').textContent = info;
      $('.ns__info').hidden = !info;
    }

    render();
    root.numsel = {
      getState: () => ({ kind, variant, value: kind === 'number' ? shown() : undefined, option: kind === 'select' ? shown() : undefined, pending: target !== null }),
      /** the confirmed value (Home Assistant's last report when linked; the demo's own value otherwise) */
      getConfirmed: () => confirmed,
      /** External update (Home Assistant). Never sends anything. A new value / availability is HA's truth: it ends a pending request. */
      setState(patch = {}) {
        s = { ...s, ...patch };
        const truth = 'value' in patch || 'option' in patch || 'available' in patch || 'state' in patch;
        if (truth) {
          confirmed = cur();
          // HA answered the accepted request (with the value asked, or what HA made of it) — or it became unusable
          if (target !== null && (phase === 'awaiting' || confirmed === target || s.available === false)) {
            const asked = target;
            settle();
            if (s.available !== false && confirmed !== null && confirmed !== asked) say(`Home Assistant reports ${kind === 'number' ? fmt(confirmed) : confirmed}`);
          }
        }
        render();
      },
    };
    return root;
  }

  /** Smallest usable area: 2 × 2 (a compact cell); a slider / chips need 3 columns from a standard span */
  function constraints(config, opts = {}) {
    const c = config || {};
    const wideCtl = c.kind !== 'select' ? (c.variant || 'slider') === 'slider' : (c.variant || 'options') === 'options';
    return { minW: { desktop: wideCtl && opts.span === 'standard' ? 3 : 2, tablet: 2, mobile: 2 }, minH: 2 };
  }

  global.MaisonNumSel = { create, constraints, NUM_VARIANTS, SEL_VARIANTS };
})(window);
