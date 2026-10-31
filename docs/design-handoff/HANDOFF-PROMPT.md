<!-- sessions: ghost-v2v3-a3@2026-07-13 · paste this file (with the folder) into claude design -->

# Design brief: Ghostty Config Manager

## What this is

A local single-user web app for customizing the Ghostty terminal: pick themes
with a live preview, tweak fonts/padding/cursor, lint and edit the raw config,
browse full edit history with restore, and switch named profiles. It is
functionally complete and battle-tested; what it needs from you is a design
elevation — it currently reads "engineer-built dashboard" and it should read
"polished native-feeling terminal companion".

## Goals (ranked)

1. **A distinctive, cohesive visual identity** rooted in terminal aesthetics —
   monospace-first, Tokyo-Night-tinted dark as the hero (this tint is
   deliberate identity, do not neutralize), with an equally considered light
   mode. It should feel like it belongs next to Ghostty itself.
2. **Make the core flow sing:** theme try-on (browse → preview → apply). The
   dual preview (Preview vs Current-on-disk) is the heart of the app — make the
   comparison instant to parse and make pending/uncommitted state impossible to
   miss without being loud.
3. **Clear surface contracts:** Customize stages until Apply; All-settings
   applies per field; Edit saves explicitly. Today nothing visually
   distinguishes these three contracts — design a language that does
   (chrome, color, affordance — your call).
4. **Design the neglected corners:** empty states (first run, no profiles,
   empty history), the native-title tooltips (key = value on every preview
   element — deserve a real affordance), history diff presentation, and the
   dead space in tall viewports.
5. Keep density: this is a developer tool; airy marketing spacing would be a
   regression. Terminal-density lists and grids are a feature.

## Hard constraints (breaking these fails the handoff)

- Single static HTML page, vanilla JS, zero build step, zero runtime CDN
  dependencies. All styling via CSS custom properties (token table in
  `UI-UX-NOTES.md` § Visual system); both dark and light must work.
- The UX safety contract in `UI-UX-NOTES.md` § "load-bearing UX contract" is
  law — especially: preview/browse interactions never write; explicit Apply
  commits; dirty state stays visually distinct; honest labels about what will
  happen after Apply (override masking).
- All text content shown in previews/diagnostics/history is real data from the
  user's config — don't design layouts that assume short strings.

## Context you should know

- Users: exactly one person at a time, a developer, on macOS, in a browser next
  to their terminal. Keyboard comfort expected; mouse not required for the main
  flow ideally (today it mostly is — improving that is welcome).
- The 463-theme list, font list, schema, and all validation come live from the
  installed Ghostty binary — content scales with upstream, never hardcoded.
- Full UI/UX inventory, flows, tokens, and an honest warts list:
  **`UI-UX-NOTES.md`** (same folder). Read it before designing.

## Reference screenshots (same folder, `screenshots/`)

| File | Shows |
|---|---|
| `01-customize-default-dark.png` | Landing view, clean state: theme list, dual previews, knobs |
| `02-customize-pending-dark.png` | THE key state: Nord staged (dashed marker), amber apply bar "8 changes … nothing written yet", override-clear checkbox ticked, white input wells |
| `03-customize-pending-light.png` | Same pending state in light chrome (terminal panes stay dark by content) |
| `04-viewer-dark.png` | Read-only config render: dimmed comments, colored keys/values, inline hex swatches |
| `05-editor-lint-dark.png` | Raw editor with 3 live diagnostics (2 line-anchored, 1 file-level) + Save |
| `06-allsettings-search-dark.png` | Schema form filtered to "cursor" (14 settings), typed widgets, modified-row markers |
| `07-history-diff-dark.png` | Timeline with app/external badges and an expanded colored diff |
| `08-profiles-dark.png` | Profile cards with active badge and actions |

## Deliverables wanted

1. A revised visual system (tokens, type scale, spacing, component treatments)
   expressed as drop-in CSS custom properties + component styles.
2. Redesigned Customize view (the landing) honoring goals 2–3.
3. Treatments for the neglected corners (goal 4): empty states, tooltip
   affordance, diff presentation.
4. Anything you change, show in both dark and light.

Where a goal conflicts with a constraint, the constraint wins; where two goals
conflict, ask rather than assume.
