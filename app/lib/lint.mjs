// Validates a candidate config text using the user's actual Ghostty binary,
// so the app can never disagree with Ghostty about what's valid.
//
// The candidate is written to a private temp file and checked with
// `ghostty +validate-config --config-file=<tmp>`; the config on disk is never
// touched. Returns { ok, diagnostics, fileLevel }: diagnostics are anchored to
// a 1-based line and key; fileLevel entries have no line. A missing theme is
// reported once per theme even though the binary prints one line per tried
// lookup path.

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ghosttyBin } from "./ghostty.mjs";
import { parse } from "./config-model.mjs";

const THEME_RE = /^theme "([^"]+)" not found/;

// The bin/timeoutMs overrides exist for tests, which need to exercise the
// spawn-failure path without a 10s wall-clock wait.
export function lint(text, { bin = ghosttyBin(), timeoutMs = 10_000 } = {}) {
  if (!bin) {
    return { ok: false, unavailable: true, diagnostics: [], fileLevel: [] };
  }

  const dir = mkdtempSync(join(tmpdir(), "ghostty-lint-"));
  const file = join(dir, "candidate");
  try {
    // A truly 0-byte file makes +validate-config exit 1 with no message
    // (verified on 1.3.1); a lone newline is the same config and validates.
    writeFileSync(file, text === "" ? "\n" : text);
    const res = spawnSync(bin, ["+validate-config", `--config-file=${file}`], {
      encoding: "utf8",
      timeout: timeoutMs,
    });
    // A spawn-level failure (timeout, crash, binary vanished) means the config
    // was NOT validated — say so, or the UI renders "invalid, 0 problems".
    if (res.error) {
      return {
        ok: false,
        diagnostics: [],
        fileLevel: [{ message: `validation did not run: ${res.error.message}` }],
      };
    }
    // Ghostty reports the candidate path with symlinks resolved
    // (/var → /private/var on macOS), so match against the resolved path.
    const reportedFile = realpathSync(file);

    const diagnostics = [];
    const fileLevel = [];
    const themesSeen = new Set();
    const output = `${res.stdout || ""}\n${res.stderr || ""}`;
    // Ground truth for key attribution: what the caller actually submitted,
    // line by line. Ghostty echoes offending text where a key would be, and
    // quoted values may contain embedded newlines, so the reported "key" is
    // only trusted when the submitted line really is `thatKey = ...`.
    const submittedEntries = parse(text).entries;

    for (const line of output.split("\n")) {
      if (!line.trim()) continue;

      const themeMatch = line.match(THEME_RE);
      if (themeMatch) {
        if (!themesSeen.has(themeMatch[1])) {
          themesSeen.add(themeMatch[1]);
          fileLevel.push({ theme: themeMatch[1], message: `theme "${themeMatch[1]}" not found` });
        }
        continue;
      }

      // Line-anchored only when the output names our candidate file.
      if (line.startsWith(reportedFile + ":")) {
        const rest = line.slice(reportedFile.length + 1);
        const m = rest.match(/^(\d+):(.*)$/);
        if (m) {
          const lineNo = Number(m[1]);
          const keyed = m[2].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
          const submitted = submittedEntries[lineNo - 1];
          const legit =
            keyed && submitted?.kind === "pair" && submitted.key === keyed[1];
          diagnostics.push(
            legit
              ? { line: lineNo, key: keyed[1], message: keyed[2] }
              : { line: lineNo, key: "", message: m[2].trim() }
          );
          continue;
        }
      }

      // Quirk #3 (verified on 1.3.1): when the config contains a `theme =`
      // line, validation errors are reported WITHOUT path:line location, as
      // bare "key: message". Recover an anchor from the submitted text only
      // when it's unambiguous: the key occurs on exactly one line, or the
      // message quotes a value that exactly one of the key's lines carries.
      // Ghostty validates every line (not just the last-wins effective one),
      // so guessing beyond that would point errors at valid lines.
      const bare = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (bare) {
        const occ = [];
        for (let i = 0; i < submittedEntries.length; i++) {
          const e = submittedEntries[i];
          if (e.kind === "pair" && e.key === bare[1]) occ.push(i);
        }
        let anchor = occ.length === 1 ? occ[0] : -1;
        if (anchor === -1 && occ.length > 1) {
          const quoted = bare[2].match(/"([^"]*)"/);
          if (quoted) {
            const matches = occ.filter(
              (i) => submittedEntries[i].value === quoted[1]
            );
            if (matches.length === 1) anchor = matches[0];
          }
        }
        if (anchor !== -1) {
          diagnostics.push({ line: anchor + 1, key: bare[1], message: bare[2] });
          continue;
        }
        if (occ.length > 0) {
          // Key exists but the owning line is ambiguous — report without a
          // line rather than point at a possibly-valid one.
          fileLevel.push({ key: bare[1], message: `${bare[1]}: ${bare[2]}` });
          continue;
        }
      }

      fileLevel.push({ message: line.trim() });
    }

    return { ok: res.status === 0, diagnostics, fileLevel };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
