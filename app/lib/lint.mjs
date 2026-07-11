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

const THEME_RE = /^theme "([^"]+)" not found/;

export function lint(text) {
  const bin = ghosttyBin();
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
      timeout: 10_000,
    });
    // Ghostty reports the candidate path with symlinks resolved
    // (/var → /private/var on macOS), so match against the resolved path.
    const reportedFile = realpathSync(file);

    const diagnostics = [];
    const fileLevel = [];
    const themesSeen = new Set();
    const output = `${res.stdout || ""}\n${res.stderr || ""}`;

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
        const m = rest.match(/^(\d+):([^:]*):\s*(.*)$/);
        if (m) {
          diagnostics.push({ line: Number(m[1]), key: m[2], message: m[3] });
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
