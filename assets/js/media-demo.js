/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Media showroom. Demo data and local state only. Artwork files are abstract demo art. */
(function () {
  'use strict';
  const G = window.MaisonGrid, M = window.MaisonMedia, { mount, logger, overlay } = window.Showroom;
  const log = logger(document.getElementById('log'));
  const onChange = (n, p, m) => log(`onChange (${m.source}): ${p.state}/${p.volume ?? '–'}/${p.source ?? '–'} → ${n.state}/${n.volume ?? '–'}/${n.source ?? '–'}`);
  const media = (cfg) => M.create({ onChange, ...cfg });
  const item = (id, cfg, layout, span) => ({ id, layout, constraints: M.constraints(cfg, { span }), content: media(cfg) });
  const ART1 = 'assets/img/media/artwork-dusk.jpg', ART2 = 'assets/img/media/artwork-tide.jpg';
  const RICH = { capabilities: { playPause: true, volume: true, source: true }, sources: ['Radio', 'Spotify', 'AirPlay', 'TV'] };
  const c2 = (i) => ({ desktop: { x: 1 + i * 2, y: 1, w: 2, h: 3 }, tablet: { x: 1 + (i % 4) * 2, y: 1 + Math.floor(i / 4) * 3, w: 2, h: 3 }, mobile: { w: 2, h: 3 } });

  mount('states', G.create({ id: 'states', items: [
    item('1-playing', { id: 'm-play', name: 'Kitchen', icon: 'speaker', state: 'playing', title: 'Evening Tide', artist: 'Demo Artist', artwork: ART2 }, c2(0)),
    item('2-paused', { id: 'm-pause', name: 'Office', icon: 'speaker', state: 'paused', title: 'Dusk Lines', artist: 'Demo Artist', artwork: ART1 }, c2(1)),
    item('3-idle', { id: 'm-idle', name: 'Bedroom', icon: 'speaker', state: 'idle' }, c2(2)),
    item('4-off', { id: 'm-off', name: 'Living Room TV', icon: 'tv', state: 'off' }, c2(3)),
    item('5-unavailable', { id: 'm-na', name: 'Garden Speaker', icon: 'speaker', state: 'playing', available: false, title: 'Evening Tide' }, c2(4)),
  ] }));

  mount('art', G.create({ id: 'art', items: [
    item('6-art', { id: 'm-art', name: 'Kitchen Speaker', subtitle: 'Kitchen', icon: 'speaker', state: 'playing', title: 'Evening Tide', artist: 'Demo Artist', artwork: ART2, volume: 35, capabilities: { playPause: true, volume: true } },
      { desktop: { x: 1, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 1, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
    item('7-noart', { id: 'm-noart', name: 'Radio', subtitle: 'Study', icon: 'receiver', state: 'playing', title: 'Morning News', artist: 'Demo FM', source: 'Radio', capabilities: { playPause: true, source: true }, sources: ['Radio', 'Bluetooth', 'Optical'] },
      { desktop: { x: 5, y: 1, w: 4, h: 3 }, tablet: { x: 5, y: 1, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
    item('9-broken', { id: 'm-broken', name: 'Bathroom Speaker', subtitle: 'Broken artwork URL', icon: 'speaker', state: 'paused', title: 'Dusk Lines', artist: 'Demo Artist', artwork: 'data:image/png;base64,AAAA', volume: 20, capabilities: { playPause: true, volume: true } },
      { desktop: { x: 9, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 4, w: 4, h: 3 }, mobile: { w: 4, h: 3 } }),
  ] }));

  mount('spans', G.create({ id: 'spans', items: [
    item('10-compact', { id: 's-compact', name: 'Hall', icon: 'speaker', state: 'playing', title: 'Dusk Lines', artist: 'Demo Artist', artwork: ART1 }, { desktop: { x: 1, y: 1, w: 2, h: 4 }, tablet: { x: 1, y: 1, w: 2, h: 4 }, mobile: { w: 2, h: 3 } }),
    item('11-standard', { id: 's-standard', name: 'Living Room', subtitle: 'Living room', icon: 'speaker', state: 'playing', title: 'Evening Tide', artist: 'Demo Artist', artwork: ART2, volume: 42, source: 'Spotify', ...RICH },
      { desktop: { x: 3, y: 1, w: 4, h: 4 }, tablet: { x: 3, y: 1, w: 6, h: 4 }, mobile: { w: 4, h: 4 } }),
    item('12-wide', { id: 's-wide', name: 'Living Room TV', subtitle: 'Living room', icon: 'tv', state: 'playing', title: 'Dusk Lines — Live Session', artist: 'Demo Artist', artwork: ART1, volume: 28, source: 'TV', ...RICH },
      { desktop: { x: 7, y: 1, w: 6, h: 4 }, tablet: { x: 1, y: 5, w: 8, h: 4 }, mobile: { w: 4, h: 4 } }, 'wide'),
  ] }));

  const mgrid = G.create({ id: 'media-grid', nested: true, items: [
    item('n-player', { id: 'n-player', name: 'Kitchen Speaker', subtitle: 'Kitchen', icon: 'speaker', state: 'paused', title: 'Evening Tide', artist: 'Demo Artist', artwork: ART2, volume: 30, source: 'Radio', ...RICH },
      { tablet: { x: 1, y: 1, w: 8, h: 4 }, mobile: { w: 4, h: 4 } }, 'wide'),
  ] });
  mount('containers', G.create({ id: 'containers', items: [
    { id: 'media', layout: { desktop: { x: 1, y: 1, w: 8, h: 6 }, tablet: { x: 1, y: 1, w: 8, h: 6 }, mobile: { w: 4, h: 6 } },
      content: { icon: M.ICONS.speaker, title: 'Media', subtitle: 'Primary container · nested grid', layout: 'free', content: [mgrid] } },
  ] }));

  overlay('[data-demo="states"] > .mg');
})();
