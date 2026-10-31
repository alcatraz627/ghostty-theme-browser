// Every config state the app has seen, kept forever in a per-target git repo
// so any point in time can be restored byte-exactly. One repo per managed
// target (namespaced by path hash under <state>/history/), holding a single
// file named "config". Undo/redo are not special operations: restoring an old
// snapshot writes it through the normal safety path, which appends a NEW
// snapshot — the timeline only ever grows, so nothing is ever lost.
//
// Git identity is passed per-invocation (-c user.name=...), so commits never
// depend on the machine's global git config.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "./env.mjs";

const REPO_FILE = "config";

function repoDirFor(targetPath) {
  let h = 0;
  for (const ch of targetPath) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return join(env.stateDir, "history", h.toString(16).padStart(8, "0"));
}

function git(dir, args, input) {
  const res = spawnSync(
    "git",
    ["-c", "user.name=ghostty-config-manager", "-c", "user.email=gcm@local", ...args],
    { cwd: dir, encoding: "utf8", input, timeout: 10_000 }
  );
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${(res.stderr || "").trim()}`);
  }
  return res.stdout;
}

function ensureRepo(targetPath) {
  const dir = repoDirFor(targetPath);
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(dir, { recursive: true });
    git(dir, ["init", "--quiet", "--initial-branch=main"]);
    // Record which file this repo shadows, for humans poking around later.
    writeFileSync(join(dir, "TARGET"), targetPath + "\n");
    git(dir, ["add", "TARGET"]);
    git(dir, ["commit", "--quiet", "-m", `history for ${targetPath}`]);
  }
  return dir;
}

function headContent(dir) {
  const res = spawnSync("git", ["show", `HEAD:${REPO_FILE}`], {
    cwd: dir,
    encoding: "utf8",
  });
  return res.status === 0 ? res.stdout : null;
}

// Records content as a snapshot commit unless it's identical to the latest
// one. source is "app" (our own writes) or "external" (hand edits noticed on
// disk). Returns { hash } or null when skipped.
export function snapshot(targetPath, content, message, source = "app") {
  const dir = ensureRepo(targetPath);
  if (headContent(dir) === content) return null;
  writeFileSync(join(dir, REPO_FILE), content);
  git(dir, ["add", REPO_FILE]);
  git(dir, ["commit", "--quiet", "-m", `[${source}] ${message}`]);
  return { hash: git(dir, ["rev-parse", "HEAD"]).trim() };
}

// Captures the target's current on-disk state if history hasn't seen it —
// this is how hand edits become their own timeline entries instead of being
// silently absorbed into the next app write.
export function captureExternal(targetPath) {
  if (!existsSync(targetPath)) return null;
  const disk = readFileSync(targetPath, "utf8");
  return snapshot(targetPath, disk, "edited outside the app", "external");
}

export function log(targetPath, limit = 100) {
  const dir = ensureRepo(targetPath);
  const out = git(dir, [
    "log",
    `--max-count=${limit}`,
    "--format=%H%x1f%ct%x1f%s",
    "--",
    REPO_FILE,
  ]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, epoch, subject] = line.split("\x1f");
      const m = subject.match(/^\[(app|external)\] (.*)$/);
      return {
        hash,
        ts: Number(epoch) * 1000,
        source: m ? m[1] : "app",
        message: m ? m[2] : subject,
      };
    });
}

// Byte-exact content of a snapshot.
export function show(targetPath, hash) {
  if (!/^[0-9a-f]{7,40}$/.test(hash)) {
    throw new TypeError(`invalid history hash: ${JSON.stringify(hash)}`);
  }
  const dir = ensureRepo(targetPath);
  return git(dir, ["show", `${hash}:${REPO_FILE}`]);
}

export function diff(targetPath, hash) {
  if (!/^[0-9a-f]{7,40}$/.test(hash)) {
    throw new TypeError(`invalid history hash: ${JSON.stringify(hash)}`);
  }
  const dir = ensureRepo(targetPath);
  return git(dir, ["show", "--format=", "--unified=2", hash, "--", REPO_FILE]);
}
