// M5 acceptance: two profiles round-trip through activation with comments
// preserved byte-exactly, activation lands in history, and hostile names are
// rejected before touching the filesystem.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SANDBOX = mkdtempSync(join(tmpdir(), "gcm-profiles-"));
process.env.GHOSTTY_MGR_STATE = join(SANDBOX, "state");
process.env.GHOSTTY_MGR_CONFIG = join(SANDBOX, "config");

// Dynamic imports on purpose: env.mjs reads process.env at module load, so
// the hermetic overrides above must be set before any app module loads.
const { saveProfile, listProfiles, readProfile, deleteProfile, activateProfile, assertProfileName } =
  await import("../lib/profiles.mjs");
const { log } = await import("../lib/history.mjs");
const { ghosttyBin } = await import("../lib/ghostty.mjs");

const TARGET = process.env.GHOSTTY_MGR_CONFIG;

const A = "# profile A keeps its comments\nfont-size = 13\n";
const B = "# profile B — different look\nfont-size = 16\nwindow-padding-x = 8\n";

test("save, list, read, delete round-trip", () => {
  saveProfile("Work", A);
  saveProfile("Play", B);
  assert.deepEqual(listProfiles().map((p) => p.name), ["Play", "Work"]);
  assert.equal(readProfile("Work"), A);
  saveProfile("Temp", A);
  deleteProfile("Temp");
  assert.ok(!listProfiles().some((p) => p.name === "Temp"));
});

test("hostile names are rejected before any fs access", () => {
  for (const bad of ["../evil", "a/b", ".hidden", "", "x".repeat(60), "a\nb"]) {
    assert.throws(() => assertProfileName(bad), TypeError, bad);
  }
  assert.throws(() => readProfile("no-such-profile"), /no such profile/);
});

test("acceptance: switching profiles preserves comments byte-exactly, via history", () => {
  if (!ghosttyBin()) return;
  writeFileSync(TARGET, "# original\nfont-size = 11\n");
  let r = activateProfile("Work");
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(readFileSync(TARGET, "utf8"), A);
  assert.ok(listProfiles().find((p) => p.name === "Work").active);

  r = activateProfile("Play");
  assert.equal(r.ok, true);
  assert.equal(readFileSync(TARGET, "utf8"), B);
  assert.ok(listProfiles().find((p) => p.name === "Play").active);
  assert.ok(!listProfiles().find((p) => p.name === "Work").active);

  // The pre-activation state (including the original hand-made file) is in
  // history — switching never loses anything.
  const entries = log(TARGET);
  assert.ok(entries.some((e) => e.message.includes('activate profile "Work"')));
  assert.ok(entries.some((e) => e.source === "external"));
});
