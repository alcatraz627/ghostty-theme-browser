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
  rmdirSync,
  statSync,
  existsSync,
  copyFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { parse, serialize, pairs } from "./config-model.mjs";
import { lineDiff } from "./diff.mjs";
import { lint } from "./lint.mjs";
import { configState } from "./paths.mjs";
import { env } from "./env.mjs";
import { captureExternal, snapshot } from "./history.mjs";

const BACKUP_DIR = join(env.stateDir, "backups");
const BACKUPS_KEPT = 50;

// A fingerprint of the config text. The page records it when a change is staged
// and sends it back with Apply, so a hand edit made in between is noticed.
export function hashOf(text) {
  return createHash("sha256").update(text ?? "").digest("hex");
}

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

// Edits a list key without moving anything that stays: lines whose value is
// still wanted keep their place (and the comments around them), removed values
// lose only their own line, and each new value goes right after the line that
// precedes it in the wanted order. Returns the new entries, or null when that
// cannot reproduce the wanted order (a reorder, or nothing survives), in which
// case the caller replaces the whole block.
function editListInPlace(entries, key, values, eol) {
  const isKey = (e) => e.kind === "pair" && e.key === key;
  const keptAt = new Map();
  const used = new Set();
  for (const e of entries.filter(isKey)) {
    const j = values.findIndex((v, i) => !used.has(i) && v === e.value);
    if (j !== -1) {
      used.add(j);
      keptAt.set(j, e);
    }
  }
  if (!keptAt.size) return null;
  const kept = new Set(keptAt.values());
  const out = entries.filter((e) => !isKey(e) || kept.has(e));
  const firstKept = keptAt.get(Math.min(...keptAt.keys()));
  let prev = null;
  values.forEach((value, j) => {
    const have = keptAt.get(j);
    if (have) {
      prev = have;
      return;
    }
    const fresh = { kind: "pair", raw: `${key} = ${value}${eol}`, key, value };
    out.splice(prev ? out.indexOf(prev) + 1 : out.indexOf(firstKept), 0, fresh);
    prev = fresh;
  });
  const got = out.filter(isKey).map((e) => e.value);
  return got.length === values.length && got.every((v, i) => v === values[i]) ? out : null;
}

export function setListInText(text, key, values) {
  assertKey(key);
  values.forEach(assertSingleLine);
  const model = parse(text);
  const first = model.entries.findIndex(
    (e) => e.kind === "pair" && e.key === key
  );
  const eol = eolOf(text);
  if (first !== -1) {
    const inPlace = editListInPlace(model.entries, key, values, eol);
    if (inPlace) {
      model.entries = inPlace;
      return serialize(model);
    }
  }
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

// Cross-process mutex around the whole read-modify-write cycle, using mkdir's
// atomicity. Without it, two processes (a second server instance, a future
// profiles CLI) computing changes from the same base silently lose the
// slower writer's edit — the M4 gate reproduced this 100% of the time.
const LOCK_RETRIES = 40;
const LOCK_WAIT_S = "0.05";
const LOCK_STALE_MS = 10_000;

function acquireLock(targetPath) {
  const lock = `${targetPath}.gcm-lock`;
  for (let i = 0; i < LOCK_RETRIES; i++) {
    try {
      mkdirSync(lock);
      return lock;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
          rmdirSync(lock); // crashed holder; steal on next iteration
          continue;
        }
      } catch {
        continue; // lock vanished between mkdir and stat — retry immediately
      }
      spawnSync("sleep", [LOCK_WAIT_S]);
    }
  }
  return null;
}

function releaseLock(lock) {
  try {
    rmdirSync(lock);
  } catch {
    /* stolen as stale or already gone — nothing to release */
  }
}

// The one write primitive: locks the target, reads the freshest content,
// applies the caller's mutator, and runs the full safety chain (validate with
// the real binary → timestamped backup → capture hand edits → same-dir atomic
// rename → read-back → history snapshot). Refuses on validation failure
// unless skipValidate (the raw editor's explicit "save anyway"). All failures
// come back as { ok: false, reason }, never a thrown exception; the returned
// content is the new text on success, the pre-change text otherwise.
export function applyChange(mutator, { skipValidate = false, message = "save", baseHash = null } = {}) {
  const state = configState();
  const lock = acquireLock(state.path);
  if (!lock) {
    return { ok: false, reason: "config is locked by another process" };
  }
  try {
    // History is auxiliary: a git failure must not block the write, but it
    // must be reported, never swallowed.
    let history = null;
    try {
      captureExternal(state.path);
      history = { pending: true };
    } catch (err) {
      history = { error: `history capture failed: ${err.message}` };
    }

    const before = existsSync(state.path) ? readFileSync(state.path, "utf8") : "";
    // First of two staleness checks: the file must still be what the caller
    // staged against. A mismatch means someone edited it since, so write nothing.
    if (baseHash && hashOf(before) !== baseHash) {
      return { ok: false, reason: "stale", content: before, hash: hashOf(before) };
    }
    const newText = mutator(before);

    const check = lint(newText);
    if (!check.ok && !skipValidate) {
      return { ok: false, reason: "validation failed", lint: check, content: before };
    }

    let backup = null;
    try {
      mkdirSync(BACKUP_DIR, { recursive: true });
      const prefix = backupPrefixFor(state.path);
      if (existsSync(state.path)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        backup = join(BACKUP_DIR, `${prefix}-${stamp}`);
        copyFileSync(state.path, backup);
      } else {
        mkdirSync(dirname(state.path), { recursive: true });
      }
      pruneBackups(prefix);

      // Same-directory temp + rename: rename is only atomic within a filesystem.
      const tmp = join(dirname(state.path), `.config-mgr-${process.pid}.tmp`);
      writeFileSync(tmp, newText);

      // Shrink the hand-edit TOCTOU window to the microseconds between this
      // capture and the rename: editors don't honor our lock, so anything
      // that landed since the first capture gets its history entry now.
      if (!history?.error) {
        try {
          captureExternal(state.path);
        } catch (err) {
          history = { error: `history capture failed: ${err.message}` };
        }
      }
      // Second staleness check, right before the rename and after the last
      // history capture: anything that landed since the first read means this
      // write would clobber it, so back out. Only a change in the microseconds
      // between this read and the rename can still be lost.
      const justBefore = existsSync(state.path) ? readFileSync(state.path, "utf8") : "";
      if (hashOf(justBefore) !== hashOf(before)) {
        try {
          unlinkSync(tmp);
        } catch {
          /* the temp file is already gone */
        }
        return { ok: false, reason: "stale", content: justBefore, hash: hashOf(justBefore) };
      }
      renameSync(tmp, state.path);

      const readBack = readFileSync(state.path, "utf8");
      if (readBack !== newText) {
        return { ok: false, reason: "read-back mismatch", backup, content: readBack };
      }

      if (!history?.error) {
        try {
          // The backup name rides in the history message so History can show it.
          const label = backup ? `${message} [backup ${basename(backup)}]` : message;
          history = snapshot(state.path, newText, label, "app");
        } catch (err) {
          history = { error: `history snapshot failed: ${err.message}` };
        }
      }
      return { ok: true, backup, lint: check, history, content: newText, hash: hashOf(newText) };
    } catch (err) {
      return { ok: false, reason: `filesystem error: ${err.message}`, backup, content: before };
    }
  } finally {
    releaseLock(lock);
  }
}

// Whole-content save; the base doesn't matter because the caller is
// deliberately replacing everything (raw editor, restore, profile activate).
export function writeConfig(newText, opts = {}) {
  return applyChange(() => newText, opts);
}

// A batch of staged changes applied as ONE locked write and one history
// entry — the commit half of the preview-then-apply contract. Each change is
// {key, value} | {key, values: []} | {key, unset: true}; shapes are enforced
// by the same assertions the surgery functions throw.
export function applyChanges(changes, opts = {}) {
  const mutator = buildMutator(changes);
  const keys = changes.map((c) => c.key).join(", ");
  return applyChange(mutator, { message: `apply ${changes.length} change(s): ${keys}`, ...opts });
}

// The one place a staged change set becomes new file text. Apply and preview
// both call it, so the text shown before Apply is the text Apply writes.
export function buildMutator(changes) {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new TypeError("changes must be a non-empty array");
  }
  return (before) =>
    changes.reduce((text, ch) => {
      if (!ch || typeof ch.key !== "string") {
        throw new TypeError("each change needs a key");
      }
      if (ch.unset === true) return unsetKeyInText(text, ch.key);
      if (Array.isArray(ch.values)) {
        return ch.values.length
          ? setListInText(text, ch.key, ch.values)
          : unsetKeyInText(text, ch.key);
      }
      if (typeof ch.value === "string") {
        return ch.value === ""
          ? unsetKeyInText(text, ch.key)
          : setKeyInText(text, ch.key, ch.value);
      }
      throw new TypeError(`change for "${ch.key}" needs value, values, or unset`);
    }, before);
}

// What Apply would write for these changes, without writing anything: no lock,
// no backup, no history capture. Returns the new text, a line diff, Ghostty's
// verdict, and whether the file changed since the caller staged against it.
export function previewChanges(changes, { baseHash = null } = {}) {
  const mutator = buildMutator(changes);
  const state = configState();
  const before = state.exists ? readFileSync(state.path, "utf8") : "";
  const hash = hashOf(before);
  const stale = Boolean(baseHash) && hash !== baseHash;
  const newText = mutator(before);
  const check = lint(newText);
  return {
    ok: check.ok && !stale,
    stale,
    baseHash: hash,
    newHash: hashOf(newText),
    newText,
    diff: lineDiff(before, newText),
    lint: check,
  };
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
