<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Server-side action planning: php tests/plan.php  (exit 1 on a failed expectation)
declare(strict_types=1);
require dirname(__DIR__) . '/server/ha/HaClient.php';
require dirname(__DIR__) . '/server/ha/HaService.php';

$fail = 0;
function ent(string $id, string $state, array $x): array { return HaService::normalise($id, $state, 'now', $x, 'now', null); }
function expect_plan(string $label, array $e, string $action, mixed $value, ?string $service, ?string $error = null): void {
    global $fail;
    $p = HaService::plan($e, $action, $value);
    $ok = $service !== null ? (($p['domain'] ?? '') . '.' . ($p['service'] ?? '') === $service) : (($p['error'] ?? null) === $error);
    echo ($ok ? 'ok   ' : 'FAIL ') . $label . ($ok ? '' : ' → ' . json_encode($p)) . "\n";
    if (!$ok) { $fail++; }
}
require __DIR__ . '/plan-cases.php';
exit($fail ? 1 : 0);
