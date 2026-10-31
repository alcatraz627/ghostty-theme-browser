// Groups, labels and control types for the settings window, checked against the
// installed Ghostty binary: no known setting is left in "Other", each control
// matches how Ghostty reads the value, and flag lists keep unrelated flags.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchema } from "../lib/schema.mjs";
import { ghosttyBin } from "../lib/ghostty.mjs";
import { toggleFlag, flagState } from "../public/js/flags.mjs";

const schema = ghosttyBin() ? buildSchema() : null;
const byKey = (k) => schema.options.find((o) => o.key === k);

// key -> the group a person should find it in
const GROUPS = {
  theme: "Appearance", background: "Appearance", foreground: "Appearance", palette: "Appearance",
  "cursor-style": "Appearance", "cursor-style-blink": "Appearance", "font-size": "Appearance",
  "font-family": "Appearance", "window-padding-balance": "Appearance", "minimum-contrast": "Appearance",
  "search-foreground": "Appearance", "search-selected-background": "Appearance",
  "font-style": "Fonts", "font-feature": "Fonts",
  "macos-titlebar-style": "macOS", "macos-option-as-alt": "macOS",
  "window-save-state": "Window", "confirm-close-surface": "Window", "quit-after-last-window-closed": "Window",
  "initial-window": "Window", "undo-timeout": "Window", "drag-handle": "Window",
  "tab-inherit-working-directory": "Window", "split-inherit-working-directory": "Window",
  "notify-on-command-finish": "Notifications", "notify-on-command-finish-action": "Notifications",
  "notify-on-command-finish-after": "Notifications", "bell-features": "Notifications",
  "bell-audio-path": "Notifications", "bell-audio-volume": "Notifications",
  "desktop-notifications": "Notifications", "app-notifications": "Notifications", "progress-style": "Notifications",
  "scroll-to-bottom": "Scrolling", scrollbar: "Scrolling", "scrollback-limit-bytes": "Scrolling",
  "link-url": "Links and mouse", "link-osc8": "Links and mouse", "link-previews": "Links and mouse",
  "right-click-action": "Links and mouse", "middle-click-action": "Links and mouse",
  "focus-follows-mouse": "Links and mouse", "mouse-scroll-multiplier": "Links and mouse",
  "copy-on-select": "Clipboard", "clipboard-read": "Clipboard",
  "shell-integration": "Shell", "shell-integration-features": "Shell",
  keybind: "Keybinds", "key-remap": "Keybinds", "quick-terminal-position": "Quick terminal",
  "vt-window-resize-allowed": "Advanced", "osc-color-report-format": "Advanced", "image-storage-limit": "Advanced",
  term: "Advanced", "enquiry-response": "Advanced", "auto-update": "Advanced", "auto-update-channel": "Advanced",
  "config-file": "Advanced", "config-default-files": "Advanced", "custom-shader": "Advanced",
  "custom-shader-animation": "Advanced", "async-backend": "Advanced", language: "Advanced",
  "grapheme-width-method": "Advanced",
};

test("every listed setting lands in its named group", () => {
  if (!schema) return;
  const wrong = [];
  for (const [key, group] of Object.entries(GROUPS)) {
    const o = byKey(key);
    if (!o) wrong.push(`${key}: missing from the schema`);
    else if (o.category !== group) wrong.push(`${key}: ${o.category}, wanted ${group}`);
  }
  assert.deepEqual(wrong, []);
});

test("no setting is left in Other, so a new Ghostty key is named here and decided", () => {
  if (!schema) return;
  const other = schema.options.filter((o) => o.category === "Other").map((o) => o.key);
  assert.deepEqual(other, [], `these keys need a group: ${other.join(", ")}`);
});

test("controls match how Ghostty reads the value", () => {
  if (!schema) return;
  const balance = byKey("window-padding-balance");
  assert.equal(balance.type, "enum");
  assert.deepEqual(balance.enumValues, ["false", "true", "equal"]);
  for (const key of ["macos-titlebar-style", "macos-option-as-alt", "notify-on-command-finish"]) {
    assert.equal(byKey(key).type, "enum", key);
  }
  for (const key of ["bell-features", "shell-integration-features", "notify-on-command-finish-action"]) {
    assert.equal(byKey(key).type, "flags", key);
    assert.ok(byKey(key).flags.length >= 2, key);
  }
  // `font-family` stays a list so a fallback chain is never collapsed.
  assert.equal(byKey("font-family").type, "list");
});

test("every curated value appears in the option's own documentation, so drift is caught", () => {
  if (!schema) return;
  const missing = [];
  for (const o of schema.options) {
    for (const v of [...(o.type === "flags" ? o.flags : []), ...(o.type === "enum" ? o.enumValues : [])]) {
      if (!o.doc.includes(v) && !["true", "false"].includes(v)) missing.push(`${o.key}: ${v}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("every option has a human label and the key stays available", () => {
  if (!schema) return;
  for (const o of schema.options) {
    assert.ok(typeof o.label === "string" && o.label.length > 0, o.key);
    assert.ok(!/^[a-z0-9]+(-[a-z0-9]+)+$/.test(o.label), `label looks like a raw key: ${o.key}`);
  }
  assert.equal(byKey("window-padding-balance").label, "Padding balance");
  assert.equal(byKey("macos-titlebar-style").label, "Titlebar style");
  assert.equal(byKey("notify-on-command-finish-action").label, "Notification method");
});

test("toggling one flag keeps every other flag byte for byte", () => {
  const v = "no-system,no-audio,attention,title,no-border";
  assert.equal(toggleFlag(v, "audio", true), "no-system,audio,attention,title,no-border");
  assert.equal(toggleFlag(v, "title", false), "no-system,no-audio,attention,no-title,no-border");
  assert.equal(toggleFlag("attention,custom-token", "border", true), "attention,custom-token,border");
  assert.equal(toggleFlag("", "bell", true), "bell");
});

test("flagState reads on, off and unset from a value", () => {
  const v = "no-system,attention";
  assert.equal(flagState(v, "system"), false);
  assert.equal(flagState(v, "attention"), true);
  assert.equal(flagState(v, "title"), null);
});
