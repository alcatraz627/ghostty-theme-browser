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

// Quirk #3: a config WITH a theme line gets location-less errors from
// ghostty ("key: message", no path:line). The anchor must be recovered from
// the submitted text's last occurrence of that key.
test("themed config still yields line-anchored diagnostics", () => {
  if (!ghosttyBin()) return;
  const r = lint("theme = Solarized Osaka Night\nfont-size = banana\n");
  assert.equal(r.ok, false);
  const d = r.diagnostics.find((x) => x.key === "font-size");
  assert.ok(d, JSON.stringify(r));
  assert.equal(d.line, 2);
  assert.match(d.message, /invalid value/);
});

// Gate blocker 2: when a key appears on multiple lines and only one is
// invalid, the anchor must land on the INVALID line (matched by the quoted
// value in the message), never on a valid one via last-wins guessing.
test("duplicate key with one bad value anchors to the bad line", () => {
  if (!ghosttyBin()) return;
  const r = lint("theme = Solarized Osaka Night\nfont-size = banana\nfont-size = 12\n");
  const d = r.diagnostics.find((x) => x.key === "font-size");
  assert.ok(d, JSON.stringify(r));
  assert.equal(d.line, 2, JSON.stringify(r.diagnostics));
});

test("ambiguous duplicate errors degrade to file-level, never a wrong anchor", () => {
  if (!ghosttyBin()) return;
  // Both lines invalid with the SAME value: no unique quoted-value match, so
  // no line anchor may be claimed.
  const r = lint("theme = Solarized Osaka Night\nfont-size = banana\nfont-size = banana\n");
  const anchored = r.diagnostics.filter((x) => x.key === "font-size");
  assert.equal(anchored.length, 0, JSON.stringify(r.diagnostics));
  assert.ok(r.fileLevel.some((f) => f.key === "font-size"), JSON.stringify(r.fileLevel));
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

// A validator that did not run cleanly must never read as a clean config. These
// use fake validators through the same binary override the timeout test uses.
function fakeValidator(body) {
  const dir = mkdtempSync(join(tmpdir(), "lint-fakebin-"));
  const fake = join(dir, "ghostty");
  writeFileSync(fake, `#!/bin/sh\n${body}\n`);
  chmodSync(fake, 0o755);
  return { fake, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("errors printed with exit 0 do not read as a clean validation", () => {
  const v = fakeValidator('echo "error: SentryInitFailed"\nexit 0');
  try {
    const r = lint("font-size = 14\n", { bin: v.fake });
    assert.equal(r.ok, false, JSON.stringify(r));
    assert.ok(r.fileLevel.some((f) => /SentryInitFailed/.test(f.message)), JSON.stringify(r));
  } finally {
    v.cleanup();
  }
});

test("a non-zero exit with no output still fails and says why", () => {
  const v = fakeValidator("exit 133");
  try {
    const r = lint("font-size = 14\n", { bin: v.fake });
    assert.equal(r.ok, false, JSON.stringify(r));
    assert.ok(r.fileLevel.some((f) => /133/.test(f.message)), JSON.stringify(r));
  } finally {
    v.cleanup();
  }
});

test("a validator that prints nothing and exits 0 stays clean (guard silent on good input)", () => {
  const v = fakeValidator("exit 0");
  try {
    const r = lint("font-size = 14\n", { bin: v.fake });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.fileLevel, []);
  } finally {
    v.cleanup();
  }
});
