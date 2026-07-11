// Changes the config as text surgery: one edited line for a scalar change,
// in-place block replacement for list keys, everything else byte-identical.
// The file-writing half applies the full safety path from the plan: validate
// with the real binary, back up the current file, write atomically in the
// same directory, then read back and compare.

import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parse, serialize, pairs } from "./config-model.mjs";
import { lint } from "./lint.mjs";
import { configState } from "./paths.mjs";
import { env } from "./env.mjs";
import { captureExternal, snapshot } from "./history.mjs";

const BACKUP_DIR = join(env.stateDir, "backups");
const BACKUPS_KEPT = 50;

// The value portion never includes a trailing \r — CRLF lines keep their
// ending when edited in place.
const PAIR_PREFIX_RE = /^(\s*[A-Za-z0-9_-]+\s*=\s*)[^\r]*(\r?)$/;

// These throw on programmer error: the HTTP layer re-validates for callers,
// but the library must protect future direct callers (profiles, history)
// from silently corrupting the entry model.
function assertKey(key) {
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]+$/.test(key)) {
    throw new TypeError(`invalid config key: ${JSON.stringify(key)}`);
  }
}
function assertSingleLine(value) {
  if (typeof value !== "string" || /[\r\n]/.test(value)) {
    throw new TypeError("config values must be single-line strings");
  }
}

// New lines match the file's existing line-ending style.
const eolOf = (text) => (/\r\n/.test(text) ? "\r" : "");

export function setKeyInText(text, key, value) {
  assertKey(key);
  assertSingleLine(value);
  const model = parse(text);
  const occurrences = pairs(model).filter((p) => p.key === key);
  if (occurrences.length) {
    // Ghostty resolves repeated scalars last-wins, so the last line is the
    // one that owns the effective value.
    const entry = model.entries[occurrences[occurrences.length - 1].index];
    entry.raw = entry.raw.replace(PAIR_PREFIX_RE, (_, prefix, cr) => prefix + value + cr);
    entry.value = value;
  } else {
    model.entries.push({ kind: "pair", raw: `${key} = ${value}${eolOf(text)}`, key, value });
  }
  return serialize(model);
}

export function unsetKeyInText(text, key) {
  assertKey(key);
  const model = parse(text);
  model.entries = model.entries.filter(
    (e) => !(e.kind === "pair" && e.key === key)
  );
  return serialize(model);
}

export function setListInText(text, key, values) {
  assertKey(key);
  values.forEach(assertSingleLine);
  const model = parse(text);
  const first = model.entries.findIndex(
    (e) => e.kind === "pair" && e.key === key
  );
  const eol = eolOf(text);
  const newEntries = values.map((v) => ({
    kind: "pair",
    raw: `${key} = ${v}${eol}`,
    key,
    value: v,
  }));
  const kept = model.entries.filter(
    (e) => !(e.kind === "pair" && e.key === key)
  );
  if (first === -1) {
    model.entries = [...kept, ...newEntries];
  } else {
    // Keep the block where the user had it — count kept entries that precede
    // the first original occurrence.
    let insertAt = 0;
    for (let i = 0; i < first; i++) {
      if (!(model.entries[i].kind === "pair" && model.entries[i].key === key)) {
        insertAt++;
      }
    }
    model.entries = [
      ...kept.slice(0, insertAt),
      ...newEntries,
      ...kept.slice(insertAt),
    ];
  }
  return serialize(model);
}

// Backups are namespaced by target path (overridden targets must not mix
// with live-config backups) and rotated so the dir can't grow unbounded.
function backupPrefixFor(targetPath) {
  let h = 0;
  for (const ch of targetPath) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `config-${h.toString(16).padStart(8, "0")}`;
}

function pruneBackups(prefix) {
  const old = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith(prefix))
    .sort()
    .slice(0, -BACKUPS_KEPT);
  for (const f of old) unlinkSync(join(BACKUP_DIR, f));
}

// Writes newText to the managed config. Refuses on validation failure unless
// skipValidate (the raw editor's explicit "save anyway"). Every successful
// write leaves a timestamped backup of the previous file. All filesystem
// failures come back as { ok: false, reason }, never as a thrown exception —
// the API contract every other failure path honors.
export function writeConfig(newText, { skipValidate = false, message = "save" } = {}) {
  const state = configState();
  const check = lint(newText);
  if (!check.ok && !skipValidate) {
    return { ok: false, reason: "validation failed", lint: check };
  }

  let backup = null;
  try {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const prefix = backupPrefixFor(state.path);
    if (state.exists) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      backup = join(BACKUP_DIR, `${prefix}-${stamp}`);
      copyFileSync(state.path, backup);
    } else {
      mkdirSync(dirname(state.path), { recursive: true });
    }
    pruneBackups(prefix);

    // History is auxiliary: a git failure must not block the config write,
    // but it must be reported, never swallowed.
    let history = null;
    try {
      captureExternal(state.path);
      history = { pending: true };
    } catch (err) {
      history = { error: `history capture failed: ${err.message}` };
    }

    // Same-directory temp + rename: rename is only atomic within a filesystem.
    const tmp = join(dirname(state.path), `.config-mgr-${process.pid}.tmp`);
    writeFileSync(tmp, newText);
    renameSync(tmp, state.path);

    const readBack = readFileSync(state.path, "utf8");
    if (readBack !== newText) {
      return { ok: false, reason: "read-back mismatch", backup };
    }

    if (!history?.error) {
      try {
        history = snapshot(state.path, newText, message, "app");
      } catch (err) {
        history = { error: `history snapshot failed: ${err.message}` };
      }
    }
    return { ok: true, backup, lint: check, history };
  } catch (err) {
    return { ok: false, reason: `filesystem error: ${err.message}`, backup };
  }
}

// Throws a statusCode-tagged error on unreadable targets so the HTTP layer
// reports a clean structured failure instead of leaking a raw fs exception.
export function currentText() {
  const state = configState();
  if (!state.exists) return "";
  try {
    return readFileSync(state.path, "utf8");
  } catch (err) {
    const wrapped = new Error(`cannot read config: ${err.message}`);
    wrapped.statusCode = 500;
    throw wrapped;
  }
}
