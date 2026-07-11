<!-- sessions: ghost-v2v3-a3@2026-07-11 -->

# V2 Plan — Local Ghostty Config Manager

A standalone local web app that edits the real Ghostty config file safely: a detailed
interactive settings editor, edit history with undo/redo, named profiles bundling a
theme plus settings, and linting backed by Ghostty's own validator.

**Feasibility verdict: HIGH.** Every pillar of the feature list maps to a mechanism that
was verified against the installed Ghostty 1.3.1 binary on this machine, not just docs.
The one genuine platform gap (forcing a running Ghostty to reload) has an honest
workaround and does not block anything else.

Research inputs: `.claude/output/20260711-1446-v2v3-research/v2-config-surface.md`
(web + docs research) and `local-ground-truth.md` (everything exercised live on this
machine). Claims below marked (V) were verified locally.

---

## 1. What each feature stands on

| Feature | Mechanism | Status |
|---|---|---|
| Interactive detailed editing | Schema generated from `ghostty +show-config --default --docs` (4,091 lines, 634 option lines, docs inline) (V) | Verified |
| Lint invalid config | `ghostty +validate-config --config-file=<tmp>` returns `path:line:key: message` lines, exit 1 (V). Catches unknown keys AND bad values (`font-size = banana`) (V) | Verified |
| History / undo / redo | Git repo in the app's state dir; one commit per save | Standard tooling |
| Profiles (theme + settings) | Profiles are complete config files; activation = validate, snapshot, atomic write to the live path | Design choice, no platform dependency |
| Theme browsing / preview | V1 of this repo already renders the same 463-theme corpus (V); read themes live from the app bundle + user dir with `(resources)`/`(user)` tags (V) | Verified |
| Apply changes to running app | User presses the reload keybind. Read the real binding from `+list-keybinds` (`super+shift+,` here) (V) | Verified, with caveat below |

The caveat: there is no way to force-reload a running Ghostty on macOS 1.3.1.
AppleScript support exists on paper (`perform action "reload_config"` is in the
dictionary), but the live object graph reports zero windows/terminals, so it fails
end-to-end (V, tested against the running app). `+new-window` IPC is Linux-only (V).
File auto-watch doesn't exist (upstream issue #449, deliberately not default).
SIGUSR2 reload is Linux-only, and must NOT be casually tested on macOS (an unhandled
USR2 would terminate every open terminal window). Design consequence in §4.

## 2. Architecture

```
┌────────────────────────── Browser UI (localhost) ──────────────────────────┐
│  Form view (schema-driven)   Raw view (editor + lint)   Themes (V1 embed)  │
│  History timeline (diffs)    Profiles (save-as / activate / duplicate)     │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ JSON over localhost HTTP
┌───────────────────────────────────┴─────────────────────────────────────────┐
│                        Node server (single process)                          │
│                                                                              │
│  config-model.mjs   ordered-entry parser/serializer (comment-preserving)     │
│  schema.mjs         parse `+show-config --default --docs` → typed schema     │
│  lint.mjs           tmp file → `+validate-config` → parsed diagnostics       │
│  history.mjs        git snapshots in state dir (undo/redo/timeline)          │
│  profiles.mjs       named config files + metadata                            │
│  ghostty.mjs        locate binary, run +actions, capability probe            │
└──────┬──────────────────────┬──────────────────────────┬────────────────────┘
       │ read/write (atomic)  │ shell out                │ read-only
┌──────┴───────────┐  ┌───────┴────────────┐  ┌──────────┴──────────────┐
│ Live config file │  │ Ghostty CLI        │  │ Theme dirs              │
│ ~/Library/App…/  │  │ /Applications/…/   │  │ app Resources (463) +   │
│ com.mitchellh.   │  │ ghostty +…         │  │ ~/.config/ghostty/themes│
│ ghostty/config   │  └────────────────────┘  └─────────────────────────┘
└──────────────────┘
```

Why a local server and not a static page or a desktop shell: the app must read/write
the config file and shell out to the ghostty binary. A hosted page (zerebos) can do
neither; the browser File System Access API is Chrome-only and still can't spawn
processes; Tauri/Electron add a build toolchain for zero extra capability here. A
single Node process serving static files plus a small JSON API is the smallest thing
that can do the whole job, and it fits the existing pm2 tooling on this machine.

No build step, matching V1's ethos: vanilla JS modules for the UI. The raw editor
starts as a `<textarea>` with a diagnostics panel; upgrading to a vendored CodeMirror 6
bundle is an optional later polish, not a dependency of anything.

Stack: Node 20+ (already installed), zero runtime npm dependencies for the server
(node:http, node:fs, node:child_process). Port: 62xx while it's a one-off dev tool,
promote to pm2 + 51xx when it becomes a kept tool (per the machine's dev-server port
policy).

### Server threat model (added after skeptical review, S1 finding)

A Ghostty config is not inert data: it can set `command`, `initial-command`, and
`config-file` includes that execute on the next terminal launch. So "a local HTTP
server that writes the config" is a code-execution surface, and "it's only
localhost" is not a defense — any local process can reach localhost, and a hostile
web page can try CSRF/DNS-rebinding against it. Mandatory from M0, not bolted on
later:

- Bind `127.0.0.1` explicitly (never `0.0.0.0`).
- Mint a random per-launch token; the server prints the tokened URL at startup and
  rejects any state-changing request without it (header check).
- Check `Origin`/`Host` on every request; reject anything that isn't the app's own
  origin. No CORS headers, ever.
- GET endpoints never mutate (also house convention for dashboard tools).

## 3. Core design decisions

### 3.1 The data model is an ordered entry list, never a map

The config format is line-oriented with repeatable keys (`palette` ×16, `keybind`,
`font-feature`, `font-codepoint-map`, `env`, `font-family` all append rather than
override) (V), and the user's real config carries hand-written comments that encode
decisions (V). Both facts kill the naive "parse into an object" approach.

Model: `Entry[] = { kind: comment | blank | pair, raw, key?, value? }`, in file order.
Rules that make editing safe:

- Untouched entries serialize as their original `raw` bytes. The round-trip invariant
  `serialize(parse(f)) === f` is property-tested against the real config and all 463
  bundled theme files as a corpus.
- Editing a value rewrites only that entry's line. Adding appends near related keys
  (same key adjacency) or at the end. Deleting removes the line. No reordering, ever.
- Ghostty's own serializer (`+show-config`) is never used to write the user file; its
  help text explicitly says comments and formatting are not preserved (V).

### 3.2 The schema comes from the installed binary, not a hand-maintained list

`+show-config --default --docs` yields every key, its default, and its documentation
(V). Parse that once at startup into `{ key, default, docText, type, enumValues }`,
cached keyed by `+version` output, so a Ghostty upgrade transparently refreshes the
schema. Prior art hand-rolls option lists (GhosttyConfigGUI) and drifts; here the schema
*source* cannot drift (regenerated from the installed binary), while the
interpretation layer (type heuristics, overrides map) still can — its failure mode is
the text-input fallback below, not wrong data.

Type inference for widgets: booleans from `true/false` defaults, numbers from numeric
defaults, colors from `#hex` defaults or color-named keys, enums from doc-text value
lists, list-keys from the known append-semantics set. A small hand-curated overrides
map corrects the top ~50 keys where heuristics guess wrong; every unknown type falls
back to a raw text input, so a wrong guess degrades to "plain but functional", never
"broken".

### 3.3 Linting is outsourced to the real validator

On every edit (debounced): write candidate to a temp file, run
`+validate-config --config-file=<tmp>`, parse two diagnostic shapes (V):

- `path:line:key: message` → line-anchored gutter/panel entries
- free-text theme-resolution errors ("theme X not found, tried path …") → file-level
  diagnostics; note one missing theme emits one line per tried lookup path (two on a
  standard install, verified), so de-dup by theme name, not by output line

The app can never disagree with Ghostty about validity, because the exact binary that
will consume the config is the linter. Saving with errors is allowed but requires an
explicit "save anyway" (Ghostty itself tolerates bad lines at runtime by ignoring
them (V-docs), so this is a warning gate, not a hard gate).

### 3.4 History is a git repo in the app state dir

State dir: `~/.config/ghostty-manager/` with `history/` as a git repo holding a copy
of the live config (plus profile files). Every save: copy in, commit with a generated
message ("set font-size 13 → 14"). Undo/redo walks the commit chain and writes the
selected version back through the same validate + atomic-write path.

Two extra rules make this robust:

- Before any app-initiated save, if the live file's mtime/hash differs from the last
  known state, snapshot the on-disk version first as an "external edit" commit. Hand
  edits (which this user demonstrably makes) are captured, never clobbered.
- The app also watches the file while open (fs.watch) and shows a "changed on disk,
  reload?" banner instead of silently diverging. Two macOS caveats (from review):
  fs.watch on a single file loses the inode when the app's own atomic rename replaces
  it, so re-arm the watch after every save; and suppress self-writes so the app's own
  saves don't trip the banner. The mtime/hash check above is the real safety net; the
  watch is best-effort UX.

Git gives diffs, timestamps, and forensic history for free, and the timeline UI is
just `git log` + `git diff` rendered nicely.

### 3.5 Profiles are complete config files

A profile is a full config file plus metadata (name, description, created), stored in
the state dir. Activating one: validate it, snapshot the current live config, write
the profile content to the live path atomically, prompt for reload. "Save current as
profile" and "duplicate profile" cover creation.

Rejected alternative: layered profiles (base + theme + override fragments) via the
`config-file` include directive. More elegant on paper, but include-order semantics
have sharp edges (keys after an include don't retroactively override it; themes load
first regardless of position (V-docs)), and debugging "why is this value set" through
layers is exactly the confusion a config GUI should remove. Complete files are dumb,
predictable, and diffable. The UI can still *display* a profile as "theme X + N
overrides" by parsing it, which is how real configs are structured anyway (the user's
own config is `theme = Solarized Osaka Night` plus a full override block) (V).

### 3.6 Reload UX is honest, with an adaptive upgrade path

After save/activate, show: "Saved. Press ⌘⇧, in Ghostty to apply." The keybind hint is
read live from `+list-keybinds` so rebinds are respected (V). Honesty caveat: some
options only apply to newly created surfaces/windows even after a reload (per-option
in the docs dump), so where the schema's doc text indicates it, the banner should say
"applies to new windows" instead of implying a live change.

At startup, probe AppleScript capability (`count terminals` — read-only, instant): if a
future Ghostty version populates the scripting object graph, a "Save & Apply" button
lights up and drives `perform action "reload_config"`; on 1.3.1 it stays hidden. The
probe result is also surfaced on the settings page so it's obvious why the button is
or isn't there. No System Events keystroke injection (fragile, needs accessibility
permission, steals focus) unless explicitly opted into later.

## 4. What V1 contributes

- The theme preview components (code/error/success/mixed panes) and the browsing UX
  port directly into V2's theme picker.
- The `data/themes.json` pipeline stays for the hosted/static version of the browser,
  but the local app reads themes live from the installed bundle + user dir instead, so
  it can never drift from what the user's Ghostty actually ships (463 here) (V).
- Preview fidelity improves in V2: the preview merges theme colors with the config's
  later overrides using Ghostty's real precedence rule (theme first, later keys win)
  (V-docs+local), which V1 cannot know about.

## 5. Build phases

Each phase lands runnable and verified before the next starts.

| Phase | Deliverable | Acceptance check |
|---|---|---|
| M0 | Server skeleton, serves UI, reads + displays live config with correct path resolution (XDG vs Application Support) | Open localhost page, see the real config rendered |
| M1 | Parser/serializer + round-trip property tests | `serialize(parse(f)) === f` byte-identical for the real config + all 463 theme files |
| M2 | Lint integration + raw editor view | The 3-error test config from ground-truth research shows 3 correctly-anchored diagnostics |
| M3 | Schema extraction + form view (categories, search, typed widgets incl. palette/keybind list editors) | Change font-size in the form; file diff shows exactly one changed line, comments intact |
| M4 | History: git snapshots, timeline with diffs, undo/redo | 5 edits, walk back 3, forward 1; every state byte-exact; external hand-edit captured as its own commit |
| M5 | Profiles: save-as, activate, duplicate, delete | Two profiles round-trip through activation with comments preserved; reload hint shows the real keybind |
| M6 | Theme browser integration (V1 embed), preview-with-overrides, dark/light UI toggle, polish | Picking a theme updates preview with the config's overrides applied on top |

Effort estimate, Claude-assisted: M0–M2 about one focused day; M3 is the largest (1–2
days, schema heuristics + widgets); M4 and M5 half a day each; M6 one day. Roughly
4–5 focused days end to end, with usable value from M2 onward.

### Build log

- **M0 + M1** shipped 2026-07-11 (main): server/viewer with the §2 threat model
  active, config model with byte-identical round-trip over the live config + all
  463 bundled themes.
- **M2** shipped 2026-07-11 (branch v2/milestones): lint module, POST /api/lint,
  editor with debounced diagnostics. Adversarial validation verdict ISSUES-FOUND,
  both majors fixed same-day (spawn-failure honesty; diagnostic-key spoof-proofing
  by cross-checking reported keys against the submitted text). Report:
  `.claude/output/20260711-m2-validation/report.md`. Deferred with eyes open:
  `spawnSync` serializes the event loop (~10–50 ms per lint) — acceptable
  single-user; revisit before M4 adds synchronous git work to the same path. Two
  verified 1.3.1 quirks now encoded in lint.mjs: reported paths are
  symlink-resolved, and a 0-byte config file exits 1 with no output.
- **M3** shipped 2026-07-11 (v2/milestones): binary-derived schema (200 options),
  form view with typed widgets, single-key write path through the full safety
  chain. Quirk #3 discovered and handled: a config containing `theme =` gets
  location-less validation errors, so anchors are recovered from the submitted
  text (unambiguously or not at all). Adversarial gate verdict ISSUES-FOUND
  (2 blockers, 3 majors) — all fixed same-day: CRLF configs edit in place,
  anchor recovery is evidence-based, values are single-line enforced at API and
  library layers, enum-beats-color inference plus a hex-only swatch guard, and
  writeConfig returns structured failures with namespaced, rotated backups
  (50 kept). Report: `.claude/output/20260711-m3-validation/report.md`. Known
  minor: comments interleaved inside a list block move below it on list apply.
- **M4** shipped 2026-07-12 (v2/milestones): per-target git history with timeline
  UI, restore-as-append, external-edit capture (write-time + stat-poll). Gate
  verdict ISSUES-FOUND (2 blockers: cross-process lost updates with ok:true;
  hand-edit TOCTOU) — fixed by moving read-modify-write inside a cross-process
  mkdir-lock (`applyChange`, now the single write primitive) and re-capturing
  external state immediately before the rename; diff endpoint now 400s cleanly.
  Residual accepted: a hand edit landing in the microseconds between the final
  capture and rename is overwritten on disk (recoverable only if seen by a
  prior capture); history growth is unbounded by design ("kept forever",
  1.4 MB / 200 writes measured). Report:
  `.claude/output/20260712-m4-validation/report.md`.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Schema type-inference guesses wrong for some keys | Curated overrides map; unknown types degrade to text input; validator still catches bad values |
| Comment/entry association ambiguity when editing | Never reorder; edit lines in place; property tests on real files |
| Ghostty upgrade changes options or CLI output shape | Schema regenerated from binary per version; lint output parsing covered by a smoke test run at startup; CLI surface has been additive-only historically |
| User hand-edits while app is open | fs.watch banner + external-edit snapshots (3.4) |
| Quoting/escape edge cases in values (keybind text actions, Zig string escapes) | Preserve raw value strings verbatim unless that specific field is edited via a typed widget; raw view always available |
| AppleScript reload stays broken upstream | It's an enhancement flag, not a dependency; core UX never relies on it |
| Corrupting the live config | Atomic write: tmp file created in the SAME directory as the target then rename (rename is only atomic within one filesystem; a /tmp-to-Application-Support rename silently degrades to copy), validate-before-write, git snapshot before every write, read-back verification after |
| Hostile writes via the localhost server | Threat model in §2: 127.0.0.1 bind, per-launch token on all mutations, Origin/Host checks, no CORS |

## 7. Out of scope for V2

- Live control of running terminals (no IPC surface exists on macOS; confirmed dead end)
- Cloud sync, config sharing URLs (zerebos already does sharing well)
- Linux/Windows support (path + binary-location abstraction kept clean, but untested)
- A keybind-editor IDE beyond simple list editing (zerebos has a good one; revisit later)
- True terminal emulation in the preview (approximation only; spectre's WASM-libghostty
  approach is noted as a future option)

## 8. Open questions (non-blocking)

1. Should activation of a profile also manage `~/.config/ghostty/themes/` custom theme
   files referenced by that profile? (Lean yes, later phase.)
2. Is a menu-bar helper (tiny Swift wrapper or BitBar/xbar script) worth it purely as a
   "reload Ghostty" affordance until upstream fixes scripting? (Post-M6 nicety.)
3. Does the app eventually swallow V1's hosted use case entirely, or does the static
   browser remain published separately? (Keep both until V2 is real.)
