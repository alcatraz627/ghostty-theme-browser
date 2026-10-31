// Apply-safety contract: staged changes are previewed without writing, Apply
// refuses when the file changed since staging (checked twice), the preview text
// is exactly what Apply writes, and the server stops itself after idle time.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SANDBOX = mkdtempSync(join(tmpdir(), "gcm-apply-"));
process.env.GHOSTTY_MGR_STATE = join(SANDBOX, "state");
process.env.GHOSTTY_MGR_CONFIG = join(SANDBOX, "config");
const TARGET = process.env.GHOSTTY_MGR_CONFIG;

const cw = await import("../lib/config-write.mjs");
const { lineDiff } = await import("../lib/diff.mjs");
const { createIdleWatch } = await import("../lib/idle.mjs");
const { ghosttyBin } = await import("../lib/ghostty.mjs");

const BASE = "# keep me\nfont-size = 13\ncursor-style-blink = true\ntheme = Solarized Osaka Night\n";
const CHANGES = [
  { key: "font-size", value: "15" },
  { key: "cursor-style-blink", value: "false" },
];

function reset(text = BASE) {
  writeFileSync(TARGET, text);
}

test("hashOf is stable and differs when text differs", () => {
  assert.equal(cw.hashOf("a"), cw.hashOf("a"));
  assert.notEqual(cw.hashOf("a"), cw.hashOf("b"));
});

test("preview writes nothing and returns exactly the text Apply writes", () => {
  if (!ghosttyBin()) return;
  reset();
  const before = readFileSync(TARGET, "utf8");
  const preview = cw.previewChanges(CHANGES, { baseHash: cw.hashOf(before) });
  assert.equal(readFileSync(TARGET, "utf8"), before, "preview must not touch the file");
  assert.equal(preview.ok, true, JSON.stringify(preview.lint));
  const applied = cw.applyChanges(CHANGES, { baseHash: cw.hashOf(before) });
  assert.equal(applied.ok, true, JSON.stringify(applied));
  assert.equal(readFileSync(TARGET, "utf8"), preview.newText, "preview text equals applied text");
});

test("preview reports the diff as changed lines only, comments untouched", () => {
  if (!ghosttyBin()) return;
  reset();
  const preview = cw.previewChanges(CHANGES, { baseHash: cw.hashOf(BASE) });
  const changed = preview.diff.filter((d) => d.t === "+" || d.t === "-").map((d) => d.t + d.text);
  // Neighbouring changed lines form one block: removals first, then additions.
  assert.deepEqual(changed, ["-font-size = 13", "-cursor-style-blink = true", "+font-size = 15", "+cursor-style-blink = false"]);
  assert.ok(preview.newText.startsWith("# keep me\n"));
});

test("an invalid pending set is refused by preview and by Apply, and the file is untouched", () => {
  if (!ghosttyBin()) return;
  reset();
  const bad = [{ key: "font-size", value: "banana" }];
  const preview = cw.previewChanges(bad, { baseHash: cw.hashOf(BASE) });
  assert.equal(preview.ok, false);
  const applied = cw.applyChanges(bad, { baseHash: cw.hashOf(BASE) });
  assert.equal(applied.ok, false);
  assert.equal(applied.reason, "validation failed");
  assert.equal(readFileSync(TARGET, "utf8"), BASE);
});

test("a stale base hash is refused with reason stale and nothing is written", () => {
  if (!ghosttyBin()) return;
  reset();
  const staged = cw.hashOf(BASE);
  writeFileSync(TARGET, BASE + "# hand edit after staging\n");
  const edited = readFileSync(TARGET, "utf8");
  const applied = cw.applyChanges(CHANGES, { baseHash: staged });
  assert.equal(applied.ok, false);
  assert.equal(applied.reason, "stale");
  assert.equal(readFileSync(TARGET, "utf8"), edited, "the hand edit survives");
  const preview = cw.previewChanges(CHANGES, { baseHash: staged });
  assert.equal(preview.stale, true);
});

test("a hand edit that lands while Apply runs is caught by the second check", () => {
  if (!ghosttyBin()) return;
  reset();
  let edited = "";
  // The mutator runs inside Apply after the first read. Writing the file here
  // is the second writer: the pre-rename comparison must notice it.
  const result = cw.applyChange(
    (before) => {
      edited = before + "# second writer\n";
      writeFileSync(TARGET, edited);
      return cw.setKeyInText(before, "font-size", "15");
    },
    { message: "second-writer test" }
  );
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.reason, "stale");
  assert.equal(readFileSync(TARGET, "utf8"), edited, "second writer's text is still on disk");
  const strays = readdirSync(SANDBOX).filter((f) => f.endsWith(".tmp"));
  assert.deepEqual(strays, [], "no temp file is left behind");
});

test("a successful apply names its backup in the history message", async () => {
  if (!ghosttyBin()) return;
  reset();
  const r = cw.applyChanges(CHANGES, { baseHash: cw.hashOf(BASE) });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(r.backup && existsSync(r.backup));
  const { log } = await import("../lib/history.mjs");
  const newest = log(TARGET)[0];
  assert.match(newest.message, /\[backup config-/);
  assert.equal(r.hash, cw.hashOf(readFileSync(TARGET, "utf8")));
});

test("lineDiff marks only changed lines and keeps one line of context", () => {
  const d = lineDiff("a\nb\nc\nd\ne\n", "a\nb\nX\nd\ne\n");
  assert.deepEqual(d.map((x) => x.t + x.text), [" b", "-c", "+X", " d"]);
});

test("idle watch: polling alone lets the server stop, a person's request keeps it up", () => {
  let now = 0;
  let stopped = 0;
  const watch = createIdleWatch({ idleMs: 300_000, now: () => now, onIdle: () => stopped++ });
  now = 299_000; watch.check();
  assert.equal(stopped, 0);
  watch.touch(); // a click or page load
  now = 598_000; watch.check();
  assert.equal(stopped, 0, "touch reset the clock");
  now = 599_001; watch.check();
  assert.equal(stopped, 1, "5 quiet minutes after the last touch stops it");
});

test("idle watch is off when idleMs is 0", () => {
  let stopped = 0;
  const watch = createIdleWatch({ idleMs: 0, now: () => 10 ** 9, onIdle: () => stopped++ });
  watch.check();
  assert.equal(stopped, 0);
});
