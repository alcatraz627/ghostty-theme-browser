// Editing a list setting keeps the lines that stay exactly where they are, with
// the comments between them, and puts only the changed items in. A reorder, which
// cannot be done in place, falls back to replacing the block.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setListInText } from "../lib/config-write.mjs";

const base = ["palette = 1", "# between items", "palette = 2", "font-size = 13", ""].join("\n");
const crlf = (s) => s.replace(/\n/g, "\r\n");

test("adding an item at the end leaves the comment between the old items alone", () => {
  assert.equal(
    setListInText(base, "palette", ["1", "2", "3"]),
    ["palette = 1", "# between items", "palette = 2", "palette = 3", "font-size = 13", ""].join("\n")
  );
});

test("removing an item drops only that line", () => {
  assert.equal(
    setListInText(base, "palette", ["1"]),
    ["palette = 1", "# between items", "font-size = 13", ""].join("\n")
  );
  assert.equal(
    setListInText(base, "palette", ["2"]),
    ["# between items", "palette = 2", "font-size = 13", ""].join("\n")
  );
});

test("an item added between two keeps goes right after the one before it", () => {
  assert.equal(
    setListInText(base, "palette", ["1", "x", "2"]),
    ["palette = 1", "palette = x", "# between items", "palette = 2", "font-size = 13", ""].join("\n")
  );
});

test("an item added at the head goes before the first kept line", () => {
  assert.equal(
    setListInText(base, "palette", ["0", "1", "2"]),
    ["palette = 0", "palette = 1", "# between items", "palette = 2", "font-size = 13", ""].join("\n")
  );
});

test("a reorder cannot be done in place, so the block is replaced where it started", () => {
  assert.equal(
    setListInText(base, "palette", ["2", "1"]),
    ["palette = 2", "palette = 1", "# between items", "font-size = 13", ""].join("\n")
  );
});

test("when no old line survives the new items take the first old position", () => {
  assert.equal(
    setListInText(base, "palette", ["9"]),
    ["palette = 9", "# between items", "font-size = 13", ""].join("\n")
  );
});

test("an empty list removes every line of the key and nothing else", () => {
  assert.equal(setListInText(base, "palette", []), ["# between items", "font-size = 13", ""].join("\n"));
});

test("a key that never existed is appended at the end", () => {
  assert.equal(setListInText("font-size = 13\n", "palette", ["1"]), "font-size = 13\npalette = 1\n");
});

test("a repeated value keeps one line and drops the extra", () => {
  assert.equal(setListInText("palette = a\npalette = a\nx = 1\n", "palette", ["a"]), "palette = a\nx = 1\n");
});

test("CRLF: kept lines stay byte for byte and new lines use CRLF", () => {
  const out = setListInText(crlf(base), "palette", ["1", "2", "3"]);
  assert.equal(out, crlf(["palette = 1", "# between items", "palette = 2", "palette = 3", "font-size = 13", ""].join("\n")));
  assert.ok(!/[^\r]\n/.test(out), "no bare LF was introduced");
});

test("the result always lists the wanted values in the wanted order", () => {
  const cases = [["1", "2"], ["2", "1"], ["x"], ["1", "y", "2", "z"], ["z", "1"], []];
  for (const want of cases) {
    const out = setListInText(base, "palette", want);
    const got = out.split("\n").filter((l) => l.startsWith("palette = ")).map((l) => l.slice("palette = ".length));
    assert.deepEqual(got, want, JSON.stringify(want));
    assert.ok(out.includes("font-size = 13"));
  }
});
