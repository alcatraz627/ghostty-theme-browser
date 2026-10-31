// Guards at the HTTP layer that protect the config: no instant-write route, a
// base hash is required to write, Raw save needs one too, and a restore writes
// exactly the bytes of the earlier entry (trailing newline and CRLF included).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { startServer } from "./helpers/start-server.mjs";

const CHANGES = [{ key: "font-size", value: "15" }];

test("the old per-key instant-write route is gone", async () => {
  const s = await startServer();
  try {
    const before = readFileSync(s.config, "utf8");
    const r = await s.call("/api/config/set", { key: "font-size", value: "31" });
    assert.equal(r.status, 404);
    assert.equal(readFileSync(s.config, "utf8"), before);
  } finally {
    s.child.kill();
  }
});

test("Apply without a base hash is a 400 and writes nothing", async () => {
  const s = await startServer();
  try {
    const before = readFileSync(s.config, "utf8");
    const r = await s.call("/api/config/apply", { changes: CHANGES });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /baseHash/);
    assert.equal(readFileSync(s.config, "utf8"), before);
  } finally {
    s.child.kill();
  }
});

test("Raw save without a base hash is a 400 and writes nothing, with or without force", async () => {
  const s = await startServer();
  try {
    const before = readFileSync(s.config, "utf8");
    for (const force of [false, true]) {
      const r = await s.call("/api/config/save", { content: "font-size = 99\n", force });
      assert.equal(r.status, 400, `force=${force}`);
    }
    assert.equal(readFileSync(s.config, "utf8"), before);
  } finally {
    s.child.kill();
  }
});

test("Raw save with a stale base hash is a 409 and writes nothing", async () => {
  const s = await startServer();
  try {
    const cfg = (await s.call("/api/config")).json;
    writeFileSync(s.config, "# a hand edit\n" + readFileSync(s.config, "utf8"));
    const after = readFileSync(s.config, "utf8");
    const r = await s.call("/api/config/save", { content: "font-size = 99\n", baseHash: cfg.hash });
    assert.equal(r.status, 409);
    assert.equal(readFileSync(s.config, "utf8"), after);
  } finally {
    s.child.kill();
  }
});

// A restore must put back the exact bytes of the earlier entry, whatever they end with.
for (const [label, base] of [
  ["a trailing newline", "# keep me\nfont-size = 13\n"],
  ["two trailing newlines", "# keep me\nfont-size = 13\n\n"],
  ["CRLF line endings", "# keep me\r\nfont-size = 13\r\ncursor-style = bar\r\n"],
  ["no trailing newline", "# keep me\nfont-size = 13"],
]) {
  test(`restore writes exactly the earlier bytes: ${label}`, async () => {
    const s = await startServer({ base });
    try {
      const first = (await s.call("/api/config")).json;
      const applied = await s.call("/api/config/apply", { changes: CHANGES, baseHash: first.hash });
      assert.equal(applied.json.ok, true, JSON.stringify(applied.json));
      assert.notEqual(readFileSync(s.config, "utf8"), base);

      const hist = (await s.call("/api/history")).json.entries;
      const target = hist[1]; // the entry before the apply
      const r = await s.call("/api/history/restore", { hash: target.hash });
      assert.equal(r.json.ok, true, JSON.stringify(r.json));
      assert.equal(readFileSync(s.config, "utf8"), base, "bytes on disk equal the earlier file");
      assert.equal(r.json.content, base, "the reply carries the same bytes");
    } finally {
      s.child.kill();
    }
  });
}
