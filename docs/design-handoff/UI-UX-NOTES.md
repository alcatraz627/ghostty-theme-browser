<!-- sessions: ghost-v2v3-a3@2026-07-13 -->

# Ghostty Config Manager — UI/UX/flow notes (design handoff)

A local, single-user web app that safely edits the real Ghostty terminal config
(`~/Library/Application Support/com.mitchellh.ghostty/config`). One static HTML
page (vanilla JS, no build step) served by a zero-dependency Node server that
shells out to the installed `ghostty` binary for validation, schema, themes, and
fonts. All state-changing operations go through a locked, validated, atomic,
history-snapshotted write chain.

## Information architecture

Six views behind a segmented control in the header, in order:

| View | Purpose | Mutates config? |
|---|---|---|
| **Customize** (landing) | Theme picking + curated knobs with live dual preview | Only via explicit Apply |
| **View** | Read-only syntax-highlighted render of the config file | Never |
| **Edit** | Raw text editor with live lint diagnostics | Only via explicit Save (validation-gated, "save anyway" confirm) |
| **All settings** | Schema-driven form over all 200 options, categorized + searchable | Immediately per field (deliberate: it's an editing surface) |
| **History** | Timeline of every config state; diffs; restore | Restore appends via the write chain |
| **Profiles** | Named complete-config snapshots; save-as/activate/duplicate/delete | Activate goes through the write chain |

Header also carries: app title, Ghostty version badge (read live from the
binary), Light/Dark chrome toggle (persisted in localStorage). Below the header:
the live config path (dimmed, not a link) and a global banner slot (save
confirmations with the user's real reload keybind, errors, changed-on-disk
notices).

## The load-bearing UX contract (do not break)

1. **Preview never writes.** In Customize, clicking a theme or changing a knob
   only stages into a client-side pending set. This was a hard-won user
   correction (the first version instant-applied and the user was rightly
   furious). Any redesign must keep selection ≠ commitment.
2. **Explicit Apply commits the whole batch** as ONE write and ONE history
   entry; Discard drops it untouched. The apply bar states plainly: "Previewing
   N changes (…) — nothing written yet."
3. **Honest labels.** The preview panel renders the selected theme's own colors;
   the Current panel renders the on-disk truth. When the user's config carries
   explicit color overrides that would mask a theme after Apply, an amber
   callout says so and offers "also clear these overrides on Apply".
4. **Dirty state is amber** (`--value` token), everywhere: apply bar + override
   callout. Accent blue means active/interactive only.
5. **Reload honesty:** after any write the banner says "Press <real keybind> in
   Ghostty to apply" — the keybind is read live from the binary (rebind-aware).
   Ghostty on macOS cannot be reloaded externally (verified; AppleScript object
   graph is empty on 1.3.1).

## Flows

### Theme try-on (primary flow)
Search/scroll list (463 themes from the binary, `custom` tag for user themes) →
click → dashed accent marker on the row + preview panel re-renders with that
theme's palette → optionally tick "clear overrides" (apply bar count grows) →
Apply → banner with reload keybind; both panels converge; pending clears.
Escape hatch at every step: Discard.

### Knob tweak
Six curated knobs under the previews: font-family (datalist of families the
ghostty binary itself can load; multi-font fallback chains render as a
non-editable pointer to All settings so a chain can't be collapsed), font-size,
window-padding-x/y, background-opacity, cursor-style (select incl. "(default)"
to unset). Changes stage like theme picks; preview reflects them (font, size,
padding, opacity, cursor glyph in the fake prompt).

### Lint loop (Edit view)
Type → debounced 400ms → POST to a temp-file validation against the real binary
→ status line ("✓ Valid config" green / "✕ N problems" red) + diagnostic cards:
line-anchored (`line N · key · message`, click jumps the editor caret and
selects the line) and file-level (theme resolution etc). Save button validates
first; a failing config offers an explicit "Ghostty ignores bad lines — save
anyway?" confirm.

### History / undo
Every save and detected hand-edit is a snapshot card: relative time, source
badge (`app` neutral / `external` amber), message, expandable colored diff,
Restore button (absent on the newest). Restores append rather than rewind —
stated in the view's own hint line. A 5s stat poll detects hand edits and
refreshes views with a banner.

### Profiles
Text field + "Save current as profile"; cards show name, relative time, size,
green `active` badge (content-identical detection — byte-identical duplicates
all show active), activate/duplicate/delete. Overwrites require an explicit
confirm; delete confirms and notes the content stays in history.

## Visual system (current tokens)

Defined as CSS custom properties on `:root` with a `[data-theme="light"]`
override set; components must use tokens only.

| Token | Dark | Light | Role |
|---|---|---|---|
| `--bg` | `#16161e` | `#f4f4f6` | page |
| `--surface` | `#1e1e2a` | `#ffffff` | cards, header, list |
| `--surface-2` | `#262637` | `#ececf1` | (reserved, barely used) |
| `--text` | `#c8ccd8` | `#2a2d3a` | body text |
| `--dim` | `#7a7f92` | `#6b7085` | secondary text, labels |
| `--border` | `#2c2f3e` | `#d9dbe3` | all hairlines |
| `--accent` | `#7aa2f7` | `#2f5fd0` | active tab, Apply, selection markers |
| `--key` | `#9ece6a` | `#4d7a1e` | config keys, success, active badge |
| `--value` | `#e0af68` | `#a05f0a` | values, WARN/dirty state |
| `--input-bg/-text/-border` | white / near-black / grey | same | all small input fields (white wells) |
| `--radius-s/m/l` | 6/8/10px | — | controls / cards / terminal boxes |
| `--fs-xs/sm/base` | 11/12/14px | — | labels / meta / body |

Type: everything monospace (`ui-monospace, SF Mono, Menlo`). Section labels are
11px uppercase letterspaced dim — one shared rule (`.section-label, .tp-label,
.cat-title, .knob label`). Error red `#f7768e` is currently hardcoded (not a
token) in a few places — a known inconsistency.

Identity note: the dark palette is deliberately Tokyo-Night-tinted (matches the
user's actual terminal theme). A designer-review pass flagged blue-tinted darks
against convention; the tint was explicitly kept as identity. Don't neutralize
it without asking.

## Known warts / accepted gaps (honest list for the designer)

- The right column of Customize ends high on tall windows; the theme list
  scrolls much deeper (dead space bottom-right).
- Preview panels approximate a terminal (5 fixed sample lines + palette strip);
  no scrollback, no real font rasterization differences, opacity approximated
  by CSS opacity on the body.
- Tooltips are native `title` attrs (key = value per panel) — functional, ugly,
  undiscoverable; an explicit affordance would be better.
- The form view (All settings) applies per-field immediately, unlike Customize —
  a deliberate split, but visually nothing communicates the different contract.
- Byte-identical profiles all show `active`; product call open (tie-break vs
  plural badge).
- History diff is raw git-diff text, colored per line; no word-level diff.
- No favicon-level branding beyond the ghost `>_` icon; no empty states designed
  (first-run with no config, no profiles, empty history are plain text lines).
- Mobile/narrow: grids collapse at 800/1000px but nothing is truly designed for
  narrow.

## Where things live (for reference against code)

- All markup/styles/JS: `app/public/index.html` (single file, ~900 lines; CSS in
  one `<style>` block, JS in one `<script>` block).
- Icon: `app/public/favicon.svg` (ghost with `>_` prompt face).
- Server API (read as the contract): `app/server.mjs` — GET meta/config/schema/
  stat/history/history-diff/themes/theme/fonts/profiles; POST lint/config-set/
  config-apply/config-save/history-restore/profiles-*.
