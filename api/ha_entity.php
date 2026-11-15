<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * GET api/ha_entity.php?entity=<id> → { ok, connected, error, entity: null | { id, domain, state, last_changed, last_updated,
 *   attributes: [[name, value]…], count, redacted: [name…], truncated }, at }
 * The complete current state of ONE entity for the configuration inspector (HaService::inspect): read-only, on demand,
 * credentials never included. Signed-in session (gate.php).
 */
require dirname(__DIR__) . '/server/ha/endpoint.php';

$ha = iq_ha();
if ($ha === null) {
    iq_json(['ok' => true, 'configured' => false, 'connected' => false, 'error' => 'not_configured', 'entity' => null]);
}
$id = is_string($_GET['entity'] ?? null) ? $_GET['entity'] : '';
iq_json(['ok' => true, 'configured' => true, 'at' => gmdate('c')] + $ha->inspect($id));
