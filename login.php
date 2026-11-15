<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

if (PHP_VERSION_ID < 80100) {                     // before anything that needs PHP 8.1 is loaded: say so instead of an empty error
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'IniqDash needs PHP 8.1 or newer. This web site runs PHP ' . PHP_VERSION . ' - choose a newer PHP version for this site in the hosting control panel.';
    exit;
}

/**
 * IniqDash sign-in. The only page a visitor can open without a session (with logout.php).
 * It loads nothing from the protected folders: its styles are inline.
 */

require __DIR__ . '/server/bootstrap.php';

iq_headers();
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");

$problem = Auth::problem();
Auth::startSession(true);

/* ---- FIRST RUN (server/FirstRun.php): while no account exists, this page creates it (step 1 of 4). No session store exists yet, so
   the form is protected by a double-submit cookie and the same-origin check. Afterwards the one-time ticket signs the new
   administrator in and the application continues with the wizard. */
require_once __DIR__ . '/server/FirstRun.php';
$setupAllowed = Setup::allowed();
$setupError = '';
$cookieBase = ['path' => iq_base(), 'secure' => iq_https(), 'httponly' => true, 'samesite' => 'Strict'];
if ($problem === null && isset($_GET['setup']) && Auth::user() === null) {
    $u = Setup::redeem($_COOKIE[Setup::TICKET_COOKIE] ?? null);
    setcookie(Setup::TICKET_COOKIE, '', ['expires' => time() - 3600] + $cookieBase);
    if ($u !== null && Auth::signInAfterSetup($u)) {
        header('Location: ' . iq_base() . '?setup=1', true, 303);
        exit;
    }
}
if ($setupAllowed) {
    $setupCsrf = $_COOKIE['iniqdash_setup_csrf'] ?? '';
    if (!is_string($setupCsrf) || !preg_match('/^[0-9a-f]{64}$/', $setupCsrf)) {
        $setupCsrf = bin2hex(random_bytes(32));
        setcookie('iniqdash_setup_csrf', $setupCsrf, ['expires' => time() + 3600] + $cookieBase);
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && ($_POST['action'] ?? '') === 'setup') {
        if (!Auth::sameOrigin() || !hash_equals($setupCsrf, (string) ($_POST['setup_csrf'] ?? ''))) {
            $setupError = 'The form expired. Please try again.';
        } else {
            $r = Setup::createAdmin(trim((string) ($_POST['user'] ?? '')), (string) ($_POST['password'] ?? ''), (string) ($_POST['password2'] ?? ''));
            if ($r['ok']) {
                setcookie(Setup::TICKET_COOKIE, $r['ticket'], ['expires' => time() + 600] + $cookieBase);
                setcookie('iniqdash_setup_csrf', '', ['expires' => time() - 3600] + $cookieBase);
                header('Location: ' . iq_base() . 'login.php?setup=continue', true, 303);
                exit;
            }
            $setupError = [
                'already_set_up' => 'IniqDash has just been set up. Please sign in.',
                'user_invalid' => 'User name: 3 to 64 letters, digits or . _ @ -',
                'password_short' => 'The password needs at least 12 characters.',
                'password_long' => 'That password is too long.',
                'password_mismatch' => 'The two passwords are not the same.',
                'busy' => 'The account is being created in another window. Wait a moment, then reload.',
                'inside_web_root' => 'PHP may only write inside the web site on this host, and IniqDash never keeps passwords and keys there. In the hosting panel, let PHP reach your account folder (open_basedir), or create an empty folder named iniqdash-private outside the web site, then try again.',
                'local_not_writable' => 'IniqDash cannot write server/local.php. Give the web server write access to the server folder, or use php server/setup.php over SSH.',
            ][$r['error']] ?? 'IniqDash found no folder outside the web site that PHP may create and write (it tried beside the site\'s folder, the folders PHP is allowed to use, and the home folder). In the hosting panel, let PHP reach your account folder, or create an empty folder named iniqdash-private beside the site\'s folder, then try again.';
            http_response_code(in_array($r['error'], ['user_invalid', 'password_short', 'password_long', 'password_mismatch'], true) ? 400 : 500);
            if ($r['error'] === 'already_set_up') {
                $setupAllowed = false;
            }
        }
    }
}

/** Where to go after signing in: a page inside IniqDash, never another site. */
function iq_next(?string $n): string
{
    $n = (string) $n;
    return preg_match('#^(?!/)(?!.*\.\.)[A-Za-z0-9._/-]{0,200}$#', $n) && !preg_match('#(^|/)\.#', $n) && !preg_match('#^server(/|$)#i', $n) ? $n : '';
}

$next = iq_next($_POST['next'] ?? $_GET['next'] ?? '');
$error = '';
$notice = isset($_GET['expired']) ? 'Your session has expired. Please sign in again.' : (isset($_GET['out']) ? 'You are signed out.' : '');

if ($problem === null && Auth::user() !== null) {
    header('Location: ' . iq_base() . $next, true, 302);
    exit;
}
if ($problem === null && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $notice = '';
    if (!Auth::sameOrigin() || !Auth::checkCsrf($_POST['csrf'] ?? null)) {
        $error = 'The form expired. Please try again.';
    } else {
        $r = Auth::attemptLogin(trim((string) ($_POST['user'] ?? '')), (string) ($_POST['password'] ?? ''));
        if ($r === true) {
            header('Location: ' . iq_base() . $next, true, 303);
            exit;
        }
        if (is_string($r) && str_starts_with($r, 'locked:')) {
            $min = max(1, (int) ceil((int) substr($r, 7) / 60));
            $error = "Too many attempts. Try again in {$min} minute" . ($min > 1 ? 's' : '') . '.';
            http_response_code(429);
        } else {
            $error = 'Incorrect user name or password.';
            http_response_code(401);
        }
    }
}
$csrf = $problem === null ? Auth::csrfToken() : '';
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Sign in · IniqDash</title>
<style>
  :root {
    --page-bg: #0b0b0d; --surface-primary: #17171a; --surface-primary-top: #1d1d21; --surface-secondary: #111113;
    --border-primary: rgba(255, 255, 255, .08); --edge-highlight: rgba(255, 255, 255, .06);
    --text-primary: #f1f1f3; --text-secondary: #a9aab3; --text-muted: #878891;
    --accent: #ff7a1a; --accent-on: #1a0e04; --accent-soft: rgba(255, 122, 26, .16); --accent-line: rgba(255, 122, 26, .38); --danger: #ff4d4f;
    --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;   /* no web font here: this page loads nothing from the protected folders */
    color-scheme: dark;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    min-height: 100vh; min-height: 100dvh; display: grid; place-items: center; padding: 24px 16px;
    font: 400 15px/1.5 var(--font); color: var(--text-primary);
    background: radial-gradient(1200px 600px at 80% -10%, #1b1e25 0%, var(--page-bg) 60%) var(--page-bg);
  }
  .card {
    width: min(100%, 380px); padding: 32px 28px 28px; border-radius: 24px;
    background: linear-gradient(180deg, var(--surface-primary-top), var(--surface-primary));
    box-shadow: 0 1px 0 var(--edge-highlight) inset, 0 18px 40px -18px rgba(0, 0, 0, .75), 0 2px 6px rgba(0, 0, 0, .25);
  }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
  .mark { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; color: var(--accent);
    background: var(--accent-soft); box-shadow: 0 0 0 1px var(--accent-line) inset; }
  .mark svg { width: 24px; height: 24px; }
  h1 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -.01em; }
  .sub { margin: 2px 0 0; font-size: 13px; color: var(--text-muted); }
  label { display: block; margin: 14px 0 6px; font-size: 12.5px; font-weight: 600; color: var(--text-secondary); }
  input[type=text], input[type=password] {
    width: 100%; height: 46px; padding: 0 14px; border: 0; border-radius: 14px; outline: 0;
    font: 500 15px var(--font); color: var(--text-primary); background: var(--surface-secondary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, .45) inset, 0 0 0 1px var(--border-primary);
  }
  input:focus-visible { box-shadow: 0 1px 3px rgba(0, 0, 0, .45) inset, 0 0 0 2px var(--accent); }
  button {
    width: 100%; height: 48px; margin-top: 22px; border: 0; border-radius: 999px; cursor: pointer;
    font: 600 15px var(--font); color: var(--accent-on); background: linear-gradient(180deg, #ff9448, var(--accent));
    box-shadow: 0 8px 20px -10px rgba(255, 181, 71, .7), 0 1px 0 rgba(255, 255, 255, .35) inset;
  }
  button:focus-visible { outline: 2px solid var(--text-primary); outline-offset: 3px; }
  .msg { margin: 0 0 4px; padding: 10px 12px; border-radius: 12px; font-size: 13px; }
  .msg--error { color: #ffd0d0; background: rgba(255, 100, 100, .12); box-shadow: 0 0 0 1px rgba(255, 100, 100, .3) inset; }
  .msg--info { color: var(--text-secondary); background: var(--surface-secondary); box-shadow: 0 0 0 1px var(--border-primary) inset; }
  code { font-size: 12.5px; color: var(--accent); }
  h2 { margin: 4px 0 12px; font-size: 17px; font-weight: 600; }
  .hint { font-weight: 400; color: var(--text-muted); }
  .step { display: flex; gap: 8px; margin: 0 0 14px; }
  .step span { flex: 1; height: 4px; border-radius: 2px; background: var(--border-primary); font-size: 0; }
  .step span.on { background: var(--accent); }
</style>
</head>
<body>
<main class="card">
  <div class="brand">
    <span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/></svg></span>
    <div><h1>IniqDash</h1><p class="sub"><?= $setupAllowed ? 'First-time setup' : 'Sign in to continue' ?></p></div>
  </div>
<?php if ($setupAllowed): ?>
  <p class="step" aria-label="Step 1 of 4"><span class="on">1</span><span>2</span><span>3</span><span>4</span></p>
  <h2>Create your account</h2>
  <p class="msg msg--info">Welcome to IniqDash. This account manages your dashboards. This page is offered only until an account exists.</p>
  <?php if ($setupError !== ''): ?><p class="msg msg--error" role="alert"><?= iq_e($setupError) ?></p><?php endif; ?>
  <form method="post" action="login.php" autocomplete="off">
    <input type="hidden" name="action" value="setup">
    <input type="hidden" name="setup_csrf" value="<?= iq_e($setupCsrf) ?>">
    <label for="user">User name</label>
    <input type="text" id="user" name="user" value="<?= iq_e(trim((string) ($_POST['user'] ?? 'admin'))) ?>" autocomplete="username" autocapitalize="none" spellcheck="false" required pattern="[A-Za-z0-9._@\-]{3,64}" autofocus>
    <label for="password">Password <span class="hint">at least 12 characters</span></label>
    <input type="password" id="password" name="password" autocomplete="new-password" minlength="12" required>
    <label for="password2">Confirm password</label>
    <input type="password" id="password2" name="password2" autocomplete="new-password" minlength="12" required>
    <button type="submit">Create account and continue</button>
  </form>
<?php elseif ($problem !== null): ?>
  <p class="msg msg--info" role="status">IniqDash is not set up on this server yet (<code><?= iq_e($problem) ?></code>). Run <code>php server/setup.php</code> over SSH.</p>
<?php else: ?>
  <?php if ($error !== ''): ?><p class="msg msg--error" role="alert"><?= iq_e($error) ?></p><?php endif; ?>
  <?php if ($notice !== ''): ?><p class="msg msg--info" role="status"><?= iq_e($notice) ?></p><?php endif; ?>
  <form method="post" action="login.php" autocomplete="on">
    <input type="hidden" name="csrf" value="<?= iq_e($csrf) ?>">
    <input type="hidden" name="next" value="<?= iq_e($next) ?>">
    <label for="user">User name</label>
    <input type="text" id="user" name="user" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus>
    <label for="password">Password</label>
    <input type="password" id="password" name="password" autocomplete="current-password" required>
    <button type="submit">Sign in</button>
  </form>
<?php endif; ?>
</main>
</body>
</html>
