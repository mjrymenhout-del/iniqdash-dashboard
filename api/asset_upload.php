<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * POST api/asset_upload.php   multipart/form-data, field "file" (+ optional "scope": the widget type it is for, its image library)   → { ok, ref, type, width, height } | { ok: false, error }
 * Reached only through gate.php: signed-in session, X-CSRF-Token and same origin are checked BEFORE this file runs.
 * The server validates the content (server/UserAssets.php), chooses the storage location and the file name, and
 * answers with the reference a dashboard stores ("api/asset.php?id=<id>"). No path, no original file name, ever.
 * Errors: unsupported_type · too_large · bad_dimensions · no_file · upload_failed · storage_unavailable · server_unsupported
 */
if (!defined('IQ_GATED')) {
    http_response_code(404);
    exit;
}
require dirname(__DIR__) . '/server/UserAssets.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function iq_asset_reply(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    iq_asset_reply(['ok' => false, 'error' => 'method_not_allowed'], 405);
}
if (($missing = UserAssets::missing()) !== null) {
    iq_asset_reply(['ok' => false, 'error' => 'server_unsupported'], 503);
}
// a body larger than PHP's post_max_size arrives EMPTY (no fields, no files): report it as too large
$len = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if (!$_FILES && !$_POST && $len > 0) {
    iq_asset_reply(['ok' => false, 'error' => 'too_large', 'max' => UserAssets::MAX_BYTES], 413);
}
if ($len > UserAssets::MAX_BYTES + 64 * 1024) {
    iq_asset_reply(['ok' => false, 'error' => 'too_large', 'max' => UserAssets::MAX_BYTES], 413);
}
$f = $_FILES['file'] ?? null;
if (!is_array($f) || is_array($f['error'] ?? null)) {
    iq_asset_reply(['ok' => false, 'error' => 'no_file'], 400);
}
$err = (int) ($f['error'] ?? UPLOAD_ERR_NO_FILE);
if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) {
    iq_asset_reply(['ok' => false, 'error' => 'too_large', 'max' => UserAssets::MAX_BYTES], 413);
}
if ($err === UPLOAD_ERR_NO_FILE) {
    iq_asset_reply(['ok' => false, 'error' => 'no_file'], 400);
}
if ($err !== UPLOAD_ERR_OK || !is_string($f['tmp_name'] ?? null)) {
    iq_asset_reply(['ok' => false, 'error' => 'upload_failed'], 400);
}
$why = null;
$a = UserAssets::store($f['tmp_name'], $why);
if ($a === null) {
    iq_log('asset_upload_refused', ['reason' => $why]);                      // never the file name
    $status = ['too_large' => 413, 'unsupported_type' => 415, 'bad_dimensions' => 415, 'storage_unavailable' => 503][$why] ?? 400;
    iq_asset_reply(['ok' => false, 'error' => $why] + ($why === 'too_large' ? ['max' => UserAssets::MAX_BYTES] : []), $status);
}
// the widget type it was uploaded for (optional): it joins that type's image library (IMAGE OWNERSHIP = WIDGET TYPE)
$scope = is_string($_POST['scope'] ?? null) ? $_POST['scope'] : '';
if ($scope !== '' && preg_match(UserAssets::SCOPE, $scope)) {
    UserAssets::addToLibrary($scope, $a['id']);
}
iq_log('asset_upload', ['id' => $a['id'], 'type' => $a['type'], 'bytes' => (int) ($f['size'] ?? 0)]);
iq_asset_reply(['ok' => true, 'ref' => $a['ref'], 'type' => $a['type'], 'width' => $a['width'], 'height' => $a['height']]);
