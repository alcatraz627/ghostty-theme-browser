#!/bin/bash
# The settings window's checks that need no browser. Exits non-zero on any
# violation, so it can gate a commit or a hand-off. Run it from anywhere:
#   bash app/checks/settings-gui.sh
#
# Browser-only checks (screenshots, hover, resize, real key presses) are not
# here; they need a person or a headless browser and are reported separately.

set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 2

fail=0
ok() { echo "ok    $1"; }
bad() { echo "FAIL  $1"; fail=1; }

# D-STAGE-01: the instant-write endpoint is gone and nothing in the page calls it.
if grep -rn "config/set" app/server.mjs app/public >/dev/null 2>&1; then
  bad "the old per-key route /api/config/set is still referenced"
  grep -rn "config/set" app/server.mjs app/public
else
  ok "no /api/config/set route or caller"
fi

# D-SAFE-01: both write endpoints require a base hash.
required=$(grep -c "baseHashOf(body, { required: true })" app/server.mjs)
if [ "$required" -ge 2 ]; then
  ok "apply and save require baseHash ($required call sites)"
else
  bad "apply and save must both call baseHashOf(body, { required: true }); found $required"
fi

# D-USE-03 and D-USE-05: no literal colors outside tokens.css.
if grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(" app/public/styles/base.css app/public/styles/components.css >/dev/null 2>&1; then
  bad "a literal color is hard-coded in base.css or components.css"
  grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(" app/public/styles/base.css app/public/styles/components.css
else
  ok "no hex, rgb or hsl in base.css and components.css"
fi
if grep -nE "border-radius:[^;]*[0-9]+px|box-shadow:[^;]*[0-9]+px [0-9]+px [0-9]+px (rgba?|#)" app/public/styles/components.css >/dev/null 2>&1; then
  bad "a literal radius or shadow color is hard-coded in components.css"
  grep -nE "border-radius:[^;]*[0-9]+px" app/public/styles/components.css
else
  ok "radii and shadow colors read tokens"
fi

# The page shell has no inline script or style.
if grep -nE "<style|style=|<script([^>]*)>" app/public/index.html | grep -v 'src=' >/dev/null 2>&1; then
  bad "index.html has an inline script or style"
  grep -nE "<style|style=|<script([^>]*)>" app/public/index.html | grep -v 'src='
else
  ok "index.html has no inline script or style"
fi

# D-USE-07: every button's tooltip comes from the shortcut table. The audit is a
# test (app/test/tip-coverage.test.mjs) so it also runs in npm test; run it by name here.
if node --test app/test/tip-coverage.test.mjs >/dev/null 2>&1; then
  ok "every button carries a tip() tooltip"
else
  bad "tip coverage test fails (run: node --test app/test/tip-coverage.test.mjs)"
fi

# Everything else: the full suite.
if npm test --silent >/tmp/settings-gui-checks.$$ 2>&1; then
  ok "npm test: $(grep -E '^ℹ pass' /tmp/settings-gui-checks.$$ | tr -d 'ℹ ') $(grep -E '^ℹ fail' /tmp/settings-gui-checks.$$ | tr -d 'ℹ ')"
else
  bad "npm test failed"
  tail -40 /tmp/settings-gui-checks.$$
fi
rm -f /tmp/settings-gui-checks.$$

if [ "$fail" -ne 0 ]; then
  echo "settings-gui checks: FAILED"
  exit 1
fi
echo "settings-gui checks: all passed"
