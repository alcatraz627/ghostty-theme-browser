// The sample terminal, drawn from a map of config values. It is a pure function:
// the same values, appearance and theme colors always give the same HTML, so
// one module draws both the Preview and On disk panels and a test can compare.
//
// It shows only what a sample can show truthfully (PREVIEW_KEYS). A theme picks
// its colors through themeColors; explicit keys in the values map win over the
// theme, which is the precedence Ghostty applies.

export const PREVIEW_KEYS = [
  "palette",
  "background",
  "foreground",
  "cursor-color",
  "cursor-text",
  "cursor-style",
  "selection-background",
  "selection-foreground",
  "font-family",
  "font-size",
  "window-padding-x",
  "window-padding-y",
  "background-opacity",
  "faint-opacity",
];

// A row carries the "previews live" marker for these. The theme row is on the
// list too: its colors are what the sample draws, though the key itself is not a
// color setting.
export const PREVIEW_ROW_KEYS = ["theme", ...PREVIEW_KEYS];

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

const COLOR_KEYS = ["background", "foreground", "cursor-color", "cursor-text", "selection-background", "selection-foreground"];

// What the sample falls back to when neither the config nor the schema says.
const FALLBACK = {
  background: "#282c34",
  foreground: "#ffffff",
  palette: [
    "#1d1f21", "#cc6666", "#b5bd68", "#f0c674", "#81a2be", "#b294bb", "#8abeb7", "#c5c8c6",
    "#666666", "#d54e53", "#b9ca4a", "#e7c547", "#7aa6da", "#c397d8", "#70c0b1", "#eaeaea",
  ],
};

export const lastOf = (values, key) => (values?.[key] ?? []).at(-1);

// The theme a given appearance renders. theme = light:X,dark:Y picks a side; a
// single name serves both; no theme gives "".
export function themeNameFor(values, appearance = "dark") {
  const raw = (lastOf(values, "theme") ?? "").trim();
  if (!raw) return "";
  if (!raw.includes(":")) return raw;
  const sides = {};
  for (const part of raw.split(",")) {
    const i = part.indexOf(":");
    if (i > 0) sides[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return sides[appearance] ?? sides[appearance === "dark" ? "light" : "dark"] ?? "";
}

// True when the theme names a light side and a dark side.
export function themeHasPair(values) {
  const raw = lastOf(values, "theme") ?? "";
  return /(^|,)\s*light:/.test(raw) && /(^|,)\s*dark:/.test(raw);
}

// CSS-safe colors only: hex, a plain color name, or a Ghostty cell-* keyword.
// Anything else is dropped so a stray character cannot end up inside a style.
function cssColor(raw, fallback) {
  const v = String(raw ?? "").trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(v) || /^#?[0-9a-fA-F]{3}$/.test(v)) return v.startsWith("#") ? v : "#" + v;
  if (/^[a-zA-Z]+$/.test(v)) return v;
  return fallback;
}

// theme colors first, then the explicit keys of the values map on top.
export function effectiveColors({ values, themeColors = {}, defaults = {} }) {
  const eff = { ...themeColors };
  for (const key of COLOR_KEYS) {
    const v = lastOf(values, key);
    if (v) eff[key] = v;
  }
  // Palette: theme entries arrive as palette.N, config entries as "N=#hex".
  const pal = {};
  for (let i = 0; i < 16; i++) {
    const own = eff[`palette.${i}`];
    if (own) pal[i] = own;
  }
  const fromList = (list) => {
    for (const entry of list ?? []) {
      const m = String(entry).match(/^(\d{1,3})\s*=\s*(.+)$/);
      if (m && Number(m[1]) <= 255) pal[Number(m[1])] = m[2].trim();
    }
  };
  const explicit = values?.palette ?? [];
  // The schema's default list only fills slots the theme left empty.
  const fill = {};
  for (const entry of defaults?.palette ?? []) {
    const m = String(entry).match(/^(\d{1,3})\s*=\s*(.+)$/);
    if (m) fill[Number(m[1])] = m[2].trim();
  }
  for (const [i, c] of Object.entries(fill)) if (pal[i] === undefined) pal[i] = c;
  fromList(explicit);
  return { eff, pal };
}

const num = (v, d) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

// "4" gives [4, 4]; "2,6" gives [2, 6] (left,right or top,bottom).
function pair(raw, d) {
  const parts = String(raw ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
  if (!parts.length) return [d, d];
  const a = num(parts[0], d);
  return [a, parts[1] !== undefined ? num(parts[1], a) : a];
}

// values: key to list of strings. appearance: "light" | "dark". themeColorsByName:
// {name: colors} as the theme endpoint returns them. defaults: the schema's
// default values, as a key to list map.
export function buildPreview({ values = {}, appearance = "dark", themeColorsByName = {}, defaults = {} } = {}) {
  const name = themeNameFor(values, appearance);
  const themeColors = (name && themeColorsByName[name]) || {};
  const { eff, pal } = effectiveColors({ values, themeColors, defaults });
  const dflt = (k) => lastOf(defaults, k);

  const bg = cssColor(eff.background ?? dflt("background"), FALLBACK.background);
  const fg = cssColor(eff.foreground ?? dflt("foreground"), FALLBACK.foreground);
  const color = (n) => cssColor(pal[n], FALLBACK.palette[n] ?? "#000000");
  const cellColor = (raw, fb) => {
    const v = String(raw ?? "").trim();
    if (v === "cell-foreground") return fg;
    if (v === "cell-background") return bg;
    return cssColor(v, fb);
  };
  const cursorColor = cellColor(eff["cursor-color"] ?? dflt("cursor-color"), fg);
  const cursorText = cellColor(eff["cursor-text"] ?? dflt("cursor-text"), bg);
  const selBg = cellColor(eff["selection-background"] ?? dflt("selection-background"), fg);
  const selFg = cellColor(eff["selection-foreground"] ?? dflt("selection-foreground"), bg);

  const style = lastOf(values, "cursor-style") ?? dflt("cursor-style") ?? "block";
  const family = (values["font-family"] ?? defaults["font-family"] ?? [])[0];
  const size = Math.min(48, Math.max(6, num(lastOf(values, "font-size") ?? dflt("font-size"), 13)));
  const [padL, padR] = pair(lastOf(values, "window-padding-x") ?? dflt("window-padding-x"), 2);
  const [padT, padB] = pair(lastOf(values, "window-padding-y") ?? dflt("window-padding-y"), 2);
  const opacity = Math.min(1, Math.max(0, num(lastOf(values, "background-opacity") ?? dflt("background-opacity"), 1)));
  const faint = Math.min(1, Math.max(0, num(lastOf(values, "faint-opacity") ?? dflt("faint-opacity"), 0.5)));

  const cursorBox = {
    bar: `border-left:2px solid ${cursorColor}`,
    underline: `border-bottom:2px solid ${cursorColor}`,
    block_hollow: `outline:1px solid ${cursorColor};outline-offset:-1px`,
  }[style] ?? `background:${cursorColor};color:${cursorText}`;
  const cursor = `<span class="cur" title="cursor-style = ${esc(style)}" style="${cursorBox}">g</span>`;

  const fontCss = `${family ? `'${String(family).replace(/[^\w .+-]/g, "")}', ` : ""}ui-monospace, 'SF Mono', Menlo, monospace`;
  const mix = Math.round(opacity * 100);
  const bodyStyle =
    `background:color-mix(in srgb, ${bg} ${mix}%, transparent);color:${fg};` +
    `font-family:${fontCss};font-size:${size}px;padding:${padT}px ${padR}px ${padB}px ${padL}px`;

  const dot = (n) => `<s title="palette ${n} = ${esc(pal[n] ?? FALLBACK.palette[n])}" style="background:${color(n)}"></s>`;
  const swatches = Array.from({ length: 16 }, (_, n) => dot(n)).join("");

  return (
    `<div class="term" style="${bodyStyle}">` +
    `<div class="tl">${dot(1)}${dot(3)}${dot(2)}</div>` +
    `<div class="l" style="color:${color(8)}"># ~/dev/notes.ts</div>` +
    `<div class="l"><span style="color:${color(4)}">const</span> greet = (<span style="color:${color(3)}">name</span>) =&gt; <span style="color:${color(2)}">\`hello \${name}\`</span></div>` +
    `<div class="l" style="color:${color(1)}">✗ error: connection refused</div>` +
    `<div class="l" style="color:${color(2)}">✓ build finished in 1.2s</div>` +
    `<div class="l"><span style="opacity:${faint}">faint text</span>  <span style="background:${selBg};color:${selFg}">selected</span></div>` +
    `<div class="l"><span style="color:${color(5)}">~/dev</span> $ ${cursor}it status</div>` +
    `<div class="pal">${swatches}</div>` +
    `</div>`
  );
}
