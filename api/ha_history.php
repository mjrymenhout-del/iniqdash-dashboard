<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * Home Assistant history (server/ha/HaService::histories) — ONE shared path for Chart, Sensor inline history and, later,
 * Entity Details. IniqDash keeps no history of its own, only a short-lived cache of the reduced answer in the private folder.
 *
 * GET api/ha_history.php?entity=sensor.x&range=1h|6h|12h|24h|7d[&kind=numeric|states]
 *   → numeric: { ok, connected, error, entity, range, kind, start, end, step, points: [[ms, mean, min, max]…], min, max, last, samples, refresh }
 *   → states:  { ok, connected, error, entity, range, kind, start, end, from, segments: [[ms, state]…], changes, truncated, last, refresh }
 * GET api/ha_history.php?entities=a,b,c&range=…[&kind=…]   (up to 40, one Home Assistant request for those not cached)
 *   → { ok, connected, error, range, kind, results: { <id>: <one answer as above> } }
 */
require dirname(__DIR__) . '/server/ha/endpoint.php';

$range = is_string($_GET['range'] ?? null) ? $_GET['range'] : '24h';
$kind = is_string($_GET['kind'] ?? null) ? $_GET['kind'] : 'numeric';
$ha = iq_ha();
if ($ha === null) {
    iq_json(['ok' => true, 'configured' => false, 'connected' => false, 'error' => 'not_configured', 'points' => [], 'results' => (object) []]);
}
if (is_string($_GET['entities'] ?? null)) {
    $ids = array_values(array_filter(explode(',', $_GET['entities']), static fn ($x) => $x !== ''));
    if ($ids === [] || count($ids) > HaService::HISTORY_BATCH_MAX) {
        iq_json(['ok' => false, 'configured' => true, 'error' => 'bad_request', 'results' => (object) []], 400);
    }
    $r = $ha->histories($ids, $range, $kind);
    $status = in_array($r['error'], ['bad_range', 'bad_kind'], true) ? 400 : 200;    // HA unreachable: reported in the JSON
    unset($r['status']);
    iq_json(['ok' => $r['error'] === null, 'configured' => true, 'range' => $range, 'kind' => $kind] + $r + ['results' => (object) []], $status);
}
$id = is_string($_GET['entity'] ?? null) ? $_GET['entity'] : '';
$h = $ha->history($id, $range, $kind);
$status = (int) ($h['status'] ?? 200);
unset($h['status']);
if ($h['error'] !== null && !in_array($h['error'], ['not_numeric', 'bad_range', 'bad_kind', 'bad_entity'], true)) {
    $status = 200;               // HA unreachable / too much history: reported in the JSON, the page keeps its last chart
}
iq_json(['ok' => $h['error'] === null, 'configured' => true] + $h, $status);
