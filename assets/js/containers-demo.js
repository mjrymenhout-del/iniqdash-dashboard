/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Showroom: builds the demo containers. Demonstration content only. */
(function () {
  'use strict';
  const C = window.MaisonContainer;

  const ICON = window.DEMO_ICON;
  const ph = (label, cls = '') => { const d = document.createElement('div'); d.className = `ph ${cls}`.trim(); d.textContent = label; return d; };
  const mount = (key, node) => document.querySelector(`[data-demo="${key}"]`).appendChild(node);

  // 1–3: the same Cuisine container at three widths
  ['s', 'm', 'l'].forEach((w) => mount(`cuisine-${w}`, C.create({
    id: `cuisine-${w}`, variant: 'primary', layout: 'grid', tone: 'accent',
    icon: ICON.pot, title: 'Cuisine', subtitle: '3 lights', status: { text: '2/3', tone: 'accent' },
    content: [ph('Widget A'), ph('Widget B'), ph('Widget C')],
  })));

  // 4: primary → secondary → bare
  mount('home', C.create({
    id: 'home', variant: 'primary', layout: 'grid',
    icon: ICON.home, title: 'Home', subtitle: 'Demo of nested containers',
    actions: [{ id: 'more', label: 'More', icon: ICON.more }],
    content: [
      ph('Widget', 'tall'),
      { id: 'quick', title: 'Quick controls', layout: 'grid', content: [ph('Widget'), ph('Widget')] },
      { id: 'activity', title: 'Activity', subtitle: 'Secondary container', status: '2', span: 'full', layout: 'row',
        content: [ph('Widget', 'short'), { id: 'group', title: 'Bare group', layout: 'row', content: [ph('Widget', 'short'), ph('Widget', 'short')] }] },
    ],
    footer: 'Footer / action area',
  }));

  // header options: title only · title + action · no header · status only
  const opts = C.create({ variant: 'bare', layout: 'stack', content: [
    { variant: 'primary', title: 'Title only', layout: 'row', content: [ph('Widget', 'short')] },
    { variant: 'primary', title: 'Title + action', layout: 'row', actions: [{ id: 'add', label: 'Add', icon: ICON.plus }], content: [ph('Widget', 'short'), ph('Widget', 'short')] },
    { variant: 'primary', layout: 'row', content: [ph('No header: content only', 'short')] },
    { variant: 'primary', icon: ICON.bolt, title: 'Energy', status: { text: 'Live', tone: 'success' }, layout: 'free', content: [ph('Free layout: the child decides', 'short')] },
  ] });
  mount('options', opts);
})();
