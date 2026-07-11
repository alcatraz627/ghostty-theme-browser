// Schema contract, checked against the real installed binary: known keys get
// sensible types, repeated keys collapse into list entries, enum values are
// extracted from doc bullets, and nothing in the dump is dropped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchema } from "../lib/schema.mjs";
import { ghosttyBin } from "../lib/ghostty.mjs";

test("schema types for known keys match reality", () => {
  if (!ghosttyBin()) return;
  const { options } = buildSchema();
  const byKey = Object.fromEntries(options.map((o) => [o.key, o]));

  assert.equal(byKey["font-size"].type, "number");
  assert.equal(byKey["macos-option-as-alt"].category, "macOS");
  assert.equal(byKey["cursor-style"].type, "enum");
  assert.ok(byKey["cursor-style"].enumValues.includes("block"));
  assert.ok(byKey["cursor-style"].enumValues.includes("underline"));
  assert.equal(byKey["palette"].type, "list");
  assert.equal(byKey["keybind"].type, "list");
  assert.equal(byKey["theme"].category, "Colors");
  assert.match(byKey["font-family"].doc, /font famil/i);
});

test("repeated keys collapse to one option with all defaults", () => {
  if (!ghosttyBin()) return;
  const { options } = buildSchema();
  const palette = options.find((o) => o.key === "palette");
  assert.equal(palette.defaults.length, 256);
  const count = options.filter((o) => o.key === "palette").length;
  assert.equal(count, 1);
});

test("every option has a category and a type", () => {
  if (!ghosttyBin()) return;
  const { options } = buildSchema();
  assert.ok(options.length >= 150, `only ${options.length} options`);
  for (const o of options) {
    assert.ok(o.category, o.key);
    assert.ok(o.type, o.key);
  }
});
