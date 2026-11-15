<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/** GET api/ha_states.php?ids=light.a,sensor.b → { ok, connected, error, states: { id: entity|null }, at } */
require dirname(__DIR__) . '/server/ha/endpoint.php';

$ids = array_slice(array_filter(explode(',', (string) ($_GET['ids'] ?? ''))), 0, 200);
$ha = iq_ha();
if ($ha === null) {
    iq_json(['ok' => true, 'configured' => false, 'connected' => false, 'error' => 'not_configured', 'states' => []]);
}
iq_json(['ok' => true, 'configured' => true, 'at' => gmdate('c')] + $ha->states($ids));
