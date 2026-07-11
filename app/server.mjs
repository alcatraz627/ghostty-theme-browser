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
import { lint } from "./lib/lint.mjs";

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

// Handlers are keyed by "METHOD /path". POST bodies arrive parsed; every
// handler here is still read-only with respect to the live config — the
// first real write endpoint lands with the history milestone.
const api = {
  "GET /api/meta": () => ({
    ghosttyVersion: versionLine(),
    binaryPath: ghosttyBin(),
    port: PORT,
  }),
  "GET /api/config": () => {
    const state = configState();
    return {
      ...state,
      content: state.exists ? readFileSync(state.path, "utf8") : null,
    };
  },
  "POST /api/lint": (body) =>
    lint(typeof body?.content === "string" ? body.content : ""),
};

const BODY_LIMIT = 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let overflowed = false;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      // Keep draining on overflow instead of destroying the socket, so the
      // client receives a clean 413 rather than a connection reset.
      if (size > BODY_LIMIT) {
        overflowed = true;
        chunks.length = 0;
        return;
      }
      if (!overflowed) chunks.push(chunk);
    });
    req.on("end", () => {
      if (overflowed) {
        const err = new Error("body too large (max 1 MiB)");
        err.statusCode = 413;
        reject(err);
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
    req.on("error", reject);
  });
}

const server = createServer((req, res) => {
  const gateError = requestGates(req);
  if (gateError) return deny(res, 403, gateError);

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname.startsWith("/api/")) {
    if (!apiAuthorized(req, url)) return deny(res, 401, "missing or bad token");
    const handler = api[`${req.method} ${url.pathname}`];
    if (!handler) return deny(res, 404, "no such endpoint");
    void (async () => {
      let parsedBody = null;
      if (req.method !== "GET") {
        try {
          const raw = await readBody(req);
          parsedBody = raw.length ? JSON.parse(raw.toString("utf8")) : null;
        } catch (err) {
          return deny(res, err.statusCode || 400, err.message);
        }
      }
      try {
        const body = JSON.stringify(handler(parsedBody));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(body);
      } catch (err) {
        deny(res, 500, err.message);
      }
    })();
    return;
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
