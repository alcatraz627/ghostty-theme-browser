// Locates the installed Ghostty binary and runs its +actions.
//
// The binary is the app's source of truth for everything (schema, validation,
// themes), so all later modules go through here.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const BUNDLE_BIN = "/Applications/Ghostty.app/Contents/MacOS/ghostty";

let cachedBin = null;

export function ghosttyBin() {
  if (cachedBin) return cachedBin;
  if (existsSync(BUNDLE_BIN)) return (cachedBin = BUNDLE_BIN);
  try {
    const found = execFileSync("/usr/bin/env", ["sh", "-lc", "command -v ghostty"], {
      encoding: "utf8",
    }).trim();
    if (found) return (cachedBin = found);
  } catch {
    /* fall through */
  }
  return null;
}

export function runAction(args, opts = {}) {
  const bin = ghosttyBin();
  if (!bin) throw new Error("ghostty binary not found");
  return execFileSync(bin, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, ...opts });
}

export function versionLine() {
  try {
    return runAction(["+version"]).split("\n")[0].trim();
  } catch (err) {
    return `unavailable (${err.message})`;
  }
}
