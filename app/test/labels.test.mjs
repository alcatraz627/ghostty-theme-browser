// Labels, groups and search, plus the pure parts of the controls and the receipt.

import { test } from "node:test";
import assert from "node:assert/strict";
import { groupOptions, GROUP_ORDER, displayLabel, helpText, matchesQuery, filterOptions } from "../public/js/labels.mjs";
import {
  controlKind,
  hexForPicker,
  stepNumber,
  textToList,
  listToText,
  withFirstFont,
  flagShown,
  flagClick,
  listExample,
} from "../public/js/controls.mjs";
import { buildReceipt, formatKeybind, undoTargetFor, refusalText } from "../public/js/receipt.mjs";
import { lineDiff as pageDiff } from "../public/js/linediff.mjs";
import { lineDiff as serverDiff } from "../lib/diff.mjs";
import { tipHasShortcut, tip, KEYS } from "../public/js/keys.mjs";

const OPTS = [
  { key: "macos-titlebar-style", label: "Titlebar style", category: "macOS", type: "enum", enumValues: ["native", "transparent", "tabs", "hidden"], doc: "How the tab bar and titlebar combine.\n\nMore detail here." },
  { key: "font-size", label: "Font size", category: "Appearance", type: "number", default: "13", doc: "Font size in points. This value can be a non-integer." },
  { key: "bell-features", label: "Bell features", category: "Notifications", type: "flags", flags: ["system", "audio", "attention", "title", "border"], default: "no-system,no-audio,attention,title,no-border", doc: "Bell features." },
  { key: "window-padding-balance", label: "Padding balance", category: "Appearance", type: "enum", enumValues: ["false", "true", "equal"], doc: "Balance." },
  { key: "mystery", label: "", category: "Other", type: "string", doc: "" },
  { key: "background", label: "Background", category: "Appearance", type: "color", default: "#282c34", doc: "Background color." },
];

test("groups come in the order a person looks for them, Other last", () => {
  const groups = groupOptions([...OPTS].reverse()).map((g) => g.name);
  assert.deepEqual(groups, ["Appearance", "Notifications", "macOS", "Other"]);
  assert.ok(GROUP_ORDER.indexOf("Appearance") < GROUP_ORDER.indexOf("Advanced"));
});

test("an unknown group sorts after the known ones and before Other", () => {
  const groups = groupOptions([{ key: "a", category: "Other" }, { key: "b", category: "Zebra" }, { key: "c", category: "Advanced" }]).map((g) => g.name);
  assert.deepEqual(groups, ["Advanced", "Zebra", "Other"]);
});

test("displayLabel uses the schema label and never a bare key", () => {
  assert.equal(displayLabel(OPTS[0]), "Titlebar style");
  assert.equal(displayLabel(OPTS[4]), "Mystery");
  assert.equal(displayLabel(undefined, "window-save-state"), "Window save state");
});

test("helpText is the first sentence of the first paragraph", () => {
  assert.equal(helpText(OPTS[0]), "How the tab bar and titlebar combine.");
  assert.equal(helpText(OPTS[1]), "Font size in points.");
  assert.equal(helpText({ doc: "" }), "");
  assert.ok(helpText({ doc: "x".repeat(400) }).length <= 170);
});

test("search finds a setting by label, key and description", () => {
  assert.equal(matchesQuery(OPTS[0], "titlebar"), true, "key and label");
  assert.equal(matchesQuery(OPTS[0], "Titlebar Style"), true, "label, any case");
  assert.equal(matchesQuery(OPTS[0], "titlebar-style"), true, "the key itself");
  assert.equal(matchesQuery(OPTS[0], "tab bar"), true, "description");
  assert.equal(matchesQuery(OPTS[0], "scrollback"), false);
  assert.equal(matchesQuery(OPTS[0], ""), true);
});

test("filters: Modified means set in the file, Pending means staged", () => {
  const diskValues = { "font-size": ["13"] };
  const mod = filterOptions(OPTS, { modified: true, diskValues });
  assert.deepEqual(mod.map((o) => o.key), ["font-size"]);
  const pend = filterOptions(OPTS, { pendingOnly: true, pendingKeys: ["background"] });
  assert.deepEqual(pend.map((o) => o.key), ["background"]);
  const both = filterOptions(OPTS, { modified: true, pendingOnly: true, diskValues, pendingKeys: ["background"] });
  assert.deepEqual(both, []);
  assert.equal(filterOptions(OPTS, { q: "bell" }).length, 1);
});

test("the control matches how Ghostty reads the value", () => {
  assert.equal(controlKind({ key: "x", type: "boolean" }, "true"), "switch");
  assert.equal(controlKind(OPTS[0], "tabs"), "segmented", "four values make a segmented choice");
  assert.equal(controlKind(OPTS[3], "equal"), "segmented", "equal is representable");
  assert.equal(controlKind({ key: "x", type: "enum", enumValues: ["a", "b", "c", "d", "e"] }, "a"), "select", "five values make a select");
  assert.equal(controlKind(OPTS[0], "something-else"), "select", "an unlisted value still shows");
  assert.equal(controlKind(OPTS[2], ""), "flags", "a flag list is never a single choice");
  assert.equal(controlKind(OPTS[5], ""), "color");
  assert.equal(controlKind(OPTS[1], ""), "stepper");
  assert.equal(controlKind({ key: "keybind", type: "list" }, ""), "list");
  assert.equal(controlKind({ key: "font-family", type: "list" }, ""), "font");
  assert.equal(controlKind({ key: "theme", type: "string" }, ""), "theme");
  assert.equal(controlKind({ key: "x", type: "string" }, ""), "text");
  assert.equal(controlKind({ key: "x", type: "boolean" }, "equal"), "text", "a boolean holding another word still shows it");
});

test("the hex guard offers the picker only for a value it can show", () => {
  assert.equal(hexForPicker("#1A1B26"), "#1a1b26");
  assert.equal(hexForPicker("1a1b26"), "#1a1b26");
  assert.equal(hexForPicker("red"), null);
  assert.equal(hexForPicker("cell-foreground"), null);
  assert.equal(hexForPicker("#fff"), null);
  assert.equal(hexForPicker(""), null);
});

test("flag toggle keeps every other token byte for byte", () => {
  const user = "no-title,ssh-terminfo,ssh-env";
  const def = "cursor,sudo,title,no-ssh-env,no-ssh-terminfo,path";
  assert.equal(flagClick(user, def, "cursor"), "no-title,ssh-terminfo,ssh-env,no-cursor", "an unset flag follows the default, so a click turns it off");
  assert.equal(flagClick(user, def, "title"), "title,ssh-terminfo,ssh-env", "an off flag turns on in place");
  assert.equal(flagClick(user, def, "ssh-env"), "no-title,ssh-terminfo,no-ssh-env", "an on flag turns off in place");
  assert.equal(flagShown(user, def, "path"), true, "unset shows the default");
  assert.equal(flagShown(user, def, "title"), false);
  assert.equal(flagClick("", "attention", "attention"), "no-attention");
});

test("stepper moves by the right step, within bounds, and leaves bad text alone", () => {
  const size = { key: "font-size", default: "13" };
  const opacity = { key: "background-opacity", default: "1" };
  assert.equal(stepNumber("13", 1, size), "13.5");
  assert.equal(stepNumber("1", -1, size), "1", "font size stays at least 1");
  assert.equal(stepNumber("0.95", 1, opacity), "1");
  assert.equal(stepNumber("1", 1, opacity), "1", "opacity stops at 1");
  assert.equal(stepNumber("0", -1, opacity), "0");
  assert.equal(stepNumber("banana", 1, size), null, "text that is not a number is left for the validator");
  assert.equal(stepNumber("", 1, size), null);
  assert.equal(stepNumber("0.1", 1, { key: "x", default: "0.5" }), "0.2", "no float noise");
});

test("every list setting Ghostty has shows what one line looks like", async () => {
  const { ghosttyBin } = await import("../lib/ghostty.mjs");
  const { buildSchema } = await import("../lib/schema.mjs");
  assert.equal(listExample("palette"), "0=#15161e");
  assert.equal(listExample("keybind"), "super+t=new_tab");
  assert.equal(listExample("font-codepoint-map"), "U+E000-U+F8FF=Symbols Nerd Font Mono");
  assert.equal(listExample("env"), "NAME=value");
  assert.equal(listExample("font-feature"), "calt or -liga");
  assert.equal(listExample("font-variation"), "wght=600");
  assert.equal(listExample("command-palette-entry"), "title:Name,action:new_tab");
  assert.equal(listExample("config-file"), "?optional/path");
  assert.equal(listExample("custom-shader"), "path/to/shader.glsl");
  for (const k of ["font-family", "font-family-bold", "font-family-italic", "font-family-bold-italic"]) assert.equal(listExample(k), "Font name");
  if (!ghosttyBin()) return;
  const missing = buildSchema().options.filter((o) => o.type === "list" && !listExample(o.key)).map((o) => o.key);
  assert.deepEqual(missing, [], "a list key with no example would show only a generic placeholder");
});

test("list text round trips and drops blank lines", () => {
  assert.deepEqual(textToList(" a \n\n b\n"), ["a", "b"]);
  assert.equal(listToText(["a", "b"]), "a\nb");
});

test("the font box changes only the first font", () => {
  assert.deepEqual(withFirstFont(["Fira Code", "Hack", "Menlo"], "JetBrains Mono"), ["JetBrains Mono", "Hack", "Menlo"]);
  assert.deepEqual(withFirstFont([], "Hack"), ["Hack"]);
  assert.deepEqual(withFirstFont(["A"], ""), []);
  assert.deepEqual(withFirstFont(["A", "B"], ""), ["B"]);
});

test("a keybind reads as glyphs", () => {
  assert.equal(formatKeybind("super+shift+,"), "⌘⇧,");
  assert.equal(formatKeybind("ctrl+alt+r"), "⌃⌥R");
  assert.equal(formatKeybind(""), "");
});

test("the receipt names the backup, the entry, the count, the keybind and four ways back", () => {
  const response = {
    ok: true,
    backup: "/state/backups/config-5f1c9a02-2026-10-31T14-55-02-111Z",
    history: { hash: "9f3c2e1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    hash: "abc",
  };
  const entries = [
    { hash: "9f3c2e1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    { hash: "1111111111111111111111111111111111111111" },
  ];
  const r = buildReceipt({ kind: "apply", response, keyCount: 3, configPath: "/home/x/config", reloadKeybind: "super+shift+,", entries });
  assert.equal(r.title, "Applied 3 changes");
  assert.equal(r.backupName, "config-5f1c9a02-2026-10-31T14-55-02-111Z");
  assert.equal(r.historyShort, "9f3c2e1");
  assert.equal(r.reloadGlyph, "⌘⇧,");
  assert.equal(r.undoTarget, "1111111111111111111111111111111111111111", "undo restores the entry before this apply");
  assert.equal(r.restoreCommand, 'cp "/state/backups/config-5f1c9a02-2026-10-31T14-55-02-111Z" "/home/x/config"');
  assert.equal(r.backupPath, response.backup);
  assert.equal(buildReceipt({ kind: "apply", response, keyCount: 1, entries }).title, "Applied 1 change");
});

test("with no earlier entry or no new entry there is nothing to undo to", () => {
  assert.equal(undoTargetFor([{ hash: "a" }], "a"), null);
  assert.equal(undoTargetFor([{ hash: "b" }, { hash: "c" }], "a"), null);
  assert.equal(undoTargetFor([], null), null);
  const r = buildReceipt({ response: { ok: true, backup: null, history: null }, keyCount: 1 });
  assert.equal(r.undoTarget, null);
  assert.equal(r.restoreCommand, null);
  assert.match(r.historyNote, /identical/);
});

test("a refusal says nothing was written only when that is certain", () => {
  assert.match(refusalText("validation failed"), /Nothing was written/);
  assert.match(refusalText("config is locked by another process"), /Nothing was written/);
  const rb = refusalText("read-back mismatch");
  assert.match(rb, /written but did not read back the same/);
  assert.match(rb, /Check History/);
  assert.doesNotMatch(rb, /Nothing was written/);
  const fsErr = refusalText("filesystem error: ENOSPC");
  assert.match(fsErr, /Check History/);
  assert.doesNotMatch(fsErr, /Nothing was written/);
  assert.doesNotMatch(refusalText("something new"), /Nothing was written/);
});

test("the page's line diff matches the server's", () => {
  const cases = [
    ["a\nb\nc\n", "a\nB\nc\n"],
    ["a\n", ""],
    ["", "x\ny\n"],
    ["a\nb\nc\nd\ne\nf\ng\n", "a\nb\nc\nd\ne\nf\nG\n"],
    ["same\n", "same\n"],
  ];
  for (const [a, b] of cases) assert.deepEqual(pageDiff(a, b), serverDiff(a, b));
});

test("every tooltip is built from the shortcut table", () => {
  assert.equal(tip("Apply 3 changes", "apply"), "Apply 3 changes  ⌘↵");
  assert.equal(tipHasShortcut(tip("Discard", "discard")), true);
  assert.equal(tipHasShortcut("Discard"), false);
  for (const [id, k] of Object.entries(KEYS)) assert.ok(k.glyph, id);
});
