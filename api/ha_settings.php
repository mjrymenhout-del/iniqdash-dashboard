<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * Settings → Home Assistant connection (server/ha/HaSettings.php).
 *   GET  api/ha_settings.php                                → { ok, configured, url, tokenConfigured, storage }  (never the token)
 *   POST api/ha_settings.php { action: "test", url, token? } → { ok, error, version?, entities?, settings }  (nothing saved)
 *   POST api/ha_settings.php { action: "save", url, token? } → { ok, error, version?, entities?, settings }  (saved only if HA accepts it)
 * A blank / missing token means "the saved token" (used server side, never sent back). Reached only through gate.php:
 * signed-in session for every request; for POST also the CSRF token and the same origin.
 */
require dirname(__DIR__) . '/server/ha/endpoint.php';
require dirname(__DIR__) . '/server/ha/HaSettings.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET' || $method === 'HEAD') {
    iq_json(['ok' => true] + HaSettings::read());
}
if ($method !== 'POST') {
    iq_json(['ok' => false, 'error' => 'method_not_allowed'], 405);
}
$body = json_decode((string) file_get_contents('php://input', false, null, 0, 8192), true);
$action = is_array($body) ? ($body['action'] ?? null) : null;
if (!in_array($action, ['test', 'save'], true)) {
    iq_json(['ok' => false, 'error' => 'bad_request'], 400);
}
$url = $body['url'] ?? null;
$token = $body['token'] ?? null;
unset($body);
if ($token !== null && !is_string($token)) {
    iq_json(['ok' => false, 'error' => 'token_invalid'], 400);
}
$r = $action === 'save' ? HaSettings::save($url, $token) : HaSettings::test($url, $token);
unset($token);
unset($r['url']);
$status = $r['ok'] ? 200 : (in_array($r['error'], ['storage_unavailable', 'write_failed'], true) ? 500 : 200);
iq_json($r + ['settings' => HaSettings::read()], $status);
