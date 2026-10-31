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

// Font families ghostty's own discovery can load — the only trustworthy
// source for a font picker (unindented lines are families; indented, faces).
let cachedFamilies = null;
export function listFontFamilies() {
  if (cachedFamilies) return cachedFamilies;
  const out = runAction(["+list-fonts"]);
  cachedFamilies = [...new Set(
    out.split("\n").filter((l) => l.trim() && !/^\s/.test(l)).map((l) => l.trim())
  )].sort((a, b) => a.localeCompare(b));
  return cachedFamilies;
}

// The user's actual reload-config trigger (they may have rebound it), for
// honest "press X to apply" hints. Ghostty spells Cmd as "super".
export function reloadKeybind() {
  try {
    const line = runAction(["+list-keybinds"])
      .split("\n")
      .find((l) => l.includes("=reload_config"));
    const m = line?.match(/keybind\s*=\s*(.+?)=reload_config/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
