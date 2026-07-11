// Lint contract: diagnostics come from the real Ghostty binary, line-anchored
// where the output names the candidate file, file-level otherwise, and a
// missing theme surfaces exactly ONCE even though the binary prints one line
// per tried lookup path.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lint } from "../lib/lint.mjs";
import { ghosttyBin } from "../lib/ghostty.mjs";

const BAD3 = 'font-size = banana\nnot-a-real-key = true\ntheme = NoSuchTheme\n';

test("valid config produces no diagnostics", () => {
  if (!ghosttyBin()) return;
  const r = lint("font-size = 14\nwindow-padding-x = 4\n");
  assert.equal(r.ok, true);
  assert.equal(r.diagnostics.length, 0);
  assert.equal(r.fileLevel.length, 0);
});

test("empty config is valid", () => {
  if (!ghosttyBin()) return;
  const r = lint("");
  assert.equal(r.ok, true);
});

test("3-error config: two line-anchored + one de-duplicated theme error", () => {
  if (!ghosttyBin()) return;
  const r = lint(BAD3);
  assert.equal(r.ok, false);

  assert.equal(r.diagnostics.length, 2, JSON.stringify(r.diagnostics));
  assert.deepEqual(
    r.diagnostics.map((d) => ({ line: d.line, key: d.key })),
    [
      { line: 1, key: "font-size" },
      { line: 2, key: "not-a-real-key" },
    ]
  );
  assert.match(r.diagnostics[0].message, /invalid value/);
  assert.match(r.diagnostics[1].message, /unknown field/);

  // The binary emits one "not found" line per tried path (2 on a standard
  // install); the UI must see exactly one entry for the one problem.
  const themeErrors = r.fileLevel.filter((f) => f.theme === "NoSuchTheme");
  assert.equal(themeErrors.length, 1, JSON.stringify(r.fileLevel));
});

test("existing theme does not produce a theme error (guard stays silent on good input)", () => {
  if (!ghosttyBin()) return;
  const r = lint("theme = Solarized Osaka Night\n");
  assert.equal(r.ok, true);
  assert.equal(r.fileLevel.length, 0);
});

// Validator finding 1: a spawn-level failure must surface as a message, never
// as "invalid config, 0 problems".
test("missing binary at spawn time surfaces as a file-level message", () => {
  const r = lint("font-size = 14\n", { bin: "/nonexistent/fake-ghostty" });
  assert.equal(r.ok, false);
  assert.match(r.fileLevel[0]?.message ?? "", /validation did not run/);
});

test("validator timeout surfaces as a file-level message", () => {
  const dir = mkdtempSync(join(tmpdir(), "lint-fakebin-"));
  const fake = join(dir, "slow.sh");
  writeFileSync(fake, "#!/bin/sh\nsleep 2\n");
  chmodSync(fake, 0o755);
  try {
    const r = lint("font-size = 14\n", { bin: fake, timeoutMs: 100 });
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics.length, 0);
    assert.match(r.fileLevel[0]?.message ?? "", /validation did not run/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Validator finding 2: an embedded newline in a quoted value makes ghostty
// echo user text where a key belongs; the parsed key must never be spoofable.
test("embedded newline in a quoted value cannot spoof a diagnostic key", () => {
  if (!ghosttyBin()) return;
  const r = lint('font-size = "x\n9999:TOTALLY_FAKE_KEY"\n');
  assert.ok(
    !r.diagnostics.some((d) => d.key === "9999"),
    JSON.stringify(r.diagnostics)
  );
  // Every attributed key must correspond to the submitted line's real key.
  for (const d of r.diagnostics) {
    assert.match(d.key, /^[A-Za-z0-9_-]*$/);
  }
});
