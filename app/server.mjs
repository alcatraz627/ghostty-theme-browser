// Local Ghostty config manager — dev server (M0: read-only config viewer).
//
// Security posture (see docs/V2-PLAN.md §2 "Server threat model"): this server
// will eventually WRITE the terminal config, which is a code-execution surface,
// so the gates exist from M0 even while everything is read-only:
//   - binds 127.0.0.1 only
//   - every /api request needs the per-launch token (printed at startup)
//   - Host and Origin are checked on every request; no CORS is ever emitted
//   - GET endpoints never mutate

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./lib/env.mjs";
import { configState } from "./lib/paths.mjs";
import { ghosttyBin, versionLine } from "./lib/ghostty.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const PORT = env.port;
const TOKEN = randomBytes(16).toString("hex");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function deny(res, code, msg) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: msg }));
}

function requestGates(req) {
  const host = req.headers.host || "";
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) {
    return "bad host";
  }
  const origin = req.headers.origin;
  if (origin && origin !== `http://127.0.0.1:${PORT}` && origin !== `http://localhost:${PORT}`) {
    return "bad origin";
  }
  return null;
}

function apiAuthorized(req, url) {
  return (
    req.headers["x-app-token"] === TOKEN || url.searchParams.get("token") === TOKEN
  );
}

const api = {
  "/api/meta": () => ({
    ghosttyVersion: versionLine(),
    binaryPath: ghosttyBin(),
    port: PORT,
  }),
  "/api/config": () => {
    const state = configState();
    return {
      ...state,
      content: state.exists ? readFileSync(state.path, "utf8") : null,
    };
  },
};

const server = createServer((req, res) => {
  const gateError = requestGates(req);
  if (gateError) return deny(res, 403, gateError);

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname.startsWith("/api/")) {
    if (!apiAuthorized(req, url)) return deny(res, 401, "missing or bad token");
    const handler = api[url.pathname];
    if (!handler || req.method !== "GET") return deny(res, 404, "no such endpoint");
    try {
      const body = JSON.stringify(handler());
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(body);
    } catch (err) {
      return deny(res, 500, err.message);
    }
  }

  // Static files. Path-traversal-safe: normalize, then require the resolved
  // path to stay inside PUBLIC_DIR.
  const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    return deny(res, 404, "not found");
  }
  res.writeHead(200, { "content-type": MIME[extname(filePath)] || "application/octet-stream" });
  res.end(readFileSync(filePath));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`ghostty-config-manager listening`);
  console.log(`  http://127.0.0.1:${PORT}/?token=${TOKEN}`);
});
