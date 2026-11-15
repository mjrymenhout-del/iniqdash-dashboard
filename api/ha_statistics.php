<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * Home Assistant LONG-TERM STATISTICS (server/ha/HaService::statistics) — read-only, for Chart's hourly / daily / weekly / monthly /
 * yearly views. IniqDash stores nothing but a short-lived cache of the answer in the private folder.
 *
 * GET api/ha_statistics.php?entities=sensor.a,sensor.b&period=hour|day|week|month|year   (up to 10 entities)
 *   → { ok, connected, error, period, start, end, refresh, results: { <id>: { error, unit, hasSum, hasMean, points: [[ms, change, mean, min, max]…] } } }
 */
require dirname(__DIR__) . '/server/ha/endpoint.php';

$period = is_string($_GET['period'] ?? null) ? $_GET['period'] : 'day';
$ha = iq_ha();
if ($ha === null) {
    iq_json(['ok' => true, 'configured' => false, 'connected' => false, 'error' => 'not_configured', 'results' => (object) []]);
}
$ids = is_string($_GET['entities'] ?? null) ? array_values(array_filter(explode(',', $_GET['entities']), static fn ($x) => $x !== '')) : [];
if ($ids === [] || count($ids) > HaService::STAT_BATCH_MAX) {
    iq_json(['ok' => false, 'configured' => true, 'error' => 'bad_request', 'results' => (object) []], 400);
}
$r = $ha->statistics($ids, $period);
$status = (int) ($r['status'] ?? 200);
unset($r['status']);
if ($r['error'] !== null && !in_array($r['error'], ['bad_period', 'bad_entity'], true)) {
    $status = 200;                // HA unreachable / refused: reported in the JSON, the chart keeps what it had
}
iq_json(['ok' => $r['error'] === null, 'configured' => true] + $r + ['results' => (object) []], $status);
