// A stand-in for the local server, as a fetch function, so the page's logic can be
// tested in Node: it records every call, answers the endpoints the page uses,
// and applies changes with the real text-surgery functions. It enforces the same
// rule as the real server: a write needs a matching base hash.

import { createHash } from "node:crypto";
import { buildMutator } from "../../lib/config-write.mjs";

const sha = (t) => createHash("sha256").update(t ?? "").digest("hex");

const SCHEMA = {
  ghosttyVersion: "Ghostty test",
  options: [
    { key: "font-size", label: "Font size", category: "Appearance", type: "number", default: "13", defaults: ["13"], doc: "Font size.", list: false },
    { key: "cursor-style", label: "Cursor style", category: "Appearance", type: "enum", enumValues: ["block", "bar", "underline"], default: "block", defaults: ["block"], doc: "Cursor.", list: false },
    { key: "window-padding-x", label: "Horizontal padding", category: "Appearance", type: "number", default: "2", defaults: ["2"], doc: "Padding.", list: false },
    { key: "theme", label: "Theme", category: "Appearance", type: "string", default: "", defaults: [""], doc: "Theme.", list: false },
    { key: "palette", label: "Palette", category: "Appearance", type: "list", default: null, defaults: ["0=#000000"], doc: "Palette.", list: true },
  ],
};

export const WRITE_PATHS = [
  "/api/config/apply",
  "/api/config/save",
  "/api/config/set",
  "/api/history/restore",
  "/api/profiles/save",
  "/api/profiles/activate",
  "/api/profiles/delete",
];

export function fakeServer({ text = "# keep\nfont-size = 13\ncursor-style = bar\n" } = {}) {
  const state = {
    text,
    entries: [{ hash: sha("h0" + text).slice(0, 40), ts: 1, source: "external", message: "edited outside the app", text }],
    calls: [],
    applyGate: null, // a promise Apply waits on, so a test can act while it is in flight
    down: 0, // number of upcoming requests that fail with no answer
    seq: 0,
  };
  const newEntry = (message, t) => {
    const e = { hash: sha(`e${++state.seq}${t}`).slice(0, 40), ts: Date.now(), source: "app", message, text: t };
    state.entries.unshift(e);
    return e;
  };
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const cfg = () => ({ path: "/sandbox/config", exists: true, mtimeMs: 1, content: state.text, hash: sha(state.text) });

  async function fetchImpl(path, init = {}) {
    const [route, query] = path.split("?");
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    state.calls.push({ method, path: route, query, body });
    if (state.down > 0) {
      state.down--;
      throw new TypeError("Failed to fetch");
    }
    const key = `${method} ${route}`;
    switch (key) {
      case "GET /api/meta":
        return reply(200, { ghosttyVersion: "Ghostty test", reloadKeybind: "super+shift+,", idleMs: 0 });
      case "GET /api/config":
        return reply(200, cfg());
      case "GET /api/schema":
        return reply(200, SCHEMA);
      case "GET /api/themes":
        return reply(200, { themes: [{ name: "Night", source: "resources" }] });
      case "GET /api/fonts":
        return reply(200, { families: ["Hack"] });
      case "GET /api/stat":
        return reply(200, { mtimeMs: 1, exists: true });
      case "GET /api/history":
        return reply(200, { entries: state.entries.map(({ text: _t, ...e }) => e) });
      case "POST /api/ping":
        return reply(200, { ok: true });
      case "POST /api/config/preview":
        return reply(200, {
          ok: true,
          stale: sha(state.text) !== body.baseHash,
          baseHash: sha(state.text),
          newText: buildMutator(body.changes)(state.text),
          newHash: "n",
          diff: [{ t: "+", text: "x" }],
          lint: { ok: true, diagnostics: [], fileLevel: [] },
        });
      case "POST /api/config/apply": {
        if (!body.baseHash) return reply(400, { error: "baseHash is required for a write" });
        if (state.applyGate) await state.applyGate;
        if (body.baseHash !== sha(state.text)) return reply(409, { ok: false, reason: "stale", content: state.text, hash: sha(state.text) });
        state.text = buildMutator(body.changes)(state.text);
        const e = newEntry(`apply ${body.changes.length} change(s) [backup config-x]`, state.text);
        return reply(200, { ok: true, backup: "/state/backups/config-x", history: { hash: e.hash }, content: state.text, hash: sha(state.text), lint: { ok: true } });
      }
      case "POST /api/config/save": {
        if (!body.baseHash) return reply(400, { error: "baseHash is required for a write" });
        if (body.baseHash !== sha(state.text)) return reply(409, { ok: false, reason: "stale", content: state.text, hash: sha(state.text) });
        state.text = body.content;
        const e = newEntry("raw editor save [backup config-y]", state.text);
        return reply(200, { ok: true, backup: "/state/backups/config-y", history: { hash: e.hash }, content: state.text, hash: sha(state.text), lint: { ok: true } });
      }
      case "POST /api/history/restore": {
        const target = state.entries.find((e) => e.hash === body.hash);
        if (!target) return reply(400, { error: "unknown snapshot hash" });
        const same = target.text === state.text;
        state.text = target.text;
        const e = same ? null : newEntry(`restore ${body.hash.slice(0, 7)} [backup config-z]`, state.text);
        return reply(200, { ok: true, backup: "/state/backups/config-z", history: e ? { hash: e.hash } : null, content: state.text, hash: sha(state.text), lint: { ok: true } });
      }
      default:
        return reply(404, { error: "no such endpoint" });
    }
  }
  return { fetch: fetchImpl, state, sha, writeCalls: () => state.calls.filter((c) => WRITE_PATHS.includes(c.path)) };
}
