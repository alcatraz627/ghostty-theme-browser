// The page's own guards, run against a fake server that records every call:
// staging never writes, Apply and Raw save carry the base hash, Undo restores the
// earlier entry only once, a value staged during Apply survives, and each action
// reports what happened.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../public/js/app.mjs";
import { fakeServer } from "./helpers/fake-server.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(opts) {
  const fs = fakeServer(opts);
  const app = createApp({ token: "t", fetchImpl: fs.fetch });
  await app.load();
  fs.state.calls.length = 0;
  return { app, fs };
}
const toastText = (app) => app.store.get().toast?.text ?? "";

test("stage() calls no write endpoint and leaves the file alone", async () => {
  const { app, fs } = await boot();
  const before = fs.state.text;
  app.stage("font-size", { value: "15" });
  app.stage("cursor-style", { value: "block" });
  app.stage("theme", { value: "Night" });
  await wait(600);
  assert.deepEqual(fs.writeCalls(), []);
  assert.equal(fs.state.text, before);
  assert.ok(fs.state.calls.length > 0, "the preview did run");
  assert.ok(fs.state.calls.every((c) => c.method === "GET" || c.path === "/api/config/preview"), JSON.stringify(fs.state.calls.map((c) => c.path)));
});

test("Apply sends the base hash of the file the person staged against, and the change list", async () => {
  const { app, fs } = await boot();
  const staged = fs.sha(fs.state.text);
  app.stage("font-size", { value: "15" });
  await app.apply();
  const call = fs.state.calls.find((c) => c.path === "/api/config/apply");
  assert.ok(call, "apply was called");
  assert.equal(call.body.baseHash, staged);
  assert.deepEqual(call.body.changes, [{ key: "font-size", value: "15" }]);
  assert.match(fs.state.text, /font-size = 15/);
});

test("a hand edit between staging and Apply is a conflict: nothing written, pending kept", async () => {
  const { app, fs } = await boot();
  app.stage("font-size", { value: "15" });
  fs.state.text += "# hand edit\n";
  const handEdited = fs.state.text;
  await app.apply();
  assert.equal(fs.state.text, handEdited, "the hand edit was not overwritten");
  assert.ok(app.store.get().conflict, "the page shows the conflict");
  assert.equal(app.store.get().receipt, null);
  assert.deepEqual(app.staging.keys(), ["font-size"]);
});

test("Raw save sends the editor's base hash, and refuses to send without one", async () => {
  const { app, fs } = await boot();
  const base = fs.sha(fs.state.text);
  await app.saveRaw("font-size = 20\n", { baseHash: base });
  const call = fs.state.calls.find((c) => c.path === "/api/config/save");
  assert.equal(call.body.baseHash, base);
  fs.state.calls.length = 0;
  await assert.rejects(() => app.saveRaw("font-size = 21\n", {}), /baseHash/);
  assert.deepEqual(fs.writeCalls(), [], "no request left the page");
});

test("Undo asks for exactly the entry before the apply and the file comes back byte for byte", async () => {
  const { app, fs } = await boot();
  const original = fs.state.text;
  const earlier = fs.state.entries[0].hash;
  app.stage("font-size", { value: "15" });
  await app.apply();
  assert.notEqual(fs.state.text, original);
  assert.equal(app.store.get().receipt.undoTarget, earlier);
  fs.state.calls.length = 0;
  await app.undo();
  const restore = fs.state.calls.filter((c) => c.path === "/api/history/restore");
  assert.equal(restore.length, 1);
  assert.deepEqual(restore[0].body, { hash: earlier });
  assert.equal(fs.state.text, original);
});

test("a second Undo while the first is running does nothing", async () => {
  const { app, fs } = await boot();
  app.stage("font-size", { value: "15" });
  await app.apply();
  fs.state.calls.length = 0;
  await Promise.all([app.undo(), app.undo(), app.restoreEntry(fs.state.entries[1].hash)]);
  assert.equal(fs.state.calls.filter((c) => c.path === "/api/history/restore").length, 1);
});

test("a restore that finds identical content keeps the real receipt and says so", async () => {
  const { app, fs } = await boot();
  app.stage("font-size", { value: "15" });
  await app.apply();
  const receipt = app.store.get().receipt;
  const head = fs.state.entries[0].hash;
  await app.restoreEntry(head);
  assert.equal(app.store.get().receipt, receipt, "the receipt with the way back is still there");
  assert.match(toastText(app), /Already restored/);
});

test("a failed restore shows the server's message instead of staying silent", async () => {
  const { app } = await boot();
  const r = await app.restoreEntry("deadbeefdeadbeef");
  assert.equal(r, null);
  assert.match(toastText(app), /unknown snapshot hash/);
});

test("Cmd+Enter commits the focused field first, then applies", async () => {
  const { app, fs } = await boot();
  const field = { tagName: "INPUT", type: "text", blur: () => app.stage("font-size", { value: "21" }) };
  await app.applyFromShortcut(field);
  assert.match(fs.state.text, /font-size = 21/);
  assert.ok(app.store.get().receipt);
});

test("Cmd+Enter with nothing staged says so and calls nothing", async () => {
  const { app, fs } = await boot();
  await app.applyFromShortcut({ tagName: "BODY", blur() {} });
  assert.match(toastText(app), /Nothing to apply/);
  assert.deepEqual(fs.writeCalls(), []);
});

test("a value staged while Apply is in flight survives it", async () => {
  const { app, fs } = await boot();
  let release;
  fs.state.applyGate = new Promise((r) => (release = r));
  app.stage("font-size", { value: "15" });
  const flight = app.apply();
  app.stage("window-padding-x", { value: "11" });
  release();
  await flight;
  assert.match(fs.state.text, /font-size = 15/);
  assert.doesNotMatch(fs.state.text, /window-padding-x/);
  assert.deepEqual(app.staging.keys(), ["window-padding-x"], "the late edit is still pending");
  assert.ok(app.staging.base, "and it is checked against the new file");
});

test("a key re-staged with a different value during Apply keeps its new value", async () => {
  const { app, fs } = await boot();
  let release;
  fs.state.applyGate = new Promise((r) => (release = r));
  app.stage("font-size", { value: "15" });
  const flight = app.apply();
  app.stage("font-size", { value: "16" });
  release();
  await flight;
  assert.deepEqual(app.staging.changes(), [{ key: "font-size", value: "16" }]);
});

test("Esc-discard says how many were dropped, and one undo brings them back", async () => {
  const { app } = await boot();
  app.stage("font-size", { value: "15" });
  app.stage("cursor-style", { value: "block" });
  app.discard();
  assert.equal(app.staging.size, 0);
  assert.match(toastText(app), /Discarded 2 staged changes/);
  assert.equal(app.undoDiscard(), true);
  assert.deepEqual(app.staging.keys().sort(), ["cursor-style", "font-size"]);
  assert.equal(app.undoDiscard(), false, "only once");
});
