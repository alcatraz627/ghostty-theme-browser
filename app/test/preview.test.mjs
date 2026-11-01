// The sample terminal is one pure function. Each key on PREVIEW_KEYS must change
// its output, a key off the list must not, and the Light/Dark variant must pick
// the right side of a theme pair.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PREVIEW_KEYS,
  PREVIEW_ROW_KEYS,
  buildPreview,
  themeNameFor,
  shownThemeName,
  themeHasPair,
  themeSides,
  previewsLive,
  LIVE_CAVEAT,
} from "../public/js/preview.mjs";

const BASE = {
  background: ["#101010"],
  foreground: ["#eeeeee"],
  "font-size": ["13"],
  "cursor-style": ["bar"],
};

test("the header names what the sample really shows", () => {
  const palette = Array.from({ length: 16 }, (_, i) => `${i}=#101010`);
  assert.equal(shownThemeName({}), "Default colors");
  assert.equal(shownThemeName({ theme: ["Nord"] }), "Nord");
  assert.equal(shownThemeName({ theme: ["light:Day,dark:Night"] }, "light"), "Day");
  assert.equal(shownThemeName({ theme: ["Nord"], background: ["#000000"] }), "Nord, plus your colors");
  assert.equal(shownThemeName({ background: ["#000000"] }), "Your colors");
  assert.equal(shownThemeName({ theme: ["Nord"], background: ["#000000"], foreground: ["#ffffff"], palette }), "Your colors", "every color is overridden, so the theme is not visible");
  assert.equal(shownThemeName({ theme: ["Nord"], background: ["#000000"], foreground: ["#ffffff"], palette: palette.slice(0, 3) }), "Nord, plus your colors");
});

// One different value for each key on the list.
const CHANGED = {
  palette: ["1=#123456"],
  background: ["#202020"],
  foreground: ["#fafafa"],
  "cursor-color": ["#ff00ff"],
  "cursor-text": ["#00ff00"],
  "cursor-style": ["block"],
  "selection-background": ["#334455"],
  "selection-foreground": ["#ffeedd"],
  "font-family": ["Hack"],
  "font-size": ["19"],
  "window-padding-x": ["12"],
  "window-padding-y": ["9"],
  "background-opacity": ["0.5"],
  "faint-opacity": ["0.2"],
};

test("PREVIEW_KEYS is exactly the fourteen keys the plan lists", () => {
  assert.deepEqual(PREVIEW_KEYS, [
    "palette", "background", "foreground", "cursor-color", "cursor-text", "cursor-style",
    "selection-background", "selection-foreground", "font-family", "font-size",
    "window-padding-x", "window-padding-y", "background-opacity", "faint-opacity",
  ]);
  assert.deepEqual(Object.keys(CHANGED).sort(), [...PREVIEW_KEYS].sort(), "the test covers every key");
});

for (const key of PREVIEW_KEYS) {
  test(`staging ${key} changes the preview`, () => {
    // Cursor text is the color under a block cursor, so it only shows with one.
    const base = key === "cursor-text" ? { ...BASE, "cursor-style": ["block"] } : BASE;
    const before = buildPreview({ values: base });
    const after = buildPreview({ values: { ...base, [key]: CHANGED[key] } });
    assert.notEqual(after, before);
  });
}

test("no attribute is broken by a quote in the font stack", () => {
  const html = buildPreview({ values: { ...BASE, "font-family": ['Evil" onload="x'] } });
  assert.doesNotMatch(html, /onload=/);
  assert.doesNotMatch(buildPreview({ values: BASE }), /style="[^"]*"[^>]*"SF Mono"/);
  assert.match(buildPreview({ values: BASE }), /'SF Mono'/);
});

for (const key of ["scrollback-limit", "cursor-style-blink", "window-save-state", "macos-titlebar-style", "copy-on-select", "font-feature", "keybind"]) {
  test(`staging ${key}, which is off the list, leaves the preview alone`, () => {
    assert.ok(!PREVIEW_KEYS.includes(key));
    const before = buildPreview({ values: BASE });
    const after = buildPreview({ values: { ...BASE, [key]: ["something"] } });
    assert.equal(after, before);
  });
}

test("cursor text claims to preview only while the cursor is a block", () => {
  assert.equal(previewsLive("cursor-text", { "cursor-style": ["bar"] }), false);
  assert.equal(previewsLive("cursor-text", { "cursor-style": ["underline"] }), false);
  assert.equal(previewsLive("cursor-text", { "cursor-style": ["block_hollow"] }), false);
  assert.equal(previewsLive("cursor-text", { "cursor-style": ["block"] }), true);
  assert.equal(previewsLive("cursor-text", {}, { "cursor-style": ["block"] }), true, "falls back to the default style");
  assert.equal(previewsLive("cursor-text", {}, {}), true, "and Ghostty's own default is a block");
});

test("the tag follows the sample: every claim matches a real change, every claim off the list is false", () => {
  const withBar = { ...BASE, "cursor-style": ["bar"] };
  assert.equal(previewsLive("cursor-text", withBar), buildPreview({ values: withBar }) !== buildPreview({ values: { ...withBar, "cursor-text": ["#ff0000"] } }));
  const withBlock = { ...BASE, "cursor-style": ["block"] };
  assert.equal(previewsLive("cursor-text", withBlock), buildPreview({ values: withBlock }) !== buildPreview({ values: { ...withBlock, "cursor-text": ["#ff0000"] } }));
  assert.equal(previewsLive("scrollback-limit", {}), false);
  assert.equal(previewsLive("font-size", {}), true);
  assert.match(LIVE_CAVEAT["font-family"], /installed in this browser/);
});

test("the theme row is marked live though its key is not a color key", () => {
  assert.ok(PREVIEW_ROW_KEYS.includes("theme"));
  assert.ok(!PREVIEW_KEYS.includes("theme"));
});

test("a theme supplies colors and an explicit key wins over it", () => {
  const colors = { A: { background: "#0000aa", foreground: "#aaaaaa", "palette.1": "#ab0000" } };
  const themed = buildPreview({ values: { theme: ["A"] }, themeColorsByName: colors });
  assert.match(themed, /#0000aa/);
  assert.match(themed, /#ab0000/);
  const explicit = buildPreview({ values: { theme: ["A"], background: ["#111111"] }, themeColorsByName: colors });
  assert.match(explicit, /#111111/);
  assert.doesNotMatch(explicit, /color-mix\(in srgb, #0000aa/);
});

test("a pair renders the chosen side", () => {
  const colors = { Day: { background: "#fefefe" }, Night: { background: "#010101" } };
  const values = { theme: ["light:Day,dark:Night"] };
  const light = buildPreview({ values, appearance: "light", themeColorsByName: colors });
  const dark = buildPreview({ values, appearance: "dark", themeColorsByName: colors });
  assert.match(light, /#fefefe/);
  assert.doesNotMatch(light, /#010101/);
  assert.match(dark, /#010101/);
  assert.notEqual(light, dark);
});

test("a single theme looks the same in both variants", () => {
  const colors = { Solo: { background: "#222222" } };
  const values = { theme: ["Solo"] };
  assert.equal(
    buildPreview({ values, appearance: "light", themeColorsByName: colors }),
    buildPreview({ values, appearance: "dark", themeColorsByName: colors })
  );
  assert.equal(themeHasPair(values), false);
});

test("no theme at all renders from the defaults and the explicit keys", () => {
  assert.equal(themeNameFor({}, "dark"), "");
  assert.equal(themeNameFor({ theme: [""] }, "light"), "");
  const html = buildPreview({ values: {}, appearance: "light" });
  assert.match(html, /class="term"/);
  assert.equal(html, buildPreview({ values: {}, appearance: "dark" }));
});

test("themeSides gives both halves of a pair and nothing for a single theme", () => {
  assert.deepEqual(themeSides("light:Catppuccin Latte,dark:Catppuccin Mocha"), { light: "Catppuccin Latte", dark: "Catppuccin Mocha" });
  assert.deepEqual(themeSides("dark:N,light:D"), { light: "D", dark: "N" });
  assert.equal(themeSides("TokyoNight"), null);
  assert.equal(themeSides("light:Only"), null);
  assert.equal(themeSides(""), null);
});

test("themeNameFor reads either order of a pair and falls back to the other side", () => {
  assert.equal(themeNameFor({ theme: ["dark:N,light:D"] }, "light"), "D");
  assert.equal(themeNameFor({ theme: ["dark:N"] }, "light"), "N");
  assert.equal(themeNameFor({ theme: ["light:D,dark:N"] }, "dark"), "N");
  assert.equal(themeHasPair({ theme: ["light:D,dark:N"] }), true);
});

test("schema defaults fill what the config leaves unset", () => {
  const html = buildPreview({ values: {}, defaults: { background: ["#abcdef"], palette: ["2=#00ff00"] } });
  assert.match(html, /#abcdef/);
  assert.match(html, /#00ff00/);
});

test("a stray character in a color value never reaches the style attribute", () => {
  const html = buildPreview({ values: { background: ['red;"><script>alert(1)</script>'] } });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /alert/);
});

test("two padding numbers read as left,right and top,bottom", () => {
  const html = buildPreview({ values: { "window-padding-x": ["3,9"], "window-padding-y": ["1,5"] } });
  assert.match(html, /padding:1px 9px 5px 3px/);
});

test("cursor styles draw different cursors", () => {
  const styles = ["block", "bar", "underline", "block_hollow"].map((s) => buildPreview({ values: { ...BASE, "cursor-style": [s] } }));
  assert.equal(new Set(styles).size, 4);
});
