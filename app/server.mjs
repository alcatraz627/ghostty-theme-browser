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
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./lib/env.mjs";
import { configState } from "./lib/paths.mjs";
import { ghosttyBin, versionLine, reloadKeybind, listFontFamilies } from "./lib/ghostty.mjs";
import { lint } from "./lib/lint.mjs";
import { buildSchema } from "./lib/schema.mjs";
import {
  setKeyInText,
  unsetKeyInText,
  setListInText,
  writeConfig,
  applyChange,
  applyChanges,
  previewChanges,
  hashOf,
} from "./lib/config-write.mjs";
import { createIdleWatch } from "./lib/idle.mjs";
import {
  log as historyLog,
  show as historyShow,
  diff as historyDiff,
  captureExternal,
} from "./lib/history.mjs";
import {
  listProfiles,
  readProfile,
  saveProfile,
  deleteProfile,
  activateProfile,
} from "./lib/profiles.mjs";
import { listThemes, themeColors } from "./lib/themes.mjs";
import { readFileSync as readFile } from "node:fs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const PORT = env.port;

// The token survives restarts so open tabs don't 401 after every server
// bounce. It lives in a user-only file in the state dir; the threat model
// (127.0.0.1 bind + token on every API call + Origin/Host checks) is
// unchanged — only the rotation cadence moves from per-launch to on-demand
// (delete the file to rotate).
function loadOrCreateToken() {
  const path = join(env.stateDir, "token");
  try {
    const existing = readFileSync(path, "utf8").trim();
    if (/^[0-9a-f]{32}$/.test(existing)) return existing;
  } catch {
    /* first run or unreadable — mint below */
  }
  const fresh = randomBytes(16).toString("hex");
  try {
    mkdirSync(env.stateDir, { recursive: true });
    writeFileSync(path, fresh + "\n", { mode: 0o600 });
  } catch {
    /* state dir unwritable: degrade to per-launch token */
  }
  return fresh;
}
const TOKEN = loadOrCreateToken();

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
    reloadKeybind: reloadKeybind(),
    port: PORT,
    idleMs: env.idleMs,
  }),
  // The page sends this on a person's key press or click while its tab is
  // visible. It counts as activity because it is not the quiet poll route.
  "POST /api/ping": () => ({ ok: true }),
  "GET /api/schema": () => buildSchema(),
  // The stat poll doubles as the external-edit detector: any hand edit the
  // repo hasn't seen becomes an [external] timeline entry.
  "GET /api/stat": () => {
    const state = configState();
    try {
      captureExternal(state.path);
    } catch {
      /* history is auxiliary; stat stays available without it */
    }
    return { mtimeMs: state.mtimeMs, exists: state.exists };
  },
  "GET /api/history": () => ({ entries: historyLog(configState().path) }),
  "GET /api/profiles": () => ({ profiles: listProfiles() }),
  "GET /api/themes": () => ({ themes: listThemes() }),
  "GET /api/fonts": () => ({ families: listFontFamilies() }),
  "GET /api/theme": (_body, url) =>
    mapTypeErrors(() => themeColors(url.searchParams.get("name") || "")),
  // Save the current config (or another profile, for duplicate) under a name.
  "POST /api/profiles/save": (body) =>
    mapTypeErrors(() => {
      const state = configState();
      const content =
        typeof body?.from === "string"
          ? readProfile(body.from)
          : state.exists
            ? readFile(state.path, "utf8")
            : "";
      return saveProfile(body?.name, content, { overwrite: body?.overwrite === true });
    }),
  "POST /api/profiles/activate": (body) =>
    mapTypeErrors(() => activateProfile(body?.name)),
  "POST /api/profiles/delete": (body) =>
    mapTypeErrors(() => deleteProfile(body?.name)),
  "GET /api/history/diff": (_body, url) => {
    const hash = url.searchParams.get("hash") || "";
    if (!/^[0-9a-f]{7,40}$/.test(hash)) {
      throw withStatus(new Error("bad hash"), 400);
    }
    try {
      return { diff: historyDiff(configState().path, hash) };
    } catch {
      throw withStatus(new Error("unknown snapshot hash"), 400);
    }
  },
  "POST /api/history/restore": (body) => {
    if (typeof body?.hash !== "string" || !/^[0-9a-f]{7,40}$/.test(body.hash)) {
      throw withStatus(new Error("bad hash"), 400);
    }
    let content;
    try {
      content = historyShow(configState().path, body.hash);
    } catch {
      throw withStatus(new Error("unknown snapshot hash"), 400);
    }
    return writeConfig(content, {
      message: `restore ${body.hash.slice(0, 7)}`,
    });
  },
  "GET /api/config": () => {
    const state = configState();
    const content = state.exists ? readFileSync(state.path, "utf8") : null;
    return { ...state, content, hash: hashOf(content ?? "") };
  },
  "POST /api/lint": (body) =>
    lint(typeof body?.content === "string" ? body.content : ""),
  // Single-setting change from the form view: {key, value} to set, {key,
  // unset: true} to reset to default, {key, values: [...]} for list keys.
  "POST /api/config/set": (body) => {
    const key = body?.key;
    if (typeof key !== "string" || !/^[A-Za-z0-9_-]+$/.test(key)) {
      throw withStatus(new Error("bad key"), 400);
    }
    // Values must be single-line: an embedded newline would smuggle extra
    // directives through an endpoint whose contract is "touch this one key".
    const singleLine = (v) => typeof v === "string" && !/[\r\n]/.test(v);
    // The mutation runs inside applyChange's cross-process lock against the
    // freshest content — never against a base read before the lock.
    let mutator;
    let message;
    if (body.unset === true) {
      mutator = (before) => unsetKeyInText(before, key);
      message = `unset ${key}`;
    } else if (Array.isArray(body.values)) {
      if (!body.values.every(singleLine)) {
        throw withStatus(new Error("values must be single-line strings"), 400);
      }
      mutator = (before) =>
        body.values.length
          ? setListInText(before, key, body.values)
          : unsetKeyInText(before, key);
      message = body.values.length
        ? `set ${key} (${body.values.length} items)`
        : `unset ${key}`;
    } else if (typeof body.value === "string") {
      if (!singleLine(body.value)) {
        throw withStatus(new Error("value must be a single-line string"), 400);
      }
      // Empty value means "back to default" — same contract the UI uses.
      mutator = (before) =>
        body.value === ""
          ? unsetKeyInText(before, key)
          : setKeyInText(before, key, body.value);
      message = body.value === "" ? `unset ${key}` : `set ${key} = ${body.value}`;
    } else {
      throw withStatus(new Error("provide value, values, or unset"), 400);
    }
    return applyChange(mutator, { message });
  },
  // The commit half of the Customize view's preview-then-apply contract:
  // all staged changes in one locked write, one history entry.
  "POST /api/config/apply": (body) => {
    validateChanges(body);
    return mapTypeErrors(() => applyChanges(body.changes, { baseHash: baseHashOf(body) }));
  },
  // What Apply would write for these changes, with the diff and Ghostty's
  // verdict. Pure: it never writes the config, a backup or history.
  "POST /api/config/preview": (body) => {
    validateChanges(body);
    return mapTypeErrors(() => previewChanges(body.changes, { baseHash: baseHashOf(body) }));
  },
  // Whole-file save from the raw editor; force skips the validation gate
  // (Ghostty itself tolerates bad lines by ignoring them).
  "POST /api/config/save": (body) => {
    if (typeof body?.content !== "string") {
      throw withStatus(new Error("content must be a string"), 400);
    }
    return writeConfig(body.content, {
      skipValidate: body.force === true,
      message: "raw editor save",
      baseHash: baseHashOf(body),
    });
  },
};

function withStatus(err, code) {
  err.statusCode = code;
  return err;
}

// The change list shared by preview and apply: keys are plain, values are one
// line each, because a newline would smuggle in an extra directive.
function validateChanges(body) {
  if (!Array.isArray(body?.changes) || !body.changes.length) {
    throw withStatus(new Error("changes must be a non-empty array"), 400);
  }
  for (const ch of body.changes) {
    if (typeof ch?.key !== "string" || !/^[A-Za-z0-9_-]+$/.test(ch.key)) {
      throw withStatus(new Error("bad key in changes"), 400);
    }
    const vals = Array.isArray(ch.values) ? ch.values : typeof ch.value === "string" ? [ch.value] : [];
    if (!vals.every((v) => typeof v === "string" && !/[\r\n]/.test(v))) {
      throw withStatus(new Error("values must be single-line strings"), 400);
    }
  }
}

// The hash of the file the page staged against, when it sent one.
function baseHashOf(body) {
  if (body?.baseHash === undefined || body.baseHash === null) return null;
  if (typeof body.baseHash !== "string" || !/^[0-9a-f]{64}$/.test(body.baseHash)) {
    throw withStatus(new Error("bad baseHash"), 400);
  }
  return body.baseHash;
}

// Library TypeErrors are caller mistakes (bad name, missing profile) — they
// come back as 400s, not 500s.
function mapTypeErrors(fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof TypeError) throw withStatus(err, 400);
    throw err;
  }
}

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

// The app should not run when nobody uses it. After idleMs without a request
// from a person it exits cleanly and says how to start it again.
const idle = createIdleWatch({
  idleMs: env.idleMs,
  onIdle: () => {
    console.log(`ghostty-config-manager stopped after ${Math.round(env.idleMs / 60000)} idle minutes. Start it again with: npm start`);
    server.close();
    process.exit(0);
  },
});
// Check often enough that a short idle window (used in tests) is honoured.
setInterval(() => idle.check(), Math.min(10_000, Math.max(250, Math.floor(env.idleMs / 4) || 10_000)));

const server = createServer((req, res) => {
  const gateError = requestGates(req);
  if (gateError) return deny(res, 403, gateError);

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname.startsWith("/api/")) {
    if (!apiAuthorized(req, url)) return deny(res, 401, "missing or bad token");
    // The page polls /api/stat to notice hand edits. That says nothing about
    // whether a person is here, so it never keeps the server alive.
    if (url.pathname !== "/api/stat") idle.touch();
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
        const result = handler(parsedBody, url);
        // A stale base is a conflict the page must resolve, not a plain failure.
        res.writeHead(result?.reason === "stale" ? 409 : 200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        deny(res, err.statusCode || 500, err.message);
      }
    })();
    return;
  }

  // Static files. Path-traversal-safe: normalize, then require the resolved
  // path to stay inside PUBLIC_DIR.
  idle.touch();
  const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    return deny(res, 404, "not found");
  }
  res.writeHead(200, { "content-type": MIME[extname(filePath)] || "application/octet-stream" });
  res.end(readFileSync(filePath));
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}/?token=${TOKEN}`;
  console.log(`ghostty-config-manager listening`);
  console.log(`  ${url}`);
  // Interactive `npm start` opens the app itself — no terminal-output
  // spelunking for the token. Headless runs (tests, background servers,
  // GHOSTTY_MGR_NO_OPEN=1) never pop a browser.
  if (process.stdout.isTTY && !env.noOpen && process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  }
});
