#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
# Copyright © 2026 Marcel Rymenhout and IniqDash contributors
# Runs the whole suite, several suites at a time, and prints one line per suite (exit code, ok / FAIL counts) plus the first failures.
#   tests/run-all.sh              everything except the two very slow sweeps
#   tests/run-all.sh --slow       + fit.mjs and library.mjs (every widget × variant; each ~15 min)
#   RUN_JOBS=2 tests/run-all.sh   parallel suites (default 4; each starts its own browser / PHP server on a free port)
#   Suites that change shared repository files (room-dropin) run alone after the parallel batch (SERIAL below).
# Exit status is non-zero when any suite fails. Needs php, node and Playwright with Chromium (see tests/README.md).
cd "$(dirname "$0")/.." || exit 1
JOBS="${RUN_JOBS:-4}"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

# name|command   (longest first: they start first and the short ones fill the gaps)
SUITES=(
  "cleanup|node tests/cleanup.mjs"
  "journey-live|node tests/journey-live.mjs"
  "room-complete|node tests/room-complete.mjs"
  "room-area|node tests/room-area.mjs"
  "room-collection|node tests/room-collection.mjs"
  "room-lights|node tests/room-lights.mjs"
  "room-content|node tests/room-content.mjs"
  "icons|node tests/icons.mjs"
  "icon-anim|node tests/icon-anim.mjs"
  "room-variants|node tests/room-variants.mjs"
  "room-reference|node tests/room-reference.mjs"
  "room-render-bugs|node tests/room-render-bugs.mjs"
  "custom-roles|node tests/custom-roles.mjs"
  "inspector|node tests/inspector.mjs"
  "journey-failure|node tests/journey-failure.mjs"
  "security|node tests/security.mjs"
  "proxy-trust|node tests/proxy-trust.mjs"
  "csp|node tests/csp.mjs"
  "simulated-home|node tests/simulated-home.mjs"
  "iniqdash-demo|node tests/iniqdash-demo.mjs"
  "demo-default|node tests/demo-default.mjs"
  "studio-resize|node tests/studio-resize.mjs"
  "studio-copy|node tests/studio-copy.mjs"
  "grid-nested|node tests/grid-nested.mjs"
  "grid-unified|node tests/grid-unified.mjs"
  "gallery-organise|node tests/gallery-organise.mjs"
  "multi-select|node tests/multi-select.mjs"
  "widget-manager|node tests/widget-manager.mjs"
  "generate-dashboard|node tests/generate-dashboard.mjs"
  "generate-robust|node tests/generate-robust.mjs"
  "calendar-multi|node tests/calendar-multi.mjs"
  "live-sync|node tests/live-sync.mjs"
  "vehicle|node tests/vehicle.mjs"
  "energy-system|node tests/energy-system.mjs"
  "templates-actions|node tests/templates-actions.mjs"
  "generate-v2|node tests/generate-v2.mjs"
  "climate-group|node tests/climate-group.mjs"
  "todo-updates-humidifier|node tests/todo-updates-humidifier.mjs"
  "countdown-photoframe|node tests/countdown-photoframe.mjs"
  "setup-wizard|node tests/setup-wizard.mjs"
  "ui-polish|node tests/ui-polish.mjs"
  "generator-quality|node tests/generator-quality.mjs"
  "setup-hosting|node tests/setup-hosting.mjs"
  "case-names|node tests/case-names.mjs"
  "about|node tests/about.mjs"
  "energy-widgets|node tests/energy-widgets.mjs"
  "screen-layouts|node tests/screen-layouts.mjs"
  "batteries|node tests/batteries.mjs"
  "studio-design-tools|node tests/studio-design-tools.mjs"
  "studio-structure|node tests/studio-structure.mjs"
  "studio-chart|node tests/studio-chart.mjs"
  "studio-gauge|node tests/studio-gauge.mjs"
  "dialogs|node tests/dialogs.mjs"
  "journey-edit|node tests/journey-edit.mjs"
  "container|node tests/container.mjs"
  "grid-edit|node tests/grid-edit.mjs"
  "mobile|node tests/mobile.mjs"
  "preview|node tests/preview.mjs"
  "pages|node tests/pages.mjs"
  "settings|node tests/settings.mjs"
  "theme|node tests/theme.mjs"
  "style|node tests/style.mjs"
  "popup|node tests/popup.mjs"
  "popup-v2|node tests/popup-v2.mjs"
  "popup-settings|node tests/popup-settings.mjs"
  "popup-hero-info|node tests/popup-hero-info.mjs"
  "visual-sizing|node tests/visual-sizing.mjs"
  "notify|node tests/notify.mjs"
  "notify-designer|node tests/notify-designer.mjs"
  "notify-acceptance|node tests/notify-acceptance.mjs"
  "dashboard-repair|node tests/dashboard-repair.mjs"
  "grid-geometry|node tests/grid-geometry.mjs"
  "tabs-swipe|node tests/tabs-swipe.mjs"
  "expandlist|node tests/expandlist.mjs"
  "theme-studio|node tests/theme-studio.mjs"
  "theme-background|node tests/theme-background.mjs"
  "theme-collection|node tests/theme-collection.mjs"
  "theme-apply|node tests/theme-apply.mjs"
  "studio-toolbox|node tests/studio-toolbox.mjs"
  "gallery-thumbnails|node tests/gallery-thumbnails.mjs"
  "weather-presets|node tests/weather-presets.mjs"
  "alarm-presets|node tests/alarm-presets.mjs"
  "camera-ptz|node tests/camera-ptz.mjs"
  "flow-connector|node tests/flow-connector.mjs"
  "app-shell|node tests/app-shell.mjs"
  "settings-app|node tests/settings-app.mjs"
  "shared-controls|node tests/shared-controls.mjs"
  "energy-dynamic|node tests/energy-dynamic.mjs"
  "energy-tesla|node tests/energy-tesla.mjs"
  "sun-arc|node tests/sun-arc.mjs"
  "energy-charts|node tests/energy-charts.mjs"
  "sunmoon-presets|node tests/sunmoon-presets.mjs"
  "activity|node tests/activity.mjs"
  "alarm-code|node tests/alarm-code.mjs"
  "testmode|node tests/testmode.mjs"
  "app-a11y|node tests/app-a11y.mjs"
  "demo|node tests/demo.mjs"
  "visual|node tests/visual.mjs"
  "reflow|node tests/reflow.mjs"
  "editor|node tests/editor.mjs"
  "registry|node tests/registry.mjs"
  "schema|node tests/schema.mjs"
  "compat|node tests/compat.mjs"
  "dashboards|node tests/dashboards.mjs"
  "a11y|node tests/a11y.mjs"
  "truth|node tests/truth.mjs"
  "motion|node tests/motion.mjs"
  "css-isolation|node tests/css-isolation.mjs"
  "robot|node tests/robot.mjs"
  "sensor|node tests/sensor.mjs"
  "climate|node tests/climate.mjs"
  "climate-reference|node tests/climate-reference.mjs"
  "climate-placement|node tests/climate-placement.mjs"
  "climate-infobar|node tests/climate-infobar.mjs"
  "component-foundation|node tests/component-foundation.mjs"
  "widget-studio|node tests/widget-studio.mjs"
  "dial-slider|node tests/dial-slider.mjs"
  "studio-ha-library|node tests/studio-ha-library.mjs"
  "studio-primitives|node tests/studio-primitives.mjs"
  "studio-v2|node tests/studio-v2.mjs"
  "studio-properties|node tests/studio-properties.mjs"
  "studio-nomagic|node tests/studio-nomagic.mjs"
  "component-previews|node tests/component-previews.mjs"
  "studio-mixed|node tests/studio-mixed.mjs"
  "css-namespace|node tests/css-namespace.mjs"
  "widget-surface|node tests/widget-surface.mjs"
  "appearance|node tests/appearance.mjs"
  "light|node tests/light.mjs"
  "light-variants|node tests/light-variants.mjs"
  "light-reference|node tests/light-reference.mjs"
  "artwork-picker|node tests/artwork-picker.mjs"
  "image-library|node tests/image-library.mjs"
  "cover|node tests/cover.mjs"
  "media|node tests/media.mjs"
  "entitylist|node tests/entitylist.mjs"
  "datetime|node tests/datetime.mjs"
  "timer|node tests/timer.mjs"
  "camera|node tests/camera.mjs"
  "person|node tests/person.mjs"
  "sunmoon|node tests/sunmoon.mjs"
  "php-lint|bash tests/lint-php.sh"
  "plan.php|php tests/plan.php"
  "actions.php|php tests/actions.php"
  "packages.php|php tests/packages.php"
  "notices.php|php tests/notices.php"
  "proxy.php|php tests/proxy.php"
  "release-packaging|bash tests/release-packaging.sh"
)
# maintainers-only suites are not part of every copy of the project: run only those present
KEEP=(); for s in "${SUITES[@]}"; do f=$(echo "${s#*|}" | grep -o -E 'tests/[^ ]+' | head -1); if [ -z "$f" ] || [ -e "$f" ]; then KEEP+=("$s"); fi; done; SUITES=("${KEEP[@]}")
if [ "$1" = "--slow" ]; then SUITES=("library|node tests/library.mjs" "fit|node tests/fit.mjs" "${SUITES[@]}"); fi

run_one() {
  local name="${1%%|*}" cmd="${1#*|}"
  bash -c "$cmd" > "$OUT/$name.out" 2>&1
  echo $? > "$OUT/$name.code"
}
export -f run_one; export OUT
printf '%s\n' "${SUITES[@]}" | xargs -P "$JOBS" -I{} bash -c 'run_one "$1"' _ {}
# suites that change files every other suite uses (room-dropin removes and restores widgets/custom/room-scene to test drop-in
# discovery): run ALONE, after the parallel batch — never beside the suites that load that package
SERIAL=("room-dropin|node tests/room-dropin.mjs")
for s in "${SERIAL[@]}"; do run_one "$s"; done
SUITES+=("${SERIAL[@]}")

rc=0; ok=0; fail=0
for s in "${SUITES[@]}"; do
  name="${s%%|*}"; code="$(cat "$OUT/$name.code" 2>/dev/null || echo '?')"
  o=$(grep -cE '^ok' "$OUT/$name.out"); f=$(grep -cE '^FAIL' "$OUT/$name.out")
  ok=$((ok + o)); fail=$((fail + f))
  printf '%-18s exit=%-3s ok=%-4s FAIL=%s\n' "$name" "$code" "$o" "$f"
  if [ "$code" != "0" ] || [ "$f" != "0" ]; then rc=1; grep -E '^FAIL|Error|error:|SyntaxError' "$OUT/$name.out" | head -8 | cut -c1-220; fi
done
echo "---- total: ok=$ok FAIL=$fail  ($(date -u +%H:%M:%SZ))"
exit $rc
