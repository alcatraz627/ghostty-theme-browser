// Gate blocker B1: two processes writing the same target must never lose an
// update. Each child performs 8 locked read-modify-writes of its OWN key;
// at the end both keys must hold their final values — lost updates would
// leave one key stale or missing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SANDBOX = mkdtempSync(join(tmpdir(), "gcm-lock-"));
process.env.GHOSTTY_MGR_STATE = join(SANDBOX, "state");
process.env.GHOSTTY_MGR_CONFIG = join(SANDBOX, "config");

const LIB = fileURLToPath(new URL("../lib/config-write.mjs", import.meta.url));

function runChild(key) {
  const script = `
    import { applyChange, setKeyInText } from ${JSON.stringify(`file://${LIB}`)};
    for (let i = 1; i <= 8; i++) {
      const r = applyChange((t) => setKeyInText(t, ${JSON.stringify(key)}, String(i)),
        { skipValidate: true, message: "race " + i });
      if (!r.ok) { console.error(JSON.stringify(r)); process.exit(1); }
    }
  `;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env },
      stdio: ["ignore", "ignore", "inherit"],
    });
    child.on("exit", (code) => resolve(code));
  });
}

test("two processes never lose each other's updates", async () => {
  writeFileSync(process.env.GHOSTTY_MGR_CONFIG, "# base\n");
  const [a, b] = await Promise.all([runChild("font-size"), runChild("window-padding-y")]);
  assert.equal(a, 0, "child A had a failed write");
  assert.equal(b, 0, "child B had a failed write");
  const final = readFileSync(process.env.GHOSTTY_MGR_CONFIG, "utf8");
  assert.match(final, /^font-size = 8$/m, final);
  assert.match(final, /^window-padding-y = 8$/m, final);
  assert.ok(final.includes("# base"));
});

test("a stale lock from a crashed process is stolen, not honored forever", async () => {
  const lock = `${process.env.GHOSTTY_MGR_CONFIG}.gcm-lock`;
  mkdirSync(lock, { recursive: true });
  const old = new Date(Date.now() - 60_000);
  utimesSync(lock, old, old);
  const { applyChange, setKeyInText } = await import("../lib/config-write.mjs");
  const r = applyChange((t) => setKeyInText(t, "cursor-style", "bar"), {
    skipValidate: true,
    message: "steal stale lock",
  });
  assert.equal(r.ok, true, JSON.stringify(r));
});
