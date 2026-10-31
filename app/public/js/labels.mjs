// Groups, readable names and search. The server decides each option's group and
// label; this module orders the groups, writes the one-line help, and answers
// "does this setting match what the person typed". Every list, diff line and
// message in the page names a setting through displayLabel, so a key is never
// shown raw where a name exists.

export const GROUP_ORDER = [
  "Appearance",
  "Fonts",
  "Window",
  "Notifications",
  "Scrolling",
  "Links and mouse",
  "Clipboard",
  "Shell",
  "Keybinds",
  "Quick terminal",
  "macOS",
  "Linux/GTK",
  "Advanced",
];

// [{name, options}] in the order a person looks for them. A group the server
// adds later sorts after the known ones, and "Other" is always last.
export function groupOptions(options) {
  const by = new Map();
  for (const o of options) {
    const name = o.category || "Other";
    if (!by.has(name)) by.set(name, []);
    by.get(name).push(o);
  }
  const rank = (name) => {
    if (name === "Other") return 1e6;
    const i = GROUP_ORDER.indexOf(name);
    return i === -1 ? 1000 : i;
  };
  return [...by.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([name, opts]) => ({ name, options: opts }));
}

function humanize(key) {
  const text = String(key).split("-").join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The one name function. The schema label wins; a key the schema does not know
// still gets words, never a bare hyphenated key.
export function displayLabel(opt, key = opt?.key) {
  return opt?.label || humanize(key ?? "");
}

// The first sentence of the option's own documentation, on one line.
export function helpText(opt, max = 170) {
  const para = String(opt?.doc ?? "").trim().split(/\n\s*\n/)[0] || "";
  const flat = para.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const m = flat.match(/^(.+?[.!?])(\s|$)/);
  const sentence = m ? m[1] : flat;
  return sentence.length > max ? sentence.slice(0, max - 1).trimEnd() + "…" : sentence;
}

// Every word the person typed must appear in the label, the key or the
// documentation. "titlebar style" and "titlebar-style" both find the macOS key.
export function matchesQuery(opt, q) {
  const words = String(q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${displayLabel(opt)} ${opt.key} ${opt.key.split("-").join(" ")} ${opt.doc ?? ""}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

// The settings that survive the search box and the two filters. modified: set
// in the file. pendingOnly: staged right now.
export function filterOptions(options, { q = "", modified = false, pendingOnly = false, diskValues = {}, pendingKeys = [] } = {}) {
  const staged = new Set(pendingKeys);
  return options.filter((o) => {
    if (modified && !(diskValues[o.key]?.length)) return false;
    if (pendingOnly && !staged.has(o.key)) return false;
    return matchesQuery(o, q);
  });
}
