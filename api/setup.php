<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * FIRST-RUN WIZARD, steps 2–4 (server/FirstRun.php). Reached only through gate.php: signed in; POST also CSRF + same origin.
 *   GET  api/setup.php                                        → { ok, pending }
 *   POST api/setup.php { action: "finish", name, dashboard }   → { ok, entry } — created, made the default, setup done; or nothing
 *   POST api/setup.php { action: "demo" }                      → { ok, entry } — the official demo, made the default, setup done
 * Both POST actions are refused once setup is done (not_pending): the wizard cannot be replayed to replace the default dashboard.
 */
if (!defined('IQ_GATED')) {
    http_response_code(404);
    exit;
}
require_once dirname(__DIR__) . '/server/FirstRun.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$reply = static function (array $d, int $status = 200): never {
    http_response_code($status);
    echo json_encode($d, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
};
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET' || $method === 'HEAD') {
    $reply(['ok' => true, 'pending' => Setup::pending()]);
}
if ($method !== 'POST') {
    $reply(['ok' => false, 'error' => 'bad_request'], 405);
}
$raw = (string) file_get_contents('php://input', false, null, 0, Dashboards::MAX_BYTES + 64 * 1024 + 1);
if (strlen($raw) > Dashboards::MAX_BYTES + 64 * 1024) {
    $reply(['ok' => false, 'error' => 'too_large'], 413);
}
$o = json_decode($raw, false, 64);
unset($raw);
$b = is_object($o) ? get_object_vars($o) : null;
$action = is_array($b) ? ($b['action'] ?? null) : null;
if ($action === 'finish') {
    $r = Setup::finish($b['name'] ?? null, $b['dashboard'] ?? null);
} elseif ($action === 'demo') {
    $r = Setup::demo();
} else {
    $reply(['ok' => false, 'error' => 'bad_request'], 400);
}
$codes = ['not_pending' => 409, 'invalid' => 400, 'name_invalid' => 400, 'too_large' => 413, 'storage_unavailable' => 503, 'write_failed' => 500];
$reply($r, $r['ok'] ? 200 : ($codes[$r['error'] ?? ''] ?? 400));
