<!-- sessions: ghost-v2v3-a3@2026-07-11 -->

# V3 Plan — Ghostty Fork (window merging + per-tab icons)

> **STATUS: RETIRED (2026-07-11).** Kept for reference; do not build from this.
>
> Why retired:
> 1. Window merging already works in stock Ghostty (this plan's own §1 finding), so
>    the fork scope had collapsed to per-tab icons alone.
> 2. Icons-as-emoji via the tab-title composer already cover the icon need in daily
>    use; a title-independent icon slot is a nice-to-have, not fork-worthy.
> 3. The cost side got worse under review: Xcode 26 + macOS 26 SDK are required even
>    at the v1.3.1 tag (verified in the tag's HACKING.md, contradicting this plan's
>    "likely Xcode 16.x" guess), on a machine with CommandLineTools only, plus
>    twice-yearly rebases against high-churn files. Disproportionate for one small
>    feature.
> 4. The right vehicle for a small extension like this would be a plugin system, and
>    Ghostty does not offer one today. If upstream ever ships plugins/extensions,
>    revisit then; filing the upstream discussions (§7.3) remains worthwhile and free.
>
> The V3 slot is reassigned to the Artifact Shelf (see `ARTIFACT-SHELF-SCOPING.md`).
> The skeptical review of this plan (`.claude/output/20260711-1507-skeptical-review/
> review.md`) flagged additional evidence issues (main-vs-tag citation drift, one (V)
> tag on an INFERRED claim); they are moot now but bind if this is ever revived.

Fork Ghostty to add: (a) merging separate windows back into one tabbed main window,
and (b) custom icons per tab. Research re-scoped this substantially: **most of (a)
already ships in stock Ghostty**, and (b) is real but small, confined to the Swift UI
layer.

**Feasibility verdict: (a) NO FORK NEEDED for the core behavior, it works today;
(b) FEASIBLE as a scoped personal fork (MEDIUM confidence), with the cost dominated
by toolchain setup and upstream churn, not by the feature code itself.**

Research inputs: `.claude/output/20260711-1446-v2v3-research/v3-fork-arch.md`
(file:line-cited source research) and `local-ground-truth.md`. Claims marked (V) were
verified in source/issues by the research pass or locally on this machine.

---

## 1. Re-scoped reality check

| Wanted | Status in stock Ghostty | Evidence |
|---|---|---|
| Merge windows into one tabbed window (menu/drag) | **Already works.** Windows are native NSWindow with `tabbingMode = .preferred`, so "Window > Merge All Windows" and cross-window tab drag are free AppKit behavior | `TerminalWindow.swift:100` (V); issue #1902 shows a user doing exactly this in 2024 (V) |
| Merge via keybind / command palette | Gap. No `merge_windows` action exists in the 85-action enum (V, checked locally on 1.3.1) | `Binding.zig` action enum (V) |
| Rename tabs (incl. inline double-click, scriptable `set_tab_title`) | **Already works**, shipped in 1.3.x. `set_tab_title` present in the installed 1.3.1 (V, local) | `TabTitleEditor.swift`, PR #11373 (V) |
| Per-tab color | **Already works** (tab context menu, 10 colors) | `TerminalTabColor.swift` (V) |
| Per-tab custom icon | **Genuine gap.** No action, config key, or UI for it; nearest upstream ask is unpromoted Discussion #9437 (job-status dots, not user icons) | (V) |

### Do these two things before any fork work

1. **Merge windows, today, no code:** open two Ghostty windows, then Window menu →
   "Merge All Windows" (or drag one window onto another's tab bar). If a keyboard
   shortcut is wanted: System Settings → Keyboard → Keyboard Shortcuts → App
   Shortcuts → add "Merge All Windows" for Ghostty. macOS binds arbitrary menu items
   by name; that covers the no-mouse ask with zero code.
2. **Icons, today, no code:** tab titles are plain text and render emoji, and the
   tab-title composer already in use on this machine (`tab-title.sh`) puts status
   glyphs into titles. That IS "custom icons per tab title", zero-fork edition. What
   a fork genuinely adds over it: an icon slot that is independent of the title, so
   the icon persists while title text churns, renders as a proper leading
   glyph/SF Symbol, and is settable from the tab's context menu like tab colors.

If (1) satisfies the window-merging need, feature (a) drops out of V3 entirely, and
V3 becomes "the per-tab icon fork", which is the honest scope.

## 2. Where the changes live

```
                     what V3 touches (all Swift, macos/ only)
┌──────────────────────────────────────────────────────────────────────┐
│ macos/Sources/                                                       │
│   Features/Terminal/Window Styles/TerminalWindow.swift   ← icon      │
│   Features/Terminal/TerminalController.swift             ← merge     │
│   Features/Terminal/TerminalTabColor.swift               ← template  │
│   Helpers/TabTitleEditor.swift                           ← template  │
│   Helpers/Extensions/NSWindow+Extension.swift            ← primitive │
└──────────────────────────────────────────────────────────────────────┘
             │ consumes prebuilt GhosttyKit.xcframework
┌────────────┴─────────────────────────────────────────────────────────┐
│ src/  (Zig core)  — UNTOUCHED, except optionally:                    │
│   input/Binding.zig  +1 action variant  (merge_all_windows /         │
│   config/Config.zig  +1 config key       set_tab_icon, additive)     │
└──────────────────────────────────────────────────────────────────────┘
```

The single most important architectural fact from the research (V): window/tab chrome
is 100% Swift/AppKit in `macos/Sources/`; the Zig core supplies content, config
values, and action dispatch only. Both features are UI-layer work with a small,
additive, optional Zig footprint. Nothing touches the C ABI or the xcframework build.

### Feature (a2), bindable merge action (only if wanted after §1.1)

`move_tab`'s implementation (`TerminalController.swift:1434-1495`) already does the
remove-from-tab-group / `addTabbedWindowSafely` dance within one window (V). A
`merge_all_windows` action is the same shape iterated over `NSApp.windows` filtered
to terminal windows. Estimated diff: ~60-100 lines Swift + 1 enum line in
`Binding.zig` + action plumbing. Half a day to a day including testing multi-display
and fullscreen edge cases.

### Feature (b), per-tab icon

Build it as the sibling of `TerminalTabColor` (V, 185 lines, the direct template):

- **Phase 1, UI-only (the personal-fork MVP):** SwiftUI icon picker (curated SF
  Symbols set + recent emoji) in the tab context menu next to the color palette;
  persist alongside `tabColor` via the same restorable-state pattern
  (`TerminalWindow.swift:63-69` (V)); render as a leading view on the tab. Rendering
  options, in order of preference: the public `NSWindowTab.accessoryView` API if it
  positions acceptably, else the `TabTitleEditor`-style overlay against the private
  tab-button hierarchy (already how upstream does inline rename (V)). 1-2 days.
- **Phase 2, scriptable (optional):** `set_tab_icon:<name>` keybind action mirroring
  `set_tab_title` (PR #11373 is the exact recipe (V)), which makes it reachable from
  the command palette, App Intents, and AppleScript. Additive lines in `Binding.zig`
  plus the Swift dispatch case. +1 day.
- **Explicitly out:** OSC escape-sequence control of icons (would touch the Zig
  terminal parser and re-open the "arbitrary programs trigger UI actions" security
  argument upstream already rejected in discussion #2353). Shell-side icon setting
  keeps using emoji-in-title.

## 3. Fork strategy

**Base on the stable tag (v1.3.1), not main.** Reasons: it matches the installed
version's behavior; main currently requires Xcode 26 + macOS 26 SDK and carries a
known Zig-0.15.x/Xcode-26.4 linking bug with documented workarounds (V,
`HACKING.md`); and main moves at ~7.5 commits/day with 100+ commits into `macos/`
per 90 days (V), concentrated in exactly the files this fork edits. Rebasing onto
each stable release (~6-month cadence (V, tag history)) instead of tracking main cuts
conflict exposure by an order of magnitude, at the cost of not getting nightly
features (acceptable: the daily driver today is stable 1.3.1 anyway).

**Study the precedent first:** `tomreinert/ghostty` (vertical-tabs sidebar fork, 116
stars, pushed the day of research (V)) is the same class of change sustained as a
long-lived personal fork. Reading its history against upstream shows the real rebase
cadence and conflict pattern before committing to the same model. Cheap and directly
informative.

**Upstreaming is a separate, slower, parallel track, not the plan.** Ghostty's
process is Discussion → maintainer promotion to a `feature` issue → vouched PR;
unsolicited PRs get closed (V, `CONTRIBUTING.md`). Neither feature has an accepted
issue today; icons have an unpromoted adjacent discussion (#9437). Ghostty also has a
strict AI policy: contributions must be human-understood and AI use disclosed (V,
`AI_POLICY.md`), so an upstream PR means owning every line, not forwarding generated
code. Filing the discussions costs nothing and can run while the fork exists.

## 4. Build setup (one-time cost, the real barrier)

| Requirement | State on this machine | Cost |
|---|---|---|
| Xcode (26 for main; likely 16.x-era suffices for the v1.3.1 tag, verify against the tag's HACKING.md) | **Not installed** (CommandLineTools only, verified when `sdef` failed) | ~12 GB download + SDK/Metal components install |
| Zig 0.15.2 | Not installed | `brew install zig@0.15` (carries the linking-bug patch (V)) |
| gettext | Check `brew list gettext` | Minutes |
| Signing | None needed for personal use: ReleaseLocal builds disable library validation for ad-hoc local runs (V) | Zero |

Dev loop once set up: full `zig build run` for the first build, then Xcode
incremental Swift builds against the prebuilt GhosttyKit.xcframework for iteration
(seconds per cycle; INFERRED in research, confirm on first checkout).

## 5. Effort and maintenance estimate

| Item | Estimate |
|---|---|
| Toolchain setup + first successful build of v1.3.1 tag | 0.5-1 day (mostly downloads) |
| Read tomreinert fork's rebase history (go/no-go input) | 1-2 hours |
| Feature (b) Phase 1 (context-menu icon, persistence, rendering) | 1-2 days |
| Feature (b) Phase 2 (scriptable action) | +1 day |
| Feature (a2) merge action (only if §1.1 doesn't satisfy) | 0.5-1 day |
| Ongoing: rebase per stable release | ~0.5 day per release if staying on stables; substantially more if tracking main |

## 6. Risks

| Risk | Read |
|---|---|
| Private AppKit API (`NSTabBar`/`NSTabButton` walked by class-name string (V)) breaks in a macOS update | Shared with upstream, which uses the same primitives for shipped features; upstream fixes fast, fork inherits the fix at next rebase. Prefer public `accessoryView` where it works |
| Upstream churn in the exact files edited | Contained by stable-tag strategy; conflicts land twice a year at rebase time, not weekly |
| Toolchain volatility (Xcode/Zig version coupling) | Pin to the tag's documented versions; the tag's HACKING.md is authoritative per version |
| Fork rot (abandoning it after novelty wears off) | Scope discipline: one feature (icons), stable-base, everything else stays configuration on stock Ghostty |
| The macOS-26-era `move_tab` visual glitches noted in upstream comments (V, `TerminalController.swift:1466-1470`) affect merge behavior | Test explicitly; worst case the merge action waits for upstream's fix |

## 7. Recommendation

1. Run the §1.1 five-second checks. Window merging almost certainly falls off the
   fork scope today, and emoji-in-title may cover enough of the icon need to defer
   the fork entirely.
2. If the icon itch is real: set up the toolchain against the v1.3.1 tag, read the
   tomreinert fork's history, then build feature (b) Phase 1 as the whole of V3.
3. File the upstream discussions (merge action + user-chosen tab icons) regardless;
   they cost nothing, and a maintainer promotion would convert fork work into a
   contribution path.
4. Treat V2 (config manager) and V3 (fork) as fully independent tracks; nothing in
   V2 depends on forked behavior.
