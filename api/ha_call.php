<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * POST api/ha_call.php  {"entity": "light.living", "action": "turn_on|turn_off|toggle|brightness|…", "value": …, "code"?: "…", "widget"?: "custom.…"}
 * "widget": set by the custom-widget action channel — the request must then match that package's declared actions.
 * "code": a lock / alarm code for this one action — sent to Home Assistant once, never stored, logged or echoed.
 * The action is checked against the entity's current capabilities; the HA service is chosen
 * server-side (server/ha/HaService.php → plan()). Returns { ok, accepted, expect } — the browser
 * shows the new state when HA confirms it through ha_states.php.
 */
require dirname(__DIR__) . '/server/ha/endpoint.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    iq_json(['ok' => false, 'error' => 'method_not_allowed'], 405);
}
$ha = iq_ha();
if ($ha === null) {
    iq_json(['ok' => false, 'error' => 'not_configured'], 503);
}
$body = json_decode((string) file_get_contents('php://input'), true);
$entity = is_array($body) && is_string($body['entity'] ?? null) ? $body['entity'] : '';
$action = is_array($body) && is_string($body['action'] ?? null) ? $body['action'] : '';
$value = is_array($body) ? ($body['value'] ?? null) : null;
if ($value !== null && !is_scalar($value)) {
    iq_json(['ok' => false, 'error' => 'bad_value'], 400);
}
// a lock / alarm code for this one action (typed by the user): passed to HA, never stored or logged
$code = is_array($body) && is_string($body['code'] ?? null) ? $body['code'] : null;
// a request through the CUSTOM-widget action channel names its package: the action and the entity's domain must be
// declared in that package's widget.json (re-checked here, server-side) — otherwise it is refused before HA is asked
if (is_array($body) && array_key_exists('widget', $body)) {
    require_once dirname(__DIR__) . '/server/WidgetPackages.php';
    $widget = is_string($body['widget']) ? $body['widget'] : '';
    if ($value !== null || $code !== null || !WidgetPackages::declares(APP_ROOT, $widget, $entity, $action)) {
        iq_log('ha_call_refused', ['entity' => $entity, 'action' => $action, 'reason' => 'not_declared']);
        iq_json(['ok' => false, 'error' => 'not_declared'], 403);
    }
}
unset($body);
$r = $ha->call($entity, $action, $value, $code);
unset($code);
iq_log($r['ok'] ? 'ha_call' : 'ha_call_refused', ['entity' => $entity, 'action' => $action] + ($r['ok'] ? [] : ['reason' => $r['error']]));
if (!$r['ok']) {
    iq_json(['ok' => false, 'error' => $r['error']], $r['status'] ?? 400);
}
iq_json(['ok' => true, 'accepted' => true, 'expect' => $r['expect']]);
