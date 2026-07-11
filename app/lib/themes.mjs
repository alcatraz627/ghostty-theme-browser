// Reads themes from the places the installed Ghostty actually loads them —
// the user themes dir first, then the app bundle — so the picker can never
// drift from what `theme = X` will really resolve to. A theme file is plain
// config syntax; its colors come back as a key→value map with palette
// entries expanded to palette.N keys.

import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { runAction } from "./ghostty.mjs";
import { parse, pairs } from "./config-model.mjs";
import { env } from "./env.mjs";

const BUNDLE_THEMES = "/Applications/Ghostty.app/Contents/Resources/ghostty/themes";

function userThemesDir() {
  const xdgBase = env.xdgConfigHome || join(homedir(), ".config");
  return join(xdgBase, "ghostty", "themes");
}

// [{ name, source: "user" | "resources" }], from the binary's own listing.
export function listThemes() {
  const out = runAction(["+list-themes", "--plain"]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?) \((user|resources)\)$/);
      return m ? { name: m[1], source: m[2] } : { name: line.trim(), source: "resources" };
    });
}

export function themeColors(name) {
  // Leading dots also rejected: "." resolves to the themes directory itself
  // (EISDIR on read), and no theme in the corpus is a dotfile.
  if (
    typeof name !== "string" ||
    name.includes("/") ||
    name.includes("..") ||
    name.startsWith(".") ||
    !name.trim()
  ) {
    throw new TypeError(`invalid theme name: ${JSON.stringify(name)}`);
  }
  // Same resolution order the binary reports when a theme is missing:
  // user dir first, bundle second. Must be a regular file — a directory
  // that happens to match the name is not a theme.
  const candidates = [join(userThemesDir(), name), join(BUNDLE_THEMES, name)];
  const path = candidates.find((p) => {
    try {
      return existsSync(p) && statSync(p).isFile();
    } catch {
      return false;
    }
  });
  if (!path) throw new TypeError(`no such theme: ${name}`);

  const colors = {};
  for (const p of pairs(parse(readFileSync(path, "utf8")))) {
    if (p.key === "palette") {
      const m = p.value.match(/^(\d{1,3})\s*=\s*(.+)$/);
      // ANSI palette indices are 0-255; anything else is a malformed line.
      if (m && Number(m[1]) <= 255) colors[`palette.${m[1]}`] = m[2].trim();
    } else {
      colors[p.key] = p.value;
    }
  }
  return { name, path, colors };
}
