/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Universal Container — factory.

   MaisonContainer.create(config) → HTMLElement

   config (every field optional):
     id         stable identifier (data-mc-id) — for future saved layouts / drag & drop
     variant    'primary' | 'secondary' | 'bare'          (default 'primary')
     layout     'stack' | 'row' | 'grid' | 'free'         (default 'stack')
     size       'auto' | 's' | 'm' | 'l' | 'full'         (data-size: a span hint for a
                future parent grid; the container itself always sizes to its content)
     tone       'accent' | null                           (highlights the header icon)
     icon       SVG markup string
     title      text
     subtitle   text
     status     text, or { text, tone: 'accent'|'success'|'warning'|'danger' }
     actions    [{ id, label, icon (SVG), onClick(event, container) }]
     footer     text, Node or array of Nodes
     content    array of children; each child is a DOM Node (a widget) or a
                plain config object → a nested container (any depth)
     span       'full' to take a whole row inside a grid/row parent
     fill       true = fill mode: stretch to the area the parent assigns (dashboard grid
                item); default false = flow mode: height follows content

   The header is rendered only when at least one header field is given.
   The container never inspects its children: it only places them.
   ========================================================================== */
(function (global) {
  'use strict';

  const VARIANTS = ['primary', 'secondary', 'bare'];
  const LAYOUTS = ['stack', 'row', 'grid', 'free'];
  const TONES = ['accent', 'success', 'warning', 'danger'];

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  };
  const svg = (markup) => {
    const t = document.createElement('template');
    t.innerHTML = String(markup).trim();
    return t.content.firstElementChild;
  };
  const isNode = (x) => x instanceof Node;

  function header(cfg, root) {
    const hasHeader = cfg.icon || cfg.title || cfg.subtitle || cfg.status || (cfg.actions && cfg.actions.length);
    if (!hasHeader) return null;
    const h = el('header', 'mc__header');
    if (cfg.icon) {
      const i = el('span', 'mc__icon');
      i.setAttribute('aria-hidden', 'true');
      const s = svg(cfg.icon);
      if (s) i.appendChild(s);
      h.appendChild(i);
    }
    if (cfg.title || cfg.subtitle) {
      const t = el('div', 'mc__titles');
      if (cfg.title) t.appendChild(el(cfg.variant === 'primary' ? 'h2' : 'h3', 'mc__title', cfg.title));
      if (cfg.subtitle) t.appendChild(el('p', 'mc__subtitle', cfg.subtitle));
      h.appendChild(t);
    }
    if (cfg.status || (cfg.actions && cfg.actions.length)) {
      const m = el('div', 'mc__meta');
      if (!cfg.title && !cfg.subtitle) m.style.marginLeft = 'auto';
      if (cfg.status) {
        const st = typeof cfg.status === 'object' ? cfg.status : { text: cfg.status };
        const s = el('span', 'mc__status', st.text);
        if (TONES.includes(st.tone)) s.dataset.tone = st.tone;
        m.appendChild(s);
      }
      if (cfg.actions && cfg.actions.length) {
        const a = el('div', 'mc__actions');
        cfg.actions.forEach((act) => {
          const b = el('button', 'mc__action');
          b.type = 'button';
          b.setAttribute('aria-label', act.label || 'Action');
          b.title = act.label || '';
          if (act.id) b.dataset.action = act.id;
          if (act.icon) { const s = svg(act.icon); if (s) b.appendChild(s); } else b.textContent = act.label || '';
          if (typeof act.onClick === 'function') b.addEventListener('click', (e) => act.onClick(e, root));
          a.appendChild(b);
        });
        m.appendChild(a);
      }
      h.appendChild(m);
    }
    return h;
  }

  function create(config = {}) {
    const cfg = { variant: 'primary', layout: 'stack', size: 'auto', ...config };
    if (!VARIANTS.includes(cfg.variant)) cfg.variant = 'primary';
    if (!LAYOUTS.includes(cfg.layout)) cfg.layout = 'stack';

    const root = el('section', `mc mc--${cfg.variant}`);
    root.dataset.layout = cfg.layout;
    root.dataset.size = cfg.size;
    if (cfg.id) root.dataset.mcId = cfg.id;
    if (cfg.tone === 'accent') root.dataset.tone = 'accent';
    if (cfg.span === 'full') root.dataset.span = 'full';
    if (cfg.fill) root.classList.add('mc--fill');
    if (cfg.title) root.setAttribute('aria-label', cfg.title);

    const h = header(cfg, root);
    if (h) root.appendChild(h);

    const content = el('div', 'mc__content');
    (cfg.content || []).forEach((child) => append(content, child, cfg.variant));
    root.appendChild(content);

    if (cfg.footer) {
      const f = el('footer', 'mc__footer');
      (Array.isArray(cfg.footer) ? cfg.footer : [cfg.footer]).forEach((x) => f.appendChild(isNode(x) ? x : document.createTextNode(String(x))));
      root.appendChild(f);
    }
    return root;
  }

  /** Children: a DOM node is a widget and is placed as-is; a config object becomes a nested
      container. A nested container defaults to 'secondary', and a secondary's child to 'bare',
      so each level is quieter than its parent unless the config says otherwise. */
  function append(content, child, parentVariant) {
    if (isNode(child)) { content.appendChild(child); return; }
    if (child && typeof child === 'object') {
      const variant = child.variant || (parentVariant === 'primary' ? 'secondary' : 'bare');
      content.appendChild(create({ ...child, variant }));
    }
  }

  /** Add a child (widget node or container config) to an existing container element. */
  function add(container, child) {
    const content = container.querySelector(':scope > .mc__content');
    const variant = VARIANTS.find((v) => container.classList.contains(`mc--${v}`)) || 'primary';
    if (content) append(content, child, variant);
    return container;
  }

  global.MaisonContainer = { create, add };
})(window);
