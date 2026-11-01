// Help written for people, for the settings people reach for and for the ones
// whose Ghostty documentation has no line of its own. A setting not listed here
// shows the first sentence of Ghostty's documentation. Each line should tell the
// reader something the label does not.

const sameFor = (what) => `The same as the main setting, for ${what} text.`;

export const HELP = {
  // Colors and cursor
  theme: "A named color scheme. It can also be a light and dark pair that follows the system.",
  background: "The color behind the text.",
  foreground: "The color of ordinary text.",
  "cursor-style": "The cursor's shape. Programs such as editors can change it while they run.",
  "cursor-style-blink": "Whether the cursor blinks. Left unset it blinks, and programs can still turn that off.",
  "cursor-color": "The cursor's color, as a hex value or a color name.",
  "cursor-opacity": "How solid the cursor is. A very low value makes it hard to find.",
  "cursor-text": "The color of the character under a block cursor.",
  "cursor-click-to-move": "Click inside a prompt to move the cursor there. Needs shell integration or a shell that supports it.",
  "selection-foreground": "The color of selected text. Left unset, selecting swaps the text and background colors.",
  "selection-background": "The color behind selected text. Left unset, selecting swaps the text and background colors.",
  "selection-clear-on-typing": "Drop the selection as soon as you start typing.",
  "selection-clear-on-copy": "Drop the selection after a copy keybind. Copy on select does not trigger this.",
  "selection-word-chars": "The characters that end a word when you double-click to select one.",
  "minimum-contrast": "Ghostty shifts text colors to keep at least this contrast with the background. 1 means no change, 21 is the most.",
  palette: "The numbered colors programs pick from: 16 basic ones, then an extended range up to 255.",
  "palette-generate": "Work out colors 16 to 255 from your 16 basic colors, so they match your scheme.",
  "palette-harmonious": "Reverse the generated colors so programs suit both light and dark mode. Some older programs expect the normal order.",
  "bold-color": "A specific color for bold text, instead of the terminal's usual bold color.",
  "faint-opacity": "How solid faint text is. Programs use faint text to de-emphasize things, and 1 makes it look ordinary.",
  "search-foreground": "The text color of search matches.",
  "search-background": "The highlight behind search matches.",
  "search-selected-foreground": "The text color of the search match you are on.",
  "search-selected-background": "The highlight behind the search match you are on.",

  // Window surface
  "window-padding-balance": "Where the spare space goes when a window is not an exact number of character cells. False leaves it at the bottom and right.",
  "window-padding-x": "Space between the text and the left and right window edges. Two numbers set each side.",
  "window-padding-y": "Space between the text and the top and bottom window edges. Two numbers set each side.",
  "window-padding-color": "What fills the padding: the background color, or the color of the nearest cell.",
  "background-opacity": "How solid the window background is. 1 is solid, and lower lets what is behind show through.",
  "background-opacity-cells": "Also apply background opacity to text with its own background color, such as an editor's.",
  "background-blur": "Blur what is behind the window when the background is see-through.",
  "background-image": "A picture to show behind the text, given as a file path.",
  "background-image-opacity": "How strongly the background picture shows.",
  "background-image-position": "Where the background picture sits in the window.",
  "background-image-fit": "How the background picture is scaled to the window.",
  "background-image-repeat": "Tile the background picture across the window.",
  "unfocused-split-opacity": "How much to fade the splits you are not using. 1 turns the fading off.",
  "unfocused-split-fill": "The color used to dim the splits you are not using. It defaults to the background color.",
  "split-divider-color": "The color of the line between splits.",

  // Fonts
  "font-family": "The font for terminal text. Fonts after the first are fallbacks for characters it lacks.",
  "font-family-bold": "The font for bold text. Left unset, the main font's bold style is used.",
  "font-family-italic": "The font for italic text. Left unset, the main font's italic style is used.",
  "font-family-bold-italic": "The font for bold italic text. Left unset, the main font's bold italic style is used.",
  "font-size": "Text size in points. Half sizes such as 13.5 work.",
  "font-style": "Which named style of the font to use for normal text, such as Heavy.",
  "font-style-bold": sameFor("bold"),
  "font-style-italic": sameFor("italic"),
  "font-style-bold-italic": sameFor("bold italic"),
  "font-synthetic-style": "Let Ghostty fake bold and italic when the font has no such style.",
  "font-feature": "Turn font features on or off, such as calt and liga for ligatures. A leading minus turns one off.",
  "font-variation": "Set an axis of a variable font, such as weight with wght=600.",
  "font-variation-bold": sameFor("bold"),
  "font-variation-italic": sameFor("italic"),
  "font-variation-bold-italic": sameFor("bold italic"),
  "font-codepoint-map": "Draw a range of Unicode characters with a specific font, often an icon font.",
  "font-thicken": "Draw text with a heavier stroke. macOS only.",
  "font-thicken-strength": "How heavy the stroke is when thickening is on.",
  "adjust-cell-width": "Widen or narrow every character cell, in pixels or percent. 1 adds a pixel, and 20% adds a fifth.",
  "adjust-cell-height": "Make every character cell taller or shorter, in pixels or percent. 1 adds a pixel, and 20% adds a fifth.",

  // Windows and tabs
  title: "A fixed title for every window. Left unset, programs set their own.",
  "window-width": "Starting window width in character cells. It needs a height too, or it is ignored.",
  "window-height": "Starting window height in character cells. It needs a width too, or it is ignored.",
  "window-position-x": "Starting distance from the left of the primary monitor, in pixels. It needs the vertical position too.",
  "window-position-y": "Starting distance from the top of the primary monitor, in pixels. It needs the horizontal position too.",
  "window-decoration": "Whether windows have a titlebar and borders. The system may override this preference.",
  "window-theme": "Light or dark for the window around the terminal. Auto follows your background color.",
  "window-colorspace": "How colors are interpreted. Display P3 gives richer colors on wide-gamut screens. macOS only.",
  "window-save-state": "Whether windows, tabs and splits come back after you quit and reopen Ghostty.",
  "window-new-tab-position": "Open new tabs next to the current tab, or at the end of the bar.",
  "window-show-tab-bar": "Show the tab bar always, never, or only with two or more tabs.",
  "confirm-close-surface": "Ask before closing a terminal with something still running. Setting always asks every time.",

  // Notifications
  "notify-on-command-finish": "Tell you when a command ends: never, only when its terminal is not focused, or always. Needs shell integration.",
  "notify-on-command-finish-action": "How you are told a command finished: the bell, a system notification, or both.",
  "notify-on-command-finish-after": "A command must run at least this long before you are told it finished, such as 5s.",
  "bell-features": "What happens when a program rings the bell: a system alert, a sound, a request for attention, a title mark or a border.",
  "bell-audio-path": "The sound file to play for the bell when audio is on.",

  // Scrolling and mouse
  "scroll-to-bottom": "When to jump back to the newest output, such as on a keypress.",
  "scrollback-limit-bytes": "How much scrollback to keep, in bytes. The oldest lines go first when it fills up.",
  scrollbar: "When the scrollbar appears: follow the system setting, or never.",
  "mouse-shift-capture": "Whether programs see Shift during a mouse click. Off keeps Shift for extending your selection.",
  "mouse-reporting": "Let programs such as editors receive mouse clicks and scrolling.",
  "mouse-scroll-multiplier": "How far one scroll moves, set separately for trackpads (precision) and mouse wheels (discrete).",
  "link-url": "Make URLs in the terminal clickable.",
  "link-osc8": "Allow clickable links that programs print with their own target.",
  "link-previews": "Show where a link goes when you point at it.",
  "focus-follows-mouse": "Focus whichever split the mouse is over, within the active window.",

  // Clipboard
  "clipboard-read": "Whether programs in the terminal can read your clipboard. Ask prompts you each time.",
  "clipboard-write": "Whether programs in the terminal can change your clipboard.",
  "clipboard-paste-protection": "Ask before pasting text that could run commands, such as text with line breaks.",
  "copy-on-select": "Copy text as soon as you select it, without pressing a key.",

  // Shell
  command: "The program each terminal runs, usually your shell. Left unset, Ghostty looks up your login shell.",
  "initial-command": "Like Command, for only the first terminal after Ghostty starts.",
  env: "Extra environment variables for commands run in a terminal.",
  input: "Text to send to the command when it starts.",
  "shell-integration": "Adds prompt jumping, working directory tracking and more to your shell. Detect works out which shell you use.",
  "shell-integration-features": "Which shell integration extras are on, such as the cursor shape at the prompt and window titles.",

  // Keys
  keybind: "Keyboard shortcuts, one per line, written as trigger=action.",
  "command-palette-entry": "Extra commands to list in the command palette.",

  // Quick terminal
  "quick-terminal-position": "The screen edge the drop-down terminal slides in from.",
  "quick-terminal-screen": "Which monitor the drop-down terminal appears on.",
  "quick-terminal-autohide": "Hide the drop-down terminal when you click away. Off leaves it open.",

  // macOS
  "macos-option-as-alt": "Make Option act as Alt in terminal programs, instead of typing special characters such as ∫.",
  "macos-titlebar-style": "How the titlebar looks: native, transparent, combined with the tabs, or hidden.",
  "macos-icon": "The icon in the dock and app switcher.",
  "macos-non-native-fullscreen": "Go fullscreen instantly, without the macOS animation. Tabs stop working in this mode.",
  "macos-hidden": "Hide Ghostty from the dock and app switcher, mainly for quick terminal users.",

  // Advanced
  "image-storage-limit": "The total bytes programs may use for images in the terminal.",
  "config-file": "Extra config files to read. A ? before the path means a missing file is not an error.",
  term: "The value of the TERM environment variable. Change it if a remote machine does not recognize Ghostty.",
  "auto-update": "Whether Ghostty checks for updates, downloads them, or does neither.",
  "auto-update-channel": "Which releases to follow: stable, or tip for pre-releases.",
};
