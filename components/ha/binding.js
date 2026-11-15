/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqBinding — the HOME ASSISTANT BINDING of a composed component (Widget Studio). It sits between the shared HA layer and a shared
   component, and keeps the three concerns apart:

     Home Assistant ⇄ IniqDash server (token stays there) ⇄ IniqHA ⇄ IniqBinding ⇄ the component's VIEW (its normal data / update())
     component event (onAction) → IniqBinding → IniqHA.call(entity, NORMALISED action, value) → the server plans the service

   A COMPONENT knows nothing of Home Assistant. It only DECLARES (IniqComponents compose):
     inputs:  { <data key>: { label, kind: 'text' | 'number' | 'boolean' | 'option' | 'series', primary?, unit?, bindOnly? } }   what view data it can consume
              (series: the entity's history / statistics as the component's configuration asks — source, range, period, stat)
     actions: { <event>: { label, kind: 'press' | 'number' | 'option' } }                                 what it reports (ctx.onAction)
   A COMPONENT INSTANCE owns its binding (never the widget: one widget may mix any domains):
     binding = { source: 'preview' | 'ha',
                 inputs: { <data key>: { entity, read: 'state' | 'attribute' | 'derived', attribute?, unit?: 'entity' | 'hide' | 'override', unitText? } },
                 action: { entity? (default: the primary input's), action: one of ACTIONS } }
       read 'state'      the entity's state (every entity — raw sensors and unusual integrations included)
       read 'attribute'  one of the entity's REAL Home Assistant attributes (scalar: string / number / boolean), as HA reports it
       read 'derived'    one of IniqDash's normalised values for it (e.g. a light's brightness_pct, 0–100)
     Inputs need not share an entity (an older binding: one input from a sensor, another from an input_number). Unbound inputs keep the
     component's preview data, so switching the source back to Preview loses nothing.

   IniqBinding.attach(x, compose, onData(patch)) → { stop(), act(event, value) → Promise<{ ok, error? }> } | null
       onData receives view data for the component (its input keys + status / unavailable) now and on every Home Assistant change
       (the shared poll — one request for every entity on screen); raw attributes are re-read when HA reports the entity updated.
   IniqBinding.data(x, compose, preview, patch) → the component's view data (preview, then bound values; bindOnly inputs never from the preview)
   WIDGET STUDIO stores a component's binding as a reference to a WIDGET PROPERTY ({ source: 'ha', property: 'p…' } — "Widget properties"
   below); IniqBinding.expand(definition) turns it into the binding above, on the entity the property's SOURCE GROUP gets in a placed copy.
   IniqBinding.fields(compose, ctx) → the component's DATA fields (Property · its Action / Unit), from its declaration only
   IniqBinding.validate(x, compose) → { errors: [text…], warnings: [text…] }   (an offline / unknown entity is a warning, never an error)
   IniqBinding.attributes(entity) → [{ name, value, kind }] | null (fetching)  ·  IniqBinding.onAttributes(cb) → unsubscribe
   ========================================================================== */
(function (global) {
  'use strict';

  const HA = () => global.IniqHA;
  const live = () => !!(HA() && HA().enabled && HA().enabled());
  const ENTITY = /^[a-z0-9_]+\.[a-z0-9_]+$/, ATTR = /^[A-Za-z0-9_]{1,64}$/;
  /** the normalised actions an event kind may ask for (the server checks each against the entity's real capabilities) */
  const ACTIONS = {
    press: [['toggle', 'Toggle'], ['turn_on', 'Turn on'], ['turn_off', 'Turn off'], ['trigger', 'Run / press'], ['open', 'Open'], ['close', 'Close'], ['stop', 'Stop'],
      ['lock', 'Lock'], ['unlock', 'Unlock'], ['play', 'Play'], ['pause', 'Pause'], ['play_pause', 'Play / pause'], ['next', 'Next'], ['previous', 'Previous'], ['power', 'Power on / off'],
      ['start', 'Start'], ['dock', 'Return to dock'], ['cancel', 'Cancel'], ['finish', 'Finish']],
    number: [['brightness', 'Brightness'], ['position', 'Position'], ['volume', 'Volume'], ['set_value', 'Value'], ['set_temperature', 'Target temperature'], ['percentage', 'Speed']],
    option: [['select_option', 'Option'], ['set_hvac_mode', 'HVAC mode'], ['set_preset_mode', 'Preset'], ['set_fan_mode', 'Fan mode'], ['source', 'Source']],
  };
  const ALL_ACTIONS = Object.values(ACTIONS).flat().map(([a]) => a);
  const UNKNOWN = ['unknown', 'unavailable'];
  const ON = ['on', 'true', 'open', 'opening', 'home', 'playing', 'heat', 'heating', 'cool', 'cooling', 'active', 'unlocked', 'detected'];
  const finite = (v) => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean' && Number.isFinite(Number(v));

  /* ---------------------------------------------------------------- raw attributes: IniqHA.inspect (server-side, credentials and
     precise location withheld), shared per entity and re-read when the shared poll reports the entity updated */
  const raw = new Map();            // entity → { at: last_updated seen, list: [{ name, value, kind }] | null, busy, waiters: Set }
  const attrSubs = new Set();
  const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'list' : typeof v === 'object' ? 'object' : typeof v);
  function fetchAttrs(entity, at) {
    const r = raw.get(entity) || { at: null, list: null, busy: false, waiters: new Set() };
    raw.set(entity, r);
    if (r.busy || (r.list && r.at === at)) return;
    r.busy = true;
    HA().inspect(entity).then((x) => {
      r.busy = false; r.at = at;
      r.list = x.ok && x.entity ? (x.entity.attributes || []).map(([name, value]) => ({ name, value, kind: kindOf(value) })) : r.list || (x.ok ? [] : null);
      r.missing = !!(x.ok && !x.entity);
      r.waiters.forEach((cb) => { try { cb(); } catch (e) { console.error(e); } });
      attrSubs.forEach((cb) => { try { cb(entity); } catch (e) { console.error(e); } });
    });
  }
  /** the Properties ask about an entity the poll has not reported yet: tell them when it arrives (its normalised values) */
  const watching = new Set();
  function watch(entity) {
    if (watching.has(entity) || HA().get(entity)) return;
    watching.add(entity);
    let un = null;
    un = HA().subscribe(entity, (e) => { if (!e) return; attrSubs.forEach((cb) => { try { cb(entity); } catch (err) { console.error(err); } }); watching.delete(entity); setTimeout(() => un && un(), 0); });
  }
  function attributes(entity) {
    if (!live() || !ENTITY.test(entity || '')) return null;
    watch(entity);
    const r = raw.get(entity);
    const e = HA().get(entity);
    if (!r || !r.list) fetchAttrs(entity, e ? JSON.stringify([e.updated, e.changed, e.state, e.attrs]) : null);
    return r && r.list ? r.list : null;
  }

  /* ---------------------------------------------------------------- one input's value from the entity */
  /** { value, status: 'ready' | 'unavailable' | 'missing' | 'loading', unit } — never undefined / NaN */
  function read(inp, e, known) {
    if (!e) return { value: null, status: known ? 'missing' : 'loading', unit: null };
    const st = String(e.state ?? '');
    if (inp.read === 'attribute') {
      const r = raw.get(inp.entity), a = r && r.list ? r.list.find((x) => x.name === inp.attribute) : null;
      if (!r || !r.list) return { value: null, status: 'loading', unit: null };
      if (!a || a.value === null || ['object', 'list'].includes(a.kind)) return { value: null, status: a ? 'unavailable' : 'missing', unit: null };
      return { value: a.value, status: 'ready', unit: null };
    }
    if (inp.read === 'derived') {
      // values IniqDash derives itself: when the entity last changed (ISO time) · a media player's live position / progress (%) ·
      // a weather entity's DAILY FORECAST, day 1–5 (forecast_<day>_<field>: temperature · templow · condition · time · precipitation_probability)
      if (inp.attribute === 'last_changed') return e.changed ? { value: e.changed, status: 'ready', unit: null } : { value: null, status: 'unavailable', unit: null };
      if (inp.attribute === 'media_position' || inp.attribute === 'media_progress') {
        const a = e.attrs || {}, dur = Number(a.duration), base = Number(a.position), at = Date.parse(a.position_updated_at || '');
        if (!Number.isFinite(base) || !(dur > 0)) return { value: null, status: 'unavailable', unit: null };
        const pos = Math.min(dur, base + (e.state === 'playing' && Number.isFinite(at) ? Math.max(0, (Date.now() - at) / 1000) : 0));
        return { value: inp.attribute === 'media_progress' ? Math.round((pos / dur) * 1000) / 10 : Math.round(pos), status: 'ready', unit: null };
      }
      const fc = /^forecast_([0-5])_(temperature|templow|condition|time|precipitation_probability)$/.exec(inp.attribute || '');
      if (fc) {
        const d = HA().peek ? HA().peek('forecast', inp.entity, 'daily') : null, row = d && d.ok && Array.isArray(d.forecast) ? d.forecast[Number(fc[1])] : null;
        if (!d) return { value: null, status: 'loading', unit: null };
        const v = row ? (fc[2] === 'time' ? (Number.isFinite(row.t) ? new Date(row.t).toISOString() : null) : row[fc[2]]) : null;
        return v === null || v === undefined ? { value: null, status: 'unavailable', unit: null } : { value: v, status: 'ready', unit: null };
      }
      const v = e.attrs ? e.attrs[inp.attribute] : undefined;
      if (v === undefined) return { value: null, status: 'missing', unit: null };
      if (v === null || typeof v === 'object') return { value: null, status: 'unavailable', unit: null };
      return { value: v, status: e.available === false ? 'unavailable' : 'ready', unit: null };
    }
    if (UNKNOWN.includes(st.toLowerCase())) return { value: null, status: 'unavailable', unit: e.unit || null };
    return { value: e.state, status: 'ready', unit: e.unit || null, e };
  }
  /** a value as the component's input kind wants it */
  function convert(decl, inp, r) {
    const ok = r.status === 'ready';
    switch (decl.kind) {
      case 'number': return ok && finite(r.value) ? Number(r.value) : null;
      case 'boolean': return ok ? (typeof r.value === 'boolean' ? r.value : finite(r.value) ? Number(r.value) > 0 : ON.includes(String(r.value).toLowerCase())) : null;
      case 'option': return ok ? String(r.value) : null;
      case 'series': return ok && Array.isArray(r.value) ? r.value : null;
      case 'scalar': return ok ? (typeof r.value === 'boolean' ? String(r.value) : finite(r.value) ? Number(r.value) : String(r.value)) : null;
      default: {                                                                   // text: the value, with the unit the owner chose
        if (r.status === 'missing') return inp.read === 'state' ? 'Not found' : '—';
        if (!ok) return '—';
        const mode = inp.unit || 'entity', H = HA();
        if (inp.read === 'state' && mode === 'entity' && r.e && H && H.format && H.format.state) { const it = H.format.state(r.e); if (it && it.text) return it.text; }
        const v = typeof r.value === 'number' ? r.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : finite(r.value) ? Number(r.value).toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(r.value);
        const unit = mode === 'override' ? (inp.unitText || '').trim() : mode === 'hide' ? '' : r.unit || '';
        return unit ? (unit === '%' ? `${v}%` : `${v} ${unit}`) : v;
      }
    }
  }
  const cleanInputs = (b, compose) => {
    const decl = (compose && compose.inputs) || {}, out = {};
    Object.entries((b && b.inputs) || {}).forEach(([k, x]) => { if (decl[k] && x && ENTITY.test(x.entity || '')) out[k] = { read: 'state', ...x }; });
    return out;
  };
  const primaryOf = (compose) => Object.keys((compose && compose.inputs) || {}).find((k) => compose.inputs[k].primary) || Object.keys((compose && compose.inputs) || {})[0] || null;

  /* ---------------------------------------------------------------- attach: live data in, normalised actions out */
  function attach(x, compose, onData) {
    const b = x && x.binding;
    if (!b || b.source !== 'ha' || !live()) return null;
    const inputs = cleanInputs(b, compose), primary = primaryOf(compose), unsubs = [];
    const state = {};                                                                 // input key → its read
    const emit = () => {
      const patch = {};
      Object.entries(inputs).forEach(([k, inp]) => { patch[k] = convert(compose.inputs[k], inp, state[k] || { value: null, status: 'loading' }); });
      const p = primary && inputs[primary] ? state[primary] : null;
      if (p) { patch.status = p.status; patch.unavailable = p.status !== 'ready'; }
      onData(patch);
    };
    // A SERIES input (a chart): the entity's HISTORY or LONG-TERM STATISTICS, as the component's own configuration asks (source, range,
    // period, stat) — re-read at the server's refresh time; [[ms, value | null], …]
    const series = Object.entries(inputs).filter(([k]) => compose.inputs[k].kind === 'series');
    let tSer = null, stopped = false;
    if (series.length) {
      const cfg = x.config || {};
      const loadSeries = async () => {
        let every = 60000;
        for (const [k, inp] of series) {
          try {
            if (cfg.source === 'history') {
              const d = await HA().history(inp.entity, ['1h', '6h', '12h', '24h', '7d'].includes(cfg.range) ? cfg.range : '24h', 'numeric');
              state[k] = d.ok ? { value: (d.points || []).map((q) => [q[0], typeof q[1] === 'number' ? q[1] : null]), status: 'ready' } : { value: null, status: 'unavailable' };
              if (d.ok) every = Math.max(30, Number(d.refresh) || 60) * 1000;
            } else {
              const d = await HA().statistics([inp.entity], ['hour', 'day', 'week', 'month'].includes(cfg.period) ? cfg.period : 'day');
              const r = d.ok ? (d.results || {})[inp.entity] : null;
              const want = ['change', 'mean', 'min', 'max'].includes(cfg.stat) ? cfg.stat : r && r.hasSum ? 'change' : 'mean', col = { change: 1, mean: 2, min: 3, max: 4 }[want];
              state[k] = r && !r.error ? { value: (r.points || []).map((q) => [q[0], typeof q[col] === 'number' ? q[col] : null]), status: 'ready' } : { value: null, status: 'unavailable' };
              if (d.ok) every = Math.max(60, Number(d.refresh) || 300) * 1000;
            }
          } catch (e) { state[k] = { value: null, status: 'unavailable' }; every = 20000; }
        }
        if (stopped) return;
        emit();
        tSer = setTimeout(loadSeries, every);
      };
      loadSeries();
      unsubs.push(() => { stopped = true; clearTimeout(tSer); });
    }
    const entities = [...new Set(Object.entries(inputs).filter(([k]) => compose.inputs[k].kind !== 'series').map(([, i]) => i.entity))];
    entities.forEach((ent) => {
      const mine = Object.entries(inputs).filter(([k, i]) => i.entity === ent && compose.inputs[k].kind !== 'series');
      const needRaw = mine.some(([, i]) => i.read === 'attribute');
      const update = () => { const e = HA().get(ent), known = HA().known ? HA().known(ent) : !!e; mine.forEach(([k, i]) => { state[k] = read(i, e, known); }); emit(); };
      if (needRaw) {
        const r = raw.get(ent) || { at: null, list: null, busy: false, waiters: new Set() };
        raw.set(ent, r); r.waiters.add(update);
        unsubs.push(() => r.waiters.delete(update));
      }
      // re-read the raw attributes whenever HA reports the entity changed (its last_updated, state or normalised values)
      unsubs.push(HA().subscribe(ent, (e) => { if (needRaw && e) fetchAttrs(ent, JSON.stringify([e.updated, e.changed, e.state, e.attrs])); update(); }));
      // the daily FORECAST (asked lazily, shared, re-asked at its refresh time) · a playing media's live POSITION and a relative TIME: ticking
      if (mine.some(([, i]) => i.read === 'derived' && /^forecast_/.test(i.attribute || '')) && HA().forecast) {
        let tf = null, gone = false; const ask = () => HA().forecast(ent, 'daily').then(() => { if (gone) return; update(); tf = setTimeout(ask, 15 * 60000); });
        ask(); unsubs.push(() => { gone = true; clearTimeout(tf); });
      }
      if (mine.some(([, i]) => i.read === 'derived' && ['media_position', 'media_progress', 'last_changed'].includes(i.attribute))) { const ti = setInterval(update, 1000); unsubs.push(() => clearInterval(ti)); }
      update();
    });
    return {
      stop() { unsubs.splice(0).forEach((u) => { try { u(); } catch (e) { /* gone */ } }); },
      /** a component event → the configured normalised action (nothing configured: nothing happens) */
      async act(event, value) {
        const a = b.action, decl = compose.actions && compose.actions[event];
        if (!a || !decl || !(ACTIONS[decl.kind] || []).some(([n]) => n === a.action)) return { ok: false, error: 'no_action' };
        const ent = a.entity || (primary && inputs[primary] ? inputs[primary].entity : null);
        if (!ENTITY.test(ent || '')) return { ok: false, error: 'no_entity' };
        let v = value;
        if (decl.kind === 'number') { v = Number(value); if (!Number.isFinite(v)) return { ok: false, error: 'not_a_number' }; if (['brightness'].includes(a.action)) v = Math.max(1, Math.min(100, Math.round(v))); }
        if (decl.kind === 'press') v = undefined;
        return HA().call(ent, a.action, v);
      },
    };
  }

  /* ---------------------------------------------------------------- WHAT AN ENTITY OFFERS (the controller side: it knows Home Assistant,
     never a component). From the entity's normalised capabilities (the same ones IniqDash's own widgets and the server's plan use), in
     words people use — only what the entity actually supports. */
  const num = (v, d) => (finite(v) ? Number(v) : d);
  /** a press: what a button can ask of this entity */
  function pressActions(e) {
    if (!e) return [];
    const c = e.caps || {}, d = e.domain;
    if (['light', 'switch', 'input_boolean', 'fan'].includes(d)) return [['toggle', 'Toggle'], ['turn_on', 'Turn on'], ['turn_off', 'Turn off']];
    if (d === 'cover') return [...(c.open && c.close ? [['toggle', 'Open / close']] : []), ...(c.open ? [['open', 'Open']] : []), ...(c.close ? [['close', 'Close']] : []), ...(c.stop ? [['stop', 'Stop']] : [])];
    if (d === 'lock') return [['lock', 'Lock'], ['unlock', 'Unlock'], ...(c.open ? [['open', 'Open']] : [])];
    if (d === 'scene') return [['trigger', 'Activate']];
    if (d === 'script') return [['trigger', 'Run']];
    if (d === 'button' || d === 'input_button') return [['trigger', 'Press']];
    if (d === 'media_player') return [['play', 'Play'], ['pause', 'Pause'], ['next', 'Next track'], ['previous', 'Previous track'], ['stop', 'Stop'], ['power', 'Power on / off']].filter(([a]) => c[a]);
    if (d === 'vacuum' || d === 'lawn_mower') return [['start', 'Start'], ['pause', 'Pause'], ['stop', 'Stop'], ['dock', 'Return to dock']].filter(([a]) => c[a]);
    if (d === 'timer') return [['start', 'Start'], ['pause', 'Pause'], ['cancel', 'Cancel'], ['finish', 'Finish']];
    return [];
  }
  /** a number this entity can be SET to (a slider; a dial's setpoint): its reading, its action and its range */
  function numberControls(e) {
    if (!e) return [];
    const c = e.caps || {}, a = e.attrs || {}, d = e.domain, out = [];
    if (d === 'light' && c.brightness) out.push({ id: 'brightness', label: 'Brightness', read: { read: 'derived', attribute: 'brightness_pct' }, range: [1, 100, 1] });
    if (d === 'cover' && c.position) out.push({ id: 'position', label: 'Position', read: { read: 'derived', attribute: 'position' }, range: [0, 100, 1] });
    if (d === 'media_player' && c.volume) out.push({ id: 'volume', label: 'Volume', read: { read: 'derived', attribute: 'volume' }, range: [0, 100, 1] });
    if (d === 'fan' && c.speed) out.push({ id: 'percentage', label: 'Speed', read: { read: 'derived', attribute: 'percentage' }, range: [0, 100, num(a.percentage_step, 1)] });
    if ((d === 'number' || d === 'input_number') && c.set_value) out.push({ id: 'set_value', label: 'Value', read: { read: 'state' }, range: [num(a.min, 0), num(a.max, 100), num(a.step, 1)] });
    if (d === 'climate' && c.target_temperature) out.push({ id: 'set_temperature', label: 'Target temperature', read: { read: 'derived', attribute: 'target_temperature' }, range: [num(a.min_temp, 7), num(a.max_temp, 35), num(a.target_temp_step, 0.5)] });
    return out;
  }
  /** a choice among options this entity can be SET to (a segmented control): its reading, its action and the options HA reports */
  function optionControls(e) {
    if (!e) return [];
    const c = e.caps || {}, a = e.attrs || {}, d = e.domain, list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []), out = [];
    if (d === 'climate' && list(c.hvac_modes).length) out.push({ id: 'set_hvac_mode', label: 'HVAC mode', read: { read: 'state' }, options: list(c.hvac_modes) });
    if (d === 'climate' && c.preset_mode) out.push({ id: 'set_preset_mode', label: 'Preset', read: { read: 'derived', attribute: 'preset_mode' }, options: list(a.preset_modes) });
    if (d === 'climate' && c.fan_mode) out.push({ id: 'set_fan_mode', label: 'Fan mode', read: { read: 'derived', attribute: 'fan_mode' }, options: list(a.fan_modes) });
    if ((d === 'select' || d === 'input_select') && c.select_option) out.push({ id: 'select_option', label: 'Option', read: { read: 'state' }, options: list(a.options) });
    if (d === 'media_player' && c.source) out.push({ id: 'source', label: 'Source', read: { read: 'derived', attribute: 'source' }, options: list(a.sources) });
    return out;
  }
  /** a sensible range for a displayed value, when Home Assistant reports one (else null: the component keeps its own) */
  function rangeFor(e, i) {
    if (!e) return null;
    const a = e.attrs || {}, key = i.read === 'state' ? 'state' : i.attribute;
    if (e.domain === 'climate' && /temp/.test(key || '') && finite(a.min_temp) && finite(a.max_temp)) return [Number(a.min_temp), Number(a.max_temp)];
    if ((e.domain === 'number' || e.domain === 'input_number') && key === 'state' && finite(a.min) && finite(a.max)) return [Number(a.min), Number(a.max), num(a.step, 1)];
    if (['brightness_pct', 'position', 'volume', 'percentage', 'battery'].includes(key) || (key === 'state' && e.unit === '%')) return [0, 100];
    return null;
  }
  /** "current_temperature" → "Current temperature" */
  const friendly = (k) => { const t = String(k).replace(/_pct$/, ' (%)').replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
  const HIDDEN_ATTRS = ['friendly_name', 'icon', 'entity_picture', 'supported_features', 'supported_color_modes', 'attribution', 'device_class', 'state_class', 'unit_of_measurement', 'restored', 'editable', 'id'];
  /** the VALUES a display component can show from this entity: State, then its real scalar attributes, then IniqDash's readings */
  function valueOptions(entity, numeric) {
    const e = live() && ENTITY.test(entity || '') ? HA().get(entity) : null, out = [], seen = new Set();
    const show = (v) => String(v).slice(0, 24);
    out.push(['state', e && e.state !== undefined ? `State (${show(e.state)}${e.unit ? ` ${e.unit}` : ''})` : 'State']);
    (attributes(entity) || []).forEach((x) => {
      if (HIDDEN_ATTRS.includes(x.name) || !['string', 'number', 'boolean'].includes(x.kind) || (numeric && !finite(x.value))) return;
      seen.add(x.name); out.push([`attribute:${x.name}`, `${friendly(x.name)} (${show(x.value)})`]);
    });
    if (e && e.attrs) Object.entries(e.attrs).forEach(([k, v]) => {
      if (seen.has(k) || HIDDEN_ATTRS.includes(k) || /(_url|image|artwork|code|color_mode)$/.test(k) || !['string', 'number', 'boolean'].includes(typeof v) || (numeric && !finite(v))) return;
      out.push([`derived:${k}`, `${friendly(k)} (${show(v)})`]);
    });
    return out;
  }
  const readKey = (i) => (!i || !i.read || i.read === 'state' ? 'state' : `${i.read}:${i.attribute}`);
  const fromKey = (v) => { const [r, ...n] = String(v || 'state').split(':'); return ['attribute', 'derived'].includes(r) && n.length ? { read: r, attribute: n.join(':') } : { read: 'state' }; };
  const slug = (v, i) => { const t = String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30); return /^[a-z]/.test(t) ? t : `o${i + 1}`; };

  /* ---------------------------------------------------------------- WIDGET PROPERTIES (the definition's named data — Widget Studio)
     A widget declares NAMED PROPERTIES — "Room Temperature", "HVAC Mode" — each: a stable id, a name, the SOURCE GROUP it comes from and
     WHAT it reads from that group's entity (a friendly VALUE of the group's HA FAMILY: Climate · Current temperature). A SOURCE GROUP
     ("Climate") is ONE entity a placed copy chooses; several properties may share it. Components never share anything with each other:
     each one REFERENCES a property ({ source: 'ha', property: 'p…' }).
       definition.slots       [{ id: 's' + 8 hex, label: the source group's name, family, preview?: the designer's entity (design only) }]
       definition.properties  [{ id: 'p' + 8 hex, name, group: a slot id, read: 'state' | 'attribute' | 'derived', attribute? }]
     Internally a source group IS an entity slot (a copy's config.entities[slot] — unchanged), and a component's property binding is
     EXPANDED into the slot binding the runtime already resolves (expandComponent): property → its group's entity → its value. */
  const V = (id, label, rd, kind, extra = {}) => ({ id, label, read: rd, kind, ...extra });
  const ST = { read: 'state' }, DV = (a) => ({ read: 'derived', attribute: a }), AT = (a) => ({ read: 'attribute', attribute: a });
  const ONOFF = [['toggle', 'Toggle'], ['turn_on', 'Turn on'], ['turn_off', 'Turn off']];
  /** the HA FAMILIES a property can expect, with the values people use (IniqDash's normalised readings where it has them) and what a
      press can ask of such an entity; a family's domains narrow the entity picker of a placed copy */
  const FAMILIES = [
    { id: 'sensor', label: 'Sensor', domains: ['sensor'], values: [V('state', 'State', ST, 'scalar')] },
    { id: 'binary_sensor', label: 'Binary sensor', domains: ['binary_sensor'], values: [V('state', 'State (on / off)', ST, 'boolean')] },
    { id: 'climate', label: 'Climate', domains: ['climate'], values: [V('current_temperature', 'Current temperature', DV('current_temperature'), 'number', { unit: 'temp' }),
      V('target_temperature', 'Target temperature', DV('target_temperature'), 'number', { control: 'set_temperature', unit: 'temp' }), V('state', 'State (HVAC mode)', ST, 'option', { control: 'set_hvac_mode' }),
      V('hvac_action', 'HVAC action', DV('hvac_action'), 'text'), V('preset_mode', 'Preset', DV('preset_mode'), 'option', { control: 'set_preset_mode' }),
      V('current_humidity', 'Current humidity', AT('current_humidity'), 'number', { unit: '%' })], press: ONOFF },
    { id: 'light', label: 'Light', domains: ['light'], values: [V('state', 'On / off (state)', ST, 'boolean'), V('brightness', 'Brightness', DV('brightness_pct'), 'number', { control: 'brightness', unit: '%' })], press: ONOFF },
    { id: 'switch', label: 'Switch', domains: ['switch', 'input_boolean'], values: [V('state', 'On / off (state)', ST, 'boolean')], press: ONOFF },
    { id: 'cover', label: 'Cover', domains: ['cover'], values: [V('state', 'State', ST, 'text'), V('position', 'Position', DV('position'), 'number', { control: 'position', unit: '%' })],
      press: [['toggle', 'Open / close'], ['open', 'Open'], ['close', 'Close'], ['stop', 'Stop']] },
    { id: 'fan', label: 'Fan', domains: ['fan'], values: [V('state', 'On / off (state)', ST, 'boolean'), V('speed', 'Speed', DV('percentage'), 'number', { control: 'percentage', unit: '%' })], press: ONOFF },
    { id: 'media_player', label: 'Media player', domains: ['media_player'], values: [V('state', 'State', ST, 'text'), V('volume', 'Volume', DV('volume'), 'number', { control: 'volume', unit: '%' }),
      V('source', 'Source', DV('source'), 'option', { control: 'source' }), V('title', 'Title', DV('title'), 'text'),
      V('artist', 'Artist', DV('artist'), 'text'), V('album', 'Album', DV('album'), 'text'), V('position', 'Position (s, live)', DV('media_position'), 'number'), V('duration', 'Duration (s)', DV('duration'), 'number'),
      V('progress', 'Progress (%, live)', DV('media_progress'), 'number', { unit: '%' })],
      press: [['play_pause', 'Play / pause'], ['play', 'Play'], ['pause', 'Pause'], ['next', 'Next track'], ['previous', 'Previous track'], ['stop', 'Stop'], ['power', 'Power on / off']] },
    { id: 'camera', label: 'Camera', domains: ['camera'], values: [V('state', 'State', ST, 'text')] },
    { id: 'weather', label: 'Weather', domains: ['weather'], values: [V('state', 'Condition (state)', ST, 'text'), V('temperature', 'Temperature', DV('temperature'), 'number', { unit: 'temp' }),
      V('apparent_temperature', 'Feels like', DV('apparent_temperature'), 'number', { unit: 'temp' }), V('humidity', 'Humidity', DV('humidity'), 'number', { unit: '%' }), V('wind_speed', 'Wind speed', DV('wind_speed'), 'number'),
      ...[0, 1, 2, 3, 4, 5].flatMap((d) => [V(`f${d}_time`, `Forecast ${d ? `day ${d}` : 'today'}: date`, DV(`forecast_${d}_time`), 'text'), V(`f${d}_condition`, `Forecast ${d ? `day ${d}` : 'today'}: condition`, DV(`forecast_${d}_condition`), 'text'),
        V(`f${d}_high`, `Forecast ${d ? `day ${d}` : 'today'}: high`, DV(`forecast_${d}_temperature`), 'number', { unit: 'temp' }), V(`f${d}_low`, `Forecast ${d ? `day ${d}` : 'today'}: low`, DV(`forecast_${d}_templow`), 'number', { unit: 'temp' }),
        V(`f${d}_rain`, `Forecast ${d ? `day ${d}` : 'today'}: chance of rain`, DV(`forecast_${d}_precipitation_probability`), 'number', { unit: '%' })])] },
    { id: 'sun', label: 'Sun', domains: ['sun'], values: [V('state', 'State', ST, 'text'), V('next_rising', 'Next sunrise', DV('next_rising'), 'text'), V('next_setting', 'Next sunset', DV('next_setting'), 'text'),
      V('elevation', 'Elevation', DV('elevation'), 'number')] },
    { id: 'vacuum', label: 'Vacuum', domains: ['vacuum'], values: [V('state', 'State', ST, 'text'), V('battery', 'Battery', DV('battery'), 'number', { unit: '%' })],
      press: [['start', 'Start'], ['pause', 'Pause'], ['stop', 'Stop'], ['dock', 'Return to dock']] },
    { id: 'lock', label: 'Lock', domains: ['lock'], values: [V('state', 'State', ST, 'text')], press: [['lock', 'Lock'], ['unlock', 'Unlock'], ['open', 'Open']] },
    { id: 'alarm_control_panel', label: 'Alarm', domains: ['alarm_control_panel'], values: [V('state', 'State', ST, 'text')] },
    { id: 'person', label: 'Person', domains: ['person', 'device_tracker'], values: [V('state', 'State (home / away)', ST, 'text')] },
    { id: 'number', label: 'Number', domains: ['number', 'input_number'], values: [V('state', 'Value', ST, 'number', { control: 'set_value' })] },
    { id: 'select', label: 'Select', domains: ['select', 'input_select'], values: [V('state', 'Option', ST, 'option', { control: 'select_option' })] },
    { id: 'scene', label: 'Scene', domains: ['scene'], values: [V('state', 'State', ST, 'text')], press: [['trigger', 'Activate']] },
    { id: 'script', label: 'Script', domains: ['script'], values: [V('state', 'State', ST, 'text')], press: [['trigger', 'Run']] },
    { id: 'button', label: 'Button', domains: ['button', 'input_button'], values: [V('state', 'Last pressed', ST, 'text')], press: [['trigger', 'Press']] },
  ];
  // every family: WHEN its entity last changed (shown as a time, or as "2 h 19 min" ago)
  FAMILIES.forEach((f) => f.values.push(V('changed', 'Last changed (time)', DV('last_changed'), 'text')));
  const FAMILY = /^[a-z][a-z_]{1,29}$/, PROP_ID = /^p[0-9a-f]{8}$/;
  const familyOf = (id) => FAMILIES.find((f) => f.id === id) || null;
  const familyForDomain = (d) => FAMILIES.find((f) => f.domains.includes(d)) || null;
  /** a property's VALUE as the catalog describes it ({ id, label, read, kind, control? }) — an older / unusual read: described by its name */
  function valueOf(family, p) {
    const f = familyOf(family), rd = (p && p.read) || 'state', at = (p && p.attribute) || '';
    const v = f && f.values.find((x) => x.read.read === rd && (x.read.attribute || '') === at);
    return v || { id: `${rd}:${at}`, label: rd === 'state' ? 'State' : friendly(at), read: { read: rd, ...(at ? { attribute: at } : {}) }, kind: 'scalar' };
  }
  const propRead = (v) => ({ read: v.read.read, ...(v.read.attribute ? { attribute: v.read.attribute } : {}) });
  /** can a component of this declaration use such a property? (a Dial: a number · a Slider: a number it can SET · a Segmented control:
      an option it can SET · a Button: an entity it can press · a text: anything) */
  function compatible(compose, family, p) {
    const inputs = (compose && compose.inputs) || {}, primary = primaryOf(compose), act = compose && compose.actions ? Object.values(compose.actions)[0] : null;
    if (!primary) return false;
    const v = valueOf(family, p);
    if (act && act.control) return !!v.control && (ACTIONS[act.kind] || []).some(([n]) => n === v.control);
    // a button presses the ENTITY: it is bound to that entity's state (on / off, HVAC mode…) — never to a temperature or a brightness
    if (act && act.kind === 'press') return !!((familyOf(family) || {}).press || []).length && v.read.read === 'state';
    if (inputs[primary].kind === 'number' || inputs[primary].kind === 'series') return v.kind === 'number' || v.kind === 'scalar';      // a chart: a numeric state      // a sensor's state may well be a number
    return true;
  }
  /** a component's PROPERTY binding → the slot binding the runtime resolves ({ slot, inputs, action }); a property that no longer exists
      (or a component that takes none) → no binding: its preview data */
  function expandComponent(x, d) {
    const b = x && x.binding;
    if (!b) return x;
    // WIDGET PROPERTIES ARE THE ONLY AUTHORITY: any other binding (a legacy slot / entity binding that survived somewhere) means nothing
    if (b.property === undefined) { const { binding, ...rest } = x; void binding; return rest; }
    const p = ((d && d.properties) || []).find((y) => y.id === b.property), g = p && ((d && d.slots) || []).find((y) => y.id === p.group);
    const D = global.IniqComponents && global.IniqComponents.get(x.type), compose = D && D.compose;
    if (!p || !g || !compose || !primaryOf(compose)) { const { binding, ...rest } = x; void binding; return rest; }
    const act = compose.actions ? Object.values(compose.actions)[0] : null, v = valueOf(g.family, p);
    const inp = { read: p.read || 'state', ...(p.attribute ? { attribute: p.attribute } : {}), ...(['hide', 'override'].includes(b.unit) ? { unit: b.unit } : {}), ...(b.unit === 'override' && b.unitText ? { unitText: b.unitText } : {}) };
    let action = null;
    if (act && act.control && v.control) action = v.control;
    else if (act && act.kind === 'press') { const press = (familyOf(g.family) || {}).press || []; action = b.action && press.some(([n]) => n === b.action.action) ? b.action.action : null; }
    return { ...x, binding: { source: 'ha', slot: g.id, inputs: { [primaryOf(compose)]: inp }, ...(action ? { action: { action } } : {}) } };
  }
  /** a property's CURRENT PREVIEW VALUE (design information — what Studio is receiving from its preview entity): { status: 'none' |
      'loading' | 'ready' | 'unavailable' | 'missing', value, unit, text } — the unit as Home Assistant reports it (a sensor's
      unit_of_measurement; a climate temperature: the system's temperature unit) — shown, never forced into a component */
  function previewValue(family, p, entity) {
    if (!ENTITY.test(entity || '')) return { status: 'none', value: null, unit: null, text: 'No preview entity selected' };
    if (!live()) return { status: 'none', value: null, unit: null, text: 'Preview values need Home Assistant (IniqDash on its server)' };
    const v = valueOf(family, p), e = HA().get(entity), known = HA().known ? HA().known(entity) : !!e;
    const r = read({ ...propRead(v), entity }, e, known);
    if (r.status === 'loading') return { status: 'loading', value: null, unit: null, text: 'Waiting for Home Assistant…' };
    if (r.status === 'missing') return { status: 'missing', value: null, unit: null, text: e ? `Not reported by ${entity}` : 'Entity not found' };
    if (r.status === 'unavailable') return { status: 'unavailable', value: null, unit: null, text: String((e && e.state) || '').toLowerCase() === 'unknown' ? 'Unknown' : 'Unavailable' };
    const unit = v.unit === 'temp' ? ((HA().status && HA().status().temperatureUnit) || '°') : v.unit || (v.read.read === 'state' ? r.unit : null) || null;
    const shown = typeof r.value === 'boolean' ? (r.value ? 'on' : 'off') : String(r.value);
    return { status: 'ready', value: r.value, unit, text: `${shown}${unit ? (unit === '%' ? '%' : ` ${unit}`) : ''}` };
  }
  /** follow a property's preview value: cb(previewValue(…)) now and on every Home Assistant change → unsubscribe */
  function watchPreview(family, p, entity, cb) {
    const tell = () => { try { cb(previewValue(family, p, entity)); } catch (e) { console.error(e); } };
    if (!live() || !ENTITY.test(entity || '')) { tell(); return () => {}; }
    const v = valueOf(family, p), offs = [HA().subscribe(entity, (e) => { if (e && v.read.read === 'attribute') fetchAttrs(entity, JSON.stringify([e.updated, e.changed, e.state, e.attrs])); tell(); })];
    if (v.read.read === 'attribute') { attributes(entity); const on = (id) => { if (id === entity) tell(); }; attrSubs.add(on); offs.push(() => attrSubs.delete(on)); }
    tell();
    return () => offs.splice(0).forEach((f) => { try { f(); } catch (e) { /* gone */ } });
  }
  /** what a component ACTUALLY does with Home Assistant, in words (Studio's Data section tells the truth): nothing without a property */
  function describe(compose, p, b) {
    const act = compose && compose.actions ? Object.values(compose.actions)[0] : null;
    if (!p) return act ? 'Display only — not connected to Home Assistant: it shows its design preview and acts on nothing.' : 'Not connected to Home Assistant — it shows its design preview.';
    const v = valueOf(p.family, p), name = `“${p.name}”`;
    if (act && act.control) return v.control ? `Shows ${name} and sets it when ${act.kind === 'option' ? 'an option is chosen (its value)' : 'moved'}.` : `Shows ${name}; it cannot be set — choosing does nothing.`;
    if (act && act.kind === 'press') { const a = b && b.action && ((familyOf(p.family) || {}).press || []).find(([n]) => n === b.action.action); return a ? `Pressing it: ${a[1]} — ${name}'s entity.` : 'Action: None — pressing it does nothing in Home Assistant.'; }
    return `Shows ${name}.`;
  }
  /** cb() once Home Assistant has reported the entity (now, if it already has) — e.g. to prefill from a newly chosen preview entity */
  function whenReported(entity, cb) {
    if (!live() || !ENTITY.test(entity || '')) return;
    if (HA().get(entity)) { cb(); return; }
    let un = null, done = false;
    un = HA().subscribe(entity, (e) => { if (!e || done) return; done = true; setTimeout(() => { if (un) un(); cb(); }, 0); });
  }
  /** a definition with every property binding expanded (what the runtime, Configure and the checks read) */
  function expand(d) { return d && Array.isArray(d.properties) && Array.isArray(d.components) ? { ...d, components: d.components.map((x) => expandComponent(x, d)) } : d; }

  /* ---------------------------------------------------------------- the component's DATA (Studio's property sheet): Property — None (its
     preview data) · a widget property it can use · + New property — then, for a press, the Action (and an Information's Unit). A new
     component starts with none: nothing is ever assigned automatically. Ranges (min / max / step) and a segmented control's options are
     the component's own configuration — prefilled from the property's preview entity when it is chosen, editable, never bindings. */
  const getB = (c) => (c.binding && typeof c.binding === 'object' ? c.binding : {});
  const fieldsDefaults = new WeakMap();                                              // compose → its defaults(c) (from fields())
  const NO_PROPS = { properties: () => [], create: () => {} };
  /** SETTLE a component whose property was just chosen (Studio, when Home Assistant reports the preview entity): its defaults → true when changed */
  function settle(x, compose) {
    if (!x || !x.binding || !x.binding.auto || !fieldsDefaults.has(compose)) return false;
    const c = { ...(x.config || {}), data: { ...(x.data || {}) }, binding: structuredClone(x.binding) };
    if (!fieldsDefaults.get(compose)(c)) return false;
    const { data, binding, ...cfg } = c;
    x.config = cfg; x.data = data; x.binding = binding;
    return true;
  }
  const opts = (list) => list.map(([value, label]) => ({ value, label }));
  /** ctx (the host's — Widget Studio): properties() → [{ id, name, family, read, attribute?, preview? }] · create(compose) (+ New property) */
  function fields(compose, ctx = NO_PROPS) {
    const inputs = (compose && compose.inputs) || {}, actions = (compose && compose.actions) || {};
    const primary = primaryOf(compose);
    if (!primary) return [];
    const pd = inputs[primary], act = Object.values(actions)[0] || null;
    const ranged = Object.entries(inputs).filter(([, d]) => d.range).map(([k]) => k), cfgRange = Array.isArray(compose.range) ? compose.range : [];
    const prop = (c) => (getB(c).property ? ctx.properties().find((p) => p.id === getB(c).property) || null : null);
    const has = (c) => !!prop(c);
    const now = (c) => { const p = prop(c); return p && p.preview && live() ? HA().get(p.preview) : null; };
    /** a range the entity reports → the component's own range values (its data: min / max / step, or its configuration: compose.range) */
    const setRange = (c, r) => { if (!r) return; c.data = { ...(c.data || {}) };
      ['min', 'max', 'step'].forEach((k, n) => { if (!finite(r[n])) return; if (ranged.includes(k)) c.data[k] = Number(r[n]); if (cfgRange.includes(k)) c[k] = Number(r[n]); }); };
    /** a newly chosen property's DEFAULTS (once its preview entity is reported): the range it reports; a segmented control's options */
    function defaults(c) {
      const p = prop(c), b0 = getB(c);
      if (!b0.auto) return true;
      if (!p) { delete c.binding.auto; return true; }
      const e = now(c);
      if (!e) return false;
      const v = valueOf(p.family, p);
      if (act && act.control) {
        const ctl = (act.kind === 'option' ? optionControls(e) : numberControls(e)).find((x) => x.id === v.control);
        if (ctl && ctl.range) setRange(c, ctl.range);
        if (ctl && ctl.options && ctl.options.length) c.options = ctl.options.slice(0, 6).map((o, i) => ({ id: slug(o, i), label: friendly(o), value: o }));
      } else if (!act) setRange(c, rangeFor(e, propRead(v)));
      delete c.binding.auto;
      return true;
    }
    fieldsDefaults.set(compose, defaults);
    const out = [];
    out.push({ key: 'binding.property', type: 'select', label: 'Property', group: 'ha',
      optionsFrom: (c) => { const cur = prop(c), list = ctx.properties().filter((p) => p === cur || compatible(compose, p.family, p)).map((p) => [p.id, `${p.name}${p === cur && !compatible(compose, p.family, p) ? ' (not usable here)' : ''}`]);
        return opts([['', 'None (preview data)'], ...list, ['+new', '+ New property…']]); },
      get: (c) => (has(c) ? getB(c).property : ''),
      set: (c, v) => {
        if (!v) { delete c.binding; return; }
        if (v === '+new') { ctx.create(compose); return; }
        if (getB(c).property === v) return;
        c.binding = { source: 'ha', property: v, auto: true };
        if (!defaults(c) && prop(c) && prop(c).preview) watch(prop(c).preview);
      } });
    if (act && act.kind === 'press') out.push({ key: 'binding.press', type: 'select', label: 'Action', group: 'ha', when: has,
      optionsFrom: (c) => opts([['', 'None'], ...(((familyOf((prop(c) || {}).family) || {}).press || []))]),
      get: (c) => (getB(c).action || {}).action || '',
      set: (c, v) => { const b = { ...getB(c) }; if (v) b.action = { action: v }; else delete b.action; c.binding = b; } });
    if (pd.unit) {
      out.push({ key: 'binding.unit', type: 'select', label: 'Unit', group: 'format', half: true, when: has, options: opts([['entity', 'From the entity'], ['hide', 'Hide'], ['override', 'Custom']]),
        get: (c) => getB(c).unit || 'entity',
        set: (c, v) => { const b = { ...getB(c) }; if (v === 'entity') { delete b.unit; delete b.unitText; } else { b.unit = v; if (v !== 'override') delete b.unitText; } c.binding = b; } });
      out.push({ key: 'binding.unitText', type: 'text', label: 'Unit text', group: 'format', half: true, maxLength: 12, optional: true, when: (c) => has(c) && getB(c).unit === 'override',
        get: (c) => getB(c).unitText || '', set: (c, v) => { c.binding = { ...getB(c), unitText: String(v || '') }; } });
    }
    if (typeof compose.bindWhen === 'function') out.forEach((f) => { const w = f.when; f.when = (c) => compose.bindWhen(c) && (!w || w(c)); });
    return out;
  }

  /* ---------------------------------------------------------------- validation (save): configuration errors vs. HA's current state */
  function validate(x, compose, slots = null) {
    const errors = [], warnings = [], b0 = x && x.binding, name = x && x.id ? x.id : 'component';
    if (!b0 || b0.source !== 'ha') return { errors, warnings };
    const decl = (compose && compose.inputs) || {}, primary = primaryOf(compose);
    if (!compose || (!Object.keys(decl).length && !compose.actions)) { errors.push(`${name}: this component takes no Home Assistant data`); return { errors, warnings }; }
    // a SLOT binding: the slot must exist; its preview entity (if any) is what the checks below look at
    let b = b0;
    if (b0.slot !== undefined) {
      const sl = (slots || []).find((y) => y.id === b0.slot);
      if (!sl) { errors.push(`${name}: its data source is missing — choose a property (or none, for preview data)`); return { errors, warnings }; }
      if (!sl.preview) return { errors: validateShape(b0, decl, compose, name), warnings };
      b = resolve(b0, sl.preview);
    }
    const ins = b.inputs || {};
    if (primary && !(ins[primary] && ENTITY.test(ins[primary].entity || ''))) errors.push(`${name}: choose a Home Assistant entity (or none, for preview data)`);
    Object.entries(ins).forEach(([k, i]) => {
      if (!decl[k]) { errors.push(`${name}: "${k}" is not an input of this component`); return; }
      if (!i || !ENTITY.test(i.entity || '')) { errors.push(`${name}: ${decl[k].label}: not a Home Assistant entity`); return; }
      if (['attribute', 'derived'].includes(i.read) && !ATTR.test(i.attribute || '')) errors.push(`${name}: ${decl[k].label}: choose an attribute`);
      if (!live()) return;
      const e = HA().get(i.entity), known = HA().known ? HA().known(i.entity) : !!e;
      if (!known) return;                                                                          // not asked yet / HA offline: nothing to say
      if (!e) { warnings.push(`${name}: ${i.entity} is not reported by Home Assistant right now`); return; }
      const r = read(i, e, true);
      if (r.status === 'missing' && i.read !== 'state') { warnings.push(`${name}: ${i.entity} reports no "${i.attribute}" right now`); return; }
      if (decl[k].kind === 'number' && r.status === 'ready' && !finite(r.value)) errors.push(`${name}: ${decl[k].label} needs a number — ${i.entity} ${i.read === 'state' ? 'state' : i.attribute} is "${String(r.value).slice(0, 24)}"`);
      if (r.status === 'unavailable') warnings.push(`${name}: ${i.entity} is unavailable right now`);
    });
    if (b.action) {
      const kinds = Object.values((compose && compose.actions) || {}).map((a) => a.kind);
      if (!ALL_ACTIONS.includes(b.action.action) || !kinds.some((kd) => (ACTIONS[kd] || []).some(([n]) => n === b.action.action))) errors.push(`${name}: "${b.action.action}" is not an action this component can ask for`);
      if (b.action.entity !== undefined && !ENTITY.test(b.action.entity || '')) errors.push(`${name}: the action entity is not a Home Assistant entity`);
      if (!b.action.entity && !(primary && ins[primary])) errors.push(`${name}: the action needs an entity`);
    }
    return { errors, warnings };
  }

  /** a slot binding's shape (no entity to look at yet): its reads and its action */
  function validateShape(b, decl, compose, name) {
    const errors = [];
    Object.entries(b.inputs || {}).forEach(([k, i]) => {
      if (!decl[k]) errors.push(`${name}: "${k}" is not an input of this component`);
      else if (i && ['attribute', 'derived'].includes(i.read) && !ATTR.test(i.attribute || '')) errors.push(`${name}: ${decl[k].label}: choose an attribute`);
    });
    if (b.action) {
      const kinds = Object.values((compose && compose.actions) || {}).map((a) => a.kind);
      if (!kinds.some((kd) => (ACTIONS[kd] || []).some(([n]) => n === b.action.action))) errors.push(`${name}: "${b.action.action}" is not an action this component can ask for`);
    }
    return errors;
  }

  /* ---------------------------------------------------------------- ENTITY SLOTS (reusable widgets): a definition's component binding
     names a SLOT ({ slot, inputs: { <key>: { read, attribute? … } }, action }); a dashboard INSTANCE assigns the slot's entity. */
  const SLOT_ID = /^s[0-9a-f]{8}$/;
  /** the binding the runtime attaches: every input and the action on the slot's entity (null entity: not bound → preview data) */
  function resolve(b, entity) {
    if (!b || b.source !== 'ha') return null;
    if (b.slot === undefined) return b;                                            // an older binding that names its entities itself
    if (!ENTITY.test(entity || '')) return null;
    const inputs = {};
    Object.entries(b.inputs || {}).forEach(([k, i]) => { inputs[k] = { ...i, entity }; });
    return { source: 'ha', inputs, ...(b.action ? { action: { action: b.action.action } } : {}) };
  }
  /** the domains a slot's entity must belong to — what its components ASK of it (their control / action), intersected; null: any */
  const ACTION_DOMAINS = { brightness: ['light'], position: ['cover'], volume: ['media_player'], set_value: ['number', 'input_number'], set_temperature: ['climate'],
    percentage: ['fan'], set_hvac_mode: ['climate'], set_preset_mode: ['climate'], set_fan_mode: ['climate'], select_option: ['select', 'input_select'], source: ['media_player'],
    toggle: ['light', 'switch', 'fan', 'input_boolean', 'cover'], turn_on: ['light', 'switch', 'fan', 'input_boolean'], turn_off: ['light', 'switch', 'fan', 'input_boolean'],
    trigger: ['scene', 'script', 'button', 'input_button'], open: ['cover', 'lock'], close: ['cover'], stop: ['cover', 'media_player', 'vacuum'], lock: ['lock'], unlock: ['lock'],
    play: ['media_player'], pause: ['media_player', 'vacuum', 'lawn_mower', 'timer'], next: ['media_player'], previous: ['media_player'], power: ['media_player'],
    start: ['vacuum', 'lawn_mower', 'timer'], dock: ['vacuum', 'lawn_mower'], cancel: ['timer'], finish: ['timer'] };
  function slotDomains(definition0, slotId) {
    const definition = expand(definition0), g = ((definition && definition.slots) || []).find((y) => y.id === slotId);
    if (g && familyOf(g.family)) return familyOf(g.family).domains.slice();              // a SOURCE GROUP: its HA family's domains
    let set = null;
    ((definition && definition.components) || []).forEach((x) => {
      const b = x && x.binding;
      if (!b || b.slot !== slotId || !b.action || !ACTION_DOMAINS[b.action.action]) return;
      const d = ACTION_DOMAINS[b.action.action];
      set = set === null ? [...d] : set.filter((y) => d.includes(y));
    });
    return set && set.length ? set : null;
  }
  /** what a slot's components NEED from its entity (to warn about an obviously incompatible choice): [{ read, attribute?, kind }] */
  function slotNeeds(definition0, slotId) {
    const definition = expand(definition0), out = [];
    ((definition && definition.components) || []).forEach((x) => {
      const b = x && x.binding, decl = global.IniqComponents && global.IniqComponents.get(x.type) ? global.IniqComponents.get(x.type).compose.inputs || {} : {};
      if (!b || b.slot !== slotId) return;
      Object.entries(b.inputs || {}).forEach(([k, i]) => { if (i) out.push({ read: i.read || 'state', attribute: i.attribute, kind: (decl[k] || {}).kind || 'text' }); });
    });
    return out;
  }
  /** an entity chosen for a slot that cannot give what its components read → a short warning ('' when fine or not known yet) */
  function slotWarning(definition, slotId, entity) {
    if (!live() || !ENTITY.test(entity || '')) return '';
    const e = HA().get(entity), raw0 = raw.get(entity);
    if (!e) { watch(entity); return ''; }
    if (!raw0 || !raw0.list) attributes(entity);
    const miss = [];
    slotNeeds(definition, slotId).forEach((n) => {
      if (n.read === 'derived' && (!e.attrs || e.attrs[n.attribute] === undefined)) miss.push(friendly(n.attribute));
      else if (n.read === 'attribute' && raw0 && raw0.list && !raw0.list.some((a) => a.name === n.attribute)) miss.push(friendly(n.attribute));
      else if (n.read === 'state' && n.kind === 'number' && !UNKNOWN.includes(String(e.state).toLowerCase()) && !finite(e.state)) miss.push('a numeric state');
    });
    return miss.length ? `${e.name || entity} does not report ${[...new Set(miss)].join(', ')} — the widget may show nothing there` : '';
  }
  /** what a placed copy must assign: ONE entity per SOURCE GROUP its components use (a group several properties share is asked for once),
      with its name, the domains its family allows, and the properties it PROVIDES */
  function slotsOf(definition0) {
    const definition = expand(definition0), comps = (definition && definition.components) || [];
    const used = new Set(comps.map((x) => x && x.binding && x.binding.source === 'ha' && x.binding.slot).filter(Boolean));
    const usedProps = new Set(((definition0 && definition0.components) || []).map((x) => x && x.binding && x.binding.property).filter(Boolean));
    return ((definition && definition.slots) || []).filter((x) => used.has(x.id)).map((x) => ({ id: x.id, label: x.label, domains: slotDomains(definition0, x.id), required: x.optional !== true, optional: x.optional === true,
      family: (familyOf(x.family) || {}).label || null,
      provides: ((definition && definition.properties) || []).filter((p) => p.group === x.id && usedProps.has(p.id)).map((p) => p.name) }));
  }
  /** an OLDER definition whose components named their entities directly → entity slots (one per entity, a stable id from the entity, its
      friendly name as the label); the entity becomes the slot's PREVIEW only — a new copy never inherits it */
  const hash8 = (t) => { let h = 0x811c9dc5; for (const ch of String(t)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return (`00000000${h.toString(16)}`).slice(-8); };
  /** the definition format: 2 = WIDGET PROPERTIES (+ source groups) are the only semantics. Anything older is migrated ONCE (on load —
      written when Studio saves it); a definition at schema 2 is never migrated again, so nothing deleted can come back */
  const SCHEMA = 2;
  /** only properties count: any other binding is dropped; only source groups that hold a property remain */
  function authority(d) {
    d.properties = Array.isArray(d.properties) ? d.properties : [];
    const ids = new Set(d.properties.map((p) => p.id));
    d.components.forEach((x) => { const b = x && x.binding; if (b && !(PROP_ID.test(b.property || '') && ids.has(b.property))) delete x.binding; });
    d.slots = (Array.isArray(d.slots) ? d.slots : []).filter((g) => d.properties.some((p) => p.group === g.id));
    return d;
  }
  function migrate(definition) {
    if (!definition || !Array.isArray(definition.components)) return definition;
    if (definition.schema === SCHEMA) return authority(structuredClone(definition));          // today's form: never cleaned by name, never re-migrated
    const d = structuredClone(definition), slots = Array.isArray(d.slots) ? d.slots : [], byEntity = new Map();
    d.components.forEach((x) => {
      const b = x && x.binding;
      if (!b || b.slot !== undefined || b.property !== undefined) return;            // a slot / property binding: today's form
      const ins = b.inputs || {}, first = Object.values(ins).map((i) => i && i.entity).find((e) => ENTITY.test(e || '')) || (b.action && ENTITY.test(b.action.entity || '') ? b.action.entity : null);
      if (!first) { delete x.binding; return; }
      let sl = byEntity.get(first) || slots.find((y) => y.preview === first);
      if (!sl) {
        const e = live() ? HA().get(first) : null, base = (e && e.name) || friendly(first.split('.')[1] || first);
        sl = { id: `s${hash8(first)}`, label: base.slice(0, 40), preview: first }; slots.push(sl);
      }
      byEntity.set(first, sl);
      const inputs = {};
      Object.entries(ins).forEach(([k, i]) => { if (i) { const { entity, ...rest } = i; void entity; inputs[k] = rest; } });
      x.binding = { source: b.source === 'ha' ? 'ha' : 'preview', slot: sl.id, ...(Object.keys(inputs).length ? { inputs } : {}), ...(b.action ? { action: { action: b.action.action } } : {}) };
    });
    if (slots.length) d.slots = slots;
    const out = authority(toProperties(d));
    out.schema = SCHEMA;
    return out;
  }
  /** the ENTITY-SLOT model (components on a slot, "Same as" bindings) → WIDGET PROPERTIES + SOURCE GROUPS. Each slot a component uses
      becomes a source group (its id — so every placed copy's assignment stays valid —, its name, its preview, an HA family taken from the
      preview entity or what its components ask of it); each distinct value read from it becomes one property. A deliberate name stays
      ("Stove Temperature"); a generated one ("Entity 2", "Dial 2") gives way to a name from the component ("Dial Value"). */
  const MEANINGLESS = /^(entity|dial|information|slider|action button|segmented control|value \/ text|icon|image)( \d+)?$/i;
  /** a name an older model GENERATED (never typed by anyone): "Entity 2", "Dial 2", "Segmented control Value" */
  const GENERATED = /^(entity|dial|information|slider|action button|button|segmented control|segmented|value \/ text|valuetext|icon|image)( \d+)?( value)?$/i;
  /** CLEANUP of migrated data: a property nothing uses whose name was GENERATED is dropped (a deliberate name — "Stove Temperature" —
      stays until the designer deletes it); a source group left without properties goes with it */
  function tidy(d) {
    if (!Array.isArray(d.properties)) return d;
    const used = new Set(d.components.map((x) => x && x.binding && x.binding.property).filter(Boolean));
    d.properties = d.properties.filter((p) => used.has(p.id) || !GENERATED.test(String(p.name || '').trim()));
    if (Array.isArray(d.slots)) d.slots = d.slots.filter((g) => d.properties.some((p) => p.group === g.id) || d.components.some((x) => x && x.binding && x.binding.slot === g.id));
    return d;
  }
  function toProperties(d) {
    if (!d.components.some((x) => x && x.binding && x.binding.slot && x.binding.property === undefined)) return tidy(d);
    const kept = Array.isArray(d.properties) ? d.properties : [], keptGroups = (Array.isArray(d.slots) ? d.slots : []).filter((g) => kept.some((p) => p.group === g.id));
    const slots = (Array.isArray(d.slots) ? d.slots : []).filter((g) => !keptGroups.includes(g)), props = [], byKey = new Map(), comps = new Map();
    d.components.forEach((x) => {
      const b = x && x.binding; if (!b || !b.slot || b.property !== undefined) return;
      const sl = slots.find((y) => y.id === b.slot), D = global.IniqComponents && global.IniqComponents.get(x.type), compose = D && D.compose;
      // an ORPHANED binding: a slot with a generated name ("Entity 2") and no preview entity was never completed — the component goes
      // back to no property instead of manufacturing a permanent junk property
      if (!sl || !compose || !primaryOf(compose) || (MEANINGLESS.test(String(sl.label).trim()) && !sl.preview)) { delete x.binding; return; }
      const inp = (b.inputs || {})[primaryOf(compose)] || { read: 'state' }, key = `${sl.id}|${readKey(inp)}`;
      let p = byKey.get(key);
      if (!p) { p = { id: `p${hash8(key)}`, name: '', group: sl.id, read: ['attribute', 'derived'].includes(inp.read) && ATTR.test(inp.attribute || '') ? inp.read : 'state' };
        if (p.read !== 'state') p.attribute = inp.attribute; props.push(p); byKey.set(key, p); }
      if (!comps.has(sl.id)) comps.set(sl.id, []);
      comps.get(sl.id).push(b);
      const act = compose.actions ? Object.values(compose.actions)[0] : null;
      x.binding = { source: 'ha', property: p.id, ...(act && act.kind === 'press' && b.action ? { action: { action: b.action.action } } : {}),
        ...(['hide', 'override'].includes(inp.unit) ? { unit: inp.unit } : {}), ...(inp.unit === 'override' && inp.unitText ? { unitText: inp.unitText } : {}) };
    });
    const taken = new Set(kept.map((p) => String(p.name).toLowerCase())), unique = (n) => { let t = n.slice(0, 40), k = 2; while (taken.has(t.toLowerCase())) t = `${n.slice(0, 36)} ${k++}`; taken.add(t.toLowerCase()); return t; };
    const groups = slots.filter((sl) => props.some((p) => p.group === sl.id)).map((sl) => {
      // its family: the preview entity's domain, else what its components ask of it, else the kind of value it reads
      const dom = sl.preview ? String(sl.preview).split('.')[0] : null, asked = (comps.get(sl.id) || []).map((b) => b.action && ACTION_DOMAINS[b.action.action]).find(Boolean);
      const fam = (dom && familyForDomain(dom)) || (asked && familyForDomain(asked[0])) || FAMILIES.find((f) => props.some((p) => p.group === sl.id && p.attribute && f.values.some((v) => v.read.attribute === p.attribute))) || familyOf('sensor');
      return { id: sl.id, label: sl.label, family: fam.id, ...(sl.preview ? { preview: sl.preview } : {}) };
    });
    // names: a deliberate one stays; a generated one ("Segmented control", "Entity 2") gives way to the preview entity's name or the value
    const nice = (g, p) => valueOf(g.family, p).label.replace(/^State \((.+)\)$/, '$1').replace(/ \(state\)$/, '');
    groups.forEach((g) => {
      const mine = props.filter((p) => p.group === g.id), vague = MEANINGLESS.test(String(g.label).trim());
      const fromPreview = g.preview ? friendly(String(g.preview).split('.')[1] || g.preview) : null;
      if (vague) g.label = fromPreview || nice(g, mine[0]);
      mine.forEach((p) => { p.name = unique(mine.length === 1 ? (vague ? (fromPreview || nice(g, p)) : g.label) : (vague ? nice(g, p) : `${g.label} ${nice(g, p)}`)); });
    });
    d.slots = [...keptGroups, ...groups];
    d.properties = [...kept, ...props];
    return tidy(d);
  }

  /** a binding as stored: declarative keys only (anything else is dropped). A slot binding stores no entity at all. */
  function clean(b, compose) {
    if (!b || typeof b !== 'object') return undefined;
    if (b.property !== undefined) {                                                  // a PROPERTY binding: the property, a press action, a unit choice
      if (!PROP_ID.test(b.property || '')) return undefined;
      const act = compose && compose.actions ? Object.values(compose.actions)[0] : null;
      return { source: 'ha', property: b.property, ...(act && act.kind === 'press' && b.action && ALL_ACTIONS.includes(b.action.action) ? { action: { action: b.action.action } } : {}),
        ...(['hide', 'override'].includes(b.unit) ? { unit: b.unit } : {}), ...(b.unit === 'override' && typeof b.unitText === 'string' ? { unitText: b.unitText.replace(/[<>\x00-\x1f]/g, '').slice(0, 12) } : {}) };
    }
    const out = { source: b.source === 'ha' ? 'ha' : 'preview' };
    const slot = SLOT_ID.test(b.slot || '') ? b.slot : null;
    if (slot) out.slot = slot;
    if (slot && b.shared === true) out.shared = true;
    const ins = {};
    Object.entries(b.inputs && typeof b.inputs === 'object' ? b.inputs : {}).slice(0, 12).forEach(([k, i]) => {
      if (!/^[a-z][A-Za-z0-9]{0,23}$/.test(k) || (compose && compose.inputs && !compose.inputs[k]) || !i || (!slot && (!ENTITY.test(i.entity || '') || String(i.entity).length > 120))) return;
      const r = ['attribute', 'derived'].includes(i.read) && ATTR.test(i.attribute || '') ? i.read : 'state';
      ins[k] = { ...(slot ? {} : { entity: i.entity }), read: r, ...(r !== 'state' ? { attribute: i.attribute } : {}),
        ...(['hide', 'override'].includes(i.unit) ? { unit: i.unit } : {}), ...(i.unit === 'override' && typeof i.unitText === 'string' ? { unitText: i.unitText.replace(/[<>\x00-\x1f]/g, '').slice(0, 12) } : {}) };
    });
    if (Object.keys(ins).length) out.inputs = ins;
    if (b.action && ALL_ACTIONS.includes(b.action.action) && !(compose && !compose.actions)) out.action = { action: b.action.action, ...(!slot && ENTITY.test(b.action.entity || '') ? { entity: b.action.entity } : {}) };
    return out;
  }

  /** the view data a bound component receives: its preview data (inputs marked bindOnly never come from the preview once bound to
      Home Assistant — a Dial bound to a sensor shows no invented target), then what the binding reports */
  function data(x, compose, preview, patch) {
    const d = { ...(preview || {}) };
    if (x && x.binding && x.binding.source === 'ha') Object.entries((compose && compose.inputs) || {}).forEach(([k, i]) => { if (i.bindOnly) delete d[k]; });
    return { ...d, ...(patch || {}) };
  }

  /** the PREVIEW entity picker of a source group (Studio): the shared IniqHA picker narrowed to the group's family; null without Home
      Assistant (a local demo) */
  function previewPicker(group, onPick) {
    if (!HA() || !HA().picker || !live()) return null;
    const f = familyOf(group.family);
    return HA().picker({ value: group.preview || '', label: `${group.label} preview entity`, domains: f ? f.domains : null, clear: 'None', empty: 'No preview entity',
      onPick: (e) => { onPick(e ? e.id : ''); if (e) attributes(e.id); } });
  }
  global.IniqBinding = Object.freeze({ attach, data, fields, validate, clean, resolve, migrate, slotsOf, slotDomains, slotNeeds, slotWarning, SLOT_ID, PROP_ID, SCHEMA, FAMILY, FAMILIES, familyOf, valueOf, compatible, expand, expandComponent, previewPicker, previewValue, watchPreview, whenReported, describe, attributes, onAttributes: (cb) => { attrSubs.add(cb); return () => attrSubs.delete(cb); }, settle, ACTIONS, pressActions, numberControls, optionControls });
})(window);
