// Starts the real server against a sandbox config and state folder, for tests
// that need the HTTP layer. Never touches the live Ghostty config.

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const SERVER = fileURLToPath(new URL("../../server.mjs", import.meta.url));

function freePort() {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

export async function startServer({ idleMs = 0, base = "# keep me\nfont-size = 13\n" } = {}) {
  const sandbox = mkdtempSync(join(tmpdir(), "gcm-guard-"));
  const config = join(sandbox, "config");
  writeFileSync(config, base);
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
  let token = "";
  for (let i = 0; i < 100 && !token; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const m = out.match(/token=([0-9a-f]{32})/);
    if (m) token = m[1];
  }
  assert.ok(token, `server did not print its URL: ${out}`);
  const call = async (path, body) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: body !== undefined ? "POST" : "GET",
      headers: { "x-app-token": token, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json() };
  };
  return { config, child, call, port, token };
}
