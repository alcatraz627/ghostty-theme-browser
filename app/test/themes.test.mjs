// Theme reading against the real installed corpus: the list matches the
// binary's own listing, a known theme parses with expanded palette keys, and
// hostile names never reach the filesystem.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Hermetic user-themes dir BEFORE the module loads (env.mjs reads at import
// time) — lets tests craft user themes without touching ~/.config.
const SANDBOX = mkdtempSync(join(tmpdir(), "gcm-themes-"));
process.env.XDG_CONFIG_HOME = SANDBOX;

// Dynamic imports on purpose: the env override above must precede env.mjs.
const { listThemes, themeColors } = await import("../lib/themes.mjs");
const { ghosttyBin } = await import("../lib/ghostty.mjs");

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
  // "." resolves to the themes DIRECTORY itself — the gate's EISDIR finding.
  for (const bad of ["../../etc/passwd", "a/b", "", "  ", 42, ".", ".hidden"]) {
    assert.throws(() => themeColors(bad), TypeError, String(bad));
  }
  assert.throws(() => themeColors("Definitely No Such Theme Zz"), /no such theme/);
});

test("a directory shadowing a theme name is not a theme", () => {
  mkdirSync(join(SANDBOX, "ghostty", "themes", "zz-dir-trap"), { recursive: true });
  assert.throws(() => themeColors("zz-dir-trap"), /no such theme/);
});

test("out-of-range palette indices are dropped, not modeled", () => {
  const dir = join(SANDBOX, "ghostty", "themes");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "zz-range-test"), "palette = 999=#ff00ff\npalette = 15=#00ff00\n");
  const { colors } = themeColors("zz-range-test");
  assert.equal(colors["palette.999"], undefined);
  assert.equal(colors["palette.15"], "#00ff00");
});
