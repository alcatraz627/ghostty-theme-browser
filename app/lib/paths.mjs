// Resolves which config file Ghostty actually reads on this machine.
//
// Ghostty loads the XDG path first, then the macOS Application Support path,
// so on conflict the macOS path wins. "Live" for editing purposes is therefore
// the macOS path when it exists, falling back to XDG, falling back to the
// macOS default location for a fresh install.

import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { env } from "./env.mjs";

const HOME = homedir();

export function candidatePaths() {
  const xdgBase = env.xdgConfigHome || join(HOME, ".config");
  const dirs = [
    join(HOME, "Library", "Application Support", "com.mitchellh.ghostty"),
    join(xdgBase, "ghostty"),
  ];
  const names = ["config", "config.ghostty"];
  return dirs.flatMap((dir) =>
    names.map((name) => {
      const path = join(dir, name);
      return { path, exists: existsSync(path) };
    })
  );
}

export function liveConfigPath() {
  const candidates = candidatePaths();
  const existing = candidates.find((c) => c.exists);
  // No config anywhere: a fresh install writes to the macOS-preferred location.
  return existing ? existing.path : candidates[0].path;
}

export function configState() {
  const path = liveConfigPath();
  const exists = existsSync(path);
  return {
    path,
    exists,
    mtimeMs: exists ? statSync(path).mtimeMs : null,
    candidates: candidatePaths(),
  };
}
