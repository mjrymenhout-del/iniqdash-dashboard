<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * Sign out: POST only, with the page's CSRF token and a same-origin check (another site cannot
 * sign you out). The server-side session is destroyed and its cookie removed.
 * A GET (e.g. typing the address) shows a small confirmation form instead.
 */

require __DIR__ . '/server/bootstrap.php';

iq_headers();
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");

Auth::startSession(true);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (Auth::sameOrigin() && Auth::checkCsrf($_POST['csrf'] ?? null)) {
        $was = Auth::user() !== null;
        Auth::destroy();
        if ($was) {
            iq_log('logout');
        }
        header('Location: ' . iq_base() . 'login.php?out=1', true, 303);
        exit;
    }
    http_response_code(403);
}
if (Auth::problem() !== null || Auth::user() === null) {
    header('Location: ' . iq_base() . 'login.php', true, 302);
    exit;
}
$csrf = Auth::csrfToken();
?>
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Sign out · IniqDash</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:500 15px ui-sans-serif,system-ui,sans-serif;color:#f2f3f6;background:#121418}form{display:flex;gap:10px;align-items:center}button,a{height:44px;padding:0 18px;border-radius:999px;border:0;font:600 14px inherit;display:inline-grid;place-items:center;text-decoration:none}button{color:#2a1a03;background:#ffb547;cursor:pointer}a{color:#b7bbc5;background:#20232a}</style></head>
<body><form method="post" action="logout.php"><input type="hidden" name="csrf" value="<?= iq_e($csrf) ?>"><button type="submit">Sign out of IniqDash</button><a href="./">Cancel</a></form></body></html>
