<!-- sessions: ghost-v2v3-a3@2026-07-11 -->

# Scoping note — per-session "durable artifact storage"

> **STATUS: promoted to the V3 track (2026-07-11).** The fork plan is retired (see
> `V3-PLAN.md` header for why); this is what V3 now means. Next step: answer the four
> open questions at the bottom, then this note graduates into a build plan.

Original ask (verbatim, from the 2026-07-11 session, kept for scoping fidelity):

> Another thing I'd like for V3 - give each terminal session some form of a "durable
> artifact storage", ALL text/markddown files, snipptets, output bits, etc; primarily
> meant to be used i conjunction with claude. Claude does give me TUI output / md file
> links / etc, but across multiple session I need to have a lot of them open as so
> many browser tabs / Finder app folders. The goal isn't to have a durable storage
> attached to ghostty, the goal is solving my pain point as mentioned above; this is
> my idea at it. Take it, validate it, suggest improvements / alternatives.
> [...] Durable here doesn't mean TRULY durable, just something where claude output
> md files are auto-pushed + I can select text pieces from the claude code
> /tui=fullscreen and add them there as items; mainly ffor my use since claude can
> always check its transcripts and md files quickly and I have to struggle with the
> clunky mac os UI

## Validation: the pain is real, the layer is wrong

The pain point is valid and well-defined: Claude sessions emit artifacts (md reports,
HTML pages, snippets, command output) faster than macOS gives you a way to view them,
and the human-side cost is N browser tabs + M Finder windows. The asymmetry is real
too: Claude re-finds artifacts cheaply (transcripts, output dirs); you can't.

But Ghostty is the wrong layer to build it into, and by your own framing ("the goal
isn't to have a durable storage attached to ghostty") this was already half-known:

- Ghostty knows nothing about markdown, sessions-in-the-Claude-sense, or which file a
  TUI line came from. Claude Code hooks know all of it: the session id, the cwd, every
  file Write, every SendUserFile. The metadata you'd want per item lives entirely on
  the Claude side.
- A Ghostty-fork version inherits all of the V3 fork costs (Xcode toolchain, upstream
  churn, rebases) for a feature upstream would never take, while a local app + hooks
  version has zero fork surface.
- "Per terminal session" is actually a weaker grouping key than what's already
  available: `CLAUDE_CODE_SESSION_ID` + project dir gives exact, stable attribution;
  a Ghostty tab is an ephemeral container that dies with the window.

**Verdict: keep the goal, drop the Ghostty attachment. This is a third, independent
track (call it the Artifact Shelf), sibling to V2, not part of the V3 fork.** V3
stays scoped to per-tab icons.

## Recommended shape: the Artifact Shelf

One local web app, one browser tab, replacing all the tab/Finder sprawl:

```
  Claude sessions                        capture paths
┌───────────────────┐   PostToolUse/Stop hook: Write *.md|*.html
│ session A (ghostty│──── in output/report dirs, SendUserFile ────┐
│ session B  tabs)  │                                             │
└───────────────────┘                                             ▼
  You, in any tab                                      ┌─────────────────────┐
   ── cmd+c, then `shelf add` (clipboard) ────────────▶│  index.jsonl +      │
   ── ghostty keybind write_selection_file, ingest ───▶│  items/ (one file   │
   ── `shelf add <path|stdin>` from any shell ────────▶│  per item)          │
                                                       └──────────┬──────────┘
                                                                  ▼
                                              ┌──────────────────────────────┐
                                              │  Shelf UI (pm2, 51xx port)   │
                                              │  feed: session ▸ day ▸ item  │
                                              │  md rendered inline, search, │
                                              │  pin / archive, dark-light   │
                                              └──────────────────────────────┘
```

- **Auto-push:** a Claude Code hook registers every markdown/HTML artifact written to
  designated dirs (`.claude/output/`, `~/.claude/assets/reports/`, docs/ plan files)
  into a JSONL index with session id, project, timestamp, title (first heading).
  SendUserFile calls are the highest-signal capture point since those are explicitly
  "the file is the deliverable".
- **Manual capture:** `shelf add` (clipboard/stdin/path) covers "select a piece of TUI
  output and keep it". Ghostty already has a relevant verified primitive: the
  `write_selection_file` keybind action dumps the current selection to a temp file
  and can copy its path, so selection → shelf is two keystrokes without any fork.
- **Viewing:** one feed, newest first, grouped by session then day; markdown rendered
  inline (no more one-tab-per-file); full-text search; pin the keepers; everything
  else ages out visually. "Durable-ish" matches the stated need: items are files +
  one JSONL, nothing fancier.

Reuses existing machine conventions rather than inventing new ones: the
decision-pages registry (`assets/decision-pages/`, port 5197) is the direct precedent
for "small local registry app with a feed UI"; session-notes docs already have a
Doc Links section this can feed from/into; the dev-server port policy applies as-is.

## Alternatives considered

| Alternative | Read |
|---|---|
| Build into a Ghostty fork (original idea) | Rejected above: wrong layer, high maintenance, weaker metadata |
| Finder smart folders / Spotlight over output dirs | Zero build, but this IS the "clunky mac os UI" being complained about; no session grouping, no inline md rendering |
| Obsidian vault ingesting the output dirs (symlink/auto-import) | Real option: excellent md rendering + search for zero custom UI. Costs: another heavyweight app, no session-id grouping without plugin work, capture-from-terminal still needs the same CLI glue. Worth a 30-minute spike if a custom feed UI feels like too much |
| Extend the existing decision-pages server into a general registry | Attractive: shared infra, one less server. Risk: muddies a working single-purpose tool. Decide at build time; the index format can be shared either way |
| TUI browser (fzf/glow) in a dedicated Ghostty tab | Keeps everything in-terminal, but md-in-terminal rendering is exactly what's not working for you today |

## MVP cut and effort

MVP (roughly 1-2 focused days, given the decision-pages precedent): JSONL index +
`shelf` CLI (`add` from clipboard/stdin/path) + auto-register hook on Write/
SendUserFile + feed UI with inline md rendering, session/day grouping, search, pin.
Dark/light toggle from day one per house HTML rules.

Explicitly out of MVP: retention policies beyond "pin or scroll past", multi-machine
sync, non-text artifacts (images render as links first), editing items in place.

## Open questions (need your call before building)

1. Standalone app vs extending the decision-pages server?
2. Auto-ingest scope: all md writes in watched dirs, or only SendUserFile/reports
   (scratchpad noise excluded)?
3. Should shelf items feed back into session-notes Doc Links (two surfaces, one
   index), or stay a separate surface?
4. Retention: keep everything forever (it's just text), or auto-archive un-pinned
   items after N weeks?
