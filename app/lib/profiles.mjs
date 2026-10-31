// Named, complete config files the user can switch between. A profile is
// deliberately a full file (not a layered diff): activation writes it through
// the normal safety path, which also means the outgoing config is captured in
// history before it's replaced — switching can never lose anything.

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { env } from "./env.mjs";
import { configState } from "./paths.mjs";
import { writeConfig } from "./config-write.mjs";

const PROFILES_DIR = () => join(env.stateDir, "profiles");
const EXT = ".conf";

// Names become filenames: strict charset, no path separators, no dotfiles,
// no leading/trailing whitespace (an invisible trailing space would render
// as a duplicate-looking entry in the UI).
export function assertProfileName(name) {
  if (
    typeof name !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,40}$/.test(name) ||
    name.includes("..") ||
    name !== name.trim()
  ) {
    throw new TypeError(`invalid profile name: ${JSON.stringify(name)}`);
  }
}

const fileFor = (name) => join(PROFILES_DIR(), name + EXT);

export function listProfiles() {
  const dir = PROFILES_DIR();
  if (!existsSync(dir)) return [];
  const state = configState();
  const current = state.exists ? readFileSync(state.path, "utf8") : null;
  return readdirSync(dir)
    .filter((f) => f.endsWith(EXT))
    .flatMap((f) => {
      const name = f.slice(0, -EXT.length);
      const path = join(dir, f);
      // Stray directories or unreadable entries must not take the whole
      // listing down.
      try {
        const st = statSync(path);
        if (!st.isFile()) return [];
        return [{
          name,
          mtimeMs: st.mtimeMs,
          size: st.size,
          active: current !== null && readFileSync(path, "utf8") === current,
        }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readProfile(name) {
  assertProfileName(name);
  if (!existsSync(fileFor(name))) {
    throw new TypeError(`no such profile: ${name}`);
  }
  return readFileSync(fileFor(name), "utf8");
}

// Overwriting an existing profile requires an explicit flag: profiles live
// outside config history, so a silent overwrite would be unrecoverable. The
// check is case-insensitive because the default macOS filesystem is — saving
// "work" over "Work" would silently clobber it otherwise.
export function saveProfile(name, content, { overwrite = false } = {}) {
  assertProfileName(name);
  if (typeof content !== "string") throw new TypeError("content must be a string");
  mkdirSync(PROFILES_DIR(), { recursive: true });
  const clash = readdirSync(PROFILES_DIR())
    .filter((f) => f.endsWith(EXT))
    .map((f) => f.slice(0, -EXT.length))
    .find((existing) => existing.toLowerCase() === name.toLowerCase());
  if (clash && !overwrite) {
    throw new TypeError(`profile "${clash}" already exists — pass overwrite to replace it`);
  }
  writeFileSync(fileFor(clash || name), content);
  return { name: clash || name };
}

export function deleteProfile(name) {
  assertProfileName(name);
  if (!existsSync(fileFor(name))) {
    throw new TypeError(`no such profile: ${name}`);
  }
  unlinkSync(fileFor(name));
  return { name };
}

// Activation goes through the full write chain (validate, backup, history
// capture + snapshot), so the previous config is always restorable.
export function activateProfile(name) {
  const content = readProfile(name);
  return writeConfig(content, { message: `activate profile "${name}"` });
}
