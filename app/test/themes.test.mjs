// Theme reading against the real installed corpus: the list matches the
// binary's own listing, a known theme parses with expanded palette keys, and
// hostile names never reach the filesystem.

import { test } from "node:test";
import assert from "node:assert/strict";
import { listThemes, themeColors } from "../lib/themes.mjs";
import { ghosttyBin } from "../lib/ghostty.mjs";

test("listThemes returns the binary's corpus with source tags", () => {
  if (!ghosttyBin()) return;
  const themes = listThemes();
  assert.ok(themes.length > 400, `${themes.length}`);
  assert.ok(themes.every((t) => t.name && (t.source === "user" || t.source === "resources")));
  assert.ok(themes.some((t) => t.name === "Solarized Osaka Night"));
});

test("themeColors parses a real bundled theme with palette expansion", () => {
  if (!ghosttyBin()) return;
  const { colors } = themeColors("Solarized Osaka Night");
  assert.match(colors.background, /^#?[0-9a-fA-F]{6}$/);
  assert.match(colors["palette.0"], /^#?[0-9a-fA-F]{6}$/);
  assert.match(colors["palette.15"], /^#?[0-9a-fA-F]{6}$/);
});

test("hostile theme names are rejected before any fs access", () => {
  for (const bad of ["../../etc/passwd", "a/b", "", "  ", 42]) {
    assert.throws(() => themeColors(bad), TypeError, String(bad));
  }
  assert.throws(() => themeColors("Definitely No Such Theme Zz"), /no such theme/);
});
