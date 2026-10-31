// The receipt shown after a write: what was written, where the backup is, which
// history entry holds it, how to reload, and four ways back. It is a plain model
// built from the server's reply, so the text and the four ways can be tested
// without a page.

const baseName = (p) => String(p ?? "").split("/").pop();

// "super+shift+," becomes "⌘⇧,".
export function formatKeybind(raw) {
  const glyph = { super: "⌘", cmd: "⌘", command: "⌘", shift: "⇧", ctrl: "⌃", control: "⌃", alt: "⌥", option: "⌥" };
  const parts = String(raw ?? "").split("+").filter(Boolean);
  if (!parts.length) return "";
  const key = parts.pop();
  const mods = parts.map((m) => glyph[m.toLowerCase()] ?? m).join("");
  return mods + (key.length === 1 ? key.toUpperCase() : key);
}

// The history entry before the one this write created, which is what Undo
// restores. entries are newest first. Returns null when there is none, or when
// the write left no history entry of its own.
export function undoTargetFor(entries, newHash) {
  if (!newHash || !Array.isArray(entries)) return null;
  const i = entries.findIndex((e) => e.hash === newHash);
  if (i === -1) return null;
  return entries[i + 1]?.hash ?? null;
}

const TITLES = {
  apply: (n) => `Applied ${n} ${n === 1 ? "change" : "changes"}`,
  raw: () => "Saved the file",
  restore: () => "Restored an earlier version",
  undo: () => "Undone, the file is back to the earlier version",
};
const UNDO_LABEL = { apply: "Undo this apply", raw: "Undo this save", restore: "Undo this restore", undo: "Redo" };

// kind: "apply" | "raw" | "restore" | "undo". response: the server's success reply.
// keyCount: how many settings changed. entries: GET /api/history after the write.
// title replaces the default heading, for writes like "Activated profile work".
export function buildReceipt({ kind = "apply", response, keyCount = 0, configPath = "", reloadKeybind = "", entries = [], title = null }) {
  const backupPath = response?.backup ?? null;
  const historyHash = response?.history?.hash ?? null;
  const historyError = response?.history?.error ?? null;
  const undoTarget = undoTargetFor(entries, historyHash);
  return {
    kind,
    title: title ?? (TITLES[kind] ?? TITLES.apply)(keyCount),
    keyCount,
    backupName: backupPath ? baseName(backupPath) : null,
    backupPath,
    historyHash,
    historyShort: historyHash ? historyHash.slice(0, 7) : null,
    historyNote: historyError ?? (historyHash ? null : "no new entry, the file is identical to the latest one"),
    newHash: response?.hash ?? null,
    fileShort: response?.hash ? response.hash.slice(0, 12) : null,
    reloadKeybind,
    reloadGlyph: formatKeybind(reloadKeybind),
    // The same text the Copy button puts on the clipboard.
    restoreCommand: backupPath ? `cp "${backupPath}" "${configPath}"` : null,
    undoTarget,
    undoLabel: UNDO_LABEL[kind] ?? UNDO_LABEL.apply,
    wasEmptyFile: !backupPath,
  };
}

// What to tell the person when the server refused or failed a write. It only
// says "nothing was written" when that is certain.
export function refusalText(reason) {
  const r = String(reason ?? "");
  if (r === "read-back mismatch") return "The file was written but did not read back the same. Check History.";
  if (r.startsWith("filesystem error")) return `Something went wrong while writing (${r}). The file may have changed. Check History.`;
  if (r === "validation failed") return "Not applied. Nothing was written.";
  if (r === "config is locked by another process") return "Not applied. Another process holds the config lock. Nothing was written.";
  return r ? `Not applied: ${r}.` : "Not applied.";
}

// Setting names for a one-line list: "Font size, Theme and 2 more".
export function summarizeNames(names, max = 3) {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}
