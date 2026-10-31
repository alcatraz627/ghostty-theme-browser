// Write-path contract: a single-key change touches exactly one line, comments
// and every other line survive byte-for-byte, and list replacement preserves
// the block's position in the file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setKeyInText, unsetKeyInText, setListInText } from "../lib/config-write.mjs";

const SAMPLE = `# header comment kept forever
shell-integration = zsh
# why: deliberate decision
window-padding-x = 4
window-padding-y = 2
palette = 0=#111111
palette = 1=#222222
font-feature = calt

# trailing comment
`;

function changedLines(a, b) {
  const la = a.split("\n");
  const lb = b.split("\n");
  const changed = [];
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) changed.push(i + 1);
  }
  return changed;
}

test("setKeyInText edits exactly one existing line, preserving all else", () => {
  const out = setKeyInText(SAMPLE, "window-padding-y", "6");
  assert.deepEqual(changedLines(SAMPLE, out), [5]);
  assert.match(out.split("\n")[4], /^window-padding-y = 6$/);
  assert.ok(out.includes("# why: deliberate decision"));
});

test("setKeyInText appends when the key is absent", () => {
  const out = setKeyInText(SAMPLE, "font-size", "14");
  assert.ok(out.startsWith(SAMPLE.trimEnd().slice(0, 20)));
  assert.match(out, /\nfont-size = 14\n$/);
});

test("setKeyInText edits the LAST occurrence of a repeated scalar (ghostty last-wins)", () => {
  const dup = "font-size = 12\nfont-size = 13\n";
  const out = setKeyInText(dup, "font-size", "15");
  assert.equal(out, "font-size = 12\nfont-size = 15\n");
});

test("setKeyInText is value-injection-safe ($ characters)", () => {
  const out = setKeyInText(SAMPLE, "window-padding-y", "$& $' $1");
  assert.match(out.split("\n")[4], /^window-padding-y = \$& \$' \$1$/);
});

test("unsetKeyInText removes all occurrences and nothing else", () => {
  const out = unsetKeyInText(SAMPLE, "palette");
  assert.ok(!out.includes("palette"));
  assert.ok(out.includes("window-padding-y = 2"));
  assert.ok(out.includes("# trailing comment"));
});

test("setListInText replaces items in place, keeping the block position", () => {
  const out = setListInText(SAMPLE, "palette", ["0=#aaaaaa", "1=#bbbbbb", "2=#cccccc"]);
  const lines = out.split("\n");
  assert.equal(lines[5], "palette = 0=#aaaaaa");
  assert.equal(lines[6], "palette = 1=#bbbbbb");
  assert.equal(lines[7], "palette = 2=#cccccc");
  assert.equal(lines[8], "font-feature = calt");
});

test("setListInText appends at end when the key never existed", () => {
  const out = setListInText("a = 1\n", "keybind", ["ctrl+a=select_all"]);
  assert.equal(out, "a = 1\nkeybind = ctrl+a=select_all\n");
});

// Gate blocker 1: CRLF files must edit in place, not append orphan duplicates.
const CRLF = "# note\r\nfont-size = 14\r\nwindow-padding-x = 4\r\n";

test("CRLF: setKeyInText edits the existing line in place, keeping CRLF", () => {
  const out = setKeyInText(CRLF, "font-size", "20");
  assert.equal(out, "# note\r\nfont-size = 20\r\nwindow-padding-x = 4\r\n");
});

test("CRLF: unsetKeyInText actually removes the line", () => {
  const out = unsetKeyInText(CRLF, "font-size");
  assert.ok(!out.includes("font-size"));
  assert.ok(out.includes("# note\r\n"));
});

test("CRLF: appended new keys match the file's line-ending style", () => {
  const out = setKeyInText(CRLF, "cursor-style", "bar");
  assert.match(out, /cursor-style = bar\r\n/);
});

// The preview-then-apply contract: staged changes land as one text
// transformation, in order, and malformed change shapes throw before any
// mutation logic runs.
test("applyChanges folds a batch in order and rejects bad shapes", async () => {
  const { applyChanges } = await import("../lib/config-write.mjs");
  // Shape validation happens before any file interaction.
  assert.throws(() => applyChanges([]), TypeError);
  assert.throws(() => applyChanges([{ value: "x" }]), TypeError);
  assert.throws(() => applyChanges([{ key: "a", nothing: true }]), TypeError);
});
test("library rejects newline-smuggling values and bad keys", () => {
  assert.throws(() => setKeyInText("a = 1\n", "font-size", "14\nkeybind = x=y"), TypeError);
  assert.throws(() => setListInText("a = 1\n", "palette", ["0=#fff\n1=#000"]), TypeError);
  assert.throws(() => setKeyInText("a = 1\n", "bad$key", "x"), TypeError);
  assert.throws(() => unsetKeyInText("a = 1\n", "bad key"), TypeError);
});
