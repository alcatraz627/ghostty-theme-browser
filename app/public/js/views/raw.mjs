// Raw file: the config as text, highlighted, with Ghostty's lint as you type.
// Save sends the hash of the file the editor started from, so a hand edit made
// meanwhile is caught. A file Ghostty reports problems in needs an explicit,
// named "save anyway" that lists the messages, and still gets a backup, a
// history entry and the same receipt with Undo.

import { h, svgIcon, clear } from "../dom.mjs";
import { ICONS } from "../icons.mjs";
import { tip } from "../keys.mjs";
import { esc } from "../preview.mjs";
import { confirmDialog } from "./dialogs.mjs";
import { renderReceipt, problemLines } from "./rail.mjs";

const icon = (name) => svgIcon(ICONS[name]);

// One config line as highlighted HTML. It adds no width, so the text lines up
// exactly with the textarea above it.
export function highlightLine(line) {
  if (/^\s*#/.test(line)) return `<span class="c">${esc(line)}</span>`;
  const m = line.match(/^(\s*)([A-Za-z0-9_-]+)(\s*=\s*)(.*)$/);
  if (!m) return esc(line);
  return `${esc(m[1])}<span class="k">${esc(m[2])}</span>${esc(m[3])}<span class="v">${esc(m[4])}</span>`;
}
export const highlight = (text) => text.split("\n").map(highlightLine).join("\n") + "\n ";

export function mountRaw(app, root, { goHistory }) {
  const { store } = app;
  let base = { hash: "", text: "" };
  let lintTimer = null;
  let lintSeq = 0;

  const status = h("span", { class: "status", id: "lint-status" }, "Checking…");
  const note = h("span", { class: "status", id: "raw-note" });
  const saveBtn = h("button", { type: "button", class: "btn solid", id: "raw-save", onclick: () => save() }, icon("check"), h("span", {}, "Save"));
  const hl = h("pre", { class: "raw-hl", "aria-hidden": "true" });
  const ta = h("textarea", { class: "raw-ta", id: "raw-editor", spellcheck: "false", wrap: "off", "aria-label": "Config file text" });
  const diags = h("ul", { class: "diags", id: "diagnostics" });
  const receiptSlot = h("div", { id: "raw-receipt" });
  const view = h("div", { class: "view-inner raw-view" },
    h("div", { class: "toolbar" }, status, note, h("span", { class: "grow" }), saveBtn),
    receiptSlot,
    h("div", { class: "raw-wrap" }, hl, ta),
    diags);
  root.append(view);

  const dirty = () => ta.value !== base.text;

  function paint() {
    hl.innerHTML = highlight(ta.value);
    hl.scrollTop = ta.scrollTop;
    hl.scrollLeft = ta.scrollLeft;
    const s = store.get();
    saveBtn.disabled = !dirty() || !!s.readOnly || !!s.busy;
    saveBtn.dataset.tip = !dirty() ? tip("Nothing to save", "save") : tip("Save the file", "save");
    const moved = dirty() && s.diskHash !== base.hash;
    note.className = `status${moved ? " bad" : ""}`;
    note.textContent = moved ? "The file changed on disk since you opened it. Save will ask before overwriting." : dirty() ? "Unsaved changes" : "";
  }

  function loadFromDisk() {
    const s = store.get();
    base = { hash: s.diskHash, text: s.diskText };
    ta.value = s.diskText;
    ta.setSelectionRange(0, 0);
    ta.scrollTop = 0;
    paint();
    // Linting spawns Ghostty, so only do it while the editor is on screen.
    if (store.get().view === "raw") lintNow();
  }

  async function lintNow() {
    const seq = ++lintSeq;
    status.className = "status";
    status.textContent = "Checking…";
    try {
      const { data: r } = await app.api.post("/api/lint", { content: ta.value });
      if (seq !== lintSeq) return;
      clear(diags);
      const items = [
        ...r.diagnostics.map((d) => h("li", {}, h("button", { type: "button", "data-line": String(d.line), "data-tip": tip(`Jump to line ${d.line}`, "press"), onclick: () => gotoLine(d.line) },
          h("span", { class: "loc" }, `line ${d.line}`), h("span", { class: "dkey" }, d.key ?? ""), h("span", {}, d.message)))),
        ...r.fileLevel.map((f) => h("li", {}, h("span", { class: "filelevel" }, f.message))),
      ];
      diags.append(...items);
      const n = r.diagnostics.length + r.fileLevel.length;
      status.className = `status ${r.ok ? "ok" : "bad"}`;
      status.textContent = r.ok ? "✓ Valid config, checked by your Ghostty binary" : `✕ ${n || 1} problem${n === 1 ? "" : "s"}`;
    } catch (err) {
      if (seq !== lintSeq) return;
      status.className = "status bad";
      status.textContent = `Lint failed: ${err.message}`;
    }
  }

  function gotoLine(n) {
    const line = Math.max(1, Number(n));
    const lines = ta.value.split("\n");
    const start = lines.slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
    ta.focus();
    ta.setSelectionRange(start, start + (lines[line - 1] || "").length);
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    ta.scrollTop = Math.max(0, (line - 3) * lh);
    hl.scrollTop = ta.scrollTop;
  }

  async function save() {
    const s = store.get();
    if (!dirty() || s.readOnly) return;
    const content = ta.value;
    let res = await app.saveRaw(content, { baseHash: base.hash });
    if (res.status === 409 || res.data?.reason === "stale") {
      const { ok } = await confirmDialog({
        title: "The file changed on disk",
        body: ["Saving would overwrite a change made outside this page. Nothing was written.", "Load the new file to continue. Your text here is replaced, so copy it first if you need it."],
        confirmLabel: "Load the new file",
      });
      if (ok) {
        await app.applyDisk(await app.api.get("/api/config"));
        loadFromDisk();
      }
      return;
    }
    if (!res.data?.ok && res.data?.reason === "validation failed") {
      const { ok } = await confirmDialog({
        title: "Save a file Ghostty reports problems in?",
        body: ["Ghostty ignores lines it cannot read, so these settings will not take effect:"],
        list: problemLines(app, res.data.lint),
        confirmLabel: "Save anyway",
        danger: true,
      });
      if (!ok) return;
      res = await app.saveRaw(content, { baseHash: base.hash, force: true });
    }
    if (!res.data?.ok) {
      app.toast(`Save failed: ${res.data?.reason ?? "unknown reason"}`);
      if (res.data?.reason === "stale") loadFromDisk();
    }
  }

  ta.addEventListener("input", () => {
    paint();
    clearTimeout(lintTimer);
    lintTimer = setTimeout(lintNow, 400);
  });
  ta.addEventListener("scroll", () => {
    hl.scrollTop = ta.scrollTop;
    hl.scrollLeft = ta.scrollLeft;
  });

  function renderReceiptSlot() {
    clear(receiptSlot);
    const r = store.get().receipt;
    if (r) receiptSlot.append(renderReceipt(app, r, { onHistory: goHistory, solidUndo: false }));
  }

  store.subscribe((s, changed) => {
    if (changed.includes("diskHash")) {
      // A clean editor follows the file; one with edits keeps them and warns.
      if (!dirty() || ta.value === s.diskText) loadFromDisk();
      else paint();
    }
    if (changed.includes("receipt")) renderReceiptSlot();
    if (changed.includes("busy") || changed.includes("readOnly")) paint();
  });
  renderReceiptSlot();

  return {
    save,
    focus: () => ta.focus(),
    // Called when the tab opens so the lint reflects the current text.
    show() {
      if (!base.hash && store.get().diskHash) loadFromDisk();
      else lintNow();
    },
    gotoLine,
    ta,
  };
}
