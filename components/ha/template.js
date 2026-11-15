/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqTemplate — SAFE text templates: live Home Assistant values inside any text, evaluated in the browser by a small parser.
   No JavaScript is ever evaluated (no eval, no Function, no property access on objects), nothing runs on the server, and only the
   functions listed below exist. A template that cannot be read is reported (valid()) and shown as "—" — never as code.

     Outside temperature: {{ value('sensor.outside') }}                    → "Outside temperature: 12.4 °C"
     {{ name('person.mia') }} is {{ state('person.mia') | lower }}         → "Mia is home"
     {{ 'Open' if is('binary_sensor.door', 'on') else 'Closed' }}
     {{ 'Warm' if num('sensor.living') gt 21 else 'Cool' }}  ·  {{ num('sensor.power') / 1000 | round(1) }} kW
     Updated {{ since('sensor.outside') }}                                 → "Updated 5 min ago"

   Functions:  state(id) · value(id) (state + unit) · num(id) (a number or none) · attr(id, 'name') · name(id) · is(id, 'x', …)
               · since(id) (relative time of the last change) · unit(id) · now('time' | 'date')
   Filters:    | round(n) · | fixed(n) · | int · | abs · | upper · | lower · | title · | default('x')
   Operators:  + - * / · == != · gt lt ge le (a dashboard's texts never contain < or >, so comparisons are words) · and or not
               · A if B else C · ( ) · 'strings' "strings" · numbers · true false none
   Limits:     a template ≤ 1 000 characters, ≤ 20 expressions, ≤ 300 tokens each, nesting ≤ 20 deep.

   IniqTemplate.has(text)                  → bool (the text contains {{ … }})
   IniqTemplate.ids(text)                  → [entity id…] the entities it reads (to subscribe to them)
   IniqTemplate.valid(text)                → { ok, error? }
   IniqTemplate.render(text, get, now?)    → string; get(id) → the normalised entity { state, unit, name, attrs, changed, available } | null
   ========================================================================== */
(function (global) {
  'use strict';
  const ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
  const MAX_LEN = 1000, MAX_EXPR = 20, MAX_TOK = 300, MAX_DEPTH = 20;
  const FUNCS = ['state', 'value', 'num', 'attr', 'name', 'is', 'since', 'unit', 'now'];
  const FILTERS = ['round', 'fixed', 'int', 'abs', 'upper', 'lower', 'title', 'default'];
  const has = (t) => typeof t === 'string' && /\{\{[\s\S]*?\}\}/.test(t);

  /* ---- tokens */
  function lex(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === "'" || c === '"') {
        let j = i + 1, s = '';
        while (j < src.length && src[j] !== c) { if (src[j] === '\\' && j + 1 < src.length) { s += src[j + 1]; j += 2; } else s += src[j++]; }
        if (j >= src.length) throw new Error('A text in quotes is not closed');
        out.push({ t: 'str', v: s }); i = j + 1; continue;
      }
      const n = /^\d+(\.\d+)?/.exec(src.slice(i));
      if (n) { out.push({ t: 'num', v: Number(n[0]) }); i += n[0].length; continue; }
      const w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      if (w) { out.push({ t: 'id', v: w[0] }); i += w[0].length; continue; }
      const op = /^(==|!=|>=|<=|[><+\-*/(),|])/.exec(src.slice(i));
      if (op) { out.push({ t: 'op', v: op[0] }); i += op[0].length; continue; }
      throw new Error(`"${c}" is not allowed in a template`);
    }
    if (out.length > MAX_TOK) throw new Error('The template is too long');
    return out;
  }

  /* ---- parser → a small tree (no code) */
  function parse(src) {
    const tk = lex(src);
    let p = 0, depth = 0;
    const peek = (v) => tk[p] && (v === undefined || tk[p].v === v) ? tk[p] : null;
    const eat = (v) => { if (!peek(v)) throw new Error(v ? `"${v}" expected` : 'Unexpected end'); return tk[p++]; };
    const deeper = (fn) => { if (++depth > MAX_DEPTH) throw new Error('The template is nested too deeply'); try { return fn(); } finally { depth--; } };
    function expr() {
      return deeper(() => {
        const a = or();
        if (peek('if') && tk[p].t === 'id') { p++; const cond = or(); eat('else'); const b = expr(); return { k: 'if', a, cond, b }; }
        return a;
      });
    }
    function or() { let a = and(); while (peek('or') && tk[p].t === 'id') { p++; a = { k: 'or', a, b: and() }; } return a; }
    function and() { let a = not(); while (peek('and') && tk[p].t === 'id') { p++; a = { k: 'and', a, b: not() }; } return a; }
    function not() { if (peek('not') && tk[p].t === 'id') { p++; return { k: 'not', a: deeper(not) }; } return cmp(); }
    const WORD_OPS = { eq: '==', ne: '!=', gt: '>', lt: '<', ge: '>=', le: '<=' };
    function cmp() {
      const a = add();
      const t = peek();
      const o = t && t.t === 'op' && ['==', '!=', '>', '<', '>=', '<='].includes(t.v) ? t.v : t && t.t === 'id' && WORD_OPS[t.v] ? WORD_OPS[t.v] : null;
      if (o) p++;
      return o ? { k: 'cmp', o, a, b: add() } : a;
    }
    function add() { let a = mul(); while (peek('+') || peek('-')) { const o = tk[p++].v; a = { k: 'ar', o, a, b: mul() }; } return a; }
    function mul() { let a = unary(); while (peek('*') || peek('/')) { const o = tk[p++].v; a = { k: 'ar', o, a, b: unary() }; } return a; }
    function unary() { if (peek('-')) { p++; return { k: 'neg', a: deeper(unary) }; } return pipe(); }
    function pipe() {
      let a = primary();
      while (peek('|')) {
        p++;
        const f = eat();
        if (f.t !== 'id' || !FILTERS.includes(f.v)) throw new Error(`Unknown filter "${f.v}"`);
        const args = [];
        if (peek('(')) { p++; if (!peek(')')) { args.push(expr()); while (peek(',')) { p++; args.push(expr()); } } eat(')'); }
        a = { k: 'flt', f: f.v, a, args };
      }
      return a;
    }
    function primary() {
      const t = eat();
      if (t.t === 'num') return { k: 'lit', v: t.v };
      if (t.t === 'str') return { k: 'lit', v: t.v };
      if (t.t === 'op' && t.v === '(') { const e = expr(); eat(')'); return e; }
      if (t.t === 'id') {
        if (t.v === 'true' || t.v === 'false') return { k: 'lit', v: t.v === 'true' };
        if (t.v === 'none') return { k: 'lit', v: null };
        if (!FUNCS.includes(t.v)) throw new Error(`Unknown name "${t.v}" (functions: ${FUNCS.join(', ')})`);
        eat('(');
        const args = [];
        if (!peek(')')) { args.push(expr()); while (peek(',')) { p++; args.push(expr()); } }
        eat(')');
        return { k: 'fn', f: t.v, args };
      }
      throw new Error(`Unexpected "${t.v}"`);
    }
    const tree = expr();
    if (p < tk.length) throw new Error(`Unexpected "${tk[p].v}"`);
    return tree;
  }

  /** the {{ … }} parts of a text: [{ lit } | { src }] */
  function split(text) {
    if (typeof text !== 'string') return [];
    if (text.length > MAX_LEN) throw new Error('The text is too long for a template');
    const out = [], re = /\{\{([\s\S]*?)\}\}/g;
    let last = 0, m, n = 0;
    while ((m = re.exec(text))) { if (++n > MAX_EXPR) throw new Error('Too many {{ … }} in one text'); out.push({ lit: text.slice(last, m.index) }, { src: m[1] }); last = re.lastIndex; }
    out.push({ lit: text.slice(last) });
    return out;
  }
  const cache = new Map();
  function compile(text) {
    if (cache.has(text)) return cache.get(text);
    let r;
    try { r = { ok: true, parts: split(text).map((x) => (x.src !== undefined ? { tree: parse(x.src) } : x)) }; }
    catch (e) { r = { ok: false, error: e.message }; }
    if (cache.size > 500) cache.clear();
    cache.set(text, r);
    return r;
  }

  /* ---- evaluation (pure: only the functions above read anything) */
  const numOf = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  function rel(ms, now) {
    if (!Number.isFinite(ms)) return '';
    const s = Math.round((now - ms) / 1000), a = Math.abs(s);
    const t = a < 45 ? 'just now' : a < 3600 ? `${Math.round(a / 60)} min` : a < 86400 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400)} d`;
    return a < 45 ? t : s >= 0 ? `${t} ago` : `in ${t}`;
  }
  function run(n, get, now) {
    switch (n.k) {
      case 'lit': return n.v;
      case 'if': return truthy(run(n.cond, get, now)) ? run(n.a, get, now) : run(n.b, get, now);
      case 'or': return truthy(run(n.a, get, now)) || truthy(run(n.b, get, now));
      case 'and': return truthy(run(n.a, get, now)) && truthy(run(n.b, get, now));
      case 'not': return !truthy(run(n.a, get, now));
      case 'neg': { const v = numOf(run(n.a, get, now)); return v === null ? null : -v; }
      case 'cmp': {
        const a = run(n.a, get, now), b = run(n.b, get, now);
        if (n.o === '==' || n.o === '!=') { const eq = String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase(); return n.o === '==' ? eq : !eq; }
        const x = numOf(a), y = numOf(b);
        if (x === null || y === null) return false;
        return n.o === '>' ? x > y : n.o === '<' ? x < y : n.o === '>=' ? x >= y : x <= y;
      }
      case 'ar': {
        const a = run(n.a, get, now), b = run(n.b, get, now);
        if (n.o === '+' && (typeof a === 'string' || typeof b === 'string') && (numOf(a) === null || numOf(b) === null)) return `${a ?? ''}${b ?? ''}`;
        const x = numOf(a), y = numOf(b);
        if (x === null || y === null) return null;
        if (n.o === '/' && y === 0) return null;
        return n.o === '+' ? x + y : n.o === '-' ? x - y : n.o === '*' ? x * y : x / y;
      }
      case 'flt': {
        const v = run(n.a, get, now), args = n.args.map((x) => run(x, get, now));
        const d = Math.max(0, Math.min(6, Math.round(numOf(args[0]) ?? 0)));
        switch (n.f) {
          case 'round': { const x = numOf(v); return x === null ? null : Math.round(x * 10 ** d) / 10 ** d; }
          case 'fixed': { const x = numOf(v); return x === null ? null : x.toFixed(d); }
          case 'int': { const x = numOf(v); return x === null ? null : Math.trunc(x); }
          case 'abs': { const x = numOf(v); return x === null ? null : Math.abs(x); }
          case 'upper': return v === null || v === undefined ? v : String(v).toUpperCase();
          case 'lower': return v === null || v === undefined ? v : String(v).toLowerCase();
          case 'title': return v === null || v === undefined ? v : String(v).replace(/(^|[\s_-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/_/g, ' ');
          case 'default': return v === null || v === undefined || v === '' || v === 'unknown' || v === 'unavailable' ? args[0] : v;
          default: return null;
        }
      }
      case 'fn': {
        const args = n.args.map((x) => run(x, get, now));
        if (n.f === 'now') { const d = new Date(now); return args[0] === 'date' ? d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
        const id = String(args[0] ?? '');
        if (!ID.test(id)) return null;
        const e = get ? get(id) : null;
        if (!e) return null;
        const st = e.state === undefined || e.state === null ? null : String(e.state);
        switch (n.f) {
          case 'state': return st;
          case 'num': return numOf(st);
          case 'unit': return e.unit || '';
          case 'value': return st === null ? null : numOf(st) !== null && e.unit ? `${Number(st).toLocaleString(undefined, { maximumFractionDigits: 2 })}${e.unit === '%' ? '%' : ` ${e.unit}`}` : st;
          case 'name': return e.name || id;
          case 'attr': { const a = e.attrs && Object.prototype.hasOwnProperty.call(e.attrs, args[1]) ? e.attrs[args[1]] : null; return a === null || typeof a === 'object' ? (Array.isArray(a) ? a.join(', ') : null) : a; }
          case 'is': return st !== null && args.slice(1).some((x) => String(x).toLowerCase() === st.toLowerCase());
          case 'since': return rel(Date.parse(e.changed || ''), now);
          default: return null;
        }
      }
      default: return null;
    }
  }
  const truthy = (v) => !(v === null || v === undefined || v === false || v === 0 || v === '' || ['off', 'false', 'unknown', 'unavailable', 'none', '0'].includes(String(v).toLowerCase()));
  const show = (v) => (v === null || v === undefined ? '—' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v));

  function render(text, get, now = Date.now()) {
    if (!has(text)) return typeof text === 'string' ? text : '';
    const c = compile(text);
    if (!c.ok) return '—';
    try { return c.parts.map((x) => (x.tree ? show(run(x.tree, get, now)) : x.lit)).join('').replace(/[<>]/g, ''); }
    catch (e) { return '—'; }
  }
  function ids(text) {
    if (!has(text)) return [];
    const c = compile(text);
    if (!c.ok) return [];
    const out = new Set();
    const walk = (n) => { if (!n || typeof n !== 'object') return; if (n.k === 'fn' && n.f !== 'now' && n.args[0] && n.args[0].k === 'lit' && ID.test(String(n.args[0].v))) out.add(String(n.args[0].v)); ['a', 'b', 'cond'].forEach((k) => walk(n[k])); (n.args || []).forEach(walk); };
    c.parts.forEach((x) => walk(x.tree));
    return [...out].slice(0, 40);
  }
  function valid(text) { if (!has(text)) return { ok: true }; const c = compile(text); return c.ok ? { ok: true } : { ok: false, error: c.error }; }

  global.IniqTemplate = Object.freeze({ has, ids, valid, render });
})(window);
