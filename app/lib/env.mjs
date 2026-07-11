// The single place this app reads process.env. Everything else imports from
// here, so the full environment surface is visible in one screen.
//
// Convention recorded at .claude/conventions/env-access.md.

import { homedir } from "node:os";
import { join } from "node:path";

export const env = {
  // Root for app state (backups, history repos). Tests point this at a temp
  // dir so nothing they do touches the real state.
  stateDir:
    process.env.GHOSTTY_MGR_STATE ||
    join(homedir(), ".config", "ghostty-manager"),

  // Base dir for the XDG config lookup (Ghostty's cross-platform config home).
  xdgConfigHome: process.env.XDG_CONFIG_HOME || null,

  // Dev-server port. Default matches the ports.sh tier-3 claim for
  // "ghostty-config-manager"; override for ad-hoc runs only.
  port: Number(process.env.GHOSTTY_MGR_PORT || 6202),

  // Manage a specific config file instead of the auto-detected live one.
  // Used by tests to run the full write path against a sandbox copy.
  configPathOverride: process.env.GHOSTTY_MGR_CONFIG || null,
};
