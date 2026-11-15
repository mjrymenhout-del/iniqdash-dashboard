<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Normalised entities for the widget tests, produced by the REAL server code (HaService::normalise) from raw attribute picks.
// php tests/fixtures.php  →  JSON { "<entity id>": normalised entity }
declare(strict_types=1);
require dirname(__DIR__) . '/server/ha/HaClient.php';
require dirname(__DIR__) . '/server/ha/HaService.php';

/** [entity id, state, picks (the short keys of HaService::pick)] */
$raw = json_decode((string) file_get_contents($argv[1] ?? 'php://stdin'), true) ?: [];
$out = [];
foreach ($raw as $row) {
    [$id, $state, $x] = $row;
    $out[$id] = HaService::normalise($id, (string) $state, '2026-10-23T10:00:00+00:00', $x, '2026-10-23T10:00:00+00:00', null);
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
