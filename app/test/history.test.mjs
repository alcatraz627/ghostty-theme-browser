// History contract, run entirely inside a temp state dir + temp target:
// snapshots are byte-exact and deduplicated, hand edits become their own
// [external] entries, and the M4 acceptance walk (5 edits, back 3, forward 1)
// restores every state exactly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Hermetic env BEFORE any app module loads (env.mjs reads at import time).
const SANDBOX = mkdtempSync(join(tmpdir(), "gcm-history-"));
process.env.GHOSTTY_MGR_STATE = join(SANDBOX, "state");
process.env.GHOSTTY_MGR_CONFIG = join(SANDBOX, "config");

const { snapshot, captureExternal, log, show } = await import("../lib/history.mjs");
const { writeConfig, setKeyInText } = await import("../lib/config-write.mjs");
const { ghosttyBin } = await import("../lib/ghostty.mjs");

const TARGET = process.env.GHOSTTY_MGR_CONFIG;

test("snapshot commits, dedups identical content, and shows byte-exact", () => {
  const a = snapshot(TARGET, "font-size = 14\n", "first");
  assert.ok(a?.hash);
  assert.equal(snapshot(TARGET, "font-size = 14\n", "same again"), null);
  const b = snapshot(TARGET, "font-size = 15\n", "second");
  assert.ok(b.hash !== a.hash);
  assert.equal(show(TARGET, a.hash), "font-size = 14\n");
  const entries = log(TARGET);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].message, "second");
  assert.equal(entries[0].source, "app");
});

test("hand edits are captured as [external] entries", () => {
  writeFileSync(TARGET, "font-size = 99\n# hand edit\n");
  const r = captureExternal(TARGET);
  assert.ok(r?.hash);
  const entries = log(TARGET);
  assert.equal(entries[0].source, "external");
  assert.equal(show(TARGET, entries[0].hash), "font-size = 99\n# hand edit\n");
  // Re-capturing the same disk state is a no-op.
  assert.equal(captureExternal(TARGET), null);
});

test("acceptance walk: 5 edits, back 3, forward 1, all byte-exact", () => {
  if (!ghosttyBin()) return; // writeConfig validates via the real binary
  const states = [];
  let text = "";
  for (let i = 1; i <= 5; i++) {
    text = setKeyInText(text, "font-size", String(10 + i));
    const r = writeConfig(text, { message: `set font-size = ${10 + i}` });
    assert.equal(r.ok, true, JSON.stringify(r));
    states.push(text);
  }
  const entries = log(TARGET);
  // Walk back 3: restore the state 3 snapshots ago via the normal write path.
  const back3 = entries[3];
  const restored = show(TARGET, back3.hash);
  assert.equal(restored, states[1], "back-3 content mismatch");
  const rr = writeConfig(restored, { message: `restore ${back3.hash.slice(0, 7)}` });
  assert.equal(rr.ok, true);
  assert.equal(readFileSync(TARGET, "utf8"), states[1]);
  // Forward 1: the state we came from is still in the timeline (nothing lost).
  const after = log(TARGET);
  const fwd = after.find((e) => show(TARGET, e.hash) === states[4]);
  assert.ok(fwd, "pre-restore state must remain restorable");
  const rf = writeConfig(show(TARGET, fwd.hash), { message: "redo" });
  assert.equal(rf.ok, true);
  assert.equal(readFileSync(TARGET, "utf8"), states[4]);
});
