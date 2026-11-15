<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * GET api/ha_todo.php?entity=todo.<id> → { ok, connected, error, entity, items: [{ uid, summary, status, due?, description? }], refresh }
 * The items of one to-do list (todo.get_items, read-only). Adding / ticking an item goes through api/ha_call.php (planned and checked there).
 */
require dirname(__DIR__) . '/server/ha/endpoint.php';

$ha = iq_ha();
if ($ha === null) {
    iq_json(['ok' => true, 'configured' => false, 'connected' => false, 'error' => 'not_configured', 'items' => []]);
}
$id = is_string($_GET['entity'] ?? null) ? $_GET['entity'] : '';
$r = $ha->todoItems($id);
$status = (int) ($r['status'] ?? 200);
unset($r['status']);
if ($r['error'] !== null && $r['error'] !== 'bad_entity') {
    $status = 200;
}
iq_json(['ok' => $r['error'] === null, 'configured' => true] + $r, $status);
