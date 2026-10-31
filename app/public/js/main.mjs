// Starts the page: builds the window, loads the data, wires the keyboard and the
// quiet poll, and shows the calm "stopped" panel when the server has gone.

import { createApp } from "./app.mjs";
import { h, svgIcon, clear } from "./dom.mjs";
import { ICONS } from "./icons.mjs";
import { KEYS, tip, isTyping, shouldIgnoreRepeat } from "./keys.mjs";
import { mountSettings } from "./views/settings.mjs";
import { mountRail } from "./views/rail.mjs";
import { mountRaw } from "./views/raw.mjs";
import { mountHistory } from "./views/history.mjs";
import { mountProfiles } from "./views/profiles.mjs";

const icon = (name) => svgIcon(ICONS[name]);

function readToken() {
  const fromUrl = new URLSearchParams(location.search).get("token");
  try {
    if (fromUrl) sessionStorage.setItem("gcm-token", fromUrl);
    return fromUrl || sessionStorage.getItem("gcm-token") || "";
  } catch {
    return fromUrl || "";
  }
}

// "/Users/me/.config/ghostty/config" shows as ".../ghostty/config".
export function shortPath(p) {
  const parts = String(p).split("/").filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : p;
}

const app = createApp({ token: readToken() });
const { store, staging } = app;
store.set({ appearance: document.documentElement.dataset.theme === "light" ? "light" : "dark", variant: document.documentElement.dataset.theme === "light" ? "light" : "dark" });

// ---- window frame ----
const root = document.getElementById("app");
const TABS = [
  ["settings", "Settings", "tabSettings"],
  ["raw", "Raw file", "tabRaw"],
  ["history", "History", "tabHistory"],
  ["profiles", "Profiles", "tabProfiles"],
];
const versionPill = h("span", { class: "pill", id: "version-pill" }, "Ghostty");
const pathPill = h("span", { class: "pill", id: "path-pill" });
const tabBtns = TABS.map(([id, label, key]) =>
  h("button", { type: "button", role: "tab", "data-view": id, "data-tip": tip(label, key), "data-tip-pos": "below", onclick: () => setView(id) }, label));
const themeBtn = h("button", { type: "button", class: "btn icon", id: "appearance-btn", onclick: () => app.setAppearance(store.get().appearance === "light" ? "dark" : "light") });
const top = h("header", { class: "top" }, h("h1", {}, "Ghostty Settings"), versionPill, pathPill, h("span", { class: "grow" }),
  h("nav", { class: "tabs", role: "tablist", "aria-label": "Screens" }, ...tabBtns), themeBtn);
const banner = h("div", { class: "banner bad", id: "banner", hidden: true, role: "alert" });
const settingsRoot = h("div", { class: "settings", id: "view-settings" });
const rawRoot = h("div", { class: "view", id: "view-raw", hidden: true });
const historyRoot = h("div", { class: "view", id: "view-history", hidden: true });
const profilesRoot = h("div", { class: "view", id: "view-profiles", hidden: true });
const stoppedRoot = h("div", { class: "view", id: "view-stopped", hidden: true });
const toastEl = h("div", { class: "toast", id: "toast", role: "status", hidden: true });
root.append(top, banner, settingsRoot, rawRoot, historyRoot, profilesRoot, stoppedRoot, toastEl);

function goHistory(hash) {
  store.set({ historyFocus: hash ?? null });
  setView("history");
}

const settings = mountSettings(app, settingsRoot, {});
mountRail(app, settings.rail, { goHistory });
const raw = mountRaw(app, rawRoot, { goHistory });
const historyView = mountHistory(app, historyRoot, { goHistory });
const profiles = mountProfiles(app, profilesRoot, { goHistory });

const VIEWS = { settings: settingsRoot, raw: rawRoot, history: historyRoot, profiles: profilesRoot };
function setView(name) {
  store.set({ view: name });
  try {
    history.replaceState(null, "", `#${name}`);
  } catch {
    /* an address bar that cannot change is not a problem */
  }
}
function renderView() {
  const { view, stopped } = store.get();
  for (const [id, el] of Object.entries(VIEWS)) el.hidden = stopped || id !== view;
  stoppedRoot.hidden = !stopped;
  for (const b of tabBtns) {
    const on = b.dataset.view === view;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", String(on));
  }
  if (stopped) return;
  if (view === "raw") {
    raw.show();
    raw.focus();
  }
  if (view === "history") historyView.show();
  else historyView.hide();
  if (view === "profiles") profiles.show();
  else profiles.hide();
}

function renderAppearance() {
  const light = store.get().appearance === "light";
  themeBtn.replaceChildren(icon(light ? "moon" : "sun"));
  themeBtn.dataset.tip = tip(light ? "Switch to the dark window" : "Switch to the light window", "appearance");
  themeBtn.dataset.tipPos = "below";
  themeBtn.dataset.tipAlign = "end";
  themeBtn.setAttribute("aria-label", light ? "Switch to the dark window" : "Switch to the light window");
}

// ---- stopped panel ----
let reconnecting = null;
function renderStopped() {
  const s = store.get();
  clear(stoppedRoot);
  if (!s.stopped) {
    // Any answer from the server ends the stopped state, so the loop can rest.
    clearInterval(reconnecting);
    reconnecting = null;
    return;
  }
  const minutes = s.meta?.idleMs ? Math.round(s.meta.idleMs / 60000) : 0;
  stoppedRoot.append(h("div", { class: "stopped", id: "stopped-panel" },
    h("h2", {}, minutes ? `Stopped after ${minutes} idle ${minutes === 1 ? "minute" : "minutes"}` : "The settings server is not running"),
    h("p", {}, "Nothing was lost: your config file is untouched. Start it again with ", h("code", {}, "npm start"), " in this repo, then press the button."),
    staging.size ? h("p", {}, `Your ${staging.size} staged ${staging.size === 1 ? "change is" : "changes are"} kept in this tab until then.`) : null,
    h("div", { class: "acts" }, h("button", { type: "button", class: "btn solid", id: "retry-btn", "data-tip": tip("Check again", "press"), onclick: () => tryReconnect() }, icon("refresh"), h("span", {}, "Check again")))));
  if (!reconnecting) reconnecting = setInterval(tryReconnect, 4000);
}
// The loop keeps running until the server answers AND the reload succeeds, so a
// server that answers /api/meta and then falters cannot strand the page here.
async function tryReconnect() {
  try {
    await app.api.get("/api/meta");
    await app.load({ keepStaging: true });
  } catch {
    /* still down, or the reload failed; the next round tries again */
  }
}

// ---- toast and banner ----
let toastTimer = null;
function renderToast() {
  const t = store.get().toast;
  if (!t) return;
  toastEl.textContent = t.text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 4500);
}
function renderBanner() {
  const s = store.get();
  banner.hidden = !s.readOnly;
  if (s.readOnly) banner.textContent = `Read-only: the config file could not be read (${s.readOnly}). Nothing on this page can write it.`;
}

store.subscribe((s, changed) => {
  if (changed.includes("view") || changed.includes("stopped")) renderView();
  if (changed.includes("stopped") || changed.includes("meta")) renderStopped();
  if (changed.includes("appearance")) renderAppearance();
  if (changed.includes("toast")) renderToast();
  if (changed.includes("readOnly")) renderBanner();
  if (changed.includes("meta") && s.meta) versionPill.textContent = s.meta.ghosttyVersion;
  if (changed.includes("fonts")) {
    // The font box suggests only families Ghostty itself can load.
    document.getElementById("font-families").replaceChildren(...s.fonts.map((f) => h("option", { value: f })));
  }
  if (changed.includes("path")) {
    pathPill.textContent = shortPath(s.path);
    pathPill.dataset.tip = s.path;
    pathPill.dataset.tipPos = "below";
    pathPill.dataset.tipAlign = "start";
  }
});

// ---- keyboard ----
const openDialog = () => document.querySelector("dialog[open]");
document.addEventListener("keydown", (e) => {
  app.ping();
  const s = store.get();
  if (s.stopped || openDialog()) return;
  const typing = isTyping(e.target);
  // A held key must not fire a write or a discard again and again.
  if (shouldIgnoreRepeat(e) && !(typing && (KEYS.undo.match(e) || KEYS.copy.match(e)))) {
    e.preventDefault();
    return;
  }

  if (KEYS.apply.match(e)) {
    if (s.view === "settings") {
      e.preventDefault();
      app.applyFromShortcut(document.activeElement);
    }
    return;
  }
  if (KEYS.save.match(e)) {
    if (s.view === "raw") {
      e.preventDefault();
      raw.save();
    }
    return;
  }
  if (KEYS.discard.match(e)) {
    if (typing) {
      e.target.blur();
    } else if (staging.size) {
      app.discard();
    } else if (s.receipt) {
      store.set({ receipt: null });
    }
    return;
  }
  if (KEYS.search.match(e) && !typing) {
    e.preventDefault();
    setView("settings");
    settings.searchInput.focus();
    return;
  }
  const tab = TABS.find(([, , key]) => KEYS[key].match(e));
  if (tab) {
    e.preventDefault();
    setView(tab[0]);
    return;
  }
  if (KEYS.filterModified.match(e)) {
    e.preventDefault();
    store.set({ filters: { ...s.filters, modified: !s.filters.modified } });
  } else if (KEYS.filterPending.match(e)) {
    e.preventDefault();
    store.set({ filters: { ...s.filters, pending: !s.filters.pending } });
  } else if (KEYS.variant.match(e)) {
    e.preventDefault();
    store.set({ variant: s.variant === "dark" ? "light" : "dark" });
  } else if (KEYS.appearance.match(e)) {
    e.preventDefault();
    app.setAppearance(s.appearance === "light" ? "dark" : "light");
  } else if (KEYS.resetRow.match(e)) {
    const btn = e.target.closest?.(".row")?.querySelector(".act");
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
  } else if (KEYS.history.match(e) && s.receipt?.historyHash) {
    e.preventDefault();
    goHistory(s.receipt.historyHash);
  } else if (KEYS.undo.match(e) && !typing) {
    // First the set an Esc just discarded, then the receipt's Undo.
    if (app.undoDiscard()) e.preventDefault();
    else if (s.receipt?.undoTarget && !staging.size) {
      e.preventDefault();
      app.undo();
    }
  } else if (KEYS.copy.match(e) && !typing && s.receipt?.restoreCommand) {
    e.preventDefault();
    document.getElementById("receipt-copy")?.click();
  }
});
document.addEventListener("pointerdown", () => app.ping(), true);
// Staged changes live only in this tab, so closing or reloading it asks first.
window.addEventListener("beforeunload", (e) => {
  if (staging.size) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") app.poll();
});

// ---- start ----
renderAppearance();
const fromHash = location.hash.slice(1);
if (VIEWS[fromHash]) store.set({ view: fromHash });
renderView();
(async () => {
  try {
    // Polling starts first so a server that is down at open is noticed and
    // recovered from, not just one that goes down later.
    app.startPolling();
    await app.load();
  } catch (err) {
    if (err?.name !== "NetworkError") {
      banner.hidden = false;
      banner.textContent = `${err.message}${readToken() ? "" : " Open the page with the tokened URL the server printed."}`;
    }
  }
})();

// Hooks for the browser checks. They read state and never write it.
window.__gcm = { app, store, staging, version: 1 };
