<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * The shared IniqDash Home Assistant layer, server side. One place that talks to HA; widgets
 * never do. It turns HA's raw states into ONE normalised entity shape that every widget binding
 * understands, and it decides — from the entity's CURRENT capabilities — which actions are
 * allowed and which HA service they become. The browser never names a service or sends raw
 * service data.
 *
 * Normalised entity:
 *   { id, domain, name, state, available, unit, area, changed,
 *     attrs: { …domain-specific, picked explicitly (never the raw attribute bag) },
 *     caps:  { …what the entity can actually do } }
 *
 * Method (as Maison): REST over cURL with the long-lived token, server-side only. States of the
 * entities on screen come from ONE /api/template call (fallback: parallel /api/states/<id>
 * when the token may not render templates); discovery from one template call (with areas) or
 * /api/states.
 */
final class HaService
{
    public const UNAVAILABLE = ['unavailable', 'unknown'];
    public const STATELESS = ['scene', 'button', 'input_button'];
    /** what a Button / Action widget may trigger, and how (one simple, safe action per domain) */
    public const TRIGGER = [
        'scene' => 'turn_on', 'script' => 'turn_on', 'button' => 'press', 'input_button' => 'press',
        'switch' => 'toggle', 'light' => 'toggle', 'fan' => 'toggle', 'input_boolean' => 'toggle', 'cover' => 'toggle',
    ];

    public function __construct(private readonly HaClient $client) {}

    /* ------------------------------------------------------------------ status */

    /** @return array{connected:bool, error:?string, version:?string, temperature_unit:?string} */
    public function status(): array
    {
        $r = $this->client->request('GET', '/api/config', null, 5);
        if ($r['error'] !== null || !is_array($r['body'])) {
            return ['connected' => false, 'error' => $r['error'] ?? 'http', 'version' => null, 'temperature_unit' => null];
        }
        return [
            'connected'        => true,
            'error'            => null,
            'version'          => is_string($r['body']['version'] ?? null) ? $r['body']['version'] : null,
            'temperature_unit' => is_string($r['body']['unit_system']['temperature'] ?? null) ? $r['body']['unit_system']['temperature'] : null,
        ];
    }

    /* ------------------------------------------------------------------ discovery */

    /**
     * Every entity, light-weight: id, domain, name, state, unit, device class, area.
     * Cached for 30 s in the private folder (several editor tabs, one HA call).
     * @return array{connected:bool, error:?string, entities:list<array>}
     */
    public function discover(bool $fresh = false): array
    {
        $cache = IQ_VAR !== null ? IQ_VAR . '/cache/ha_entities.json' : null;
        if (!$fresh && $cache !== null && is_file($cache) && filemtime($cache) > time() - 30) {
            $c = json_decode((string) file_get_contents($cache), true);
            if (is_array($c)) {
                return ['connected' => true, 'error' => null, 'entities' => $c];
            }
        }
        $rows = null;
        $tpl = '{%- set ns = namespace(rows=[]) -%}{%- for s in states -%}'
            . '{%- set ns.rows = ns.rows + [[s.entity_id, s.state, s.attributes.friendly_name | default(none), '
            . 's.attributes.unit_of_measurement | default(none), s.attributes.device_class | default(none), area_name(s.entity_id)]] -%}'
            . '{%- endfor -%}{{ ns.rows | tojson }}';
        $r = $this->client->request('POST', '/api/template', ['template' => $tpl], 20);
        if ($r['error'] === 'unreachable' || $r['error'] === 'timeout' || ($r['error'] === 'auth' && $r['status'] === 401)) {
            return ['connected' => false, 'error' => $r['error'], 'entities' => []];
        }
        $decoded = $r['error'] === null ? (is_string($r['body']) ? json_decode($r['body'], true) : $r['body']) : null;
        if (is_array($decoded)) {
            $rows = [];
            foreach ($decoded as $row) {
                if (is_array($row) && is_string($row[0] ?? null)) {
                    $rows[] = self::listing($row[0], (string) $row[1], $row[2], $row[3], $row[4], $row[5] ?? null);
                }
            }
        } else {
            // template not allowed for this token: plain state list, without areas
            $r = $this->client->request('GET', '/api/states', null, 20);
            if ($r['error'] !== null || !is_array($r['body'])) {
                return ['connected' => false, 'error' => $r['error'] ?? 'http', 'entities' => []];
            }
            $rows = [];
            foreach ($r['body'] as $s) {
                if (is_array($s) && is_string($s['entity_id'] ?? null)) {
                    $a = is_array($s['attributes'] ?? null) ? $s['attributes'] : [];
                    $rows[] = self::listing($s['entity_id'], (string) ($s['state'] ?? ''), $a['friendly_name'] ?? null, $a['unit_of_measurement'] ?? null, $a['device_class'] ?? null, null);
                }
            }
        }
        usort($rows, static fn ($a, $b) => strcmp($a['id'], $b['id']));
        if ($cache !== null) {
            @file_put_contents($cache, json_encode($rows, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
        }
        return ['connected' => true, 'error' => null, 'entities' => $rows];
    }

    private static function listing(string $id, string $state, mixed $name, mixed $unit, mixed $dc, mixed $area): array
    {
        return [
            'id'     => $id,
            'domain' => explode('.', $id, 2)[0],
            'name'   => is_string($name) && $name !== '' ? $name : $id,
            'state'  => $state,
            'unit'   => is_string($unit) ? $unit : null,
            'dc'     => is_string($dc) ? $dc : null,
            'area'   => is_string($area) && $area !== '' ? $area : null,
        ];
    }

    /* ------------------------------------------------------------------ states */

    /**
     * Normalised states of the given entities (the ones on screen).
     * @return array{connected:bool, error:?string, states:array<string, ?array>}  null = not found in HA
     */
    public function states(array $ids): array
    {
        $ids = array_values(array_unique(array_filter($ids, static fn ($i) => is_string($i) && self::validId($i))));
        if ($ids === []) {
            return ['connected' => true, 'error' => null, 'states' => []];
        }
        $out = array_fill_keys($ids, null);
        $r = $this->client->request('POST', '/api/template', ['template' => self::statesTemplate($ids)], 6);
        if ($r['error'] === 'unreachable' || $r['error'] === 'timeout' || ($r['error'] === 'auth' && $r['status'] === 401)) {
            return ['connected' => false, 'error' => $r['error'], 'states' => []];
        }
        $decoded = $r['error'] === null ? (is_string($r['body']) ? json_decode($r['body'], true) : $r['body']) : null;
        if (is_array($decoded)) {
            foreach ($decoded as $row) {
                if (is_array($row) && is_string($row[0] ?? null) && array_key_exists($row[0], $out)) {
                    $out[$row[0]] = self::normalise($row[0], (string) $row[1], (string) ($row[2] ?? ''), is_array($row[3] ?? null) ? $row[3] : []);
                }
            }
            return ['connected' => true, 'error' => null, 'states' => $out];
        }
        // fallback: one GET per entity, in parallel (picked attributes only)
        $any = false;
        foreach ($this->client->statesParallel($ids) as $id => $res) {
            if ($res['code'] === 200 && is_array($res['body'])) {
                $any = true;
                $a = is_array($res['body']['attributes'] ?? null) ? $res['body']['attributes'] : [];
                $out[$id] = self::normalise($id, (string) ($res['body']['state'] ?? ''), (string) ($res['body']['last_changed'] ?? ''), self::pick($id, $a));
            } elseif ($res['code'] === 404) {
                $any = true;
            }
        }
        return $any ? ['connected' => true, 'error' => null, 'states' => $out] : ['connected' => false, 'error' => 'unreachable', 'states' => []];
    }

    public static function validId(string $id): bool
    {
        return (bool) preg_match('/^[a-z0-9_]+\.[a-z0-9_]+$/', $id) && strlen($id) <= 120;
    }

    /** The same attribute picks as statesTemplate(), for raw REST answers. */
    private static function pick(string $id, array $a): array
    {
        $x = ['name' => $a['friendly_name'] ?? null, 'unit' => $a['unit_of_measurement'] ?? null, 'dc' => $a['device_class'] ?? null, 'f' => $a['supported_features'] ?? 0, 'icon' => $a['icon'] ?? null, 'sc' => $a['state_class'] ?? null];
        if (str_starts_with($id, 'light.')) {
            $x += ['br' => $a['brightness'] ?? null, 'cm' => $a['color_mode'] ?? null, 'scm' => $a['supported_color_modes'] ?? []];
        } elseif (str_starts_with($id, 'climate.')) {
            $x += ['cur' => $a['current_temperature'] ?? null, 'target' => $a['temperature'] ?? null, 'min' => $a['min_temp'] ?? null, 'max' => $a['max_temp'] ?? null,
                'step' => $a['target_temp_step'] ?? null, 'modes' => $a['hvac_modes'] ?? [], 'action' => $a['hvac_action'] ?? null, 'preset' => $a['preset_mode'] ?? null];
        } elseif (str_starts_with($id, 'cover.')) {
            $x += ['pos' => $a['current_position'] ?? null, 'tilt' => $a['current_tilt_position'] ?? null];
        } elseif (str_starts_with($id, 'fan.')) {
            $x += ['pct' => $a['percentage'] ?? null, 'pstep' => $a['percentage_step'] ?? null, 'preset' => $a['preset_mode'] ?? null, 'presets' => $a['preset_modes'] ?? [],
                'osc' => $a['oscillating'] ?? null, 'dir' => $a['direction'] ?? null];
        } elseif (str_starts_with($id, 'lock.')) {
            $x += ['cf' => $a['code_format'] ?? null];
        } elseif (str_starts_with($id, 'alarm_control_panel.')) {
            $x += ['cf' => $a['code_format'] ?? null, 'car' => $a['code_arm_required'] ?? null, 'cb' => $a['changed_by'] ?? null];
        } elseif (str_starts_with($id, 'camera.')) {
            $x += ['cst' => $a['frontend_stream_type'] ?? null];
        } elseif (str_starts_with($id, 'input_number.') || str_starts_with($id, 'number.')) {
            $x += ['nmin' => $a['min'] ?? null, 'nmax' => $a['max'] ?? null, 'nstep' => $a['step'] ?? null];
        } elseif (str_starts_with($id, 'image.') || str_starts_with($id, 'person.')) {
            $x += ['pic' => $a['entity_picture'] ?? null];
        } elseif (str_starts_with($id, 'weather.')) {
            $x += ['wt' => $a['temperature'] ?? null, 'wtu' => $a['temperature_unit'] ?? null, 'wa' => $a['apparent_temperature'] ?? null, 'wh' => $a['humidity'] ?? null,
                'ws' => $a['wind_speed'] ?? null, 'wsu' => $a['wind_speed_unit'] ?? null, 'wb' => $a['wind_bearing'] ?? null];
        } elseif (str_starts_with($id, 'sun.')) {
            $x += ['nr' => $a['next_rising'] ?? null, 'ns' => $a['next_setting'] ?? null, 'nn' => $a['next_noon'] ?? null, 'el' => $a['elevation'] ?? null, 'ri' => $a['rising'] ?? null];
        } elseif (str_starts_with($id, 'media_player.')) {
            $x += ['title' => $a['media_title'] ?? null, 'artist' => $a['media_artist'] ?? null, 'album' => $a['media_album_name'] ?? null, 'vol' => $a['volume_level'] ?? null,
                'muted' => $a['is_volume_muted'] ?? null, 'source' => $a['source'] ?? null, 'sources' => $a['source_list'] ?? [], 'app' => $a['app_name'] ?? null,
                'pic' => $a['entity_picture'] ?? null];
        }
        return $x;
    }

    /** Explicit attribute picks per domain (never the whole attribute bag: no tokens, no URLs). */
    private static function statesTemplate(array $ids): string
    {
        $list = json_encode(array_values($ids), JSON_UNESCAPED_SLASHES);
        $common = "'name': a.friendly_name | default(none), 'unit': a.unit_of_measurement | default(none), 'dc': a.device_class | default(none), "
            . "'f': a.supported_features | default(0), 'icon': a.icon | default(none), 'sc': a.state_class | default(none)";
        return '{%- set ns = namespace(rows=[]) -%}'
            . '{%- for id in ' . $list . ' -%}{%- set s = states[id] -%}'
            . '{%- if s -%}{%- set a = s.attributes -%}'
            . "{%- if id.startswith('light.') -%}"
            . "{%- set x = {{$common}, 'br': a.brightness | default(none), 'cm': a.color_mode | default(none), 'scm': a.supported_color_modes | default([])} -%}"
            . "{%- elif id.startswith('climate.') -%}"
            . "{%- set x = {{$common}, 'cur': a.current_temperature | default(none), 'target': a.temperature | default(none), 'min': a.min_temp | default(none), "
            . "'max': a.max_temp | default(none), 'step': a.target_temp_step | default(none), 'modes': a.hvac_modes | default([]), "
            . "'action': a.hvac_action | default(none), 'preset': a.preset_mode | default(none)} -%}"
            . "{%- elif id.startswith('cover.') -%}"
            . "{%- set x = {{$common}, 'pos': a.current_position | default(none), 'tilt': a.current_tilt_position | default(none)} -%}"
            . "{%- elif id.startswith('fan.') -%}"
            . "{%- set x = {{$common}, 'pct': a.percentage | default(none), 'pstep': a.percentage_step | default(none), 'preset': a.preset_mode | default(none), "
            . "'presets': a.preset_modes | default([]), 'osc': a.oscillating | default(none), 'dir': a.direction | default(none)} -%}"
            . "{%- elif id.startswith('media_player.') -%}"
            . "{%- set x = {{$common}, 'title': a.media_title | default(none), 'artist': a.media_artist | default(none), 'album': a.media_album_name | default(none), "
            . "'vol': a.volume_level | default(none), 'muted': a.is_volume_muted | default(none), 'source': a.source | default(none), "
            . "'sources': a.source_list | default([]), 'app': a.app_name | default(none), 'pic': a.entity_picture | default(none)} -%}"
            . "{%- elif id.startswith('lock.') -%}"
            . "{%- set x = {{$common}, 'cf': a.code_format | default(none)} -%}"
            . "{%- elif id.startswith('alarm_control_panel.') -%}"
            . "{%- set x = {{$common}, 'cf': a.code_format | default(none), 'car': a.code_arm_required | default(none), 'cb': a.changed_by | default(none)} -%}"
            . "{%- elif id.startswith('camera.') -%}"
            . "{%- set x = {{$common}, 'cst': a.frontend_stream_type | default(none)} -%}"
            . "{%- elif id.startswith('input_number.') or id.startswith('number.') -%}"
            . "{%- set x = {{$common}, 'nmin': a.min | default(none), 'nmax': a.max | default(none), 'nstep': a.step | default(none)} -%}"
            . "{%- elif id.startswith('image.') or id.startswith('person.') -%}"
            . "{%- set x = {{$common}, 'pic': a.entity_picture | default(none)} -%}"
            . "{%- elif id.startswith('weather.') -%}"
            . "{%- set x = {{$common}, 'wt': a.temperature | default(none), 'wtu': a.temperature_unit | default(none), 'wa': a.apparent_temperature | default(none), "
            . "'wh': a.humidity | default(none), 'ws': a.wind_speed | default(none), 'wsu': a.wind_speed_unit | default(none), 'wb': a.wind_bearing | default(none)} -%}"
            . "{%- elif id.startswith('sun.') -%}"
            . "{%- set x = {{$common}, 'nr': a.next_rising | default(none), 'ns': a.next_setting | default(none), 'nn': a.next_noon | default(none), "
            . "'el': a.elevation | default(none), 'ri': a.rising | default(none)} -%}"
            . "{%- else -%}{%- set x = {{$common}} -%}{%- endif -%}"
            . '{%- set ns.rows = ns.rows + [[id, s.state, s.last_changed.isoformat(), x]] -%}'
            . '{%- endif -%}{%- endfor -%}{{ ns.rows | tojson }}';
    }

    /** One entity in the shape every IniqDash widget binding understands. */
    public static function normalise(string $id, string $state, string $changed, array $x): array
    {
        $domain = explode('.', $id, 2)[0];
        $num = static fn ($v) => is_numeric($v) ? 0 + $v : null;
        $e = [
            'id'        => $id,
            'domain'    => $domain,
            'name'      => is_string($x['name'] ?? null) && $x['name'] !== '' ? $x['name'] : $id,
            'state'     => $state,
            // scenes and buttons have no meaningful state ("unknown" until first used): only "unavailable" counts
            'available' => in_array($domain, self::STATELESS, true) ? strtolower($state) !== 'unavailable' : !in_array(strtolower($state), self::UNAVAILABLE, true),
            'unit'      => is_string($x['unit'] ?? null) ? $x['unit'] : null,
            'changed'   => $changed,
            'attrs'     => ['device_class' => is_string($x['dc'] ?? null) ? $x['dc'] : null, 'state_class' => is_string($x['sc'] ?? null) ? $x['sc'] : null, 'icon' => is_string($x['icon'] ?? null) ? $x['icon'] : null],
            'caps'      => [],
        ];
        $f = (int) ($x['f'] ?? 0);
        switch ($domain) {
            case 'light':
                $modes = array_values(array_filter((array) ($x['scm'] ?? []), 'is_string'));
                // brightness: any colour mode except plain on/off (HA 2021.4+), or the legacy feature bit
                $dim = array_diff($modes, ['onoff', 'unknown']) !== [] || ($modes === [] && ($f & 1));
                $br = $num($x['br'] ?? null);
                $e['attrs'] += ['brightness_pct' => $br !== null ? (int) round($br / 255 * 100) : null, 'color_mode' => $x['cm'] ?? null, 'supported_color_modes' => $modes];
                $e['caps'] = ['on_off' => true, 'brightness' => (bool) $dim];
                break;
            case 'switch':
            case 'input_boolean':
                $e['caps'] = ['on_off' => true];
                break;
            case 'climate':
                $modes = array_values(array_filter((array) ($x['modes'] ?? []), 'is_string'));
                $e['attrs'] += [
                    'current_temperature' => $num($x['cur'] ?? null), 'target_temperature' => $num($x['target'] ?? null),
                    'min_temp' => $num($x['min'] ?? null), 'max_temp' => $num($x['max'] ?? null), 'target_temp_step' => $num($x['step'] ?? null),
                    'hvac_modes' => $modes, 'hvac_action' => is_string($x['action'] ?? null) ? $x['action'] : null, 'preset_mode' => is_string($x['preset'] ?? null) ? $x['preset'] : null,
                ];
                // ClimateEntityFeature.TARGET_TEMPERATURE = 1 (a single set point)
                $e['caps'] = ['target_temperature' => ($f & 1) === 1, 'hvac_modes' => $modes];
                break;
            case 'cover':
                // CoverEntityFeature: OPEN 1, CLOSE 2, SET_POSITION 4, STOP 8
                $pos = $num($x['pos'] ?? null);
                $e['attrs'] += ['position' => $pos !== null ? (int) round($pos) : null, 'tilt_position' => $num($x['tilt'] ?? null)];
                $e['caps'] = ['open' => ($f & 1) === 1, 'close' => ($f & 2) === 2, 'position' => ($f & 4) === 4, 'stop' => ($f & 8) === 8];
                break;
            case 'fan':
                // FanEntityFeature: SET_SPEED 1, OSCILLATE 2, DIRECTION 4, PRESET_MODE 8 (on/off: every fan)
                $presets = array_values(array_filter((array) ($x['presets'] ?? []), 'is_string'));
                $pct = $num($x['pct'] ?? null);
                $e['attrs'] += ['percentage' => $pct, 'percentage_step' => $num($x['pstep'] ?? null), 'preset_mode' => is_string($x['preset'] ?? null) ? $x['preset'] : null,
                    'preset_modes' => $presets, 'oscillating' => is_bool($x['osc'] ?? null) ? $x['osc'] : null, 'direction' => is_string($x['dir'] ?? null) ? $x['dir'] : null];
                $e['caps'] = ['on_off' => true, 'speed' => ($f & 1) === 1, 'oscillate' => ($f & 2) === 2, 'direction' => ($f & 4) === 4, 'preset' => ($f & 8) === 8 && $presets !== []];
                break;
            case 'media_player':
                // MediaPlayerEntityFeature: PAUSE 1, VOLUME_SET 4, VOLUME_MUTE 8, PREVIOUS 16, NEXT 32, SELECT_SOURCE 2048, STOP 4096, PLAY 16384
                $sources = array_values(array_filter((array) ($x['sources'] ?? []), 'is_string'));
                $vol = $num($x['vol'] ?? null);
                $pic = is_string($x['pic'] ?? null) && $x['pic'] !== '' ? $x['pic'] : null;
                $e['attrs'] += [
                    'title' => is_scalar($x['title'] ?? null) ? (string) $x['title'] : null, 'artist' => is_scalar($x['artist'] ?? null) ? (string) $x['artist'] : null,
                    'album' => is_scalar($x['album'] ?? null) ? (string) $x['album'] : null, 'app' => is_string($x['app'] ?? null) ? $x['app'] : null,
                    'volume' => $vol !== null ? (int) round($vol * 100) : null, 'muted' => is_bool($x['muted'] ?? null) ? $x['muted'] : null,
                    'source' => is_string($x['source'] ?? null) ? $x['source'] : null, 'sources' => $sources,
                    // artwork goes through IniqDash (api/ha_art.php): HA's picture URL carries an access token and HA's address.
                    // The version only changes when the picture changes; it reveals nothing.
                    'artwork' => $pic !== null ? 'api/ha_art.php?entity=' . rawurlencode($id) . '&v=' . substr(hash('sha256', $pic), 0, 12) : null,
                ];
                $e['caps'] = ['play' => ($f & 16384) === 16384, 'pause' => ($f & 1) === 1, 'stop' => ($f & 4096) === 4096, 'previous' => ($f & 16) === 16, 'next' => ($f & 32) === 32,
                    'volume' => ($f & 4) === 4, 'mute' => ($f & 8) === 8, 'source' => ($f & 2048) === 2048 && $sources !== []];
                break;
            case 'camera':
                // the snapshot goes through IniqDash (api/ha_cam.php, server side with the token);
                // HA's own picture URL carries an access token and is never passed on
                $e['attrs'] += ['image' => 'api/ha_cam.php?entity=' . rawurlencode($id), 'stream_type' => is_string($x['cst'] ?? null) ? $x['cst'] : null];
                $e['caps'] = ['snapshot' => true, 'on_off' => ($f & 1) === 1, 'stream' => ($f & 2) === 2];
                break;
            case 'sun':
                // the sun's next events as HA reports them (ISO 8601 timestamps with offset; the browser shows them in local time)
                $ts = static fn ($v) => is_string($v) && strlen($v) <= 40 && strtotime($v) !== false ? $v : null;
                $e['attrs'] += ['next_rising' => $ts($x['nr'] ?? null), 'next_setting' => $ts($x['ns'] ?? null), 'next_noon' => $ts($x['nn'] ?? null),
                    'elevation' => $num($x['el'] ?? null), 'rising' => is_bool($x['ri'] ?? null) ? $x['ri'] : null];
                break;
            case 'input_number':
            case 'number':
                // the entity's own range: a Gauge uses it as its automatic min / max
                $e['attrs'] += ['min' => $num($x['nmin'] ?? null), 'max' => $num($x['nmax'] ?? null), 'step' => $num($x['nstep'] ?? null)];
                break;
            case 'weather':
                // current conditions only (HA has served the forecast through a service call since 2024.3, not as a state attribute)
                $e['attrs'] += ['temperature' => $num($x['wt'] ?? null), 'temperature_unit' => is_string($x['wtu'] ?? null) ? $x['wtu'] : null,
                    'apparent_temperature' => $num($x['wa'] ?? null), 'humidity' => $num($x['wh'] ?? null), 'wind_speed' => $num($x['ws'] ?? null),
                    'wind_speed_unit' => is_string($x['wsu'] ?? null) ? $x['wsu'] : null, 'wind_bearing' => $num($x['wb'] ?? null) ?? (is_string($x['wb'] ?? null) ? $x['wb'] : null)];
                break;
            case 'image':
            case 'person':
                // the picture goes through IniqDash (api/ha_img.php): HA's picture URL may carry an access
                // token. The version only changes when the picture changes; it reveals nothing.
                $pic = is_string($x['pic'] ?? null) && $x['pic'] !== '' ? $x['pic'] : null;
                // a person's picture is only served when it lives on Home Assistant itself (a path), the
                // same rule as entityPicture(): an outside address is never fetched, so none is offered
                if ($domain === 'person' && $pic !== null && (!str_starts_with($pic, '/') || str_starts_with($pic, '//') || str_contains($pic, '..'))) {
                    $pic = null;
                }
                // image.*: its state is the time the picture last changed (HA's URL carries a rotating token)
                $ver = $domain === 'image' ? (string) $e['state'] : (string) $pic;
                $e['attrs'] += ['image' => $pic !== null ? 'api/ha_img.php?entity=' . rawurlencode($id) . '&v=' . substr(hash('sha256', $ver), 0, 12) : null];
                break;
            case 'lock':
                // LockEntityFeature: OPEN 1. A code is needed when HA reports a code format.
                $e['attrs'] += ['code' => self::codeKind($x['cf'] ?? null)];
                $e['caps'] = ['lock' => true, 'unlock' => true, 'open' => ($f & 1) === 1];
                break;
            case 'alarm_control_panel':
                // AlarmControlPanelEntityFeature: ARM_HOME 1, ARM_AWAY 2, ARM_NIGHT 4, TRIGGER 8, ARM_CUSTOM_BYPASS 16, ARM_VACATION 32
                $code = self::codeKind($x['cf'] ?? null);
                $e['attrs'] += ['code' => $code, 'code_to_arm' => $code !== null && ($x['car'] ?? true) !== false, 'code_to_disarm' => $code !== null,
                    'changed_by' => is_string($x['cb'] ?? null) ? $x['cb'] : null];
                $e['caps'] = ['disarm' => true, 'arm_home' => ($f & 1) === 1, 'arm_away' => ($f & 2) === 2, 'arm_night' => ($f & 4) === 4,
                    'arm_vacation' => ($f & 32) === 32, 'arm_custom_bypass' => ($f & 16) === 16];
                break;
        }
        if (isset(self::TRIGGER[$domain])) {
            $e['caps']['trigger'] = true;
        }
        return $e;
    }

    /** 'number' | 'text' | null — only what kind of code is needed, never the code itself */
    private static function codeKind(mixed $fmt): ?string
    {
        return is_string($fmt) && $fmt !== '' ? ($fmt === 'number' ? 'number' : 'text') : null;
    }

    /** The current picture URL of a media player, read fresh from HA (server side only). */
    public function picture(string $id): ?string
    {
        if (!self::validId($id) || !str_starts_with($id, 'media_player.')) {
            return null;
        }
        $r = $this->client->request('GET', '/api/states/' . rawurlencode($id), null, 6);
        $p = is_array($r['body']) ? ($r['body']['attributes']['entity_picture'] ?? null) : null;
        return is_string($p) && $p !== '' ? $p : null;
    }

    /**
     * The picture of an image.* or person.* entity, as a Home Assistant PATH (fetched by the server
     * with the token). image.* entities are served by HA's image proxy. A person's picture is only
     * used when it is a path on Home Assistant itself: an absolute URL is refused, so this can never
     * be used to make the server fetch an arbitrary address.
     */
    public function entityPicture(string $id): ?string
    {
        if (!self::validId($id)) {
            return null;
        }
        if (str_starts_with($id, 'image.')) {
            return '/api/image_proxy/' . rawurlencode($id);
        }
        if (!str_starts_with($id, 'person.')) {
            return null;
        }
        $r = $this->client->request('GET', '/api/states/' . rawurlencode($id), null, 6);
        $p = is_array($r['body']) ? ($r['body']['attributes']['entity_picture'] ?? null) : null;
        return is_string($p) && str_starts_with($p, '/') && !str_starts_with($p, '//') && !str_contains($p, '..') ? $p : null;
    }

    /* ------------------------------------------------------------------ history */

    /** Practical ranges: span (s), number of buckets, cache / refresh time (s). */
    public const HISTORY = [
        '1h'  => [3600, 60, 60],          // 1-minute buckets, refreshed at most every minute
        '6h'  => [21600, 72, 120],        // 5 min
        '12h' => [43200, 72, 300],        // 10 min
        '24h' => [86400, 96, 300],        // 15 min
        '7d'  => [604800, 84, 900],       // 2 hours
    ];
    /** domains whose state is a number (others have no numeric history to draw) */
    public const NUMERIC = ['sensor', 'input_number', 'number', 'counter'];
    private const HISTORY_MAX_BYTES = 16 * 1024 * 1024;

    /**
     * Numeric history of ONE entity from Home Assistant's own recorder
     * (GET /api/history/period/<start>?filter_entity_id=…&end_time=…&minimal_response&no_attributes).
     * IniqDash stores nothing: the answer is reduced to a fixed number of time buckets for drawing
     * (the time-weighted mean of the reported value in each bucket, plus its min / max) and kept
     * for a short time in the private cache folder so several screens do not repeat the request.
     * A bucket with no numeric value (unavailable / unknown / before the entity existed) is null —
     * a gap, never an invented value.
     *
     * @return array{connected:bool, error:?string, ...}
     */
    public function history(string $id, string $range): array
    {
        if (!self::validId($id) || !in_array(explode('.', $id, 2)[0], self::NUMERIC, true)) {
            return ['connected' => true, 'error' => 'not_numeric', 'status' => 400];
        }
        if (!isset(self::HISTORY[$range])) {
            return ['connected' => true, 'error' => 'bad_range', 'status' => 400];
        }
        [$span, $count, $ttl] = self::HISTORY[$range];
        $cache = IQ_VAR !== null ? IQ_VAR . '/cache/ha_hist_' . substr(hash('sha256', $id . '|' . $range), 0, 20) . '.json' : null;
        if ($cache !== null && is_file($cache) && filemtime($cache) > time() - $ttl) {
            $c = json_decode((string) file_get_contents($cache), true);
            if (is_array($c)) {
                return $c + ['cached' => true];
            }
        }
        $end = time();
        $start = $end - $span;
        $path = '/api/history/period/' . rawurlencode(gmdate('Y-m-d\TH:i:s\Z', $start))
            . '?filter_entity_id=' . rawurlencode($id) . '&end_time=' . rawurlencode(gmdate('Y-m-d\TH:i:s\Z', $end))
            . '&minimal_response&no_attributes';
        $r = $this->client->request('GET', $path, null, 20, self::HISTORY_MAX_BYTES);
        if ($r['error'] !== null || !is_array($r['body'])) {
            $err = $r['error'] ?? 'http';
            return ['connected' => !in_array($err, ['unreachable', 'timeout', 'auth'], true), 'error' => $err === 'too_large' ? 'too_much_history' : $err, 'status' => 502];
        }
        $rows = is_array($r['body'][0] ?? null) ? $r['body'][0] : [];
        $out = self::buckets($rows, $start, $end, $count) + ['connected' => true, 'error' => null, 'entity' => $id, 'range' => $range, 'refresh' => $ttl, 'fetched' => gmdate('c', $end)];
        unset($r, $rows);
        if ($cache !== null) {
            @file_put_contents($cache, json_encode($out, JSON_UNESCAPED_SLASHES), LOCK_EX);
        }
        return $out;
    }

    /**
     * Reduce HA's state changes to $count equal time buckets. Each change holds its value until the
     * next change (that is what HA's recorder means); a non-numeric state (unavailable, unknown, a
     * text) holds "no value". Per bucket: [start ms, mean, min, max] or [start ms, null, null, null].
     */
    public static function buckets(array $rows, int $start, int $end, int $count): array
    {
        $step = ($end - $start) / $count;
        $seg = [];                                        // [t, value|null]
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $t = strtotime((string) ($row['last_changed'] ?? $row['last_updated'] ?? ''));
            if ($t === false) {
                continue;
            }
            $st = $row['state'] ?? null;
            $v = is_numeric($st) && is_finite((float) $st) ? (float) $st : null;
            $seg[] = [max($start, min($end, $t)), $v];
        }
        usort($seg, static fn ($a, $b) => $a[0] <=> $b[0]);
        $sum = array_fill(0, $count, 0.0);
        $cov = array_fill(0, $count, 0.0);
        $lo = array_fill(0, $count, null);
        $hi = array_fill(0, $count, null);
        $min = null; $max = null; $last = null; $n = 0;
        foreach ($seg as $i => [$t, $v]) {
            $t2 = $seg[$i + 1][0] ?? $end;
            if ($v === null) {
                continue;
            }
            $n++;
            $min = $min === null ? $v : min($min, $v);
            $max = $max === null ? $v : max($max, $v);
            $last = $v;
            $b0 = (int) floor(($t - $start) / $step);
            $b1 = (int) min($count - 1, floor((max($t, $t2 - 0.001) - $start) / $step));
            for ($b = max(0, $b0); $b <= $b1; $b++) {
                $bs = $start + $b * $step;
                $dt = min($t2, $bs + $step) - max($t, $bs);
                if ($dt > 0) {
                    $sum[$b] += $v * $dt;
                    $cov[$b] += $dt;
                }
                if ($dt > 0 || $t2 === $t) {
                    $lo[$b] = $lo[$b] === null ? $v : min($lo[$b], $v);
                    $hi[$b] = $hi[$b] === null ? $v : max($hi[$b], $v);
                }
            }
        }
        $points = [];
        for ($b = 0; $b < $count; $b++) {
            $ms = (int) round(($start + $b * $step) * 1000);
            $points[] = $cov[$b] > 0 ? [$ms, round($sum[$b] / $cov[$b], 4), $lo[$b], $hi[$b]] : [$ms, null, null, null];
        }
        return ['start' => $start * 1000, 'end' => $end * 1000, 'step' => (int) round($step * 1000), 'points' => $points,
            'min' => $min, 'max' => $max, 'last' => $last, 'samples' => $n];
    }

    /* ------------------------------------------------------------------ actions */

    /**
     * Validate an action against the entity's CURRENT state and capabilities and send the HA
     * service call. The service is chosen here, never by the browser.
     * @return array{ok:bool, error?:string, status?:int, expect?:array}
     */
    /** Rejected codes (lock / alarm): 5 per 10 minutes, then IniqDash refuses codes for a while.
        Kept in the private folder; Home Assistant itself is not affected. */
    private const CODE_MAX_FAILS = 5;
    private const CODE_WINDOW = 600;

    private static function codeFails(?int $add = null): array
    {
        if (IQ_VAR === null) {
            return [];
        }
        $f = IQ_VAR . '/ratelimit/ha_code_failures.json';
        $now = time();
        $ev = json_decode((string) @file_get_contents($f), true);
        $ev = array_values(array_filter(is_array($ev) ? $ev : [], static fn ($t) => is_int($t) && $t > $now - self::CODE_WINDOW));
        if ($add !== null) {
            $ev[] = $add;
            @file_put_contents($f, json_encode($ev), LOCK_EX);
        }
        return $ev;
    }

    /**
     * @param ?string $code  a lock / alarm code typed by the user for THIS action: sent to Home
     *                       Assistant once, never stored, logged or returned
     */
    public function call(string $id, string $action, mixed $value, ?string $code = null): array
    {
        if (!self::validId($id)) {
            return ['ok' => false, 'error' => 'bad_entity', 'status' => 400];
        }
        $cur = $this->states([$id]);
        if (!$cur['connected']) {
            return ['ok' => false, 'error' => 'ha_' . ($cur['error'] ?? 'unreachable'), 'status' => 502];
        }
        $e = $cur['states'][$id] ?? null;
        if ($e === null) {
            return ['ok' => false, 'error' => 'unknown_entity', 'status' => 404];
        }
        if (!$e['available']) {
            return ['ok' => false, 'error' => 'unavailable', 'status' => 409];
        }
        $plan = self::plan($e, $action, $value);
        if (isset($plan['error'])) {
            return ['ok' => false, 'error' => $plan['error'], 'status' => 400];
        }
        $data = ['entity_id' => $id] + $plan['data'];
        $withCode = false;
        if (array_key_exists('code', $plan) && $plan['code'] !== null) {
            if (count(self::codeFails()) >= self::CODE_MAX_FAILS) {
                return ['ok' => false, 'error' => 'code_locked', 'status' => 429];
            }
            if ($code === null || $code === '') {
                return ['ok' => false, 'error' => 'code_required', 'status' => 422];
            }
            if (mb_strlen($code) > 32 || ($plan['code'] === 'number' && !ctype_digit($code))) {
                return ['ok' => false, 'error' => 'bad_code', 'status' => 400];
            }
            $data['code'] = $code;
            $withCode = true;
        }
        $r = $this->client->request('POST', '/api/services/' . $plan['domain'] . '/' . $plan['service'], $data, 8);
        unset($data, $code);
        if ($r['error'] !== null) {
            if ($withCode && $r['error'] === 'http') {        // refused by HA (wrong code); timeouts do not count
                self::codeFails(time());
                return ['ok' => false, 'error' => 'code_rejected', 'status' => 403];
            }
            return ['ok' => false, 'error' => 'ha_' . $r['error'], 'status' => $r['error'] === 'timeout' ? 504 : 502];
        }
        return ['ok' => true, 'expect' => $plan['expect']];
    }

    /** @return array{domain:string, service:string, data:array, expect:array}|array{error:string} */
    public static function plan(array $e, string $action, mixed $value): array
    {
        $d = $e['domain'];
        $caps = $e['caps'];
        if (in_array($d, ['light', 'switch', 'input_boolean'], true) && in_array($action, ['turn_on', 'turn_off', 'toggle'], true)) {
            $to = $action === 'toggle' ? ($e['state'] === 'on' ? 'off' : 'on') : ($action === 'turn_on' ? 'on' : 'off');
            return ['domain' => $d, 'service' => $to === 'on' ? 'turn_on' : 'turn_off', 'data' => [], 'expect' => ['state' => $to]];
        }
        if ($d === 'light' && $action === 'brightness') {
            if (empty($caps['brightness'])) {
                return ['error' => 'not_supported'];
            }
            if (!is_numeric($value) || $value < 1 || $value > 100) {
                return ['error' => 'out_of_range'];
            }
            $pct = (int) round((float) $value);
            return ['domain' => 'light', 'service' => 'turn_on', 'data' => ['brightness_pct' => $pct], 'expect' => ['state' => 'on', 'brightness_pct' => $pct]];
        }
        if ($d === 'climate' && $action === 'set_temperature') {
            if (empty($caps['target_temperature'])) {
                return ['error' => 'not_supported'];
            }
            $a = $e['attrs'];
            $min = $a['min_temp'] ?? 5;
            $max = $a['max_temp'] ?? 35;
            $step = ($a['target_temp_step'] ?? 0) > 0 ? $a['target_temp_step'] : 0.5;
            if (!is_numeric($value) || $value < $min || $value > $max) {
                return ['error' => 'out_of_range'];
            }
            $t = round(round((float) $value / $step) * $step, 2);
            return ['domain' => 'climate', 'service' => 'set_temperature', 'data' => ['temperature' => $t], 'expect' => ['target_temperature' => $t]];
        }
        if ($d === 'climate' && $action === 'set_hvac_mode') {
            if (!is_string($value) || !in_array($value, $caps['hvac_modes'] ?? [], true)) {
                return ['error' => 'not_supported'];
            }
            return ['domain' => 'climate', 'service' => 'set_hvac_mode', 'data' => ['hvac_mode' => $value], 'expect' => ['state' => $value]];
        }
        if ($action === 'trigger' && isset(self::TRIGGER[$d])) {
            // Button / Action widgets: one simple, fixed action per domain — never a free service call
            if ($d === 'cover' && empty($caps['open']) && empty($caps['close'])) {
                return ['error' => 'not_supported'];
            }
            return ['domain' => $d, 'service' => self::TRIGGER[$d], 'data' => [], 'expect' => []];
        }
        if ($d === 'cover') {
            $map = ['open' => ['open', 'open_cover'], 'close' => ['close', 'close_cover'], 'stop' => ['stop', 'stop_cover']];
            if (isset($map[$action])) {
                return empty($caps[$map[$action][0]]) ? ['error' => 'not_supported'] : ['domain' => 'cover', 'service' => $map[$action][1], 'data' => [], 'expect' => []];
            }
            if ($action === 'position') {
                if (empty($caps['position'])) {
                    return ['error' => 'not_supported'];
                }
                if (!is_numeric($value) || $value < 0 || $value > 100) {
                    return ['error' => 'out_of_range'];
                }
                return ['domain' => 'cover', 'service' => 'set_cover_position', 'data' => ['position' => (int) round((float) $value)], 'expect' => []];
            }
        }
        if ($d === 'fan') {
            if (in_array($action, ['turn_on', 'turn_off', 'toggle'], true)) {
                $to = $action === 'toggle' ? ($e['state'] === 'on' ? 'off' : 'on') : ($action === 'turn_on' ? 'on' : 'off');
                return ['domain' => 'fan', 'service' => $to === 'on' ? 'turn_on' : 'turn_off', 'data' => [], 'expect' => ['state' => $to]];
            }
            if ($action === 'percentage') {
                if (empty($caps['speed'])) {
                    return ['error' => 'not_supported'];
                }
                if (!is_numeric($value) || $value < 0 || $value > 100) {
                    return ['error' => 'out_of_range'];
                }
                $p = (int) round((float) $value);
                return $p === 0 ? ['domain' => 'fan', 'service' => 'turn_off', 'data' => [], 'expect' => ['state' => 'off']]
                    : ['domain' => 'fan', 'service' => 'set_percentage', 'data' => ['percentage' => $p], 'expect' => ['state' => 'on']];
            }
            if ($action === 'preset') {
                if (empty($caps['preset']) || !is_string($value) || !in_array($value, $e['attrs']['preset_modes'] ?? [], true)) {
                    return ['error' => 'not_supported'];
                }
                return ['domain' => 'fan', 'service' => 'set_preset_mode', 'data' => ['preset_mode' => $value], 'expect' => ['preset_mode' => $value]];
            }
            if ($action === 'oscillate') {
                return empty($caps['oscillate']) || !is_bool($value) ? ['error' => 'not_supported'] : ['domain' => 'fan', 'service' => 'oscillate', 'data' => ['oscillating' => $value], 'expect' => ['oscillating' => $value]];
            }
            if ($action === 'direction') {
                return empty($caps['direction']) || !in_array($value, ['forward', 'reverse'], true) ? ['error' => 'not_supported'] : ['domain' => 'fan', 'service' => 'set_direction', 'data' => ['direction' => $value], 'expect' => ['direction' => $value]];
            }
        }
        if ($d === 'lock' && in_array($action, ['lock', 'unlock', 'open'], true)) {
            if (empty($caps[$action])) {
                return ['error' => 'not_supported'];
            }
            return ['domain' => 'lock', 'service' => $action, 'data' => [], 'expect' => [], 'code' => $e['attrs']['code'] ?? null];
        }
        if ($d === 'alarm_control_panel' && in_array($action, ['disarm', 'arm_home', 'arm_away', 'arm_night', 'arm_vacation', 'arm_custom_bypass'], true)) {
            if (empty($caps[$action])) {
                return ['error' => 'not_supported'];
            }
            $a = $e['attrs'];
            $needs = $action === 'disarm' ? !empty($a['code_to_disarm']) : !empty($a['code_to_arm']);
            return ['domain' => 'alarm_control_panel', 'service' => 'alarm_' . $action, 'data' => [], 'expect' => [], 'code' => $needs ? $a['code'] : null];
        }
        if ($d === 'media_player') {
            $simple = ['play' => ['play', 'media_play', 'playing'], 'stop' => ['stop', 'media_stop', null], 'previous' => ['previous', 'media_previous_track', null], 'next' => ['next', 'media_next_track', null]];
            if (isset($simple[$action])) {
                [$cap, $svc, $st] = $simple[$action];
                return empty($caps[$cap]) ? ['error' => 'not_supported'] : ['domain' => 'media_player', 'service' => $svc, 'data' => [], 'expect' => $st ? ['state' => $st] : []];
            }
            if ($action === 'pause') {        // a player without pause but with stop: the pause button stops
                if (!empty($caps['pause'])) {
                    return ['domain' => 'media_player', 'service' => 'media_pause', 'data' => [], 'expect' => ['state' => 'paused']];
                }
                return empty($caps['stop']) ? ['error' => 'not_supported'] : ['domain' => 'media_player', 'service' => 'media_stop', 'data' => [], 'expect' => []];
            }
            if ($action === 'volume') {
                if (empty($caps['volume'])) {
                    return ['error' => 'not_supported'];
                }
                if (!is_numeric($value) || $value < 0 || $value > 100) {
                    return ['error' => 'out_of_range'];
                }
                $v = (int) round((float) $value);
                return ['domain' => 'media_player', 'service' => 'volume_set', 'data' => ['volume_level' => round($v / 100, 2)], 'expect' => ['volume' => $v]];
            }
            if ($action === 'mute') {
                return empty($caps['mute']) || !is_bool($value) ? ['error' => 'not_supported'] : ['domain' => 'media_player', 'service' => 'volume_mute', 'data' => ['is_volume_muted' => $value], 'expect' => ['muted' => $value]];
            }
            if ($action === 'source') {
                return empty($caps['source']) || !is_string($value) || !in_array($value, $e['attrs']['sources'] ?? [], true) ? ['error' => 'not_supported']
                    : ['domain' => 'media_player', 'service' => 'select_source', 'data' => ['source' => $value], 'expect' => ['source' => $value]];
            }
        }
        return ['error' => 'action_not_allowed'];
    }
}
