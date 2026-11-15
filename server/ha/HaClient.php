<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * Home Assistant REST client (cURL) — the method Maison uses and has proven against the real
 * installation: the long-lived token is placed in the Authorization header of server-side
 * requests only. It is never logged, echoed, cached or returned to the browser.
 */
/** Not final: SimHaClient (server/ha/SimHa.php) replaces every public method for the simulated home. */
class HaClient
{
    /** @param array{url:string, token:string, verify_tls:bool, ca_file?:?string} $cfg */
    public function __construct(private readonly array $cfg) {}

    /** The HA connection settings from the private folder, or null (= demo data only). */
    public static function config(): ?array
    {
        $ha = iq_secrets()['ha'] ?? null;
        if (!is_array($ha)) {
            return null;
        }
        $url = rtrim((string) ($ha['url'] ?? ''), '/');
        $token = (string) ($ha['token'] ?? '');
        if (!preg_match('#^https?://[^\s/]+(:\d+)?(/.*)?$#i', $url) || strlen($token) < 20) {
            return null;
        }
        return ['url' => $url, 'token' => $token, 'verify_tls' => (bool) ($ha['verify_tls'] ?? true), 'ca_file' => isset($ha['ca_file']) ? (string) $ha['ca_file'] : null];
    }

    /**
     * @return array{status:int, body:mixed, error:?string}
     *   error: null | 'unreachable' | 'timeout' | 'auth' | 'http' | 'too_large'
     * @param int $maxBytes  0 = no limit; otherwise a larger answer is abandoned (error 'too_large')
     */
    public function request(string $method, string $path, ?array $json = null, int $timeout = 6, int $maxBytes = 0): array
    {
        $ch = curl_init($this->cfg['url'] . $path);
        $headers = ['Authorization: Bearer ' . $this->cfg['token'], 'Accept: application/json'];
        $opts = [
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => $this->cfg['verify_tls'],
            CURLOPT_SSL_VERIFYHOST => $this->cfg['verify_tls'] ? 2 : 0,
        ];
        if (!empty($this->cfg['ca_file'])) {
            $opts[CURLOPT_CAINFO] = $this->cfg['ca_file'];
        }
        if ($json !== null) {
            $headers[] = 'Content-Type: application/json';
            $opts[CURLOPT_POSTFIELDS] = json_encode($json, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }
        $opts[CURLOPT_HTTPHEADER] = $headers;
        $buf = '';
        $tooLarge = false;
        if ($maxBytes > 0) {
            $opts[CURLOPT_RETURNTRANSFER] = false;
            $opts[CURLOPT_WRITEFUNCTION] = static function ($ch, $chunk) use (&$buf, &$tooLarge, $maxBytes) {
                $buf .= $chunk;
                if (strlen($buf) > $maxBytes) {
                    $tooLarge = true;
                    return 0;                                   // abort: never load an unreasonable answer
                }
                return strlen($chunk);
            };
        }
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        if ($maxBytes > 0 && $raw === true) {
            $raw = $buf;
        }
        $errno = curl_errno($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($tooLarge) {
            return ['status' => $status, 'body' => null, 'error' => 'too_large'];
        }
        if ($raw === false || $errno !== 0) {
            // 'errno' (the cURL error number, never its message) lets the connection test name the cause precisely
            return ['status' => 0, 'body' => null, 'error' => $errno === CURLE_OPERATION_TIMEDOUT ? 'timeout' : 'unreachable', 'errno' => $errno];
        }
        if ($status === 401 || $status === 403) {
            return ['status' => $status, 'body' => null, 'error' => 'auth'];
        }
        if ($status >= 502 && $status <= 504) {
            return ['status' => $status, 'body' => null, 'error' => 'unreachable'];   // proxy (Nabu Casa) up, HA down
        }
        if ($status < 200 || $status >= 300) {
            return ['status' => $status, 'body' => null, 'error' => 'http'];
        }
        $body = json_decode((string) $raw, true);
        return ['status' => $status, 'body' => $body ?? (string) $raw, 'error' => null];
    }

    /**
     * Fetch an image for the artwork proxy. A path ("/api/media_player_proxy/…") is fetched from
     * Home Assistant WITH the token; an absolute URL (a streaming service's cover art) is fetched
     * WITHOUT it — the token never goes anywhere but Home Assistant. No redirects, 5 MB max,
     * images only.
     * @return array{type:string, body:string}|null
     */
    public function image(string $picture): ?array
    {
        $isPath = str_starts_with($picture, '/') && !str_starts_with($picture, '//');
        if (!$isPath && !preg_match('#^https?://[^\s]+$#i', $picture)) {
            return null;
        }
        $ch = curl_init($isPath ? $this->cfg['url'] . $picture : $picture);
        $max = 5 * 1024 * 1024;
        $buf = '';
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => $isPath ? $this->cfg['verify_tls'] : true,
            CURLOPT_SSL_VERIFYHOST => $isPath && !$this->cfg['verify_tls'] ? 0 : 2,
            CURLOPT_HTTPHEADER     => $isPath ? ['Authorization: Bearer ' . $this->cfg['token']] : [],
            CURLOPT_WRITEFUNCTION  => static function ($ch, $chunk) use (&$buf, $max) {
                $buf .= $chunk;
                return strlen($buf) > $max ? 0 : strlen($chunk);     // abort oversized answers
            },
        ]);
        if ($isPath && !empty($this->cfg['ca_file'])) {
            curl_setopt($ch, CURLOPT_CAINFO, $this->cfg['ca_file']);
        }
        $ok = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $type = strtolower((string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE));
        curl_close($ch);
        $type = trim(explode(';', $type)[0]);
        if ($ok === false || $status !== 200 || !in_array($type, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true) || $buf === '') {
            return null;
        }
        return ['type' => $type, 'body' => $buf];
    }

    /** GET several /api/states/<id> in parallel (fallback when the token may not render templates). */
    public function statesParallel(array $ids, int $timeout = 6): array
    {
        $mh = curl_multi_init();
        $handles = [];
        foreach ($ids as $id) {
            $ch = curl_init($this->cfg['url'] . '/api/states/' . rawurlencode($id));
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 4,
                CURLOPT_TIMEOUT        => $timeout,
                CURLOPT_SSL_VERIFYPEER => $this->cfg['verify_tls'],
                CURLOPT_SSL_VERIFYHOST => $this->cfg['verify_tls'] ? 2 : 0,
                CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $this->cfg['token'], 'Accept: application/json'],
            ]);
            if (!empty($this->cfg['ca_file'])) {
                curl_setopt($ch, CURLOPT_CAINFO, $this->cfg['ca_file']);
            }
            curl_multi_add_handle($mh, $ch);
            $handles[$id] = $ch;
        }
        do {
            $st = curl_multi_exec($mh, $running);
            if ($running) {
                curl_multi_select($mh, 0.5);
            }
        } while ($running && $st === CURLM_OK);
        $out = [];
        foreach ($handles as $id => $ch) {
            $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $out[$id] = ['code' => $code, 'body' => $code === 200 ? json_decode((string) curl_multi_getcontent($ch), true) : null];
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
        }
        curl_multi_close($mh);
        return $out;
    }

    /**
     * Home Assistant's WebSocket API, READ-ONLY use: one short connection that authenticates with the server-side token, sends the
     * given commands (each { type, … } — the caller allow-lists them) one after another, collects each result and closes. Used for the
     * recorder's long-term statistics, which the REST API does not offer. The token never leaves the server.
     * @param list<array<string,mixed>> $commands
     * @return array{error:?string, results:list<array{success:bool, result:mixed, error:?string}>}
     *   error: null | 'unreachable' | 'timeout' | 'auth' | 'http' | 'too_large' | 'protocol'
     */
    public function ws(array $commands, int $timeout = 12, int $maxBytes = 8388608): array
    {
        $u = parse_url($this->cfg['url']);
        if (!is_array($u) || empty($u['host'])) {
            return ['error' => 'unreachable', 'results' => []];
        }
        $tls = strtolower((string) ($u['scheme'] ?? 'http')) === 'https';
        $port = (int) ($u['port'] ?? ($tls ? 443 : 80));
        $path = rtrim((string) ($u['path'] ?? ''), '/') . '/api/websocket';
        $ctx = stream_context_create(['ssl' => ['verify_peer' => $this->cfg['verify_tls'], 'verify_peer_name' => $this->cfg['verify_tls'], 'SNI_enabled' => true]]);
        if (!empty($this->cfg['ca_file'])) {
            stream_context_set_option($ctx, 'ssl', 'cafile', $this->cfg['ca_file']);
        }
        $deadline = microtime(true) + $timeout;
        $errno = 0;
        $errstr = '';
        $sock = @stream_socket_client(($tls ? 'tls://' : 'tcp://') . $u['host'] . ':' . $port, $errno, $errstr, 4, STREAM_CLIENT_CONNECT, $ctx);
        if (!is_resource($sock)) {
            return ['error' => 'unreachable', 'results' => []];
        }
        stream_set_timeout($sock, max(1, $timeout));
        $key = base64_encode(random_bytes(16));
        $host = $u['host'] . (isset($u['port']) ? ':' . $u['port'] : '');
        fwrite($sock, "GET {$path} HTTP/1.1\r\nHost: {$host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {$key}\r\nSec-WebSocket-Version: 13\r\n\r\n");
        $head = '';
        while (!str_contains($head, "\r\n\r\n")) {
            $c = fread($sock, 1);
            if ($c === false || $c === '' || microtime(true) > $deadline || strlen($head) > 8192) {
                fclose($sock);
                return ['error' => microtime(true) > $deadline ? 'timeout' : 'unreachable', 'results' => []];
            }
            $head .= $c;
        }
        if (!preg_match('#^HTTP/1\.[01] 101#', $head)) {
            fclose($sock);
            return ['error' => preg_match('#^HTTP/1\.[01] (401|403)#', $head) ? 'auth' : 'http', 'results' => []];
        }
        $total = 0;
        $read = function () use ($sock, $deadline, $maxBytes, &$total): ?array {
            $msg = '';
            while (true) {
                $h = $this->wsRead($sock, 2, $deadline);
                if ($h === null) {
                    return null;
                }
                $op = ord($h[0]) & 0x0f;
                $fin = (ord($h[0]) & 0x80) !== 0;
                $len = ord($h[1]) & 0x7f;
                if ($len === 126) {
                    $x = $this->wsRead($sock, 2, $deadline);
                    $len = $x === null ? -1 : unpack('n', $x)[1];
                } elseif ($len === 127) {
                    $x = $this->wsRead($sock, 8, $deadline);
                    $len = $x === null ? -1 : (int) unpack('J', $x)[1];
                }
                if ($len < 0 || ($total += $len) > $maxBytes) {
                    return ['__too_large' => true];
                }
                $data = $len > 0 ? $this->wsRead($sock, $len, $deadline) : '';
                if ($data === null) {
                    return null;
                }
                if ($op === 9) {                        // ping → pong
                    $this->wsSend($sock, $data, 10);
                    continue;
                }
                if ($op === 8) {
                    return null;
                }
                $msg .= $data;
                if ($fin && ($op === 1 || $op === 0)) {
                    $j = json_decode($msg, true);
                    return is_array($j) ? $j : ['__bad' => true];
                }
            }
        };
        $fail = function (string $e) use ($sock): array {
            @fclose($sock);
            return ['error' => $e, 'results' => []];
        };
        $m = $read();
        if (!is_array($m) || ($m['type'] ?? '') !== 'auth_required') {
            return $fail(microtime(true) > $deadline ? 'timeout' : 'protocol');
        }
        $this->wsSend($sock, json_encode(['type' => 'auth', 'access_token' => $this->cfg['token']]));
        $m = $read();
        if (!is_array($m) || ($m['type'] ?? '') !== 'auth_ok') {
            return $fail(is_array($m) && ($m['type'] ?? '') === 'auth_invalid' ? 'auth' : 'protocol');
        }
        $results = [];
        foreach (array_values($commands) as $i => $cmd) {
            $id = $i + 1;
            $this->wsSend($sock, json_encode(['id' => $id] + $cmd, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            while (true) {
                $m = $read();
                if (!is_array($m)) {
                    return $fail(microtime(true) > $deadline ? 'timeout' : 'protocol');
                }
                if (isset($m['__too_large'])) {
                    return $fail('too_large');
                }
                if (($m['id'] ?? null) === $id && ($m['type'] ?? '') === 'result') {
                    $results[] = ['success' => (bool) ($m['success'] ?? false), 'result' => $m['result'] ?? null, 'error' => is_array($m['error'] ?? null) ? (string) ($m['error']['code'] ?? 'error') : null];
                    break;
                }
            }
        }
        $this->wsSend($sock, '', 8);
        @fclose($sock);
        return ['error' => null, 'results' => $results];
    }

    /** exactly $n bytes from the socket, or null (closed / timed out) */
    private function wsRead($sock, int $n, float $deadline): ?string
    {
        $buf = '';
        while (strlen($buf) < $n) {
            if (microtime(true) > $deadline) {
                return null;
            }
            $c = fread($sock, $n - strlen($buf));
            if ($c === false || ($c === '' && feof($sock))) {
                return null;
            }
            $buf .= $c;
        }
        return $buf;
    }

    /** one masked frame (a client must mask): text by default */
    private function wsSend($sock, string $data, int $op = 1): void
    {
        $len = strlen($data);
        $h = chr(0x80 | $op);
        if ($len < 126) {
            $h .= chr(0x80 | $len);
        } elseif ($len < 65536) {
            $h .= chr(0x80 | 126) . pack('n', $len);
        } else {
            $h .= chr(0x80 | 127) . pack('J', $len);
        }
        $mask = random_bytes(4);
        $masked = '';
        for ($i = 0; $i < $len; $i++) {
            $masked .= $data[$i] ^ $mask[$i % 4];
        }
        @fwrite($sock, $h . $mask . $masked);
    }
}
