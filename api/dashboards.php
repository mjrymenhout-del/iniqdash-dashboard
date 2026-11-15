<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * Server-side dashboards (server/Dashboards.php). Reached only through gate.php: signed-in session for every request;
 * POST also needs the CSRF token (X-CSRF-Token) and the same origin.
 *
 *   GET  api/dashboards.php                 → { ok, dashboards: [{ id, name, updated, revision }], maxBytes }
 *   GET  api/dashboards.php?id=<id>         → { ok, id, name, created, updated, revision, dashboard }
 *   POST { action: "create",    name, dashboard }          → { ok, entry }      (also used by Import / first save)
 *   POST { action: "save",      id, revision, dashboard }  → { ok, entry } | 409 { error: "conflict", revision }
 *   POST { action: "rename",    id, name }                 → { ok, entry }
 *   POST { action: "duplicate", id }                       → { ok, entry }
 *   POST { action: "delete",    id }                       → { ok }
 *   POST { action: "settings",  default?, editButton?, gallery? }     → { ok, settings }   (the application settings: which dashboard opens after
 *        signing in — an existing id or null — and how the Edit control appears: 'corner' | 'always'; GET lists them as `settings`)
 * Errors: not_found · corrupt · conflict · name_invalid · name_taken · invalid (+ detail) · too_large · too_many ·
 *         storage_unavailable · write_failed · bad_request. No filesystem path is ever returned.
 */
if (!defined('IQ_GATED')) {
    http_response_code(404);
    exit;
}
require dirname(__DIR__) . '/server/Dashboards.php';
require_once dirname(__DIR__) . '/server/DemoInstall.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function iq_dash_reply(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}
const IQ_DASH_STATUS = ['not_found' => 404, 'corrupt' => 500, 'conflict' => 409, 'name_taken' => 409, 'name_invalid' => 400, 'invalid' => 400,
    'too_large' => 413, 'too_many' => 409, 'storage_unavailable' => 503, 'write_failed' => 500, 'bad_request' => 400];
function iq_dash_result(array $r): never
{
    iq_dash_reply($r, $r['ok'] ? 200 : (IQ_DASH_STATUS[$r['error'] ?? 'bad_request'] ?? 400));
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET' || $method === 'HEAD') {
    if (Dashboards::dir() === null) {
        iq_dash_reply(['ok' => false, 'error' => 'storage_unavailable'], 503);
    }
    // LIVE SYNC: { ok, revision, build } — a viewing screen checks whether its dashboard was saved elsewhere (a few bytes, no dashboard)
    // and whether the application itself was updated (build: changes when its files are replaced)
    if (isset($_GET['rev'])) {
        $rev = Dashboards::revisionOf($_GET['rev']);
        $build = substr(hash('sha256', implode('|', array_map(static fn ($f) => (string) @filemtime(APP_ROOT . '/' . $f), ['VERSION', 'editor.html', 'components/editor/editor.js', 'widgets/index.js']))
            . @file_get_contents(APP_ROOT . '/VERSION')), 0, 16);
        iq_dash_reply($rev !== null ? ['ok' => true, 'revision' => $rev, 'build' => $build] : ['ok' => false, 'error' => 'not_found', 'build' => $build], $rev !== null ? 200 : 404);
    }
    if (isset($_GET['id'])) {
        $why = null;
        $e = Dashboards::get($_GET['id'], $why);
        iq_dash_result($e !== null ? ['ok' => true] + $e : ['ok' => false, 'error' => $why]);
    }
    // a NEW installation starts with the INIQDASH demo as its default dashboard (server/DemoInstall.php — decided once; an existing
    // installation is never changed)
    $demo = DemoInstall::ensure();
    if (isset($demo['added']) || isset($demo['error'])) {
        iq_log(isset($demo['added']) ? 'demo_installed' : 'demo_install_failed', ['id' => (string) ($demo['added'] ?? $demo['error'])]);
    }
    iq_dash_reply(['ok' => true, 'dashboards' => Dashboards::list(), 'settings' => Dashboards::settings(), 'maxBytes' => Dashboards::MAX_BYTES]);
}
if ($method !== 'POST') {
    iq_dash_reply(['ok' => false, 'error' => 'bad_request'], 405);
}
$len = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($len > Dashboards::MAX_BYTES + 64 * 1024) {
    iq_dash_reply(['ok' => false, 'error' => 'too_large', 'max' => Dashboards::MAX_BYTES], 413);
}
$raw = (string) file_get_contents('php://input', false, null, 0, Dashboards::MAX_BYTES + 64 * 1024 + 1);
if (strlen($raw) > Dashboards::MAX_BYTES + 64 * 1024) {
    iq_dash_reply(['ok' => false, 'error' => 'too_large', 'max' => Dashboards::MAX_BYTES], 413);
}
// objects stay stdClass objects, so a dashboard is stored exactly as sent ({} stays {})
$o = json_decode($raw, false, 64);
unset($raw);
$b = is_object($o) ? get_object_vars($o) : null;
if (!is_array($b) || !is_string($b['action'] ?? null)) {
    iq_dash_reply(['ok' => false, 'error' => 'bad_request'], 400);
}
// the model alone must fit the limit (the envelope is small)
if (isset($b['dashboard'])) {
    $mj = json_encode($b['dashboard'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($mj) || strlen($mj) > Dashboards::MAX_BYTES) {
        iq_dash_reply(['ok' => false, 'error' => 'too_large', 'max' => Dashboards::MAX_BYTES], 413);
    }
}
switch ($b['action']) {
    case 'create':    $r = Dashboards::create($b['name'] ?? null, $b['dashboard'] ?? null, ($b['unique'] ?? false) === true); break;
    case 'save':      $r = Dashboards::save($b['id'] ?? null, $b['revision'] ?? null, $b['dashboard'] ?? null); break;
    case 'rename':    $r = Dashboards::rename($b['id'] ?? null, $b['name'] ?? null); break;
    case 'duplicate': $r = Dashboards::duplicate($b['id'] ?? null); break;
    case 'delete':    $r = Dashboards::delete($b['id'] ?? null); break;
    case 'settings':  $r = Dashboards::setSettings(array_intersect_key($b, ['default' => 1, 'editButton' => 1, 'gallery' => 1])); break;
    default:          $r = ['ok' => false, 'error' => 'bad_request'];
}
if ($r['ok'] && in_array($b['action'], ['create', 'rename', 'duplicate', 'delete'], true)) {
    iq_log('dashboard_' . $b['action'], ['id' => $r['entry']['id'] ?? ($r['id'] ?? '')]);    // ids only, never names or content
}
iq_dash_result($r);
