# IniqDash tests

Run everything: `tests/run-all.sh` (parallel; `--slow` adds the two long sweeps; `RUN_JOBS=2` limits concurrency). One line per suite, exact ok / FAIL counts, non-zero exit on any failure.

**What "real" means here.** No test talks to a real Home Assistant. Three levels are used and must not be confused:
1. *fixtures* — entities produced by the real server code (`server/ha/HaService.php`, via `tests/fixtures.php`) behind a mocked `api/ha_*.php` (`tests/lib/harness.mjs`);
2. *real PHP server + fake Home Assistant* — `tests/lib/live.mjs` starts PHP's built-in server with the real `gate.php`, sessions, CSRF, dashboard storage and HA layer,
   plus a small HTTP server that records every request it receives and can drop, fail or change entities. This is **not** a real Home Assistant;
3. *pure units* — PHP / Node without a browser.

Editor and application (real editor code in Chromium, local mode — no server):

    node tests/pages.mjs         page lifecycle: create, rename, duplicate, reorder, start page, delete (confirmation, current page, last page), persistence
    node tests/settings.mjs      dashboard settings, validation, undo, export → import, malformed import changes nothing
    node tests/journey-edit.mjs  empty page → container → widget → move / resize (keys, pointer, 8 handles) → duplicate / paste → undo → save → reload
    node tests/container.mjs     containers: children, move in / out, duplicate / paste (container only), delete + undo, one level of nesting, export / import
    node tests/grid-edit.mjs     Smart Grid in the editor: drop reflow, one-step undo, determinism, mobile flow layout
    node tests/reflow.mjs        MaisonReflow (pure): 600 random boards — deterministic, no overlap, in bounds, local
    node tests/mobile.mjs        a 390 × 844 window: 4-column grid, dialogs fit and scroll, Add flow, navigation, Save
    node tests/preview.mjs       Responsive Preview Studio: exact logical viewports, zoom never changes layout, rotate, custom, presets, multi, scrubber
    node tests/testmode.mjs      full-screen Test Mode: no editor chrome, logical size kept, navigation, Escape
    node tests/popup.mjs         popup host: Escape / outside / button, focus in, trapped, restored; no stale handlers
    node tests/notify.mjs        notifications: event → rule → template → surface, placeholders, dismissal, limits
    node tests/theme.mjs         theme data model: token rules, layers, model + server validation, apply, persistence, fallback
    node tests/style.mjs         Copy / Paste Style: corners + theme only, one undo
    node tests/app-a11y.mjs      landmarks, names, dialog semantics and focus, keyboard editing, reduced motion
    node tests/compat.mjs        older dashboards (v1, v2, v3 without newer keys) migrate deterministically; newer / versionless files refused
    node tests/demo.mjs          static demo mode: no server traffic, no secrets, simulated-data note, reset
    node tests/cleanup.mjs       (~5 min) repeated open / close of dialogs, pages, Test Mode, Details…: no timers, listeners or retained DOM left (forced GC)

Real PHP server + fake Home Assistant:

    node tests/security.mjs      unauthenticated access, login, CSRF / origin, traversal, storage validation + conflicts, HA token never exposed,
                                 only planned HA actions reach HA, uploads, private assets
    node tests/journey-live.mjs  new dashboard, save / reload, recovery drafts, conflict, export / import, rename / duplicate / delete, corrupt file
    node tests/journey-failure.mjs  HA unreachable / 502 / unavailable / removed entity, controls fail safe, bounded retries, recovery, not configured

Server (PHP):

    php tests/plan.php           capabilities + action planning (HaService::normalise / plan)
    php tests/actions.php        the secure action matrix (entity kinds × action names × hostile values)
    php tests/packages.php       widget package discovery / validation, hostile manifests, the custom action channel re-check
    php tests/checkmodel.php < m.json   the server's save validation of one model (used by other suites)
    tests/lint-php.sh            every PHP file parses

Widgets and library (fixtures):

    node tests/<family>.mjs            # robot · sensor · climate · light · cover · media · entitylist · datetime · timer · camera · person · sunmoon
    node tests/dialogs.mjs [type…]     # every widget's configuration dialog renders fully (guards CSS collisions with the editor's .ef framework)
    node tests/registry.mjs            # every widget type builds / validates / normalises, every variant renders, shipped dashboards validate, new CSS is iq-*
    node tests/editor.mjs              # the real editor: add, configure, place and persist the new widgets
    node tests/library.mjs [type…]     # (slow, ~15 min) the whole library through the real editor: add, variant, duplicate, copy / paste, undo, save / reload, export / import
    node tests/fit.mjs [type…]         # (slow) every widget × variant at its grid minimum and larger: nothing escapes the box, controls do not overlap, zoom-independent
    node tests/a11y.mjs [type…]        # accessible names, keyboard reach, state exposure, reduced-motion guards
    node tests/css-isolation.mjs       # widget CSS never defines framework classes (the `.ef` regression), iq-* names / properties / container names
    node tests/schema.mjs              # configuration consistency across widgets (entity, mappings, demo values, variants, shared fields)
    node tests/truth.mjs               # zero ≠ unavailable, false ≠ missing, optional attributes stay optional
    node tests/motion.mjs              # timers stop with the widget, no rAF loops, reduced motion silences animations
    node tests/dashboards.mjs          # shipped dashboards + every widget × variant validate in the editor model AND the server's save validation
    node tests/lib/shots.mjs out.png '[["sensor",{…},w,h]]' '[rows]'   # a contact sheet screenshot for visual checks

Playwright (with Chromium) and PHP 8.1+ (with curl, fileinfo, mbstring) must be available; a global Playwright install is found automatically.
