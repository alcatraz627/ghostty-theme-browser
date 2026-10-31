// Server-level contract, run against a real server process on a sandbox config:
// preview never writes, a stale base answers 409, and the server stops itself
// after idle time while the page's quiet poll does not keep it alive.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("../server.mjs", import.meta.url));
const BASE = "# keep me\nfont-size = 13\ncursor-style-blink = true\n";

function freePort() {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function startServer({ idleMs }) {
  const sandbox = mkdtempSync(join(tmpdir(), "gcm-server-"));
  const config = join(sandbox, "config");
  writeFileSync(config, BASE);
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      GHOSTTY_MGR_CONFIG: config,
      GHOSTTY_MGR_STATE: join(sandbox, "state"),
      GHOSTTY_MGR_PORT: String(port),
      GHOSTTY_MGR_NO_OPEN: "1",
      GHOSTTY_MGR_IDLE_MS: String(idleMs),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  let token = "";
  for (let i = 0; i < 100 && !token; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const m = out.match(/token=([0-9a-f]{32})/);
    if (m) token = m[1];
  }
  assert.ok(token, `server did not print its URL: ${out}`);
  const call = async (path, body) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "x-app-token": token, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json() };
  };
  return { config, child, exited, call, out: () => out };
}

test("preview writes nothing, a stale base answers 409, a fresh base applies", async () => {
  const s = await startServer({ idleMs: 0 });
  try {
    const cfg = (await s.call("/api/config")).json;
    assert.match(cfg.hash, /^[0-9a-f]{64}$/);
    const changes = [{ key: "font-size", value: "15" }];

    const preview = await s.call("/api/config/preview", { changes, baseHash: cfg.hash });
    assert.equal(preview.status, 200);
    assert.ok(preview.json.diff.some((d) => d.t === "+" && d.text === "font-size = 15"));
    assert.equal(readFileSync(s.config, "utf8"), BASE, "preview left the file alone");

    writeFileSync(s.config, BASE + "# hand edit\n");
    const stale = await s.call("/api/config/apply", { changes, baseHash: cfg.hash });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.reason, "stale");
    assert.equal(readFileSync(s.config, "utf8"), BASE + "# hand edit\n");

    const fresh = (await s.call("/api/config")).json;
    const applied = await s.call("/api/config/apply", { changes, baseHash: fresh.hash });
    assert.equal(applied.status, 200);
    assert.equal(applied.json.ok, true, JSON.stringify(applied.json));
    assert.match(readFileSync(s.config, "utf8"), /font-size = 15/);
  } finally {
    s.child.kill();
  }
});

test("a malformed baseHash is a 400, not a silent write", async () => {
  const s = await startServer({ idleMs: 0 });
  try {
    const r = await s.call("/api/config/apply", { changes: [{ key: "font-size", value: "15" }], baseHash: "nope" });
    assert.equal(r.status, 400);
    assert.equal(readFileSync(s.config, "utf8"), BASE);
  } finally {
    s.child.kill();
  }
});

test("the server stops after idle time when only the quiet poll runs, and a ping keeps it up", async () => {
  const s = await startServer({ idleMs: 1500 });
  const started = Date.now();
  let pinged = false;
  const poll = setInterval(() => {
    s.call("/api/stat").catch(() => {});
    if (!pinged && Date.now() - started > 1000) {
      pinged = true;
      s.call("/api/ping", {}).catch(() => {});
    }
  }, 200);
  try {
    const code = await Promise.race([s.exited, new Promise((r) => setTimeout(() => r("timeout"), 9000))]);
    assert.equal(code, 0, "server should exit cleanly on its own");
    const lived = Date.now() - started;
    assert.ok(lived > 2400, `a ping at 1s should extend life past 2.4s, lived ${lived} ms`);
    assert.match(s.out(), /stopped after .* idle minutes/);
  } finally {
    clearInterval(poll);
    s.child.kill();
  }
});
