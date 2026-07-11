# Env access convention (this project)

All `process.env` reads go through the single accessor module
`app/lib/env.mjs` — a plain frozen-shape object, no validation library. Chosen
because the app is deliberately zero-dependency vanilla Node; a schema lib would
be the only dep in the tree for two variables. Revisit if the env surface grows
past ~6 variables or gains security-sensitive values.

Established 2026-07-11 (session ghost-v2v3-a3) in response to the env-access
hook. Current surface: `XDG_CONFIG_HOME`, `GHOSTTY_MGR_PORT`,
`GHOSTTY_MGR_CONFIG` (manage a specific config file; tests use it to exercise
the write path against a sandbox copy instead of the live config),
`GHOSTTY_MGR_STATE` (root for backups + history repos; tests point it at a
temp dir).
