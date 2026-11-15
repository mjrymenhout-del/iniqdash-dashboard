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

    /** caches of this request's Home Assistant: the real one (var/cache) or the simulated home (var/cache/sim) — never mixed */
    private static ?string $cacheDir = null;
    /** the simulated home answers this request: picture URLs written for the browser carry "sim=1" (served by the simulated client too) */
    private static bool $sim = false;

    public function __construct(private readonly HaClient $client)
    {
        self::$sim = $client instanceof SimHaClient;
        self::$cacheDir = IQ_VAR === null ? null : IQ_VAR . '/cache' . (self::$sim ? '/sim' : '');
        if (self::$cacheDir !== null && !is_dir(self::$cacheDir)) {
            @mkdir(self::$cacheDir, 0700, true);
        }
    }

    private static function cacheDir(): string
    {
        return self::$cacheDir ?? (IQ_VAR . '/cache');
    }

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
        $cache = IQ_VAR !== null ? self::cacheDir() . '/ha_entities.json' : null;
        if (!$fresh && $cache !== null && is_file($cache) && filemtime($cache) > time() - 30) {
            $c = json_decode((string) file_get_contents($cache), true);
            if (is_array($c) && isset($c['rows']) && is_array($c['rows'])) {
                return ['connected' => true, 'error' => null, 'entities' => $c['rows'], 'areas' => is_array($c['areas'] ?? null) ? $c['areas'] : []];
            }
        }
        $rows = null;
        $areas = [];
        // AREAS from Home Assistant's own registry: every area (id + name), and per entity the area HA resolves for it — the entity's own
        // area, or (when it has none) its DEVICE's area. Both are read from HA (area_id / device_id), never guessed from a name.
        $tpl = '{%- set ns = namespace(rows=[], areas=[]) -%}'
            . '{%- for a in areas() -%}{%- set ns.areas = ns.areas + [[a, area_name(a)]] -%}{%- endfor -%}'
            . '{%- for s in states -%}{%- set d = device_id(s.entity_id) -%}'
            . '{%- set ns.rows = ns.rows + [[s.entity_id, s.state, s.attributes.friendly_name | default(none), '
            . 's.attributes.unit_of_measurement | default(none), s.attributes.device_class | default(none), area_name(s.entity_id), '
            . 'area_id(s.entity_id), (area_id(d) if d else none), s.attributes.state_class | default(none), s.attributes.entity_id | default(none)]] -%}'
            . '{%- endfor -%}{{ {"rows": ns.rows, "areas": ns.areas} | tojson }}';
        $r = $this->client->request('POST', '/api/template', ['template' => $tpl], 20);
        if ($r['error'] === 'unreachable' || $r['error'] === 'timeout' || ($r['error'] === 'auth' && $r['status'] === 401)) {
            return ['connected' => false, 'error' => $r['error'], 'entities' => []];
        }
        $decoded = $r['error'] === null ? (is_string($r['body']) ? json_decode($r['body'], true) : $r['body']) : null;
        if (is_array($decoded)) {
            // { rows, areas } (rows without the area columns: an older answer shape — no area context)
            $list = isset($decoded['rows']) && is_array($decoded['rows']) ? $decoded['rows'] : (array_is_list($decoded) ? $decoded : []);
            foreach (is_array($decoded['areas'] ?? null) ? $decoded['areas'] : [] as $a) {
                if (is_array($a) && self::validArea($a[0] ?? null)) {
                    $areas[] = ['id' => $a[0], 'name' => is_string($a[1] ?? null) && $a[1] !== '' ? $a[1] : $a[0]];
                }
            }
            $names = array_column($areas, 'name', 'id');
            $rows = [];
            foreach ($list as $row) {
                if (is_array($row) && is_string($row[0] ?? null)) {
                    $areaId = self::areaOf($row[6] ?? null, $row[7] ?? null);
                    $rows[] = self::listing($row[0], (string) $row[1], $row[2], $row[3], $row[4], $areaId !== null ? ($names[$areaId] ?? ($row[5] ?? null)) : ($row[5] ?? null), $areaId)
                        + self::extra($row[8] ?? null, $row[9] ?? null);
                }
            }
            $rows = $this->withRegistry($rows);
            usort($areas, static fn ($a, $b) => strcasecmp($a['name'], $b['name']));
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
            @file_put_contents($cache, json_encode(['rows' => $rows, 'areas' => $areas], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
        }
        return ['connected' => true, 'error' => null, 'entities' => $rows, 'areas' => $areas];
    }

    /** a Home Assistant area id (a registry id: letters, digits, _ and -) */
    public static function validArea(mixed $id): bool
    {
        return is_string($id) && (bool) preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id);
    }

    /** the area of an entity as HA reports it: its own area, else its device's (the registry's own inheritance) — null: none */
    public static function areaOf(mixed $entityArea, mixed $deviceArea): ?string
    {
        return self::validArea($entityArea) ? $entityArea : (self::validArea($deviceArea) ? $deviceArea : null);
    }

    /** state class + group members (a light / switch group lists the entities it controls) */
    private static function extra(mixed $sc, mixed $members): array
    {
        $out = [];
        if (is_string($sc) && preg_match('/^[a-z_]{1,32}$/', $sc)) {
            $out['sc'] = $sc;
        }
        if (is_array($members) && array_is_list($members)) {
            $m = array_values(array_filter($members, static fn ($x) => is_string($x) && self::validId($x)));
            if ($m !== []) {
                $out['members'] = array_slice($m, 0, 64);
            }
        }
        return $out;
    }

    /**
     * REGISTRY METADATA (best effort, read-only, Home Assistant's WebSocket API): per entity its DEVICE (id, name, model, whether it is
     * a service rather than a physical device), its category (config / diagnostic), whether the user HID it, and the integration that
     * provides it. This is what tells a room's real devices apart from the dozens of technical entities one appliance can expose.
     * Disabled entities are not in Home Assistant's state list at all. When the registry cannot be read (an old version, a refused
     * command) the rows are returned unchanged: the generator then classifies by domain, device class and name only.
     */
    private function withRegistry(array $rows): array
    {
        $r = $this->client->ws([['type' => 'config/entity_registry/list_for_display'], ['type' => 'config/device_registry/list']], 10, 16777216);
        if ($r['error'] !== null || count($r['results']) < 2 || !$r['results'][0]['success']) {
            return $rows;
        }
        $er = $r['results'][0]['result'];
        $cats = is_array($er['entity_categories'] ?? null) ? $er['entity_categories'] : [];
        $byId = [];
        foreach (is_array($er['entities'] ?? null) ? $er['entities'] : [] as $e) {
            if (is_array($e) && is_string($e['ei'] ?? null)) {
                $byId[$e['ei']] = $e;
            }
        }
        $devs = [];
        if ($r['results'][1]['success'] && is_array($r['results'][1]['result'])) {
            foreach ($r['results'][1]['result'] as $d) {
                if (is_array($d) && is_string($d['id'] ?? null)) {
                    $n = is_string($d['name_by_user'] ?? null) && $d['name_by_user'] !== '' ? $d['name_by_user'] : ($d['name'] ?? null);
                    $devs[$d['id']] = [
                        'name'    => is_string($n) ? mb_substr($n, 0, 120) : null,
                        'service' => ($d['entry_type'] ?? null) === 'service',
                        'model'   => is_string($d['model'] ?? null) ? mb_substr($d['model'], 0, 80) : null,
                    ];
                }
            }
        }
        foreach ($rows as &$row) {
            $e = $byId[$row['id']] ?? null;
            if ($e === null) {
                continue;
            }
            $row['reg'] = true;
            $ec = $e['ec'] ?? null;
            $cat = is_int($ec) ? ($cats[$ec] ?? $cats[(string) $ec] ?? null) : (is_string($ec) ? $ec : null);
            if ($cat === 'config' || $cat === 'diagnostic') {
                $row['cat'] = $cat;
            }
            if (!empty($e['hb'])) {
                $row['hidden'] = true;
            }
            if (is_string($e['pl'] ?? null) && preg_match('/^[a-z0-9_]{1,64}$/', $e['pl'])) {
                $row['platform'] = $e['pl'];
            }
            $di = $e['di'] ?? null;
            if (is_string($di) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $di)) {
                $row['device'] = $di;
                if (isset($devs[$di])) {
                    $row['deviceName'] = $devs[$di]['name'];
                    if ($devs[$di]['service']) {
                        $row['service'] = true;
                    }
                    if ($devs[$di]['model'] !== null) {
                        $row['model'] = $devs[$di]['model'];
                    }
                }
            }
        }
        unset($row);
        return $rows;
    }

    private static function listing(string $id, string $state, mixed $name, mixed $unit, mixed $dc, mixed $area, ?string $areaId = null): array
    {
        return [
            'id'     => $id,
            'domain' => explode('.', $id, 2)[0],
            'name'   => is_string($name) && $name !== '' ? $name : $id,
            'state'  => $state,
            'unit'   => is_string($unit) ? $unit : null,
            'dc'     => is_string($dc) ? $dc : null,
            'area'   => is_string($area) && $area !== '' ? $area : null,
            'areaId' => $areaId,
        ];
    }

    /* ------------------------------------------------------------------ activity (logbook) */

    /** activity entries returned at most (the most recent) */
    public const LOGBOOK_MAX = 50;

    /**
     * Activity of ONE entity from Home Assistant's logbook (GET /api/logbook/<start>?entity=<id>&end_time=<end>), read-only.
     * Each entry is reduced to what can be shown truthfully: { t (ms), state?, message?, cause? }.
     *   cause: ONLY when HA's own context names an automation or a script ({ kind: 'automation' | 'script', name }).
     *          A user id is never passed on (every IniqDash action reaches HA as the token's user, so it cannot tell who),
     *          and a missing context is NOT reported as "manual" / "physical" — it is simply absent.
     * Cached per entity + range in short clock windows (60 s). Range: the history ranges (1h … 7d).
     * @return array{connected:bool, error:?string, entries?:array}
     */
    public function logbook(string $id, string $range): array
    {
        if (!self::validId($id)) {
            return ['connected' => true, 'error' => 'bad_entity', 'status' => 400, 'entries' => []];
        }
        if (!isset(self::HISTORY[$range])) {
            return ['connected' => true, 'error' => 'bad_range', 'status' => 400, 'entries' => []];
        }
        $ttl = 60;
        $f = IQ_VAR !== null ? self::cacheDir() . '/ha_log_' . substr(hash('sha256', $id . '|' . $range), 0, 20) . '.json' : null;
        if ($f !== null && is_file($f) && intdiv((int) filemtime($f), $ttl) === intdiv(time(), $ttl)) {
            $c = json_decode((string) file_get_contents($f), true);
            if (is_array($c)) {
                return $c + ['cached' => true];
            }
        }
        $end = time();
        $start = $end - self::HISTORY[$range][0];
        $path = '/api/logbook/' . rawurlencode(gmdate('Y-m-d\TH:i:s\Z', $start)) . '?entity=' . rawurlencode($id) . '&end_time=' . rawurlencode(gmdate('Y-m-d\TH:i:s\Z', $end));
        $r = $this->client->request('GET', $path, null, 15, 4 * 1024 * 1024);
        if ($r['error'] !== null || !is_array($r['body'])) {
            $e = $r['error'] ?? 'http';
            return ['connected' => !in_array($e, ['unreachable', 'timeout', 'auth'], true), 'error' => $e === 'too_large' ? 'too_much_activity' : $e, 'status' => 502, 'entries' => []];
        }
        $txt = static fn ($v, $n = 80) => is_scalar($v) && !is_bool($v) && (string) $v !== '' ? mb_substr(str_replace(['<', '>'], '', (string) $v), 0, $n) : null;
        $out = [];
        foreach ($r['body'] as $row) {
            if (!is_array($row) || ($row['entity_id'] ?? null) !== $id) {
                continue;                                  // only this entity's own entries
            }
            $t = strtotime((string) ($row['when'] ?? ''));
            if ($t === false) {
                continue;
            }
            $entry = ['t' => $t * 1000];
            if (($st = $txt($row['state'] ?? null, 60)) !== null) {
                $entry['state'] = $st;
            }
            if (($m = $txt($row['message'] ?? null)) !== null) {
                $entry['message'] = $m;
            }
            $ce = $row['context_entity_id'] ?? null;
            if (is_string($ce) && self::validId($ce) && (str_starts_with($ce, 'automation.') || str_starts_with($ce, 'script.'))) {
                $entry['cause'] = ['kind' => str_starts_with($ce, 'automation.') ? 'automation' : 'script', 'name' => $txt($row['context_entity_id_name'] ?? null) ?? $ce];
            }
            $out[] = $entry;
        }
        usort($out, static fn ($a, $b) => $b['t'] <=> $a['t']);
        $res = ['connected' => true, 'error' => null, 'entity' => $id, 'range' => $range, 'entries' => array_slice($out, 0, self::LOGBOOK_MAX),
            'more' => count($out) > self::LOGBOOK_MAX, 'fetched' => gmdate('c', $end)];
        if ($f !== null) {
            @file_put_contents($f, json_encode($res, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
        }
        return $res;
    }

    /* ------------------------------------------------------------------ calendar events */

    /** upcoming days asked for (one window, shared by the Calendar widget and Entity Details), events returned at most */
    public const CALENDAR_DAYS = 14;
    public const CALENDAR_MAX = 100;
    private const CALENDAR_TTL = 300;

    /**
     * Upcoming events of ONE calendar.* entity (GET /api/calendars/<id>?start=…&end=…), read-only. IniqDash stores no events:
     * the reduced answer is cached in the private folder in aligned 5-minute windows (widget and Details share it).
     * Each event: { title, start, end, allDay, location? }
     *   timed:   start / end exactly as HA reports them (ISO 8601 with the calendar's offset) — the browser shows the instant locally
     *   all-day: start / end as calendar DATES ("2026-10-22"; end is exclusive, as in HA) — never turned into an invented time
     * The window starts a day back so an all-day or multi-day event still running today is included in any time zone;
     * the browser drops what has ended. Nothing is invented: no events → an empty list.
     * @return array{connected:bool, error:?string, status?:int, events:array}
     */
    /** the items of a todo.* list (todo.get_items, read-only): [{ uid, summary, status, due?, description? }] — plain text, bounded */
    public function todoItems(string $id): array
    {
        if (!self::validId($id) || !str_starts_with($id, 'todo.')) {
            return ['connected' => true, 'error' => 'bad_entity', 'status' => 400, 'items' => []];
        }
        $r = $this->client->request('POST', '/api/services/todo/get_items?return_response', ['entity_id' => $id], 12, 1024 * 1024);
        if ($r['error'] !== null || !is_array($r['body'])) {
            $e = $r['error'] ?? 'http';
            if ($e === 'http' && $r['status'] === 400) {
                $e = 'todo_refused';
            }
            return ['connected' => !in_array($e, ['unreachable', 'timeout', 'auth'], true), 'error' => $e, 'status' => 502, 'items' => []];
        }
        $list = $r['body']['service_response'][$id]['items'] ?? null;
        if (!is_array($list)) {
            return ['connected' => true, 'error' => 'no_items', 'items' => []];
        }
        $t = static fn ($v, $n) => is_scalar($v) && !is_bool($v) && trim((string) $v) !== '' ? mb_substr(str_replace(['<', '>'], '', trim((string) $v)), 0, $n) : null;
        $out = [];
        foreach (array_slice($list, 0, 200) as $row) {
            if (!is_array($row) || ($sum = $t($row['summary'] ?? null, 200)) === null) {
                continue;
            }
            $uid = is_string($row['uid'] ?? null) && preg_match('/^[A-Za-z0-9_.:-]{1,120}$/', $row['uid']) ? $row['uid'] : null;
            $x = ['uid' => $uid, 'summary' => $sum, 'status' => ($row['status'] ?? '') === 'completed' ? 'completed' : 'needs_action'];
            if (($due = $t($row['due'] ?? null, 40)) !== null) {
                $x['due'] = $due;
            }
            if (($d = $t($row['description'] ?? null, 200)) !== null) {
                $x['description'] = $d;
            }
            $out[] = $x;
        }
        return ['connected' => true, 'error' => null, 'entity' => $id, 'items' => $out, 'refresh' => 30];
    }

    public function calendar(string $id, ?string $from = null, ?int $days = null): array
    {
        if (!self::validId($id) || !str_starts_with($id, 'calendar.')) {
            return ['connected' => true, 'error' => 'bad_entity', 'status' => 400, 'events' => []];
        }
        // an optional WINDOW (the Calendar widget's week / month views and date navigation): from a day (Y-m-d, UTC midnight) for
        // 1–62 days, at most ~13 months away from today. Without one: yesterday → CALENDAR_DAYS ahead (as before).
        $win = null;
        if ($from !== null || $days !== null) {
            if ($from === null || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !checkdate((int) substr($from, 5, 2), (int) substr($from, 8, 2), (int) substr($from, 0, 4))) {
                return ['connected' => true, 'error' => 'bad_range', 'status' => 400, 'events' => []];
            }
            $days = $days ?? self::CALENDAR_DAYS;
            $t0 = strtotime($from . 'T00:00:00Z');
            if ($days < 1 || $days > 62 || $t0 === false || abs($t0 - time()) > 400 * 86400) {
                return ['connected' => true, 'error' => 'bad_range', 'status' => 400, 'events' => []];
            }
            $win = [$t0, $days];
        }
        $ttl = self::CALENDAR_TTL;
        $f = IQ_VAR !== null ? self::cacheDir() . '/ha_cal_' . substr(hash('sha256', $id . ($win ? '|' . $win[0] . '|' . $win[1] : '')), 0, 20) . '.json' : null;
        if ($f !== null && is_file($f) && intdiv((int) filemtime($f), $ttl) === intdiv(time(), $ttl)) {
            $c = json_decode((string) file_get_contents($f), true);
            if (is_array($c)) {
                return $c + ['cached' => true];
            }
        }
        $now = time();
        $start = $win ? $win[0] : $now - 86400;
        $end = $win ? $win[0] + $win[1] * 86400 : $now + self::CALENDAR_DAYS * 86400;
        $path = '/api/calendars/' . rawurlencode($id) . '?start=' . rawurlencode(gmdate('Y-m-d\TH:i:s\Z', $start)) . '&end=' . rawurlencode(gmdate('Y-m-d\TH:i:s\Z', $end));
        $r = $this->client->request('GET', $path, null, 12, 2 * 1024 * 1024);
        if ($r['error'] !== null || !is_array($r['body'])) {
            $e = $r['error'] ?? 'http';
            if ($e === 'http' && $r['status'] === 404) {
                $e = 'unknown_entity';
            }
            return ['connected' => !in_array($e, ['unreachable', 'timeout', 'auth'], true), 'error' => $e === 'too_large' ? 'too_many_events' : $e, 'status' => 502, 'events' => []];
        }
        $txt = static fn ($v, $n) => is_scalar($v) && !is_bool($v) && trim((string) $v) !== '' ? mb_substr(str_replace(['<', '>'], '', trim((string) $v)), 0, $n) : null;
        /** HA: { dateTime: ISO } (timed) or { date: Y-m-d } (all day); a plain string is accepted too */
        $moment = static function ($v): ?array {
            if (is_array($v)) {
                $v = $v['dateTime'] ?? $v['date'] ?? null;
            }
            if (!is_string($v) || strlen($v) > 40) {
                return null;
            }
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
                return checkdate((int) substr($v, 5, 2), (int) substr($v, 8, 2), (int) substr($v, 0, 4)) ? ['date' => $v] : null;
            }
            return strtotime($v) !== false ? ['time' => $v] : null;
        };
        $out = [];
        foreach ($r['body'] as $row) {
            if (!is_array($row)) {
                continue;
            }
            $s = $moment($row['start'] ?? null);
            $e = $moment($row['end'] ?? null);
            if ($s === null) {
                continue;
            }
            $allDay = isset($s['date']);
            if ($e !== null && isset($e['date']) !== $allDay) {
                $e = null;                                  // a mixed answer is not guessed at
            }
            $ev = ['title' => $txt($row['summary'] ?? null, 120) ?? '', 'start' => $s['date'] ?? $s['time'], 'end' => $e !== null ? ($e['date'] ?? $e['time']) : null, 'allDay' => $allDay];
            if (($loc = $txt($row['location'] ?? null, 120)) !== null) {
                $ev['location'] = $loc;
            }
            if (($desc = $txt($row['description'] ?? null, 160)) !== null) {
                $ev['description'] = $desc;               // a short note (plain text, capped) — shown by the Event spotlight
            }
            $ev['_k'] = $allDay ? strtotime($ev['start'] . 'T00:00:00Z') : strtotime($ev['start']);
            $out[] = $ev;
        }
        usort($out, static fn ($a, $b) => $a['_k'] <=> $b['_k']);
        $out = array_map(static function ($x) { unset($x['_k']); return $x; }, $out);
        $res = ['connected' => true, 'error' => null, 'entity' => $id, 'start' => $start * 1000, 'end' => $end * 1000, 'days' => $win ? $win[1] : self::CALENDAR_DAYS,
            'events' => array_slice($out, 0, self::CALENDAR_MAX), 'more' => count($out) > self::CALENDAR_MAX, 'refresh' => $ttl, 'fetched' => gmdate('c', $now)];
        if ($f !== null) {
            @file_put_contents($f, json_encode($res, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
        }
        return $res;
    }

    /* ------------------------------------------------------------------ weather forecast */

    /** forecast types and the WeatherEntityFeature bit that says the entity serves them */
    public const FORECAST_TYPES = ['daily' => 1, 'hourly' => 2, 'twice_daily' => 4];
    private const FORECAST_TTL = 600;
    private const FORECAST_MAX = 48;

    /**
     * The forecast of ONE weather.* entity through Home Assistant's supported mechanism, the weather.get_forecasts service
     * (POST /api/services/weather/get_forecasts?return_response — HA 2024.8+ over REST). Read-only: the service changes nothing.
     * Only a type the entity's supported_features declares is asked for; any other is refused ('type_not_supported') and
     * never filled with anything else. Cached in aligned 10-minute windows per entity + type (widget and Details share it).
     * Entries: { t (ms), condition?, temperature?, templow?, precipitation?, precipitation_probability?, wind_speed?,
     *            wind_bearing?, humidity?, is_daytime? } — only what HA returned; units: those of the entity (HA converts its
     * forecast to the same units as the entity's state attributes).
     * @return array{connected:bool, error:?string, status?:int, forecast:array}
     */
    public function forecast(string $id, string $type): array
    {
        if (!self::validId($id) || !str_starts_with($id, 'weather.')) {
            return ['connected' => true, 'error' => 'bad_entity', 'status' => 400, 'forecast' => []];
        }
        if (!isset(self::FORECAST_TYPES[$type])) {
            return ['connected' => true, 'error' => 'bad_type', 'status' => 400, 'forecast' => []];
        }
        $ttl = self::FORECAST_TTL;
        $f = IQ_VAR !== null ? self::cacheDir() . '/ha_fc_' . substr(hash('sha256', $id . '|' . $type), 0, 20) . '.json' : null;
        if ($f !== null && is_file($f) && intdiv((int) filemtime($f), $ttl) === intdiv(time(), $ttl)) {
            $c = json_decode((string) file_get_contents($f), true);
            if (is_array($c)) {
                return $c + ['cached' => true];
            }
        }
        // what this entity supports NOW (and its units): its normalised state
        $cur = $this->states([$id]);
        if (!$cur['connected']) {
            return ['connected' => false, 'error' => $cur['error'] ?? 'unreachable', 'status' => 502, 'forecast' => []];
        }
        $ent = $cur['states'][$id] ?? null;
        if ($ent === null) {
            return ['connected' => true, 'error' => 'unknown_entity', 'status' => 404, 'forecast' => []];
        }
        $supported = array_keys(array_filter(self::FORECAST_TYPES, static fn ($bit, $t) => !empty($ent['caps']['forecast_' . $t]), ARRAY_FILTER_USE_BOTH));
        $base = ['entity' => $id, 'type' => $type, 'supported' => $supported,
            'units' => ['temperature' => $ent['attrs']['temperature_unit'] ?? null, 'precipitation' => $ent['attrs']['precipitation_unit'] ?? null, 'wind_speed' => $ent['attrs']['wind_speed_unit'] ?? null]];
        if (!in_array($type, $supported, true)) {
            return ['connected' => true, 'error' => 'type_not_supported', 'forecast' => []] + $base;
        }
        if (!$ent['available']) {
            return ['connected' => true, 'error' => 'unavailable', 'forecast' => []] + $base;
        }
        $r = $this->client->request('POST', '/api/services/weather/get_forecasts?return_response', ['entity_id' => $id, 'type' => $type], 12, 1024 * 1024);
        if ($r['error'] !== null || !is_array($r['body'])) {
            $e = $r['error'] ?? 'http';
            // 400: this Home Assistant refused the call (e.g. older than 2024.8, which cannot return a service response over REST)
            if ($e === 'http' && $r['status'] === 400) {
                $e = 'forecast_refused';
            }
            return ['connected' => !in_array($e, ['unreachable', 'timeout', 'auth'], true), 'error' => $e, 'status' => 502, 'forecast' => []] + $base;
        }
        $list = $r['body']['service_response'][$id]['forecast'] ?? null;
        if (!is_array($list)) {
            return ['connected' => true, 'error' => 'no_forecast', 'forecast' => []] + $base;
        }
        $num = static fn ($v) => is_numeric($v) && is_finite((float) $v) ? 0 + $v : null;
        $txt = static fn ($v) => is_string($v) && $v !== '' && strlen($v) <= 40 ? str_replace(['<', '>'], '', $v) : null;
        $out = [];
        foreach ($list as $row) {
            $t = is_array($row) && is_string($row['datetime'] ?? null) ? strtotime($row['datetime']) : false;
            if ($t === false) {
                continue;
            }
            $x = ['t' => $t * 1000];
            foreach (['temperature', 'templow', 'precipitation', 'precipitation_probability', 'wind_speed', 'humidity'] as $k) {
                if (($v = $num($row[$k] ?? null)) !== null) {
                    $x[$k] = $v;
                }
            }
            if (($c = $txt($row['condition'] ?? null)) !== null) {
                $x['condition'] = $c;
            }
            $wb = $row['wind_bearing'] ?? null;
            if (($v = $num($wb)) !== null || ($v = $txt($wb)) !== null) {
                $x['wind_bearing'] = $v;
            }
            if (is_bool($row['is_daytime'] ?? null)) {
                $x['is_daytime'] = $row['is_daytime'];
            }
            $out[] = $x;
        }
        usort($out, static fn ($a, $b) => $a['t'] <=> $b['t']);
        $res = ['connected' => true, 'error' => null, 'forecast' => array_slice($out, 0, self::FORECAST_MAX), 'refresh' => $ttl, 'fetched' => gmdate('c')] + $base;
        if ($f !== null) {
            @file_put_contents($f, json_encode($res, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
        }
        return $res;
    }

    /* ------------------------------------------------------------------ same device */

    /**
     * Entity ids on the same HA device as $id (HA's own device registry, read through the template service: device_id() /
     * device_entities()). A person has no device: the device of its current tracker (its "source") is used. Suggestions only —
     * nothing about a role is inferred. Unknown entity, no device or the template service refused: an empty list.
     * @return array{connected:bool, error:?string, entities:string[]}
     */
    public function related(string $id): array
    {
        if (!self::validId($id)) {
            return ['connected' => true, 'error' => 'bad_entity', 'entities' => []];
        }
        $q = json_encode($id, JSON_UNESCAPED_SLASHES);
        $tpl = '{%- set d = device_id(' . $q . ') -%}'
            . '{%- if not d and ' . $q . '.startswith(\'person.\') -%}{%- set src = state_attr(' . $q . ', \'source\') -%}'
            . '{%- if src -%}{%- set d = device_id(src) -%}{%- endif -%}{%- endif -%}'
            . '{{ (device_entities(d) if d else []) | tojson }}';
        $r = $this->client->request('POST', '/api/template', ['template' => $tpl], 6);
        if ($r['error'] === 'unreachable' || $r['error'] === 'timeout' || ($r['error'] === 'auth' && $r['status'] === 401)) {
            return ['connected' => false, 'error' => $r['error'], 'entities' => []];
        }
        $list = $r['error'] === null ? (is_string($r['body']) ? json_decode($r['body'], true) : $r['body']) : null;
        $out = [];
        foreach (is_array($list) ? $list : [] as $e) {
            if (is_string($e) && $e !== $id && self::validId($e)) {
                $out[] = $e;
            }
        }
        return ['connected' => true, 'error' => null, 'entities' => array_slice(array_values(array_unique($out)), 0, 60)];
    }

    /* ------------------------------------------------------------------ inspect */

    /** limits of the inspector answer (one entity): HA's answer, attributes listed, string length, nesting */
    public const INSPECT_MAX_BYTES = 512 * 1024;
    public const INSPECT_MAX_ATTRS = 500;
    public const INSPECT_MAX_STRING = 4000;
    public const INSPECT_MAX_DEPTH = 8;
    /** attribute names whose value is a credential: listed by name only, the value never leaves the server */
    private const SECRET_KEY = '/(^|_)(access_token|token|password|passwd|secret|api_?key|credentials?|authorization|bearer)$/i';
    /** precise location: the attributes the Entity Details policy never passes on (normalise(): "NEVER coordinates, accuracy, speed or any
        location history"; details.js: "Never: coordinates, GPS accuracy …") — listed by name only, never their values */
    public const LOCATION_KEYS = ['latitude', 'longitude', 'altitude', 'gps_accuracy', 'vertical_accuracy', 'speed', 'course'];

    /**
     * The COMPLETE current Home Assistant state of ONE entity, for the configuration inspector (read-only, on demand, never
     * part of the state poll and never stored). Every attribute HA reports is listed, in HA's order — except credentials:
     * an attribute named like a token / password / secret is listed in `redacted` without its value, and a token in a URL
     * (?token=…, e.g. a camera's entity_picture) is replaced — and precise location (LOCATION_KEYS, the Entity Details policy), listed
     * in `location` without its value. Nothing is added or renamed.
     * @return array{connected:bool, error:?string, entity:?array}  entity null + error null = HA has no such entity
     */
    public function inspect(string $id): array
    {
        if (!self::validId($id)) {
            return ['connected' => true, 'error' => 'bad_entity', 'entity' => null];
        }
        $r = $this->client->request('GET', '/api/states/' . rawurlencode($id), null, 6, self::INSPECT_MAX_BYTES);
        if ($r['error'] === 'unreachable' || $r['error'] === 'timeout' || ($r['error'] === 'auth' && $r['status'] === 401)) {
            return ['connected' => false, 'error' => $r['error'], 'entity' => null];
        }
        if ($r['error'] === 'http' && $r['status'] === 404) {
            return ['connected' => true, 'error' => null, 'entity' => null];
        }
        if ($r['error'] !== null || !is_array($r['body'])) {
            return ['connected' => true, 'error' => $r['error'] === 'too_large' ? 'too_large' : 'http', 'entity' => null];
        }
        return ['connected' => true, 'error' => null, 'entity' => self::inspected($id, $r['body'])];
    }

    /**
     * HA's raw state object → { id, domain, state, last_changed, last_updated, attributes: [[name, value]…], count, redacted: [name…], location: [name…], truncated }
     * attributes is a LIST of pairs so HA's order (and an empty object) survives JSON. Values are HA's own JSON values.
     */
    public static function inspected(string $id, array $b): array
    {
        $redacted = [];
        $location = [];
        $truncated = false;
        $attrs = is_array($b['attributes'] ?? null) ? $b['attributes'] : [];
        $out = [];
        foreach ($attrs as $k => $v) {
            $k = (string) $k;
            if (preg_match(self::SECRET_KEY, $k)) {
                $redacted[] = $k;
                continue;
            }
            if (in_array(strtolower($k), self::LOCATION_KEYS, true)) {
                $location[] = $k;
                continue;
            }
            if (count($out) >= self::INSPECT_MAX_ATTRS) {
                $truncated = true;
                break;
            }
            $out[] = [$k, self::inspectValue($v, $k, 1, $redacted, $location, $truncated)];
        }
        $str = static fn ($v) => is_string($v) ? $v : null;
        return [
            'id' => $id,
            'domain' => explode('.', $id, 2)[0],
            'state' => is_scalar($b['state'] ?? null) ? (string) $b['state'] : null,
            'last_changed' => $str($b['last_changed'] ?? null),
            'last_updated' => $str($b['last_updated'] ?? null),
            'attributes' => $out,
            'count' => count($attrs),
            'redacted' => $redacted,
            'location' => $location,
            'truncated' => $truncated,
        ];
    }

    /** one value, recursively: credentials and precise location inside objects and tokens in URLs removed, very long strings / deep nesting cut */
    private static function inspectValue(mixed $v, string $path, int $depth, array &$redacted, array &$location, bool &$truncated): mixed
    {
        if (is_string($v)) {
            $v = (string) preg_replace('/([?&](?:access_)?token=)[^&#\s"\']*/i', '$1[hidden]', $v);
            if (strlen($v) > self::INSPECT_MAX_STRING) {
                $truncated = true;
                $v = mb_strcut($v, 0, self::INSPECT_MAX_STRING, 'UTF-8') . '…';
            }
            return $v;
        }
        if (!is_array($v)) {
            return $v;
        }
        if ($depth >= self::INSPECT_MAX_DEPTH) {
            $truncated = true;
            return '…';
        }
        $out = [];
        foreach ($v as $k => $x) {
            if (is_string($k) && preg_match(self::SECRET_KEY, $k)) {
                $redacted[] = $path . '.' . $k;
                continue;
            }
            if (is_string($k) && in_array(strtolower($k), self::LOCATION_KEYS, true)) {
                $location[] = $path . '.' . $k;
                continue;
            }
            $out[$k] = self::inspectValue($x, $path . '.' . $k, $depth + 1, $redacted, $location, $truncated);
        }
        return array_is_list($v) ? array_values($out) : (object) $out;
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
                    $out[$row[0]] = self::normalise($row[0], (string) $row[1], (string) ($row[2] ?? ''), is_array($row[3] ?? null) ? $row[3] : [],
                        is_string($row[4] ?? null) ? $row[4] : null, is_string($row[5] ?? null) ? $row[5] : null);
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
                $b = $res['body'];
                $out[$id] = self::normalise($id, (string) ($b['state'] ?? ''), (string) ($b['last_changed'] ?? ''), self::pick($id, $a),
                    is_string($b['last_updated'] ?? null) ? $b['last_updated'] : null, is_string($b['last_reported'] ?? null) ? $b['last_reported'] : null);
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
            $x += ['br' => $a['brightness'] ?? null, 'cm' => $a['color_mode'] ?? null, 'scm' => $a['supported_color_modes'] ?? [],
                'ctk' => $a['color_temp_kelvin'] ?? null, 'rgb' => $a['rgb_color'] ?? null, 'fx' => $a['effect'] ?? null,
                'ckmin' => $a['min_color_temp_kelvin'] ?? null, 'ckmax' => $a['max_color_temp_kelvin'] ?? null, 'hs' => $a['hs_color'] ?? null, 'fxl' => $a['effect_list'] ?? []];
        } elseif (str_starts_with($id, 'climate.')) {
            $x += ['cur' => $a['current_temperature'] ?? null, 'target' => $a['temperature'] ?? null, 'min' => $a['min_temp'] ?? null, 'max' => $a['max_temp'] ?? null,
                'step' => $a['target_temp_step'] ?? null, 'modes' => $a['hvac_modes'] ?? [], 'action' => $a['hvac_action'] ?? null, 'preset' => $a['preset_mode'] ?? null,
                'hum' => $a['current_humidity'] ?? null, 'thum' => $a['humidity'] ?? null, 'tlo' => $a['target_temp_low'] ?? null, 'thi' => $a['target_temp_high'] ?? null,
                'fm' => $a['fan_mode'] ?? null, 'sm' => $a['swing_mode'] ?? null, 'fml' => $a['fan_modes'] ?? [], 'pml' => $a['preset_modes'] ?? [], 'sml' => $a['swing_modes'] ?? [],
                'hmin' => $a['min_humidity'] ?? null, 'hmax' => $a['max_humidity'] ?? null];
        } elseif (str_starts_with($id, 'cover.')) {
            $x += ['pos' => $a['current_position'] ?? null, 'tilt' => $a['current_tilt_position'] ?? null];
        } elseif (str_starts_with($id, 'fan.')) {
            $x += ['pct' => $a['percentage'] ?? null, 'pstep' => $a['percentage_step'] ?? null, 'preset' => $a['preset_mode'] ?? null, 'presets' => $a['preset_modes'] ?? [],
                'osc' => $a['oscillating'] ?? null, 'dir' => $a['direction'] ?? null];
        } elseif (str_starts_with($id, 'lock.')) {
            $x += ['cf' => $a['code_format'] ?? null, 'cb' => $a['changed_by'] ?? null];
        } elseif (str_starts_with($id, 'alarm_control_panel.')) {
            $x += ['cf' => $a['code_format'] ?? null, 'car' => $a['code_arm_required'] ?? null, 'cb' => $a['changed_by'] ?? null];
        } elseif (str_starts_with($id, 'camera.')) {
            $x += ['cst' => $a['frontend_stream_type'] ?? null];
        } elseif (str_starts_with($id, 'input_number.') || str_starts_with($id, 'number.')) {
            $x += ['nmin' => $a['min'] ?? null, 'nmax' => $a['max'] ?? null, 'nstep' => $a['step'] ?? null, 'nmode' => $a['mode'] ?? null];
        } elseif (str_starts_with($id, 'select.') || str_starts_with($id, 'input_select.')) {
            $x += ['opts' => $a['options'] ?? []];
        } elseif (str_starts_with($id, 'image.') || str_starts_with($id, 'person.')) {
            $x += ['pic' => $a['entity_picture'] ?? null, 'src' => $a['source'] ?? null];
        } elseif (str_starts_with($id, 'humidifier.')) {
            $x += ['hum' => $a['current_humidity'] ?? null, 'thum' => $a['humidity'] ?? null, 'hmin' => $a['min_humidity'] ?? null, 'hmax' => $a['max_humidity'] ?? null,
                'hmode' => $a['mode'] ?? null, 'hmodes' => $a['available_modes'] ?? [], 'action' => $a['action'] ?? null];
        } elseif (str_starts_with($id, 'update.')) {
            $x += ['iv' => $a['installed_version'] ?? null, 'lv' => $a['latest_version'] ?? null, 'ttl' => $a['title'] ?? null, 'rurl' => $a['release_url'] ?? null,
                'inp' => $a['in_progress'] ?? null, 'upct' => $a['update_percentage'] ?? null];
        } elseif (str_starts_with($id, 'script.')) {
            $x += ['lt' => $a['last_triggered'] ?? null];
        } elseif (str_starts_with($id, 'weather.')) {
            $x += ['wt' => $a['temperature'] ?? null, 'wtu' => $a['temperature_unit'] ?? null, 'wa' => $a['apparent_temperature'] ?? null, 'wh' => $a['humidity'] ?? null,
                'ws' => $a['wind_speed'] ?? null, 'wsu' => $a['wind_speed_unit'] ?? null, 'wb' => $a['wind_bearing'] ?? null,
                'wp' => $a['pressure'] ?? null, 'wpu' => $a['pressure_unit'] ?? null, 'wdp' => $a['dew_point'] ?? null, 'wuv' => $a['uv_index'] ?? null,
                'wvis' => $a['visibility'] ?? null, 'wvu' => $a['visibility_unit'] ?? null, 'wcc' => $a['cloud_coverage'] ?? null,
                'wpru' => $a['precipitation_unit'] ?? null];
        } elseif (str_starts_with($id, 'device_tracker.')) {
            $x += ['stt' => $a['source_type'] ?? null, 'bat' => $a['battery_level'] ?? null];
        } elseif (str_starts_with($id, 'timer.')) {
            $x += ['dur' => isset($a['duration']) ? (string) $a['duration'] : null, 'rem' => isset($a['remaining']) ? (string) $a['remaining'] : null, 'fin' => isset($a['finishes_at']) ? (string) $a['finishes_at'] : null];
        } elseif (str_starts_with($id, 'vacuum.')) {
            $x += ['bat' => $a['battery_level'] ?? null, 'fs' => $a['fan_speed'] ?? null, 'fsl' => $a['fan_speed_list'] ?? []];
        } elseif (str_starts_with($id, 'lawn_mower.')) {
            $x += ['bat' => $a['battery_level'] ?? null];
        } elseif (str_starts_with($id, 'sun.')) {
            $x += ['nr' => $a['next_rising'] ?? null, 'ns' => $a['next_setting'] ?? null, 'nn' => $a['next_noon'] ?? null, 'el' => $a['elevation'] ?? null, 'ri' => $a['rising'] ?? null,
                'az' => $a['azimuth'] ?? null, 'nd' => $a['next_dawn'] ?? null, 'nu' => $a['next_dusk'] ?? null, 'nm' => $a['next_midnight'] ?? null];
        } elseif (str_starts_with($id, 'media_player.')) {
            $x += ['title' => $a['media_title'] ?? null, 'artist' => $a['media_artist'] ?? null, 'album' => $a['media_album_name'] ?? null, 'vol' => $a['volume_level'] ?? null,
                'muted' => $a['is_volume_muted'] ?? null, 'source' => $a['source'] ?? null, 'sources' => $a['source_list'] ?? [], 'app' => $a['app_name'] ?? null,
                'pic' => $a['entity_picture'] ?? null, 'mpos' => $a['media_position'] ?? null, 'mposu' => $a['media_position_updated_at'] ?? null,
                'mdur' => $a['media_duration'] ?? null, 'shuf' => $a['shuffle'] ?? null, 'rep' => $a['repeat'] ?? null, 'mct' => $a['media_content_type'] ?? null];
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
            . "{%- set x = {{$common}, 'br': a.brightness | default(none), 'cm': a.color_mode | default(none), 'scm': a.supported_color_modes | default([]), "
            . "'ctk': a.color_temp_kelvin | default(none), 'rgb': a.rgb_color | default(none), 'fx': a.effect | default(none), "
            . "'ckmin': a.min_color_temp_kelvin | default(none), 'ckmax': a.max_color_temp_kelvin | default(none), 'hs': a.hs_color | default(none), 'fxl': a.effect_list | default([])} -%}"
            . "{%- elif id.startswith('climate.') -%}"
            . "{%- set x = {{$common}, 'cur': a.current_temperature | default(none), 'target': a.temperature | default(none), 'min': a.min_temp | default(none), "
            . "'max': a.max_temp | default(none), 'step': a.target_temp_step | default(none), 'modes': a.hvac_modes | default([]), "
            . "'action': a.hvac_action | default(none), 'preset': a.preset_mode | default(none), 'hum': a.current_humidity | default(none), "
            . "'thum': a.humidity | default(none), 'tlo': a.target_temp_low | default(none), 'thi': a.target_temp_high | default(none), "
            . "'fm': a.fan_mode | default(none), 'sm': a.swing_mode | default(none), "
            . "'fml': a.fan_modes | default([]), 'pml': a.preset_modes | default([]), 'sml': a.swing_modes | default([]), 'hmin': a.min_humidity | default(none), 'hmax': a.max_humidity | default(none)} -%}"
            . "{%- elif id.startswith('cover.') -%}"
            . "{%- set x = {{$common}, 'pos': a.current_position | default(none), 'tilt': a.current_tilt_position | default(none)} -%}"
            . "{%- elif id.startswith('fan.') -%}"
            . "{%- set x = {{$common}, 'pct': a.percentage | default(none), 'pstep': a.percentage_step | default(none), 'preset': a.preset_mode | default(none), "
            . "'presets': a.preset_modes | default([]), 'osc': a.oscillating | default(none), 'dir': a.direction | default(none)} -%}"
            . "{%- elif id.startswith('media_player.') -%}"
            . "{%- set x = {{$common}, 'title': a.media_title | default(none), 'artist': a.media_artist | default(none), 'album': a.media_album_name | default(none), "
            . "'vol': a.volume_level | default(none), 'muted': a.is_volume_muted | default(none), 'source': a.source | default(none), "
            . "'sources': a.source_list | default([]), 'app': a.app_name | default(none), 'pic': a.entity_picture | default(none), "
            . "'mpos': a.media_position | default(none), 'mposu': ((a.media_position_updated_at | string) if a.media_position_updated_at is defined and a.media_position_updated_at is not none else none), "
            . "'mdur': a.media_duration | default(none), 'shuf': a.shuffle | default(none), 'rep': a.repeat | default(none), 'mct': a.media_content_type | default(none)} -%}"
            . "{%- elif id.startswith('lock.') -%}"
            . "{%- set x = {{$common}, 'cf': a.code_format | default(none), 'cb': a.changed_by | default(none)} -%}"
            . "{%- elif id.startswith('alarm_control_panel.') -%}"
            . "{%- set x = {{$common}, 'cf': a.code_format | default(none), 'car': a.code_arm_required | default(none), 'cb': a.changed_by | default(none)} -%}"
            . "{%- elif id.startswith('camera.') -%}"
            . "{%- set x = {{$common}, 'cst': a.frontend_stream_type | default(none)} -%}"
            . "{%- elif id.startswith('input_number.') or id.startswith('number.') -%}"
            . "{%- set x = {{$common}, 'nmin': a.min | default(none), 'nmax': a.max | default(none), 'nstep': a.step | default(none), 'nmode': a.mode | default(none)} -%}"
            . "{%- elif id.startswith('select.') or id.startswith('input_select.') -%}"
            . "{%- set x = {{$common}, 'opts': a.options | default([])} -%}"
            . "{%- elif id.startswith('image.') or id.startswith('person.') -%}"
            . "{%- set x = {{$common}, 'pic': a.entity_picture | default(none), 'src': a.source | default(none)} -%}"
            . "{%- elif id.startswith('humidifier.') -%}"
            . "{%- set x = {{$common}, 'hum': a.current_humidity | default(none), 'thum': a.humidity | default(none), 'hmin': a.min_humidity | default(none), "
            . "'hmax': a.max_humidity | default(none), 'hmode': a.mode | default(none), 'hmodes': a.available_modes | default([]), 'action': a.action | default(none)} -%}"
            . "{%- elif id.startswith('update.') -%}"
            . "{%- set x = {{$common}, 'iv': a.installed_version | default(none), 'lv': a.latest_version | default(none), 'ttl': a.title | default(none), "
            . "'rurl': a.release_url | default(none), 'inp': a.in_progress | default(none), 'upct': a.update_percentage | default(none)} -%}"
            . "{%- elif id.startswith('script.') -%}"
            . "{%- set x = {{$common}, 'lt': ((a.last_triggered | string) if a.last_triggered is defined and a.last_triggered is not none else none)} -%}"
            . "{%- elif id.startswith('weather.') -%}"
            . "{%- set x = {{$common}, 'wt': a.temperature | default(none), 'wtu': a.temperature_unit | default(none), 'wa': a.apparent_temperature | default(none), "
            . "'wh': a.humidity | default(none), 'ws': a.wind_speed | default(none), 'wsu': a.wind_speed_unit | default(none), 'wb': a.wind_bearing | default(none), "
            . "'wp': a.pressure | default(none), 'wpu': a.pressure_unit | default(none), 'wdp': a.dew_point | default(none), 'wuv': a.uv_index | default(none), "
            . "'wvis': a.visibility | default(none), 'wvu': a.visibility_unit | default(none), 'wcc': a.cloud_coverage | default(none), "
            . "'wpru': a.precipitation_unit | default(none)} -%}"
            . "{%- elif id.startswith('device_tracker.') -%}"
            . "{%- set x = {{$common}, 'stt': a.source_type | default(none), 'bat': a.battery_level | default(none)} -%}"
            . "{%- elif id.startswith('timer.') -%}"
            . "{%- set x = {{$common}, 'dur': (a.duration | string) if a.duration is defined and a.duration is not none else none, "
            . "'rem': (a.remaining | string) if a.remaining is defined and a.remaining is not none else none, "
            . "'fin': (a.finishes_at | string) if a.finishes_at is defined and a.finishes_at is not none else none} -%}"
            . "{%- elif id.startswith('vacuum.') -%}"
            . "{%- set x = {{$common}, 'bat': a.battery_level | default(none), 'fs': a.fan_speed | default(none), 'fsl': a.fan_speed_list | default([])} -%}"
            . "{%- elif id.startswith('lawn_mower.') -%}"
            . "{%- set x = {{$common}, 'bat': a.battery_level | default(none)} -%}"
            . "{%- elif id.startswith('sun.') -%}"
            . "{%- set x = {{$common}, 'nr': a.next_rising | default(none), 'ns': a.next_setting | default(none), 'nn': a.next_noon | default(none), "
            . "'el': a.elevation | default(none), 'ri': a.rising | default(none), 'az': a.azimuth | default(none), "
            . "'nd': a.next_dawn | default(none), 'nu': a.next_dusk | default(none), 'nm': a.next_midnight | default(none)} -%}"
            . "{%- else -%}{%- set x = {{$common}} -%}{%- endif -%}"
            . '{%- set ns.rows = ns.rows + [[id, s.state, s.last_changed.isoformat(), x, s.last_updated.isoformat(), '
            . '(s.last_reported.isoformat() if s.last_reported is defined and s.last_reported else none)]] -%}'
            . '{%- endif -%}{%- endfor -%}{{ ns.rows | tojson }}';
    }

    /** One entity in the shape every IniqDash widget binding understands. */
    public static function normalise(string $id, string $state, string $changed, array $x, ?string $updated = null, ?string $reported = null): array
    {
        $domain = explode('.', $id, 2)[0];
        $num = static fn ($v) => is_numeric($v) ? 0 + $v : null;
        // a timestamp HA reports (ISO 8601 / "2026-10-22 13:05:00+00:00"): kept only when it is a real date, never anything else
        $ts = static fn ($v) => is_string($v) && $v !== '' && strlen($v) <= 40 && strtotime($v) !== false ? $v : null;
        // short plain text an integration reports (a name, a mode…): no markup, bounded
        $txt = static fn ($v) => is_scalar($v) && !is_bool($v) && (string) $v !== '' ? mb_substr(str_replace(['<', '>'], '', (string) $v), 0, 60) : null;
        $e = [
            'id'        => $id,
            'domain'    => $domain,
            'name'      => is_string($x['name'] ?? null) && $x['name'] !== '' ? $x['name'] : $id,
            'state'     => $state,
            // scenes and buttons have no meaningful state ("unknown" until first used): only "unavailable" counts
            'available' => in_array($domain, self::STATELESS, true) ? strtolower($state) !== 'unavailable' : !in_array(strtolower($state), self::UNAVAILABLE, true),
            'unit'      => is_string($x['unit'] ?? null) ? $x['unit'] : null,
            'changed'   => $changed,
            // last_updated: the state OR an attribute changed; last_reported (HA 2024.3+): HA last received a report, even unchanged
            'updated'   => $ts($updated),
            'reported'  => $ts($reported),
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
                $rgb = is_array($x['rgb'] ?? null) && count($x['rgb']) === 3 && count(array_filter($x['rgb'], 'is_numeric')) === 3
                    ? array_map(static fn ($c) => max(0, min(255, (int) round((float) $c))), array_values($x['rgb'])) : null;
                $e['attrs'] += ['brightness_pct' => $br !== null ? (int) round($br / 255 * 100) : null, 'color_mode' => $x['cm'] ?? null, 'supported_color_modes' => $modes,
                    // what the light shows now (information only — IniqDash has no colour controls)
                    'color_temp_kelvin' => ($k = $num($x['ctk'] ?? null)) !== null ? (int) round($k) : null, 'rgb_color' => $rgb, 'effect' => $txt($x['fx'] ?? null),
                    // the colour-temperature range the light supports, and its current hue (colour modes) — what the colour controls are bounded by
                    'min_color_temp_kelvin' => ($k1 = $num($x['ckmin'] ?? null)) !== null ? (int) round($k1) : null, 'max_color_temp_kelvin' => ($k2 = $num($x['ckmax'] ?? null)) !== null ? (int) round($k2) : null,
                    'hue' => is_array($x['hs'] ?? null) && isset($x['hs'][0]) && is_numeric($x['hs'][0]) ? (int) round((float) $x['hs'][0]) % 360 : null];
                // what else HA reports (shown truthfully in Settings; IniqDash's Light has no controls for these yet):
                // colour temperature / colour / white come from the colour modes, effects from LightEntityFeature.EFFECT (4)
                // the effects HA lists (verbatim); an effect is only ever sent back when it is one of them
                $e['attrs']['effect_list'] = self::options($x['fxl'] ?? []);
                $e['caps'] = ['on_off' => true, 'brightness' => (bool) $dim, 'color_temp' => in_array('color_temp', $modes, true),
                    'color' => array_intersect($modes, ['hs', 'xy', 'rgb', 'rgbw', 'rgbww']) !== [], 'white' => in_array('white', $modes, true),
                    'effect' => ($f & 4) === 4 && $e['attrs']['effect_list'] !== []];
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
                    // information only (no controls for these): humidity, target humidity, low / high target range, fan and swing mode
                    'current_humidity' => $num($x['hum'] ?? null), 'target_humidity' => $num($x['thum'] ?? null),
                    'target_temp_low' => $num($x['tlo'] ?? null), 'target_temp_high' => $num($x['thi'] ?? null),
                    'fan_mode' => $txt($x['fm'] ?? null), 'swing_mode' => $txt($x['sm'] ?? null),
                    // the lists HA reports (verbatim; a mode is only ever sent back when it is one of them)
                    'fan_modes' => self::options($x['fml'] ?? []), 'preset_modes' => self::options($x['pml'] ?? []), 'swing_modes' => self::options($x['sml'] ?? []),
                    'min_humidity' => $num($x['hmin'] ?? null), 'max_humidity' => $num($x['hmax'] ?? null),
                ];
                // ClimateEntityFeature.TARGET_TEMPERATURE = 1 (a single set point)
                // ClimateEntityFeature: TARGET_TEMPERATURE_RANGE 2, TARGET_HUMIDITY 4, FAN_MODE 8, PRESET_MODE 16, SWING_MODE 32
                // (reported for Settings; IniqDash's Climate has no controls for these yet)
                $e['caps'] = ['target_temperature' => ($f & 1) === 1, 'hvac_modes' => $modes, 'target_range' => ($f & 2) === 2, 'target_humidity' => ($f & 4) === 4 && $num($x['hmin'] ?? null) !== null && $num($x['hmax'] ?? null) !== null && $num($x['hmax']) > $num($x['hmin']),
                    'fan_mode' => ($f & 8) === 8 && $e['attrs']['fan_modes'] !== [], 'preset_mode' => ($f & 16) === 16 && $e['attrs']['preset_modes'] !== [], 'swing_mode' => ($f & 32) === 32 && $e['attrs']['swing_modes'] !== []];
                break;
            case 'cover':
                // CoverEntityFeature: OPEN 1, CLOSE 2, SET_POSITION 4, STOP 8
                $pos = $num($x['pos'] ?? null);
                $e['attrs'] += ['position' => $pos !== null ? (int) round($pos) : null, 'tilt_position' => $num($x['tilt'] ?? null)];
                // tilt: OPEN_TILT 16, CLOSE_TILT 32, STOP_TILT 64, SET_TILT_POSITION 128 (reported only; no tilt controls yet)
                $e['caps'] = ['open' => ($f & 1) === 1, 'close' => ($f & 2) === 2, 'position' => ($f & 4) === 4, 'stop' => ($f & 8) === 8, 'tilt' => ($f & 240) !== 0];
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
                    'artwork' => $pic !== null ? 'api/ha_art.php?entity=' . rawurlencode($id) . '&v=' . substr(hash('sha256', $pic), 0, 12) . (self::$sim ? '&sim=1' : '') : null,
                    // playback position (s) as of position_updated_at, and the duration (s): the browser derives the progress from these
                    'position' => $num($x['mpos'] ?? null), 'position_updated_at' => $ts($x['mposu'] ?? null), 'duration' => $num($x['mdur'] ?? null),
                    'shuffle' => is_bool($x['shuf'] ?? null) ? $x['shuf'] : null, 'repeat' => in_array($x['rep'] ?? null, ['off', 'all', 'one'], true) ? $x['rep'] : null,
                    'content_type' => $txt($x['mct'] ?? null),
                ];
                $e['caps'] = ['play' => ($f & 16384) === 16384, 'pause' => ($f & 1) === 1, 'stop' => ($f & 4096) === 4096, 'previous' => ($f & 16) === 16, 'next' => ($f & 32) === 32,
                    'volume' => ($f & 4) === 4, 'mute' => ($f & 8) === 8, 'source' => ($f & 2048) === 2048 && $sources !== [],
                    // reported only (no IniqDash controls): SEEK 2, TURN_ON 128 / TURN_OFF 256, SHUFFLE_SET 32768, REPEAT_SET 262144
                    'seek' => ($f & 2) === 2, 'power' => ($f & 384) !== 0, 'shuffle' => ($f & 32768) === 32768, 'repeat' => ($f & 262144) === 262144];
                break;
            case 'camera':
                // the snapshot goes through IniqDash (api/ha_cam.php, server side with the token);
                // HA's own picture URL carries an access token and is never passed on
                $e['attrs'] += ['image' => 'api/ha_cam.php?entity=' . rawurlencode($id) . (self::$sim ? '&sim=1' : ''), 'stream_type' => is_string($x['cst'] ?? null) ? $x['cst'] : null];
                $e['caps'] = ['snapshot' => true, 'on_off' => ($f & 1) === 1, 'stream' => ($f & 2) === 2];
                break;
            case 'device_tracker':
                // a tracker's state is home / not_home / a zone name. Only how it tracks (a fixed list of source types) and its battery are
                // passed on — NEVER coordinates, accuracy, speed or any location history
                $bat = $num($x['bat'] ?? null);
                $e['attrs'] += ['source_type' => in_array($x['stt'] ?? null, ['gps', 'router', 'bluetooth', 'bluetooth_le'], true) ? $x['stt'] : null,
                    'battery' => $bat !== null && $bat >= 0 && $bat <= 100 ? (int) round($bat) : null];
                break;
            case 'timer':
                // the timer as HA reports it: its configured duration, the time left when paused, the moment it finishes while active (all optional)
                $e['attrs'] += ['duration' => self::hms($x['dur'] ?? null), 'remaining' => self::hms($x['rem'] ?? null), 'finishes_at' => $ts($x['fin'] ?? null)];
                $e['caps'] = ['start' => true, 'pause' => true, 'cancel' => true, 'finish' => true];
                break;
            case 'vacuum':
                // VacuumEntityFeature: PAUSE 4, STOP 8, RETURN_HOME 16, FAN_SPEED 32, LOCATE 512, CLEAN_SPOT 1024, START 8192
                // (the older TURN_ON / TURN_OFF / STATUS / BATTERY bits are not used: the battery is read from the attribute only when HA still reports it)
                $speeds = array_values(array_filter((array) ($x['fsl'] ?? []), static fn ($v) => is_string($v) && $v !== '' && strlen($v) <= 60));
                $bat = $num($x['bat'] ?? null);
                $e['attrs'] += ['battery' => $bat !== null && $bat >= 0 && $bat <= 100 ? (int) round($bat) : null, 'fan_speed' => is_string($x['fs'] ?? null) && $x['fs'] !== '' && strlen($x['fs']) <= 60 ? $x['fs'] : null, 'fan_speeds' => $speeds];
                $e['caps'] = ['start' => ($f & 8192) === 8192, 'pause' => ($f & 4) === 4, 'stop' => ($f & 8) === 8, 'dock' => ($f & 16) === 16, 'locate' => ($f & 512) === 512,
                    'spot' => ($f & 1024) === 1024, 'fan_speed' => ($f & 32) === 32 && $speeds !== []];
                break;
            case 'lawn_mower':
                // LawnMowerEntityFeature: START_MOWING 1, PAUSE 2, DOCK 4 (the mower reports no battery attribute: map a battery sensor in the widget)
                $bat = $num($x['bat'] ?? null);
                $e['attrs'] += ['battery' => $bat !== null && $bat >= 0 && $bat <= 100 ? (int) round($bat) : null];
                $e['caps'] = ['start' => ($f & 1) === 1, 'pause' => ($f & 2) === 2, 'dock' => ($f & 4) === 4];
                break;
            case 'sun':
                // the sun's next events as HA reports them (ISO 8601 timestamps with offset; the browser shows them in local time)
                $ts = static fn ($v) => is_string($v) && strlen($v) <= 40 && strtotime($v) !== false ? $v : null;
                $e['attrs'] += ['next_rising' => $ts($x['nr'] ?? null), 'next_setting' => $ts($x['ns'] ?? null), 'next_noon' => $ts($x['nn'] ?? null),
                    'elevation' => $num($x['el'] ?? null), 'rising' => is_bool($x['ri'] ?? null) ? $x['ri'] : null,
                    // where the sun is (degrees from north, clockwise) and the rest of its next events — all as HA reports them
                    'azimuth' => ($az = $num($x['az'] ?? null)) !== null && $az >= 0 && $az <= 360 ? $az : null,
                    'next_dawn' => $ts($x['nd'] ?? null), 'next_dusk' => $ts($x['nu'] ?? null), 'next_midnight' => $ts($x['nm'] ?? null)];
                break;
            case 'input_number':
            case 'number':
                // the entity's own range: a Gauge uses it as its automatic min / max; Number & Select sets a value inside it.
                // value: the state as a number (null when it is not one) — what an action's confirmation is compared with
                $min = $num($x['nmin'] ?? null); $max = $num($x['nmax'] ?? null); $step = $num($x['nstep'] ?? null);
                $e['attrs'] += ['min' => $min, 'max' => $max, 'step' => $step !== null && $step > 0 ? $step : null,
                    'mode' => in_array($x['nmode'] ?? null, ['auto', 'box', 'slider'], true) ? $x['nmode'] : null, 'value' => $num($state)];
                // set_value only inside a real range reported by HA (no range: nothing to validate against, so no control)
                $e['caps'] = ['set_value' => $min !== null && $max !== null && $max > $min];
                break;
            case 'select':
            case 'input_select':
                // the options exactly as HA reports them (an option is sent back verbatim: never cleaned, never truncated —
                // one that is too long or not text is left out rather than changed)
                $e['attrs'] += ['options' => self::options($x['opts'] ?? [])];
                $e['caps'] = ['select_option' => $e['attrs']['options'] !== []];
                break;
            case 'weather':
                // current conditions (HA serves the forecast through the weather.get_forecasts service, not as a state attribute: forecast())
                $e['attrs'] += ['temperature' => $num($x['wt'] ?? null), 'temperature_unit' => is_string($x['wtu'] ?? null) ? $x['wtu'] : null,
                    'apparent_temperature' => $num($x['wa'] ?? null), 'humidity' => $num($x['wh'] ?? null), 'wind_speed' => $num($x['ws'] ?? null),
                    'wind_speed_unit' => is_string($x['wsu'] ?? null) ? $x['wsu'] : null, 'wind_bearing' => $num($x['wb'] ?? null) ?? (is_string($x['wb'] ?? null) ? $x['wb'] : null),
                    // only what this weather entity reports (null otherwise)
                    'pressure' => $num($x['wp'] ?? null), 'pressure_unit' => $txt($x['wpu'] ?? null), 'dew_point' => $num($x['wdp'] ?? null), 'uv_index' => $num($x['wuv'] ?? null),
                    'visibility' => $num($x['wvis'] ?? null), 'visibility_unit' => $txt($x['wvu'] ?? null), 'cloud_coverage' => $num($x['wcc'] ?? null),
                    'precipitation_unit' => $txt($x['wpru'] ?? null)];
                // WeatherEntityFeature: FORECAST_DAILY 1, FORECAST_HOURLY 2, FORECAST_TWICE_DAILY 4 — which forecasts this entity serves
                // (through weather.get_forecasts, see forecast()); nothing else is offered
                $e['caps'] = ['forecast_daily' => ($f & 1) === 1, 'forecast_hourly' => ($f & 2) === 2, 'forecast_twice_daily' => ($f & 4) === 4];
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
                $e['attrs'] += ['image' => $pic !== null ? 'api/ha_img.php?entity=' . rawurlencode($id) . '&v=' . substr(hash('sha256', $ver), 0, 12) . (self::$sim ? '&sim=1' : '') : null];
                if ($domain === 'person') {
                    // the tracker HA uses now (an entity id: kept for Entity Details later) — never coordinates, accuracy or user_id
                    $src = $x['src'] ?? null;
                    $e['attrs']['source'] = is_string($src) && self::validId($src) ? $src : null;
                }
                break;
            case 'script':
                $e['attrs'] += ['last_triggered' => $ts($x['lt'] ?? null)];
                break;
            case 'humidifier':
                // HumidifierEntityFeature: MODES 1. A target humidity is always settable, inside the entity's own min / max (HA's defaults 0–100).
                $hm = array_values(array_filter((array) ($x['hmodes'] ?? []), static fn ($m) => is_string($m) && $m !== '' && strlen($m) <= 60));
                $e['attrs'] += ['current_humidity' => $num($x['hum'] ?? null), 'target_humidity' => $num($x['thum'] ?? null), 'min_humidity' => $num($x['hmin'] ?? null) ?? 0,
                    'max_humidity' => $num($x['hmax'] ?? null) ?? 100, 'mode' => $txt($x['hmode'] ?? null), 'available_modes' => array_slice($hm, 0, 20), 'action' => $txt($x['action'] ?? null)];
                $e['caps'] = ['on_off' => true, 'set_humidity' => true, 'modes' => ($f & 1) === 1 && $hm !== []];
                break;
            case 'update':
                // UpdateEntityFeature: INSTALL 1, SPECIFIC_VERSION 2, PROGRESS 4, BACKUP 8, RELEASE_NOTES 16. "on" = an update is available.
                $url = is_string($x['rurl'] ?? null) && preg_match('#^https://[^\s"\'<>]{1,400}$#', $x['rurl']) ? $x['rurl'] : null;
                $e['attrs'] += ['installed_version' => $txt($x['iv'] ?? null), 'latest_version' => $txt($x['lv'] ?? null), 'title' => $txt($x['ttl'] ?? null), 'release_url' => $url,
                    'in_progress' => ($x['inp'] ?? null) === true, 'update_percentage' => $num($x['upct'] ?? null)];
                $e['caps'] = ['install' => ($f & 1) === 1, 'backup' => ($f & 8) === 8];
                break;
            case 'todo':
                // the state is the number of items still to do; the items themselves: todo.get_items (HaService::todoItems)
                // TodoListEntityFeature: CREATE_TODO_ITEM 1, DELETE 2, UPDATE_TODO_ITEM 4
                $e['caps'] = ['add' => ($f & 1) === 1, 'update' => ($f & 4) === 4];
                break;
            case 'lock':
                // LockEntityFeature: OPEN 1. A code is needed when HA reports a code format.
                // changed_by: only what the integration reports (e.g. a keypad / user label) — never a code
                $e['attrs'] += ['code' => self::codeKind($x['cf'] ?? null), 'changed_by' => $txt($x['cb'] ?? null)];
                $e['caps'] = ['lock' => true, 'unlock' => true, 'open' => ($f & 1) === 1];
                break;
            case 'alarm_control_panel':
                // AlarmControlPanelEntityFeature: ARM_HOME 1, ARM_AWAY 2, ARM_NIGHT 4, TRIGGER 8, ARM_CUSTOM_BYPASS 16, ARM_VACATION 32
                $code = self::codeKind($x['cf'] ?? null);
                $e['attrs'] += ['code' => $code, 'code_to_arm' => $code !== null && ($x['car'] ?? true) !== false, 'code_to_disarm' => $code !== null,
                    'changed_by' => $txt($x['cb'] ?? null)];
                $e['caps'] = ['disarm' => true, 'arm_home' => ($f & 1) === 1, 'arm_away' => ($f & 2) === 2, 'arm_night' => ($f & 4) === 4,
                    'arm_vacation' => ($f & 32) === 32, 'arm_custom_bypass' => ($f & 16) === 16, 'alarm_trigger' => ($f & 8) === 8];   // trigger: reported only
                break;
        }
        if (isset(self::TRIGGER[$domain])) {
            $e['caps']['trigger'] = true;
        }
        return $e;
    }

    /** "0:05:00" / "1:02:03.5" → seconds (null when it is not a duration) */
    public static function hms(mixed $v): ?float
    {
        if (!is_string($v) || !preg_match('/^(?:(\d+) days?, )?(\d{1,3}):(\d{2}):(\d{2})(?:\.(\d+))?$/', trim($v), $m)) {
            return null;
        }
        return (float) ((int) ($m[1] ?: 0) * 86400 + (int) $m[2] * 3600 + (int) $m[3] * 60 + (int) $m[4] + ($m[5] ?? '' ? (float) ('0.' . $m[5]) : 0));
    }

    /** at most this many select options are passed on (and accepted back) */
    public const OPTIONS_MAX = 200;

    /** a select entity's options: distinct strings of 1–255 characters, in HA's order, at most OPTIONS_MAX */
    private static function options(mixed $list): array
    {
        $out = [];
        foreach (is_array($list) ? $list : [] as $o) {
            if (is_string($o) && $o !== '' && strlen($o) <= 255 && !in_array($o, $out, true)) {
                $out[] = $o;
            }
        }
        return array_slice($out, 0, self::OPTIONS_MAX);
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

    /** history kinds: a numeric series (time buckets) or a state timeline (merged state periods) */
    public const HISTORY_KINDS = ['numeric', 'states'];
    /** state periods returned per entity at most (the most recent ones; older ones are reported as not shown) */
    public const STATE_MAX = 400;
    /** entities per batch request */
    public const HISTORY_BATCH_MAX = 40;

    /**
     * History of ONE entity — the same path as histories() (kept for api/ha_history.php?entity=…).
     * @return array{connected:bool, error:?string, status?:int, ...}
     */
    public function history(string $id, string $range, string $kind = 'numeric'): array
    {
        $r = $this->histories([$id], $range, $kind);
        if ($r['error'] !== null && !isset($r['results'][$id])) {
            return ['connected' => $r['connected'], 'error' => $r['error'], 'status' => $r['status'] ?? 502];
        }
        $one = $r['results'][$id] ?? ['connected' => true, 'error' => 'bad_entity'];
        if ($one['error'] !== null) {
            $one['status'] = in_array($one['error'], ['not_numeric', 'bad_range', 'bad_entity', 'bad_kind'], true) ? 400 : 502;
        }
        return $one;
    }

    /**
     * History of SEVERAL entities from Home Assistant's own recorder in ONE request
     * (GET /api/history/period/<start>?filter_entity_id=a,b,c&end_time=…&minimal_response&no_attributes).
     * IniqDash stores nothing: each entity's answer is reduced (numeric: time buckets; states: merged state periods) and
     * kept for a short time in the private cache folder (per entity + range + kind), so Chart, Sensor and — later — Entity
     * Details share it and several screens do not repeat the request. Only entities missing from that cache are fetched.
     * A period without a usable value (unavailable / unknown / before the entity existed) stays a gap — never invented.
     * @return array{connected:bool, error:?string, status?:int, results: array<string, array>}
     */
    public function histories(array $ids, string $range, string $kind = 'numeric'): array
    {
        if (!in_array($kind, self::HISTORY_KINDS, true)) {
            return ['connected' => true, 'error' => 'bad_kind', 'status' => 400, 'results' => []];
        }
        if (!isset(self::HISTORY[$range])) {
            return ['connected' => true, 'error' => 'bad_range', 'status' => 400, 'results' => []];
        }
        [$span, $count, $ttl] = self::HISTORY[$range];
        $results = [];
        $miss = [];
        foreach (array_slice(array_values(array_unique(array_filter($ids, 'is_string'))), 0, self::HISTORY_BATCH_MAX) as $id) {
            if (!self::validId($id)) {
                $results[$id] = ['connected' => true, 'error' => 'bad_entity'];
                continue;
            }
            if ($kind === 'numeric' && !in_array(explode('.', $id, 2)[0], self::NUMERIC, true)) {
                $results[$id] = ['connected' => true, 'error' => 'not_numeric'];
                continue;
            }
            $c = self::historyCache($id, $range, $kind, $ttl);
            if ($c !== null) {
                $results[$id] = $c + ['cached' => true];
            } else {
                $miss[] = $id;
            }
        }
        if ($miss === []) {
            return ['connected' => true, 'error' => null, 'results' => $results];
        }
        $end = time();
        $start = $end - $span;
        $fetch = function (array $list) use ($start, $end): array {
            $path = '/api/history/period/' . rawurlencode(gmdate('Y-m-d\TH:i:s\Z', $start))
                . '?filter_entity_id=' . rawurlencode(implode(',', $list)) . '&end_time=' . rawurlencode(gmdate('Y-m-d\TH:i:s\Z', $end))
                . '&minimal_response&no_attributes';
            return $this->client->request('GET', $path, null, 20, self::HISTORY_MAX_BYTES);
        };
        $r = $fetch($miss);
        $byId = [];
        if ($r['error'] === 'too_large' && count($miss) > 1) {
            // a very busy set of entities: one request each, so one chatty entity cannot take the others down with it
            foreach ($miss as $id) {
                $one = $fetch([$id]);
                if ($one['error'] !== null || !is_array($one['body'])) {
                    $e = $one['error'] ?? 'http';
                    $results[$id] = ['connected' => !in_array($e, ['unreachable', 'timeout', 'auth'], true), 'error' => $e === 'too_large' ? 'too_much_history' : $e];
                    continue;
                }
                $byId += self::historyRows($one['body']);
            }
        } elseif ($r['error'] !== null || !is_array($r['body'])) {
            $e = $r['error'] ?? 'http';
            $conn = !in_array($e, ['unreachable', 'timeout', 'auth'], true);
            foreach ($miss as $id) {
                $results[$id] = ['connected' => $conn, 'error' => $e === 'too_large' ? 'too_much_history' : $e];
            }
            return ['connected' => $conn, 'error' => $e === 'too_large' ? 'too_much_history' : $e, 'status' => 502, 'results' => $results];
        } else {
            $byId = self::historyRows($r['body']);
        }
        unset($r);
        foreach ($miss as $id) {
            if (isset($results[$id])) {
                continue;
            }
            $rows = $byId[$id] ?? [];                     // absent: no recorded state in the period → no history (not an error)
            $red = $kind === 'numeric' ? self::buckets($rows, $start, $end, $count) : self::segments($rows, $start, $end);
            $out = $red + ['connected' => true, 'error' => null, 'entity' => $id, 'range' => $range, 'kind' => $kind, 'refresh' => $ttl, 'fetched' => gmdate('c', $end)];
            $f = self::historyCacheFile($id, $range, $kind);
            if ($f !== null) {
                @file_put_contents($f, json_encode($out, JSON_UNESCAPED_SLASHES), LOCK_EX);
            }
            $results[$id] = $out;
        }
        return ['connected' => true, 'error' => null, 'results' => $results];
    }

    /* ------------------------------------------------------------------ long-term statistics */

    /** Periods: HA's recorder period, the span shown (s), cache time (s). 'year' = HA's monthly statistics, summed per year (change only). */
    public const STAT_PERIODS = [
        'hour'  => ['hour', 172800, 300],          // the last 48 hours, hourly
        'day'   => ['day', 2592000, 900],          // the last 30 days, daily
        'week'  => ['week', 7257600, 1800],        // the last 12 weeks
        'month' => ['month', 31622400, 3600],      // the last 12 months
        'year'  => ['month', 157852800, 3600],     // the last 5 years (monthly, summed per year)
    ];
    public const STAT_BATCH_MAX = 10;

    /**
     * Home Assistant's LONG-TERM STATISTICS for a few entities (recorder/get_statistics_metadata + recorder/statistics_during_period over
     * the WebSocket API — read-only). Nothing is calculated here but a sum of HA's own per-month changes for 'year'. Each entity answers
     * with what HA keeps for it: { unit, hasSum (a total — e.g. kWh, m³: its CHANGE per period is the consumption), hasMean (a measurement
     * — e.g. W, °C: its MEAN / MIN / MAX per period), points: [[startMs, change|null, mean|null, min|null, max|null]…] } — or the error
     * 'no_statistics' (HA keeps none: the entity has no state class). A period HA has no row for is a GAP (null), never zero.
     * @return array{connected:bool, error:?string, status?:int, results: array<string, array>}
     */
    public function statistics(array $ids, string $period): array
    {
        if (!isset(self::STAT_PERIODS[$period])) {
            return ['connected' => true, 'error' => 'bad_period', 'status' => 400, 'results' => []];
        }
        [$haPeriod, $span, $ttl] = self::STAT_PERIODS[$period];
        $ids = array_slice(array_values(array_unique(array_filter($ids, static fn ($x) => is_string($x) && self::validId($x)))), 0, self::STAT_BATCH_MAX);
        if ($ids === []) {
            return ['connected' => true, 'error' => 'bad_entity', 'status' => 400, 'results' => []];
        }
        $f = IQ_VAR === null ? null : self::cacheDir() . '/ha_stat_' . substr(hash('sha256', implode(',', $ids) . '|' . $period), 0, 20) . '.json';
        if ($f !== null && is_file($f) && intdiv((int) filemtime($f), $ttl) === intdiv(time(), $ttl)) {
            $c = json_decode((string) file_get_contents($f), true);
            if (is_array($c)) {
                return $c + ['cached' => true];
            }
        }
        $end = time();
        // whole periods: from the start of the first period shown (local server time is not known — HA aligns its own buckets)
        $start = $end - $span;
        $r = $this->client->ws([
            ['type' => 'recorder/get_statistics_metadata', 'statistic_ids' => $ids],
            ['type' => 'recorder/statistics_during_period', 'start_time' => gmdate('Y-m-d\TH:i:s\Z', $start), 'end_time' => gmdate('Y-m-d\TH:i:s\Z', $end),
                'statistic_ids' => $ids, 'period' => $haPeriod, 'types' => ['change', 'mean', 'min', 'max']],
        ]);
        if ($r['error'] !== null || count($r['results']) < 2) {
            $e = $r['error'] ?? 'protocol';
            return ['connected' => !in_array($e, ['unreachable', 'timeout', 'auth'], true), 'error' => $e, 'status' => 502, 'results' => []];
        }
        [$metaR, $dataR] = $r['results'];
        if (!$metaR['success'] || !$dataR['success']) {
            return ['connected' => true, 'error' => 'ha_refused', 'status' => 502, 'results' => []];
        }
        $meta = [];
        foreach ((array) $metaR['result'] as $m) {
            if (is_array($m) && is_string($m['statistic_id'] ?? null)) {
                $meta[$m['statistic_id']] = $m;
            }
        }
        $data = is_array($dataR['result']) ? $dataR['result'] : [];
        $num = static fn ($v) => is_int($v) || is_float($v) ? (float) $v : null;
        $ms = static function ($v): ?int {
            if (is_int($v) || is_float($v)) {
                return (int) ($v > 1e11 ? $v : $v * 1000);          // HA sends ms (recent versions) or s
            }
            $t = is_string($v) ? strtotime($v) : false;
            return $t === false ? null : $t * 1000;
        };
        $results = [];
        foreach ($ids as $id) {
            if (!isset($meta[$id])) {
                $results[$id] = ['error' => 'no_statistics', 'entity' => $id];
                continue;
            }
            $m = $meta[$id];
            $hasSum = (bool) ($m['has_sum'] ?? false);
            $hasMean = (bool) ($m['has_mean'] ?? false) || in_array($m['mean_type'] ?? 0, [1, 2], true);
            $pts = [];
            foreach ((array) ($data[$id] ?? []) as $row) {
                if (!is_array($row) || ($t = $ms($row['start'] ?? null)) === null) {
                    continue;
                }
                $pts[] = [$t, $hasSum ? $num($row['change'] ?? null) : null, $hasMean ? $num($row['mean'] ?? null) : null, $hasMean ? $num($row['min'] ?? null) : null, $hasMean ? $num($row['max'] ?? null) : null];
            }
            usort($pts, static fn ($a, $b) => $a[0] <=> $b[0]);
            if ($period === 'year') {
                // HA keeps no yearly period: the year's change is the sum of ITS months' changes (a month HA has no row for adds nothing)
                $years = [];
                foreach ($pts as $p) {
                    $y = (int) gmdate('Y', intdiv($p[0], 1000) + 43200);
                    $years[$y] ??= [gmmktime(0, 0, 0, 1, 1, $y) * 1000, null, null, null, null];
                    if ($p[1] !== null) {
                        $years[$y][1] = ($years[$y][1] ?? 0.0) + $p[1];
                    }
                }
                ksort($years);
                $pts = array_values($years);
            }
            $results[$id] = ['error' => null, 'entity' => $id, 'unit' => is_string($m['statistics_unit_of_measurement'] ?? null) ? $m['statistics_unit_of_measurement'] : '',
                'hasSum' => $hasSum, 'hasMean' => $hasMean && $period !== 'year', 'name' => is_string($m['name'] ?? null) ? $m['name'] : null, 'points' => $pts];
        }
        $out = ['connected' => true, 'error' => null, 'period' => $period, 'start' => $start * 1000, 'end' => $end * 1000, 'refresh' => $ttl, 'results' => $results];
        if ($f !== null) {
            @file_put_contents($f, json_encode($out, JSON_UNESCAPED_SLASHES), LOCK_EX);
        }
        return $out;
    }

    /** HA answers one list per entity; with minimal_response only the first row of each list names its entity */
    private static function historyRows(array $body): array
    {
        $out = [];
        foreach ($body as $list) {
            if (is_array($list) && is_array($list[0] ?? null) && is_string($list[0]['entity_id'] ?? null)) {
                $out[$list[0]['entity_id']] = $list;
            }
        }
        return $out;
    }

    /** numeric keeps its earlier cache name (id|range), so existing caches and Chart stay compatible */
    private static function historyCacheFile(string $id, string $range, string $kind): ?string
    {
        if (IQ_VAR === null) {
            return null;
        }
        return self::cacheDir() . '/ha_hist_' . substr(hash('sha256', $id . '|' . $range . ($kind === 'numeric' ? '' : '|' . $kind)), 0, 20) . '.json';
    }

    private static function historyCache(string $id, string $range, string $kind, int $ttl): ?array
    {
        $f = self::historyCacheFile($id, $range, $kind);
        // valid within the same clock window of $ttl seconds (aligned windows: every request in one window shares one answer,
        // and the first request of the next window fetches fresh history — never more than one window old)
        if ($f === null || !is_file($f) || intdiv((int) filemtime($f), $ttl) !== intdiv(time(), $ttl)) {
            return null;
        }
        $c = json_decode((string) file_get_contents($f), true);
        return is_array($c) ? $c : null;
    }

    /**
     * Reduce HA's state changes to a STATE TIMELINE: [[start ms, state]…], consecutive identical states merged, every real
     * change kept. A state holds until the next change (that is what HA's recorder means). 'unavailable' / 'unknown' are
     * kept as they are (a presentation shows them as gaps, never as a normal state). At most STATE_MAX periods (the most
     * recent); 'from' then says where the returned timeline begins.
     */
    public static function segments(array $rows, int $start, int $end): array
    {
        $seg = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $t = strtotime((string) ($row['last_changed'] ?? $row['last_updated'] ?? ''));
            $st = $row['state'] ?? null;
            if ($t === false || !is_scalar($st)) {
                continue;
            }
            $seg[] = [max($start, min($end, $t)), mb_substr(str_replace(['<', '>'], '', (string) $st), 0, 60)];
        }
        usort($seg, static fn ($a, $b) => $a[0] <=> $b[0]);
        $out = [];
        foreach ($seg as [$t, $st]) {
            $n = count($out);
            if ($n && $out[$n - 1][1] === $st) {
                continue;                                  // same state reported again: no change
            }
            if ($n && $out[$n - 1][0] === $t * 1000) {
                $out[$n - 1][1] = $st;                     // two reports at the same instant: the later one counts
                if ($n > 1 && $out[$n - 2][1] === $st) {
                    array_pop($out);
                }
                continue;
            }
            $out[] = [$t * 1000, $st];
        }
        $changes = max(0, count($out) - 1);
        $truncated = count($out) > self::STATE_MAX;
        if ($truncated) {
            $out = array_slice($out, -self::STATE_MAX);
        }
        return ['start' => $start * 1000, 'end' => $end * 1000, 'from' => $out[0][0] ?? $end * 1000, 'segments' => $out,
            'changes' => $changes, 'truncated' => $truncated, 'last' => $out ? $out[count($out) - 1][1] : null];
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

    /** decimal places of a number (0.01 → 2, 5 → 0, -0.5 → 1, 2.5e-3 → 4), at most 10 */
    private static function decimals(float $x): int
    {
        $x = abs($x);
        for ($d = 0; $d < 10; $d++) {
            if (abs($x * 10 ** $d - round($x * 10 ** $d)) < 1e-7) {
                return $d;
            }
        }
        return 10;
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
        if ($d === 'light' && $action === 'color_temp') {
            // colour temperature in kelvin, only inside the range the light reports (no range, no control)
            $a = $e['attrs'];
            $lo = $a['min_color_temp_kelvin'] ?? null;
            $hi = $a['max_color_temp_kelvin'] ?? null;
            if (empty($caps['color_temp']) || $lo === null || $hi === null || $hi <= $lo) {
                return ['error' => 'not_supported'];
            }
            if (!is_numeric($value) || $value < $lo || $value > $hi) {
                return ['error' => 'out_of_range'];
            }
            return ['domain' => 'light', 'service' => 'turn_on', 'data' => ['color_temp_kelvin' => (int) round((float) $value)], 'expect' => ['state' => 'on']];
        }
        if ($d === 'light' && $action === 'effect') {
            // only one of the effects the light lists now, exactly as listed
            if (empty($caps['effect']) || !is_string($value) || !in_array($value, $e['attrs']['effect_list'] ?? [], true)) {
                return ['error' => 'not_supported'];
            }
            return ['domain' => 'light', 'service' => 'turn_on', 'data' => ['effect' => $value], 'expect' => ['state' => 'on']];
        }
        if ($d === 'light' && $action === 'hue') {
            // a hue (0–359) at full saturation: only for a light with a colour mode
            if (empty($caps['color'])) {
                return ['error' => 'not_supported'];
            }
            if (!is_numeric($value) || $value < 0 || $value > 360) {
                return ['error' => 'out_of_range'];
            }
            return ['domain' => 'light', 'service' => 'turn_on', 'data' => ['hs_color' => [(int) round((float) $value) % 360, 100]], 'expect' => ['state' => 'on']];
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
        if ($d === 'climate' && in_array($action, ['turn_on', 'turn_off', 'toggle'], true)) {
            // HA's climate.turn_on / turn_off (on: the entity's own last mode); toggle by the current state
            $on = $action === 'toggle' ? ($e['state'] === 'off') : $action === 'turn_on';
            return ['domain' => 'climate', 'service' => $on ? 'turn_on' : 'turn_off', 'data' => [], 'expect' => $on ? [] : ['state' => 'off']];
        }
        if ($d === 'climate' && $action === 'set_hvac_mode') {
            if (!is_string($value) || !in_array($value, $caps['hvac_modes'] ?? [], true)) {
                return ['error' => 'not_supported'];
            }
            return ['domain' => 'climate', 'service' => 'set_hvac_mode', 'data' => ['hvac_mode' => $value], 'expect' => ['state' => $value]];
        }
        if ($d === 'climate' && $action === 'set_swing_mode') {
            if (empty($caps['swing_mode']) || !is_string($value) || !in_array($value, $e['attrs']['swing_modes'] ?? [], true)) {
                return ['error' => 'not_supported'];
            }
            return ['domain' => 'climate', 'service' => 'set_swing_mode', 'data' => ['swing_mode' => $value], 'expect' => strlen($value) <= 60 ? ['swing_mode' => $value] : []];
        }
        if ($d === 'climate' && $action === 'set_humidity') {
            // only inside the range the entity reports (no range, no control), whole percent
            $a = $e['attrs'];
            if (empty($caps['target_humidity']) || !isset($a['min_humidity'], $a['max_humidity'])) {
                return ['error' => 'not_supported'];
            }
            if (!is_numeric($value) || $value < $a['min_humidity'] || $value > $a['max_humidity']) {
                return ['error' => 'out_of_range'];
            }
            $h = (int) round((float) $value);
            return ['domain' => 'climate', 'service' => 'set_humidity', 'data' => ['humidity' => $h], 'expect' => ['target_humidity' => $h]];
        }
        if ($d === 'climate' && $action === 'set_temperature_range') {
            // "low:high" (two numbers): each inside the entity's own min / max, on its step, low strictly below high
            if (empty($caps['target_range'])) {
                return ['error' => 'not_supported'];
            }
            if (!is_string($value) || !preg_match('/^(-?\d{1,3}(?:\.\d{1,3})?):(-?\d{1,3}(?:\.\d{1,3})?)$/', $value, $m)) {
                return ['error' => 'bad_value'];
            }
            $a = $e['attrs'];
            $min = $a['min_temp'] ?? 5;
            $max = $a['max_temp'] ?? 35;
            $step = ($a['target_temp_step'] ?? 0) > 0 ? $a['target_temp_step'] : 0.5;
            [$lo, $hi] = [(float) $m[1], (float) $m[2]];
            if ($lo < $min || $hi > $max || $lo >= $hi) {
                return ['error' => 'out_of_range'];
            }
            $lo = round(round($lo / $step) * $step, 2);
            $hi = round(round($hi / $step) * $step, 2);
            if ($lo >= $hi) {
                return ['error' => 'out_of_range'];
            }
            return ['domain' => 'climate', 'service' => 'set_temperature', 'data' => ['target_temp_low' => $lo, 'target_temp_high' => $hi], 'expect' => ['target_temp_low' => $lo, 'target_temp_high' => $hi]];
        }
        if ($d === 'climate' && in_array($action, ['set_preset_mode', 'set_fan_mode'], true)) {
            // only one of the modes HA reports for this entity now, exactly as reported
            $key = $action === 'set_preset_mode' ? 'preset_mode' : 'fan_mode';
            if (empty($caps[$key]) || !is_string($value) || !in_array($value, $e['attrs'][$key . 's'] ?? [], true)) {
                return ['error' => 'not_supported'];
            }
            return ['domain' => 'climate', 'service' => $action, 'data' => [$key => $value], 'expect' => strlen($value) <= 60 ? [$key => $value] : []];
        }
        if (in_array($d, ['number', 'input_number'], true) && $action === 'set_value') {
            // a value inside the entity's own range (as HA reports it now), on its own step grid — never a free service call
            if (empty($caps['set_value'])) {
                return ['error' => 'not_supported'];
            }
            if (!is_int($value) && !is_float($value) && !(is_string($value) && is_numeric($value) && strlen($value) <= 32)) {
                return ['error' => 'bad_value'];
            }
            $a = $e['attrs'];
            $v = (float) $value;
            $min = (float) $a['min']; $max = (float) $a['max']; $step = $a['step'] !== null ? (float) $a['step'] : null;
            $eps = max(1e-9, ($max - $min) * 1e-9);
            if (!is_finite($v) || $v < $min - $eps || $v > $max + $eps) {
                return ['error' => 'out_of_range'];
            }
            if ($step !== null) {
                $dec = max(self::decimals($step), self::decimals($min));   // the grid starts at min (0.5, 1.5, 2.5 …)
                $snap = round($min + round(($v - $min) / $step) * $step, $dec);
                if (abs($snap - $v) > $step * 1e-6) {
                    return ['error' => 'off_step'];
                }
                $v = $snap;
            }
            $v = max($min, min($max, $v));
            $v = $v == floor($v) && abs($v) < 1e15 ? (int) $v : $v;
            return ['domain' => $d, 'service' => 'set_value', 'data' => ['value' => $v], 'expect' => ['value' => $v]];
        }
        if (in_array($d, ['select', 'input_select'], true) && $action === 'select_option') {
            // only one of the options HA reports for this entity now, exactly as reported
            if (empty($caps['select_option'])) {
                return ['error' => 'not_supported'];
            }
            if (!is_string($value) || !in_array($value, $e['attrs']['options'] ?? [], true)) {
                return ['error' => 'not_an_option'];
            }
            return ['domain' => $d, 'service' => 'select_option', 'data' => ['option' => $value], 'expect' => ['state' => $value]];
        }
        if ($d === 'humidifier') {
            // on / off; a target inside the entity's own range (whole percent); a mode only from the entity's own list
            if (in_array($action, ['turn_on', 'turn_off', 'toggle'], true)) {
                $on = $action === 'toggle' ? $e['state'] !== 'on' : $action === 'turn_on';
                return ['domain' => 'humidifier', 'service' => $on ? 'turn_on' : 'turn_off', 'data' => [], 'expect' => ['state' => $on ? 'on' : 'off']];
            }
            if ($action === 'set_humidity') {
                $a = $e['attrs'];
                if (!is_numeric($value) || $value < $a['min_humidity'] || $value > $a['max_humidity']) {
                    return ['error' => 'out_of_range'];
                }
                $h = (int) round((float) $value);
                return ['domain' => 'humidifier', 'service' => 'set_humidity', 'data' => ['humidity' => $h], 'expect' => ['target_humidity' => $h]];
            }
            if ($action === 'set_mode') {
                if (empty($caps['modes']) || !is_string($value) || !in_array($value, $e['attrs']['available_modes'] ?? [], true)) {
                    return ['error' => 'not_supported'];
                }
                return ['domain' => 'humidifier', 'service' => 'set_mode', 'data' => ['mode' => $value], 'expect' => ['mode' => $value]];
            }
            return ['error' => 'not_supported'];
        }
        if ($d === 'update' && $action === 'install') {
            // only an update that is available (state on), that the integration can install, not already installing;
            // a backup first only when the integration supports it ($value === 'backup')
            if (empty($caps['install']) || $e['state'] !== 'on' || !empty($e['attrs']['in_progress'])) {
                return ['error' => 'not_supported'];
            }
            $backup = $value === 'backup' && !empty($caps['backup']);
            return ['domain' => 'update', 'service' => 'install', 'data' => $backup ? ['backup' => true] : [], 'expect' => []];
        }
        if ($d === 'todo' && in_array($action, ['add_item', 'complete_item', 'reopen_item'], true)) {
            // an item's text: plain, ≤ 200 characters; complete / reopen name an item by its uid (as todo.get_items returned it)
            if (!is_string($value) || trim($value) === '' || mb_strlen($value) > 200 || preg_match('/[<>]/', $value)) {
                return ['error' => 'bad_value'];
            }
            if ($action === 'add_item') {
                return empty($caps['add']) ? ['error' => 'not_supported'] : ['domain' => 'todo', 'service' => 'add_item', 'data' => ['item' => trim($value)], 'expect' => []];
            }
            if (empty($caps['update']) || !preg_match('/^[A-Za-z0-9_.:-]{1,120}$/', $value)) {
                return ['error' => empty($caps['update']) ? 'not_supported' : 'bad_value'];
            }
            return ['domain' => 'todo', 'service' => 'update_item', 'data' => ['item' => $value, 'status' => $action === 'complete_item' ? 'completed' : 'needs_action'], 'expect' => []];
        }
        if ($action === 'trigger' && isset(self::TRIGGER[$d])) {
            // Button / Action widgets: one simple, fixed action per domain — never a free service call
            // a toggle opens a closed cover and closes an open one: it needs both (a cover without either cannot toggle)
            if ($d === 'cover' && (empty($caps['open']) || empty($caps['close']))) {
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
        if ($d === 'timer' && in_array($action, ['start', 'pause', 'cancel', 'finish'], true)) {
            // Timer widget: fixed services; start uses the timer's own configured duration (or resumes a paused one) — no free durations
            return ['domain' => 'timer', 'service' => $action, 'data' => [], 'expect' => []];
        }
        if ($d === 'vacuum' || $d === 'lawn_mower') {
            // Robot widget: fixed, simple services per domain, each only when the entity's own feature bit allows it
            $map = $d === 'vacuum'
                ? ['start' => 'start', 'pause' => 'pause', 'stop' => 'stop', 'dock' => 'return_to_base', 'locate' => 'locate', 'spot' => 'clean_spot']
                : ['start' => 'start_mowing', 'pause' => 'pause', 'dock' => 'dock'];
            if (isset($map[$action])) {
                return empty($caps[$action]) ? ['error' => 'not_supported'] : ['domain' => $d, 'service' => $map[$action], 'data' => [], 'expect' => []];
            }
            if ($d === 'vacuum' && $action === 'fan_speed') {
                if (empty($caps['fan_speed']) || !is_string($value) || !in_array($value, $e['attrs']['fan_speeds'] ?? [], true)) {
                    return ['error' => 'not_supported'];
                }
                return ['domain' => 'vacuum', 'service' => 'set_fan_speed', 'data' => ['fan_speed' => $value], 'expect' => ['fan_speed' => $value]];
            }
        }
        if ($d === 'media_player') {
            $simple = ['play' => ['play', 'media_play', 'playing'], 'stop' => ['stop', 'media_stop', null], 'previous' => ['previous', 'media_previous_track', null], 'next' => ['next', 'media_next_track', null]];
            if (isset($simple[$action])) {
                [$cap, $svc, $st] = $simple[$action];
                return empty($caps[$cap]) ? ['error' => 'not_supported'] : ['domain' => 'media_player', 'service' => $svc, 'data' => [], 'expect' => $st ? ['state' => $st] : []];
            }
            if ($action === 'play_pause') {   // one button: playing → pause, otherwise play
                $action = ($e['state'] ?? '') === 'playing' ? 'pause' : 'play';
                if ($action === 'play') {
                    return empty($caps['play']) ? ['error' => 'not_supported'] : ['domain' => 'media_player', 'service' => 'media_play', 'data' => [], 'expect' => ['state' => 'playing']];
                }
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
            if ($action === 'shuffle') {
                return empty($caps['shuffle']) || !is_bool($value) ? ['error' => 'not_supported'] : ['domain' => 'media_player', 'service' => 'shuffle_set', 'data' => ['shuffle' => $value], 'expect' => ['shuffle' => $value]];
            }
            if ($action === 'repeat') {
                return empty($caps['repeat']) || !in_array($value, ['off', 'all', 'one'], true) ? ['error' => 'not_supported'] : ['domain' => 'media_player', 'service' => 'repeat_set', 'data' => ['repeat' => $value], 'expect' => ['repeat' => $value]];
            }
            if ($action === 'power') {
                // TURN_ON / TURN_OFF (the feature bits are 'power' together: only the service the state makes sense for is sent)
                if (empty($caps['power']) || !is_bool($value)) {
                    return ['error' => 'not_supported'];
                }
                return ['domain' => 'media_player', 'service' => $value ? 'turn_on' : 'turn_off', 'data' => [], 'expect' => []];
            }
            if ($action === 'source') {
                return empty($caps['source']) || !is_string($value) || !in_array($value, $e['attrs']['sources'] ?? [], true) ? ['error' => 'not_supported']
                    : ['domain' => 'media_player', 'service' => 'select_source', 'data' => ['source' => $value], 'expect' => ['source' => $value]];
            }
        }
        return ['error' => 'action_not_allowed'];
    }
}
