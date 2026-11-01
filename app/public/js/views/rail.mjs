// The right rail: the sample terminal, joined by the On disk one only while
// something is staged, then directly under them the panel that shows the pending
// diff with Ghostty's verdict, or, after a write, the receipt in the same place.

import { h, svgIcon, clear } from "../dom.mjs";
import { ICONS } from "../icons.mjs";
import { tip } from "../keys.mjs";
import { buildPreview, shownThemeName, themeHasPair } from "../preview.mjs";
import { lineDiff } from "../linediff.mjs";
import { displayLabel } from "../labels.mjs";
import { refusalText } from "../receipt.mjs";

const icon = (name) => svgIcon(ICONS[name]);

function diffNode(rows) {
  return h("div", { class: "diff", role: "region", "aria-label": "Diff" },
    ...rows.map((r) => h("div", { class: r.t === "+" ? "a" : r.t === "-" ? "d" : "g" }, r.t === "…" ? "…" : `${r.t === " " ? " " : r.t}${r.text.replace(/\r$/, "")}`)));
}

// Lines for a validator reply, each naming the setting by its label and key.
export function problemLines(app, lint) {
  const out = [];
  if (lint?.unavailable) return ["Ghostty was not found on this machine, so the change cannot be checked."];
  for (const d of lint?.diagnostics ?? []) {
    const opt = app.store.get().byKey[d.key];
    const who = d.key ? `${displayLabel(opt, d.key)} (${d.key})` : `line ${d.line}`;
    out.push(`${who}: ${d.message}`);
  }
  for (const f of lint?.fileLevel ?? []) out.push(f.message);
  return out;
}

function verdictNode(app, s) {
  const v = s.verdict;
  if (s.refusal) {
    const lines = s.refusal.lint ? problemLines(app, s.refusal.lint) : [];
    return h("div", { class: "verdict bad", role: "alert" }, icon("alert"),
      h("div", {}, refusalText(s.refusal.reason), lines.length ? h("ul", {}, ...lines.map((l) => h("li", {}, l))) : null));
  }
  switch (v.state) {
    case "ok":
      return h("div", { class: "verdict ok" }, icon("check"), h("span", {}, "Ghostty says the result is valid"));
    case "bad": {
      const lines = problemLines(app, v.lint);
      return h("div", { class: "verdict bad", role: "alert" }, icon("alert"),
        h("div", {}, "Ghostty rejects this change:", h("ul", {}, ...lines.map((l) => h("li", {}, l)))));
    }
    case "stale":
      return h("div", { class: "verdict stale" }, icon("alert"), h("span", {}, "The file changed on disk since you started staging."));
    case "error":
      return h("div", { class: "verdict bad" }, icon("alert"), h("span", {}, v.message));
    default:
      return h("div", { class: "verdict" }, h("span", {}, "Checking with Ghostty…"));
  }
}

// solidUndo: the rail's Undo is the one solid button there. Other views already
// have their own solid action, so they pass false and Undo stays a ghost button.
export function renderReceipt(app, r, { onHistory, solidUndo = true }) {
  const kv = [
    h("span", {}, "Backup"), h("span", { class: "mono", title: r.backupPath ?? "" }, r.backupName ?? "none, the file did not exist"),
    h("span", {}, "History"), h("span", { class: "mono" }, r.historyShort ?? "", r.historyNote ? ` ${r.historyNote}` : ""),
    h("span", {}, "File"), h("span", { class: "mono" }, r.fileShort ? `sha256 ${r.fileShort}` : ""),
    h("span", {}, "Reload"),
    h("span", {}, "Press ", h("b", { class: "mono" }, r.reloadGlyph || "your reload key"), r.reloadKeybind ? ` (${r.reloadKeybind})` : "", " in Ghostty"),
  ];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.restoreCommand);
      app.toast("Copied the restore command.");
    } catch {
      app.toast("Could not copy. The command is shown on the panel.");
    }
  };
  const undo = h("button", {
    type: "button", class: `btn${solidUndo ? " solid" : ""}`, id: "undo-btn", disabled: !r.undoTarget,
    "data-tip": r.undoTarget ? tip(r.undoLabel, "undo") : tip("No earlier version to go back to", "undo"),
    onclick: () => app.undo(r),
  }, icon("undo"), h("span", {}, r.undoLabel));
  const hist = h("button", { type: "button", class: "btn", id: "receipt-history", disabled: !r.historyHash, "data-tip": tip("Show this entry in History", "history"), onclick: () => onHistory(r.historyHash) },
    icon("history"), h("span", {}, "History"));
  const cp = h("button", { type: "button", class: "btn icon", id: "receipt-copy", disabled: !r.restoreCommand, "aria-label": "Copy restore command", "data-tip": tip("Copy restore command", "copy"), onclick: copy }, icon("copy"));
  const close = h("button", { type: "button", class: "btn icon small push", "aria-label": "Close receipt", "data-tip": tip("Close", "discard"), "data-tip-align": "end", onclick: () => app.store.set({ receipt: null }) }, icon("x"));
  return h("div", { class: "panel ok receipt", id: "receipt" },
    h("h3", {}, r.title, close),
    h("div", { class: "acts first" }, undo, hist, cp),
    h("div", { class: "kv" }, ...kv),
    r.backupPath ? h("div", { class: "kv cmd" }, h("span", {}, "Path"), h("span", { class: "mono", id: "backup-path", "data-cmd": r.restoreCommand }, r.backupPath)) : null);
}

export function mountRail(app, host, { goHistory }) {
  const { store, staging } = app;

  const variantBtn = (v, label) =>
    h("button", { type: "button", "data-variant": v, "data-tip": tip(`Preview the ${v} side`, "variant"), onclick: () => store.set({ variant: v }) }, label);
  const toggle = h("span", { class: "seg", role: "group", "aria-label": "Preview appearance" }, variantBtn("light", "Light"), variantBtn("dark", "Dark"));
  const previewName = h("span", { class: "pv-name" });
  const diskName = h("span", { class: "pv-name" });
  const previewTerm = h("div", { id: "term-preview" });
  const diskTerm = h("div", { id: "term-disk" });
  const previewCard = h("div", { class: "pv", id: "pv-preview" }, h("div", { class: "pv-head" }, h("span", {}, "Preview"), previewName, h("span", { class: "grow" }), toggle), previewTerm);
  const diskCard = h("div", { class: "pv", id: "pv-disk" }, h("div", { class: "pv-head" }, h("span", {}, "On disk"), diskName), diskTerm);
  const panelHost = h("div", { id: "rail-panel" });
  host.append(previewCard, diskCard, panelHost);

  function renderTerms() {
    const s = store.get();
    const eff = staging.effective(s.diskValues);
    app.ensureThemesFor(eff, s.variant);
    app.ensureThemesFor(s.diskValues, s.variant);
    const common = { appearance: s.variant, themeColorsByName: app.themeCache, defaults: s.defaults };
    previewTerm.innerHTML = buildPreview({ values: eff, ...common });
    diskTerm.innerHTML = buildPreview({ values: s.diskValues, ...common });
    previewName.textContent = shownThemeName(eff, s.variant);
    diskName.textContent = shownThemeName(s.diskValues, s.variant);
    for (const b of toggle.children) b.classList.toggle("on", b.dataset.variant === s.variant);
    // Light and Dark only differ for a theme with both sides.
    toggle.hidden = !themeHasPair(eff);
    // With nothing staged the two terminals would be identical.
    diskCard.hidden = staging.size === 0;
  }

  let shownReceipt = null;
  function renderPanel() {
    const s = store.get();
    const n = staging.size;
    clear(panelHost);
    if (n) {
      const rows = s.verdict.diff ?? [];
      const external = s.diskHash && staging.base && s.diskHash !== staging.base.hash;
      const stale = s.verdict.state === "stale" || !!s.conflict || external;
      const node = h("div", { class: "panel", id: "diff-panel" },
        h("h3", {}, "Pending changes", h("span", { class: "cnt" }, String(n))));
      if (stale) {
        const base = staging.base?.text ?? "";
        const now = s.conflict?.text ?? s.diskText;
        const theirs = lineDiff(base, now);
        node.append(
          h("p", { class: "conflict", id: "conflict-note" }, s.conflict
            ? "Nothing was written. The file changed on disk after you started staging. These are the lines that changed:"
            : "The file changed on disk after you started staging. Apply will check again and may refuse. These are the lines that changed:"),
          theirs.length ? diffNode(theirs) : null,
          h("div", { class: "acts" }, h("button", { type: "button", class: "btn", id: "review-new", "data-tip": tip("Take the new file as the base and keep your changes", "press"), onclick: () => app.reviewOnNewFile() }, icon("refresh"), h("span", {}, "Review on the new file")))
        );
      } else {
        node.append(rows.length ? diffNode(rows) : h("p", { class: "none" }, "Checking the change…"));
      }
      if (!stale) node.append(verdictNode(app, s));
      panelHost.append(node);
    } else if (s.receipt) {
      const card = renderReceipt(app, s.receipt, { onHistory: goHistory });
      panelHost.append(card);
      // A tall sample (a big font size) can push the receipt below the fold, and
      // the Undo button is the point of it, so bring a new receipt into view.
      if (shownReceipt !== s.receipt) card.scrollIntoView({ block: "nearest" });
      shownReceipt = s.receipt;
    } else {
      shownReceipt = null;
      panelHost.append(h("div", { class: "panel", id: "diff-panel" }, h("h3", {}, "Pending changes", h("span", { class: "cnt" }, "0")),
        h("p", { class: "none" }, "Nothing is staged. A change you make shows here as a diff, checked by Ghostty, before anything is written.")));
    }
  }

  store.subscribe((_s, changed) => {
    if (changed.some((k) => ["diskValues", "variant", "themeRev", "stagedRev", "defaults"].includes(k))) renderTerms();
    if (changed.some((k) => ["verdict", "receipt", "conflict", "refusal", "stagedRev", "diskHash"].includes(k))) renderPanel();
  });
  renderTerms();
  renderPanel();
}
