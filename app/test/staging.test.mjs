// The pending set: stage, revert, discard, the overlay on the file's values, list
// keys, unset, and the change list the page sends to the API.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createStaging, normalizeChange, sameAsDisk } from "../public/js/staging.mjs";
import { valuesFromText } from "../public/js/store.mjs";

const DISK = valuesFromText(
  "# comment = x\nfont-size = 13\ntheme = Night\nfont-family = Fira Code\nfont-family = Hack\nclipboard-read = allow\n"
);
const BASE = { hash: "h1", text: "disk" };
const ctx = (key, extra = {}) => ({ disk: DISK[key], def: null, base: BASE, ...extra });

test("a staged value is listed once with its key", () => {
  const s = createStaging();
  s.stage("font-size", { value: "15" }, ctx("font-size"));
  assert.equal(s.size, 1);
  assert.deepEqual(s.changes(), [{ key: "font-size", value: "15" }]);
});

test("staging does not touch the disk values it was given", () => {
  const before = JSON.stringify(DISK);
  const s = createStaging();
  s.stage("font-size", { value: "15" }, ctx("font-size"));
  s.effective(DISK);
  assert.equal(JSON.stringify(DISK), before);
});

test("staging the value the file already has leaves nothing pending", () => {
  const s = createStaging();
  s.stage("font-size", { value: "13" }, ctx("font-size"));
  assert.equal(s.size, 0);
  assert.equal(s.base, null);
});

test("putting a value back removes it from the set", () => {
  const s = createStaging();
  s.stage("font-size", { value: "15" }, ctx("font-size"));
  s.stage("font-size", { value: "13" }, ctx("font-size"));
  assert.equal(s.size, 0);
});

test("revert removes one key and keeps the rest", () => {
  const s = createStaging();
  s.stage("font-size", { value: "15" }, ctx("font-size"));
  s.stage("theme", { value: "Day" }, ctx("theme"));
  s.revert("font-size");
  assert.deepEqual(s.keys(), ["theme"]);
  assert.ok(s.base, "base stays while something is still pending");
  s.revert("theme");
  assert.equal(s.base, null);
});

test("discard empties the set and returns what was pending", () => {
  const s = createStaging();
  s.stage("font-size", { value: "15" }, ctx("font-size"));
  s.stage("theme", { value: "Day" }, ctx("theme"));
  const dropped = s.discard();
  assert.equal(s.size, 0);
  assert.equal(dropped.size, 2);
  assert.deepEqual(s.changes(), []);
});

test("effective overlays pending values on the file's values", () => {
  const s = createStaging();
  s.stage("font-size", { value: "15" }, ctx("font-size"));
  s.stage("clipboard-read", { unset: true }, ctx("clipboard-read"));
  s.stage("macos-icon", { value: "xray" }, ctx("macos-icon"));
  const eff = s.effective(DISK);
  assert.deepEqual(eff["font-size"], ["15"]);
  assert.equal(eff["clipboard-read"], undefined);
  assert.deepEqual(eff["macos-icon"], ["xray"]);
  assert.deepEqual(eff.theme, ["Night"], "untouched keys come through");
  assert.deepEqual(DISK["font-size"], ["13"], "the input map is not changed");
});

test("a list key stages as values and keeps its order", () => {
  const s = createStaging();
  s.stage("font-family", { values: ["Fira Code", "Hack", "Menlo"] }, ctx("font-family"));
  assert.deepEqual(s.changes(), [{ key: "font-family", values: ["Fira Code", "Hack", "Menlo"] }]);
  assert.deepEqual(s.effective(DISK)["font-family"], ["Fira Code", "Hack", "Menlo"]);
});

test("a list equal to the file's list is no change", () => {
  const s = createStaging();
  s.stage("font-family", { values: ["Fira Code", "Hack"] }, ctx("font-family"));
  assert.equal(s.size, 0);
});

test("an empty value or an empty list means unset", () => {
  assert.deepEqual(normalizeChange({ value: "" }), { unset: true });
  assert.deepEqual(normalizeChange({ values: [] }), { unset: true });
  assert.deepEqual(normalizeChange({ unset: true }), { unset: true });
  assert.deepEqual(normalizeChange({ value: "x" }), { value: "x" });
});

test("unset is a change only when the file sets the key", () => {
  const s = createStaging();
  s.stage("font-size", { unset: true }, ctx("font-size"));
  s.stage("scrollback-limit", { unset: true }, ctx("scrollback-limit"));
  assert.deepEqual(s.changes(), [{ key: "font-size", unset: true }]);
});

test("choosing the default for a key the file does not set is no change", () => {
  const s = createStaging();
  s.stage("cursor-style", { value: "block" }, { disk: undefined, def: "block", base: BASE });
  assert.equal(s.size, 0);
  s.stage("cursor-style", { value: "bar" }, { disk: undefined, def: "block", base: BASE });
  assert.equal(s.size, 1);
});

test("the base is the file as it was at the first staged change", () => {
  const s = createStaging();
  s.stage("font-size", { value: "15" }, ctx("font-size", { base: { hash: "first", text: "a" } }));
  s.stage("theme", { value: "Day" }, ctx("theme", { base: { hash: "second", text: "b" } }));
  assert.equal(s.base.hash, "first", "a later staging does not move the base");
});

test("rebase moves the base and keeps the changes", () => {
  const s = createStaging();
  s.stage("font-size", { value: "15" }, ctx("font-size"));
  s.rebase({ hash: "h2", text: "new" });
  assert.equal(s.base.hash, "h2");
  assert.equal(s.size, 1);
});

test("prune drops a change the file now already has", () => {
  const s = createStaging();
  s.stage("font-size", { value: "15" }, ctx("font-size"));
  s.stage("theme", { value: "Day" }, ctx("theme"));
  s.prune({ ...DISK, "font-size": ["15"] });
  assert.deepEqual(s.keys(), ["theme"]);
});

test("the change list sent to the API has the shape the server reads", () => {
  const s = createStaging();
  s.stage("font-size", { value: "15" }, ctx("font-size"));
  s.stage("font-family", { values: ["A", "B"] }, ctx("font-family"));
  s.stage("clipboard-read", { unset: true }, ctx("clipboard-read"));
  assert.deepEqual(s.changes(), [
    { key: "font-size", value: "15" },
    { key: "font-family", values: ["A", "B"] },
    { key: "clipboard-read", unset: true },
  ]);
});

test("onChange fires on stage, revert and discard, and stops after unsubscribe", () => {
  const s = createStaging();
  let n = 0;
  const off = s.onChange(() => n++);
  s.stage("font-size", { value: "15" }, ctx("font-size"));
  s.revert("font-size");
  s.stage("font-size", { value: "16" }, ctx("font-size"));
  s.discard();
  assert.equal(n, 4);
  off();
  s.stage("font-size", { value: "17" }, ctx("font-size"));
  assert.equal(n, 4);
});

test("sameAsDisk compares the last value of a scalar", () => {
  assert.equal(sameAsDisk({ value: "b" }, ["a", "b"]), true);
  assert.equal(sameAsDisk({ value: "a" }, ["a", "b"]), false);
});

test("valuesFromText keeps every value for a repeated key and skips comments", () => {
  assert.deepEqual(DISK["font-family"], ["Fira Code", "Hack"]);
  assert.equal(DISK["comment"], undefined);
});
