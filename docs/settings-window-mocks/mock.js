// Builds one layout of the settings-window mock from static sample data.
// Query: ?theme=dark|light  ?type=sans|mono  ?state=pending|review|applied  ?pv=dark|light
const q = new URLSearchParams(location.search);
const theme = q.get("theme") || "dark";
const type = q.get("type") || "sans";
const state = q.get("state") || "pending";
const pv = q.get("pv") || "dark";
document.documentElement.dataset.theme = theme;
document.documentElement.dataset.type = type;
const layout = document.body.dataset.layout;

// Small stroke icons shared by the buttons in layout D.
const svg = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ic = {
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>'),
  history: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
  reset: svg('<path d="M4 12a8 8 0 108-8H7"/><path d="M7 1v6h6"/>'),
};

const PENDING = state !== "applied";
const sw = (on) => `<span class="sw ${on ? "on" : ""}"></span>`;
const seg = (opts, on) => `<span class="seg">${opts.map((o) => `<span class="${o === on ? "on" : ""}">${o}</span>`).join("")}</span>`;
const step = (v) => `<span class="step"><b>−</b><i>${v}</i><b>+</b></span>`;
const field = (v) => `<span class="field">${v}</span>`;
const color = (hex) => `<span class="swatch"><s style="background:${hex}"></s>${hex}</span>`;
const chooser = (name, dots) => `<span class="chooser">${name}<span class="dots">${dots.map((c) => `<s style="background:${c}"></s>`).join("")}</span><em>Change</em></span>`;
const flags = (all, on) => `<span class="flags">${all.map((f) => `<span class="${on.includes(f) ? "on" : ""}">${f}</span>`).join("")}</span>`;

// theme values: on disk versus staged
const diskTheme = "Solarized Osaka Night";
const newTheme = PENDING ? "Tokyo Night Storm" : "Tokyo Night Storm";
const fontSize = PENDING ? 15 : 15;
const blink = false;

const INLINE_WAS = layout === "d";
const row = (o) => `<div class="row ${o.pend && PENDING ? "pend" : ""} ${o.hov && q.get("hover") ? "hov" : ""}"><div><div><span class="label">${o.label}</span><span class="key">${o.key}</span></div>` +
  `<div class="help">${o.help}</div>${!INLINE_WAS && o.pend && PENDING ? `<div class="was">was ${o.was}</div>` : ""}</div>` +
  `<div class="ctl">${INLINE_WAS && o.pend && PENDING ? `<span class="was">was ${o.was}</span>` : ""}${o.ctl}</div><div class="act" data-tip="Reset to default">${ic.reset}</div></div>`;

const appearance = [
  { label: "Theme", key: "theme", help: "Colors for the terminal. Your explicit color lines still win after Apply.", pend: true, was: diskTheme,
    ctl: chooser(newTheme, ["#24283b", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7"]) },
  { label: "Background", key: "background", help: "Terminal background color.", hov: true, ctl: color("#1a1b26") },
  { label: "Foreground", key: "foreground", help: "Default text color.", ctl: color("#c0caf5") },
  { label: "Cursor style", key: "cursor-style", help: "Shape of the cursor at the prompt.", ctl: seg(["block", "bar", "underline"], "bar") },
  { label: "Cursor blink", key: "cursor-style-blink", help: "Whether the cursor blinks.", pend: true, was: "true", ctl: sw(blink) },
  { label: "Font family", key: "font-family", help: "First choice font. Fallbacks are kept as they are.", ctl: field("Fira Code") },
  { label: "Font size", key: "font-size", help: "Size in points.", pend: true, was: "13", ctl: step(fontSize) },
  { label: "Padding balance", key: "window-padding-balance", help: "How leftover space around the grid is shared.", ctl: seg(["false", "true", "equal"], "equal") },
];
const windowRows = [
  { label: "Titlebar style", key: "macos-titlebar-style", help: "How the tab bar and titlebar combine.", ctl: seg(["native", "transparent", "tabs", "hidden"], "tabs") },
  { label: "Restore windows", key: "window-save-state", help: "Reopen windows after a restart.", ctl: seg(["default", "never", "always"], "always") },
];
const notifRows = [
  { label: "Notify when a command finishes", key: "notify-on-command-finish", help: "Needs shell integration.", ctl: seg(["never", "unfocused", "always"], "unfocused") },
  { label: "Notification method", key: "notify-on-command-finish-action", help: "Pick any combination.", ctl: flags(["bell", "notify"], ["bell", "notify"]) },
  { label: "Bell features", key: "bell-features", help: "Other flags are kept when you toggle one.", ctl: flags(["system", "audio", "attention", "title", "border"], ["attention", "title"]) },
];
const clipRows = [
  { label: "Copy on select", key: "copy-on-select", help: "Where a selection is copied.", ctl: seg(["none", "primary", "clipboard", "both"], "both") },
  { label: "Clipboard read", key: "clipboard-read", help: "Whether programs may read your clipboard.", ctl: seg(["ask", "allow", "deny"], "allow") },
];
const sec = (t, rows) => `<h2>${t}</h2>${rows.map(row).join("")}`;

const groups = [["Appearance", 8, true], ["Fonts", 33], ["Window", 29], ["Notifications", 9], ["Clipboard", 8], ["Shell", 7], ["Mouse", 5], ["Keybinds", 1], ["Quick terminal", 6], ["macOS", 17], ["Advanced", 40]];
const sidebar = `<div class="side"><div class="filters"><span class="chip">Modified</span><span class="chip ${PENDING ? "on" : ""}">Pending</span></div>` +
  groups.map(([n, c, on]) => `<div class="grp ${on ? "on" : ""}"><span>${n}</span><span class="n">${c}</span></div>`).join("") + `</div>`;

// preview
const palette = ["#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6", "#414868", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5"];
function term(bg, fg, size, cursor, label, opts = {}) {
  const compact = opts.compact;
  return `<div class="pv"><div class="pv-head"><span>${label}</span><span class="sp"></span>${opts.toggle ? `<span class="seg"><span class="${pv === "light" ? "on" : ""}">Light</span><span class="${pv === "dark" ? "on" : ""}">Dark</span></span>` : ""}</div>` +
    `<div class="term" style="background:${bg};color:${fg};font-size:${size}px">` +
    `<div class="tl"><s style="background:${palette[1]}"></s><s style="background:${palette[3]}"></s><s style="background:${palette[2]}"></s></div>` +
    `<div class="l" style="color:${palette[8]}"># ${label.includes("disk") && PENDING ? diskTheme : newTheme}</div>` +
    `<div class="l"><span style="color:${palette[4]}">const</span> greet = (<span style="color:${palette[3]}">name</span>) =&gt; <span style="color:${palette[2]}">\`hello \${name}\`</span></div>` +
    (compact ? "" : `<div class="l" style="color:${palette[1]}">✗ error: connection refused (port 6277)</div><div class="l" style="color:${palette[2]}">✓ build finished in 1.2s</div>`) +
    `<div class="l"><span style="color:${palette[5]}">~/dev</span> $ <span class="cur ${cursor}" style="background:${fg}"></span></div>` +
    `<div class="pal">${palette.map((c) => `<s style="background:${c}"></s>`).join("")}</div></div></div>`;
}
const lightBg = "#e1e2e7", lightFg = "#3760bf";
const previewNew = (opts) => pv === "light" ? term(lightBg, lightFg, PENDING ? 15 : 15, "bar", "Preview", opts) : term("#24283b", "#c0caf5", 15, "bar", "Preview", opts);
const previewDisk = (opts) => PENDING ? term("#1a1b26", "#c0caf5", 13, "bar", "On disk", opts) : term("#24283b", "#c0caf5", 15, "bar", "On disk", opts);

// bars
const applyBar = `<div class="applybar"><span class="msg"><b>3 changes</b> staged, nothing written yet. <span class="ok">✓ Ghostty says the result is valid</span></span>` +
  `<button class="btn">Review diff <kbd>⌘D</kbd></button><button class="btn">Discard</button><button class="btn pri">Apply <kbd>⌘↵</kbd></button></div>`;
const cleanBar = `<div class="applybar" style="border-top-color:var(--line)"><span class="msg" style="color:var(--dim)">No pending changes</span><button class="btn">Discard</button><button class="btn pri" style="opacity:.45">Apply</button></div>`;
const receipt = `<div class="receipt"><h3>Applied 3 changes</h3><div class="kv"><span>Backup</span><span class="mono">config-5f1c9a02-2026-10-31T14-55-02Z</span>` +
  `<span>History</span><span class="mono">entry 9f3c2e1, appended</span><span>Reload</span><span>Press <b class="mono">⌘⇧,</b> in Ghostty to apply</span></div>` +
  `<div class="acts"><button class="btn pri">Undo this apply</button><button class="btn">Show in History</button><button class="btn">Copy restore command</button></div></div>`;
const diff = `<div class="diff"><div class="h">@@ config @@</div><div class="d">-theme = Solarized Osaka Night</div><div class="a">+theme = Tokyo Night Storm</div>` +
  `<div class="d">-cursor-style-blink = true</div><div class="a">+cursor-style-blink = false</div><div class="d">-font-size = 13</div><div class="a">+font-size = 15</div></div>`;
const extra =state === "applied" ? receipt : state === "review" ? diff : "";
const bar = state === "applied" ? cleanBar : applyBar;

const topbar =`<div class="top"><h1>Ghostty Settings</h1><span class="pill">Ghostty 1.4.0</span><span class="pill">…/ghostty/config</span><span class="pill">mock data, nothing is written</span><span class="sp"></span>` +
  (layout === "c" || layout === "d" ? "" : `<div class="search">Search settings<kbd>/</kbd></div>`) +
  `<div class="tabs"><span class="on">Settings</span><span>Raw file</span><span>History</span><span>Profiles</span></div></div>`;
const note = "";
const lists = (full) => (full ? sec("Appearance", appearance) + sec("Window", windowRows) + sec("Notifications", notifRows) + sec("Clipboard", clipRows) : sec("Appearance", appearance));

// Layout D: the owner's composition of C (scrolling page, sticky strip, floating Apply)
// with a right rail holding the previews and, directly below them, the diff or receipt.
const tip = q.get("tip");
const btn = (cls, icon, label, tipText, extra = "") => `<button class="btn ${cls} ${extra}" data-tip="${tipText}">${icon}${label ? `<span>${label}</span>` : ""}</button>`;
const drawerPending = `<div class="drawer"><h3>Pending changes <span class="cnt">3</span></h3><div class="diff"><div class="d">-theme = Solarized Osaka Night</div><div class="a">+theme = Tokyo Night Storm</div>` +
  `<div class="d">-cursor-style-blink = true</div><div class="a">+cursor-style-blink = false</div><div class="d">-font-size = 13</div><div class="a">+font-size = 15</div></div>` +
  `<div class="verdict">${ic.check}<span>Ghostty says the result is valid</span></div></div>`;
const drawerApplied = `<div class="drawer ok"><h3>Applied 3 changes</h3><div class="kv"><span>Backup</span><span class="mono">config-5f1c9a02-2026-10-31T14-55-02Z</span>` +
  `<span>History</span><span class="mono">entry 9f3c2e1, appended</span><span>Reload</span><span>Press <b class="mono">⌘⇧,</b> in Ghostty</span></div>` +
  `<div class="acts">${btn("pri", ic.undo, "Undo this apply", "Undo this apply  ⌘Z")}${btn("", ic.history, "History", "Show in History  ⌘Y")}${btn("icon", ic.copy, "", "Copy restore command  ⌘⇧C", tip ? "tipshow" : "")}</div></div>`;

let html = "";
if (layout === "e") {
  // The other reading of "below the previews": the preview band stays on top, the diff panel sits under it.
  const pillE = `<div class="float"><span><b>3 changes</b> <span style="color:var(--dim)">staged</span></span>${btn("", ic.x, "Discard", "Discard all changes  Esc")}${btn("pri", ic.check, "Apply", "Apply 3 changes  ⌘↵")}</div>`;
  html = `<div class="app ld le">${topbar}<div class="strip">${["Appearance", "Fonts", "Window", "Notifications", "Clipboard", "Shell", "Keybinds", "More"].map((g, i) => `<span class="g ${i === 0 ? "on" : ""}">${g}</span>`).join("")}` +
    `<span style="flex:1"></span><div class="search">Search<kbd>/</kbd></div></div>` +
    `<div class="band">${previewNew({ toggle: true, compact: true })}${previewDisk({ compact: true })}</div><div class="below">${drawerPending}</div>` +
    `<div class="page"><div class="list">${lists(true)}</div>${pillE}</div></div>`;
} else if (layout === "d") {
  const pill = state === "applied" ? "" :
    `<div class="float"><span><b>3 changes</b> <span style="color:var(--dim)">staged</span></span>${btn("", ic.x, "Discard", "Discard all changes  Esc")}${btn("pri", ic.check, "Apply", "Apply 3 changes  ⌘↵", tip ? "tipshow" : "")}</div>`;
  html = `<div class="app ld">${topbar}<div class="strip">${["Appearance", "Fonts", "Window", "Notifications", "Clipboard", "Shell", "Keybinds", "More"].map((g, i) => `<span class="g ${i === 0 ? "on" : ""}">${g}</span>`).join("")}` +
    `<span style="flex:1"></span><div class="search" data-tip="Search settings  /">Search<kbd>/</kbd></div></div>` +
    `<div class="cols"><div class="page"><div class="list">${lists(true)}</div>${pill}</div>` +
    `<aside class="rail">${previewNew({ toggle: true })}${previewDisk({})}${state === "applied" ? drawerApplied : drawerPending}</aside></div></div>`;
} else if (layout === "a") {
  html = `<div class="app la">${topbar}<div class="body">${sidebar}<div class="main">${state === "applied" ? "" : applyBar}` +
    `<div class="pvrow">${previewNew({ toggle: true })}${previewDisk({})}</div><div class="list" style="flex:1">${extra}${lists(false)}${sec("Window", windowRows)}</div>${state === "applied" ? cleanBar : ""}</div></div>${note}</div>`;
} else if (layout === "b") {
  html = `<div class="app lb">${topbar}<div class="body">${sidebar}<div class="center"><div class="list" style="height:100%">${extra}${lists(false)}${sec("Window", windowRows)}</div></div>` +
    `<div class="rail">${previewNew({ toggle: true })}${previewDisk({})}</div></div>${bar}${note}</div>`;
} else {
  html = `<div class="app lc">${topbar}<div class="strip"><span class="g on">Appearance</span><span class="g">Fonts</span><span class="g">Window</span><span class="g">Notifications</span><span class="g">Clipboard</span><span class="g">Shell</span><span class="g">Keybinds</span><span class="g">More</span><span class="sp" style="flex:1"></span><div class="search" style="width:240px">Search<kbd>/</kbd></div></div>` +
    `<div class="sticky">${previewNew({ toggle: true, compact: true })}${previewDisk({ compact: true })}</div>` +
    `<div class="page"><div class="list" style="height:100%">${extra}${lists(true)}</div>${state === "applied" ? "" : `<div class="float"><span><b>3 changes</b> <span style="color:var(--dim)">staged</span> <span class="ok">✓ valid</span></span><button class="btn">Review diff</button><button class="btn">Discard</button><button class="btn pri">Apply <kbd>⌘↵</kbd></button></div>`}</div>${note}</div>`;
}
document.body.innerHTML = html;

// Dark/light toggle for the page chrome (the preview's own appearance is the ?pv= variant).
const tg = document.createElement("button");
tg.textContent = theme === "light" ? "Dark" : "Light";
tg.style.cssText = "font:11.5px var(--mono);border:1px solid var(--line);background:var(--surface);color:var(--dim);border-radius:99px;padding:2px 10px;cursor:pointer;margin-left:6px";
tg.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  tg.textContent = next === "light" ? "Dark" : "Light";
});
document.querySelector(".top").appendChild(tg);
