// Every keyboard shortcut in one table. Each button's tooltip is built from this
// table, and the key handler matches against it, so a tooltip cannot promise a
// shortcut that does not exist. Option-based shortcuts match on the physical key
// because Option changes the character a Mac types.

const cmd = (e) => e.metaKey || e.ctrlKey;
const opt = (code) => (e) => e.altKey && !e.metaKey && !e.ctrlKey && e.code === code;

export const KEYS = {
  apply: { glyph: "⌘↵", match: (e) => cmd(e) && e.key === "Enter" },
  discard: { glyph: "Esc", match: (e) => e.key === "Escape" },
  search: { glyph: "/", match: (e) => e.key === "/" && !cmd(e) && !e.altKey },
  tabSettings: { glyph: "⌥1", match: opt("Digit1") },
  tabRaw: { glyph: "⌥2", match: opt("Digit2") },
  tabHistory: { glyph: "⌥3", match: opt("Digit3") },
  tabProfiles: { glyph: "⌥4", match: opt("Digit4") },
  filterModified: { glyph: "⌥M", match: opt("KeyM") },
  filterPending: { glyph: "⌥P", match: opt("KeyP") },
  variant: { glyph: "⌥V", match: opt("KeyV") },
  appearance: { glyph: "⌥T", match: opt("KeyT") },
  resetRow: { glyph: "⌥R", match: opt("KeyR") },
  history: { glyph: "⌥H", match: opt("KeyH") },
  undo: { glyph: "⌘Z", match: (e) => cmd(e) && !e.shiftKey && e.key.toLowerCase() === "z" },
  copy: { glyph: "⌘⇧C", match: (e) => cmd(e) && e.shiftKey && e.key.toLowerCase() === "c" },
  save: { glyph: "⌘S", match: (e) => cmd(e) && !e.shiftKey && e.key.toLowerCase() === "s" },
  // Native keys on a focused control. They are real, just not ours to bind.
  press: { glyph: "⏎", match: () => false },
  toggle: { glyph: "␣", match: () => false },
  arrows: { glyph: "← →", match: () => false },
  stepUp: { glyph: "↑", match: () => false },
  stepDown: { glyph: "↓", match: () => false },
};

// A held key repeats keydown. For anything that writes or discards, only the
// first press counts.
const ONCE_PER_PRESS = ["apply", "save", "undo", "copy", "history", "discard"];
export const shouldIgnoreRepeat = (e) => !!e.repeat && ONCE_PER_PRESS.some((id) => KEYS[id].match(e));

// "Apply 3 changes  ⌘↵": the text of a tooltip.
export const tip = (label, id) => `${label}  ${KEYS[id].glyph}`;

// Does this tooltip end in one of the table's glyphs?
export function tipHasShortcut(text) {
  return Object.values(KEYS).some((k) => String(text ?? "").trim().endsWith(k.glyph));
}

export const isTyping = (el) =>
  !!el && (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && !["checkbox", "radio", "button"].includes(el.type)) || el.isContentEditable);
