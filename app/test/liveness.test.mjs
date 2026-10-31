// When the page decides the server is gone: three unanswered requests in a row,
// never one, and any answer brings it back. Plus the key-repeat rule that keeps a
// held shortcut from firing a write again and again.

import { test } from "node:test";
import assert from "node:assert/strict";
import { initialLiveness, nextLiveness } from "../public/js/liveness.mjs";
import { shouldIgnoreRepeat, KEYS } from "../public/js/keys.mjs";
import { createApp } from "../public/js/app.mjs";
import { fakeServer } from "./helpers/fake-server.mjs";

const run = (events) => events.reduce((s, ev) => nextLiveness(s, ev), initialLiveness());

test("one rejected request is a hiccup, not a stopped server", () => {
  assert.equal(run(["fail"]).stopped, false);
  assert.equal(run(["fail", "fail"]).stopped, false);
});

test("three in a row stop it, and it stays stopped until something answers", () => {
  const s = run(["fail", "fail", "fail"]);
  assert.equal(s.stopped, true);
  assert.equal(nextLiveness(s, "fail").stopped, true);
});

test("an answer between failures resets the count", () => {
  assert.equal(run(["fail", "fail", "ok", "fail", "fail"]).stopped, false);
  assert.equal(run(["fail", "fail", "ok", "fail", "fail", "fail"]).stopped, true);
});

test("any answer clears the stopped state, so the page can never stick on it while the server is up", () => {
  const stopped = run(["fail", "fail", "fail"]);
  assert.deepEqual(nextLiveness(stopped, "ok"), { failures: 0, stopped: false });
});

test("the unchanged state comes back as the same object, so nothing re-renders", () => {
  const s = initialLiveness();
  assert.equal(nextLiveness(s, "ok"), s);
});

test("in the app: one failed request does not swap the window, three do, and an answer restores it", async () => {
  const fs = fakeServer();
  const app = createApp({ token: "t", fetchImpl: fs.fetch });
  await app.load();
  fs.state.down = 1;
  await assert.rejects(() => app.api.get("/api/stat"));
  assert.equal(app.store.get().stopped, false);
  await app.api.get("/api/stat");
  fs.state.down = 3;
  for (let i = 0; i < 3; i++) await assert.rejects(() => app.api.get("/api/stat"));
  assert.equal(app.store.get().stopped, true);
  await app.api.get("/api/meta");
  assert.equal(app.store.get().stopped, false);
});

test("a held write shortcut is ignored after the first press", () => {
  const press = (init) => ({ metaKey: true, shiftKey: false, altKey: false, ctrlKey: false, ...init });
  assert.equal(shouldIgnoreRepeat(press({ key: "z", repeat: true })), true, "undo held");
  assert.equal(shouldIgnoreRepeat(press({ key: "z", repeat: false })), false, "first press");
  assert.equal(shouldIgnoreRepeat(press({ key: "Enter", repeat: true })), true, "apply held");
  assert.equal(shouldIgnoreRepeat(press({ key: "s", repeat: true })), true, "save held");
  assert.equal(shouldIgnoreRepeat({ key: "Escape", repeat: true }), true, "discard held");
  assert.equal(shouldIgnoreRepeat({ key: "ArrowRight", repeat: true }), false, "arrows may repeat");
  assert.ok(KEYS.undo.match(press({ key: "z" })));
});
