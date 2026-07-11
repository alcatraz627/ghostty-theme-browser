// The M1 acceptance gate: serialize(parse(f)) must be byte-identical for the
// real live config and every theme file shipped in the installed Ghostty
// bundle, plus constructed edge cases the corpus can't guarantee to contain.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse, serialize, pairs } from "../lib/config-model.mjs";
import { configState } from "../lib/paths.mjs";

const roundtrip = (text) => serialize(parse(text));

test("edge cases round-trip byte-identically", () => {
  const cases = [
    "",
    "\n",
    "key = value",
    "key = value\n",
    "# comment only, no newline",
    "   \n\t\n",
    "key=value\nkey =  spaced value  \n",
    "# CRLF content preserved\r\nkey = v\r\n",
    "not a valid line at all !!!\n",
    "palette = 0=#15161e\npalette = 1=#f7768e\n",
    "empty-reset =\n",
  ];
  for (const text of cases) {
    assert.equal(roundtrip(text), text, `failed for: ${JSON.stringify(text)}`);
  }
});

test("classification: pairs, comments, blanks, unknowns", () => {
  const model = parse("# c\n\ntheme = Nord\nweird !!\nkey=v\n");
  assert.deepEqual(
    model.entries.map((e) => e.kind),
    ["comment", "blank", "pair", "unknown", "pair"]
  );
  const p = pairs(model);
  assert.equal(p.length, 2);
  assert.deepEqual(
    { key: p[0].key, value: p[0].value, index: p[0].index },
    { key: "theme", value: "Nord", index: 2 }
  );
});

test("live config round-trips and parses its repeated keys", () => {
  const state = configState();
  if (!state.exists) return; // fresh machine: nothing to test against
  const text = readFileSync(state.path, "utf8");
  assert.equal(roundtrip(text), text);
  const paletteEntries = pairs(parse(text)).filter((e) => e.key === "palette");
  assert.ok(paletteEntries.length >= 2, "expected repeated palette keys");
});

test("all bundled theme files round-trip byte-identically", () => {
  const themesDir = "/Applications/Ghostty.app/Contents/Resources/ghostty/themes";
  if (!existsSync(themesDir)) return; // not a machine with Ghostty installed
  const names = readdirSync(themesDir);
  assert.ok(names.length > 400, `suspiciously few themes: ${names.length}`);
  for (const name of names) {
    const text = readFileSync(join(themesDir, name), "utf8");
    assert.equal(roundtrip(text), text, `theme failed round-trip: ${name}`);
  }
});
