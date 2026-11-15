<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * Reusable Widget Studio definitions and the user's collections (server/StudioWidgets.php). Reached only through gate.php: signed-in session for
 * every request; POST also needs the CSRF token (X-CSRF-Token) and the same origin.
 *
 *   GET  api/studio_widgets.php                         → { ok, widgets: [{ id, revision, created, updated, definition }], collections: [{ id, name }] }
 *   POST { action: "create_collection", name }          → { ok, collection: { id, name } }   a new user collection (stable id)
 *   POST { action: "save", id: null, definition }       → { ok, widget }   a NEW definition (the server chooses its id)
 *   POST { action: "save", id, revision, definition }   → { ok, widget } | 409 { error: "conflict", revision }
 *   POST { action: "delete", id, revision }              → { ok, id } | 409 { error: "in_use", dashboards: [{ id, name }] } | 409 conflict
 *   GET  ?usage=1                                         → … + usage: { <widget id>: [{ id, name }] } (the dashboards that place each one)
 *   POST { action: "rename_collection", id, name }       → { ok, collection }
 *   POST { action: "delete_collection", id, mode: "keep" | "widgets", to? } → { ok, deleted, kept, moved, failed } (dashboards' widgets kept)
 *   POST { action: "move_widgets", ids, to }              → { ok, moved, failed }
 *   POST { action: "delete_widgets", ids }                → { ok, deleted, kept: [{ id, dashboards }], failed }
 *   POST { action: "retire_examples" }                    → { ok, report } (the retired example collections, again)
 * Errors: not_found · corrupt · conflict · invalid (+ detail) · too_large · too_many · storage_unavailable · write_failed · bad_request.
 * There is no delete yet (dashboard instances reference definitions live).
 */
if (!defined('IQ_GATED')) {
    http_response_code(404);
    exit;
}
require_once dirname(__DIR__) . '/server/Dashboards.php';
require_once dirname(__DIR__) . '/server/StudioWidgets.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function iq_sw_reply(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}
const IQ_SW_STATUS = ['in_use' => 409, 'name_invalid' => 400, 'name_taken' => 409, 'not_found' => 404, 'corrupt' => 500, 'conflict' => 409, 'invalid' => 400, 'too_large' => 413, 'too_many' => 409,
    'storage_unavailable' => 503, 'write_failed' => 500, 'bad_request' => 400];

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET' || $method === 'HEAD') {
    if (StudioWidgets::dir() === null) {
        iq_sw_reply(['ok' => false, 'error' => 'storage_unavailable'], 503);
    }
    // the RETIRED example collections ("Maison demo", "Studio Examples", "Test Me") are cleaned up once, the first time the library is read
    // (a marker in the library folder; dashboards' widgets are never deleted — see StudioWidgets::retireObsolete)
    $retired = StudioWidgets::retireObsolete(false, dirname(__DIR__));
    if (!empty($retired['ran'])) {
        iq_log('studio_retire_examples', ['collections' => count($retired['report']['collections'] ?? []), 'packages' => count($retired['report']['packages'] ?? [])]);
    }
    iq_sw_reply(['ok' => true, 'widgets' => StudioWidgets::list(), 'collections' => StudioWidgets::collections(),
        'retired' => $retired['report'] ?? null] + (!empty($_GET['usage']) ? ['usage' => (object) StudioWidgets::usageAll()] : []));
}
if ($method !== 'POST') {
    iq_sw_reply(['ok' => false, 'error' => 'bad_request'], 405);
}
$len = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
$raw = $len > StudioWidgets::MAX_BYTES + 8192 ? '' : (string) file_get_contents('php://input', false, null, 0, StudioWidgets::MAX_BYTES + 8193);
if ($raw === '' || strlen($raw) > StudioWidgets::MAX_BYTES + 8192) {
    iq_sw_reply(['ok' => false, 'error' => $raw === '' && $len === 0 ? 'bad_request' : 'too_large', 'max' => StudioWidgets::MAX_BYTES], $raw === '' && $len === 0 ? 400 : 413);
}
$o = json_decode($raw, false, 64);
unset($raw);
$b = is_object($o) ? get_object_vars($o) : null;
if (is_array($b) && ($b['action'] ?? null) === 'create_collection') {
    $r = StudioWidgets::createCollection($b['name'] ?? null);
    if ($r['ok']) {
        iq_log('studio_collection_create', ['id' => $r['collection']['id']]);
    }
    iq_sw_reply($r, $r['ok'] ? 200 : (IQ_SW_STATUS[$r['error'] ?? 'bad_request'] ?? 400));
}
// MANAGEMENT (Manage widgets): rename / delete a collection, move widgets, delete several widgets, re-run the clean-up
$act = is_array($b) ? ($b['action'] ?? null) : null;
if (in_array($act, ['rename_collection', 'delete_collection', 'move_widgets', 'delete_widgets', 'retire_examples'], true)) {
    $r = match ($act) {
        'rename_collection' => StudioWidgets::renameCollection($b['id'] ?? null, $b['name'] ?? null),
        'delete_collection' => StudioWidgets::deleteCollection($b['id'] ?? null, $b['mode'] ?? null, $b['to'] ?? null),
        'move_widgets' => StudioWidgets::moveWidgets($b['ids'] ?? null, $b['to'] ?? null),
        'delete_widgets' => StudioWidgets::deleteWidgets($b['ids'] ?? null),
        'retire_examples' => StudioWidgets::retireObsolete(true, dirname(__DIR__)),
    };
    if ($r['ok']) {
        iq_log('studio_manage', ['action' => $act]);
    }
    iq_sw_reply($r, $r['ok'] ? 200 : (IQ_SW_STATUS[$r['error'] ?? 'bad_request'] ?? 400));
}
if (is_array($b) && ($b['action'] ?? null) === 'delete') {
    $r = StudioWidgets::delete($b['id'] ?? null, $b['revision'] ?? null);
    if ($r['ok']) {
        iq_log('studio_widget_delete', ['id' => $r['id']]);
    }
    iq_sw_reply($r, $r['ok'] ? 200 : (IQ_SW_STATUS[$r['error'] ?? 'bad_request'] ?? 400));
}
if (!is_array($b) || ($b['action'] ?? null) !== 'save' || !array_key_exists('definition', $b)) {
    iq_sw_reply(['ok' => false, 'error' => 'bad_request'], 400);
}
// the collections a definition may belong to: the first-party one, the user's, and the installed package collections
require_once dirname(__DIR__) . '/server/WidgetPackages.php';
$allowed = array_merge([StudioWidgets::FIRST_PARTY_COLLECTION['id']], array_column(StudioWidgets::collections(), 'id'),
    array_column(WidgetPackages::scan(dirname(__DIR__), 'custom')['collections'], 'id'));
$r = StudioWidgets::save($b['id'] ?? null, $b['revision'] ?? null, $b['definition'], $allowed);
if ($r['ok']) {
    iq_log('studio_widget_save', ['id' => $r['widget']['id']]);              // the id only, never its content
}
iq_sw_reply($r, $r['ok'] ? 200 : (IQ_SW_STATUS[$r['error'] ?? 'bad_request'] ?? 400));
