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
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { parse, serialize, pairs } from "./config-model.mjs";
import { lint } from "./lint.mjs";
import { configState } from "./paths.mjs";

const STATE_DIR = join(homedir(), ".config", "ghostty-manager");
const BACKUP_DIR = join(STATE_DIR, "backups");

const PAIR_PREFIX_RE = /^(\s*[A-Za-z0-9_-]+\s*=\s*).*$/;

export function setKeyInText(text, key, value) {
  const model = parse(text);
  const occurrences = pairs(model).filter((p) => p.key === key);
  if (occurrences.length) {
    // Ghostty resolves repeated scalars last-wins, so the last line is the
    // one that owns the effective value.
    const entry = model.entries[occurrences[occurrences.length - 1].index];
    entry.raw = entry.raw.replace(PAIR_PREFIX_RE, (_, prefix) => prefix + value);
    entry.value = value;
  } else {
    model.entries.push({ kind: "pair", raw: `${key} = ${value}`, key, value });
  }
  return serialize(model);
}

export function unsetKeyInText(text, key) {
  const model = parse(text);
  model.entries = model.entries.filter(
    (e) => !(e.kind === "pair" && e.key === key)
  );
  return serialize(model);
}

export function setListInText(text, key, values) {
  const model = parse(text);
  const first = model.entries.findIndex(
    (e) => e.kind === "pair" && e.key === key
  );
  const newEntries = values.map((v) => ({
    kind: "pair",
    raw: `${key} = ${v}`,
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

// Writes newText to the live config. Refuses on validation failure unless
// skipValidate (the raw editor's explicit "save anyway"). Every successful
// write leaves a timestamped backup of the previous file.
export function writeConfig(newText, { skipValidate = false } = {}) {
  const state = configState();
  const check = lint(newText);
  if (!check.ok && !skipValidate) {
    return { ok: false, reason: "validation failed", lint: check };
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  let backup = null;
  if (state.exists) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    backup = join(BACKUP_DIR, `config-${stamp}`);
    copyFileSync(state.path, backup);
  } else {
    mkdirSync(dirname(state.path), { recursive: true });
  }

  // Same-directory temp + rename: rename is only atomic within a filesystem.
  const tmp = join(dirname(state.path), `.config-mgr-${process.pid}.tmp`);
  writeFileSync(tmp, newText);
  renameSync(tmp, state.path);

  const readBack = readFileSync(state.path, "utf8");
  if (readBack !== newText) {
    return { ok: false, reason: "read-back mismatch", backup };
  }
  return { ok: true, backup, lint: check };
}

export function currentText() {
  const state = configState();
  return state.exists ? readFileSync(state.path, "utf8") : "";
}
