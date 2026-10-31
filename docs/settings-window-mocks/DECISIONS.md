---
reader: the owner, then whoever builds the settings window
---

# Settings window mock decisions

You chose the one-scrolling-page layout with sans labels, and you asked for the diff panel to sit under the previews and always be visible. This file records those calls and your design notes so the build follows them.

## What you decided

| Call | Your answer |
|---|---|
| Layout | One scrolling page with a sticky group strip and a floating Apply |
| Type | Sans labels, with monospace for keys, values, diff and preview |
| Diff and receipt | A panel under the previews, visible without a click |
| Variant | Light or dark appearance |

## Your notes on the look

- Borders, radius, shadow and buttons must be coherent across the whole window.
- Buttons are solid only where needed and minimal otherwise.
- Buttons use icons, and sometimes only an icon.
- Every button has a tooltip that shows its keyboard shortcut.
- Hover changes the background or the border, so it is clear what is interactive.
- No unnecessary borders and no extra rows.
- Panels scroll only when their content needs it, and nothing is cut off.
- Elements do not stretch to the full width without a reason.

## How the composition answers them

The composition is drawn in `layout-d.html` and rendered in `renders/d-dark.png`, `renders/d-light.png` and `renders/d-dark-applied.png`.

1. The group strip and the scrolling list come from your chosen layout.
2. The previews move to a right rail so the diff panel can sit directly under them.
3. The floating Apply pill stays at the bottom of the list column.
4. Controls are filled shapes instead of outlines, and rows have no dividers.
5. Staged rows get a solid accent bar and a tint, and the old value shows beside the control as "was X".

## One reading to confirm

"Below the previews" fits two layouts.

- **Right rail:** the previews and the diff panel stack in a rail beside the list. This is what is drawn.
- **Top band:** the previews stay as a band across the top, and the diff panel sits between the band and the list.

The rail costs no vertical space. The band keeps the page centered but pushes every row down by the height of the diff panel.

## Sources

1. Your answers to the decision page `ghostty-settings-window-layout`, 2026-10-31: layout c, type a, diff and receipt b, variant a.
2. Your note on the layout call and your note on the diff call, quoted in the list above in short form.
