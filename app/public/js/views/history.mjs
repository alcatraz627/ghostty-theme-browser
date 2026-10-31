// History: every write the app made and every hand edit it noticed, newest
// first. Each card shows when, who, what, the backup file that came with it, and
// the entry id. Restore never deletes anything; it adds a new entry on top.

import { h, svgIcon, clear, relTime } from "../dom.mjs";
import { ICONS } from "../icons.mjs";
import { tip } from "../keys.mjs";
import { renderReceipt } from "./rail.mjs";

const icon = (name) => svgIcon(ICONS[name]);

// "apply 3 change(s): a, b [backup config-1-2]" gives the message and the backup.
export function splitMessage(message) {
  const m = String(message).match(/^(.*?)\s*\[backup ([^\]]+)\]\s*$/);
  return m ? { text: m[1], backup: m[2] } : { text: String(message), backup: null };
}

export function mountHistory(app, root, { goHistory }) {
  const { store } = app;
  const receiptSlot = h("div", { id: "history-receipt" });
  const body = h("div", { id: "history-body", class: "stack" });
  root.append(
    h("div", { class: "view-inner" },
      h("p", { class: "intro" }, "Every write the app made and every hand edit it noticed is an entry. Restoring never deletes anything: it adds a new entry on top, so redo is restoring the newer one."),
      receiptSlot, body));
  let entries = null;
  let seq = 0;
  let active = false;

  function renderReceiptSlot() {
    clear(receiptSlot);
    const r = store.get().receipt;
    if (r) receiptSlot.append(renderReceipt(app, r, { onHistory: goHistory, solidUndo: false }));
  }

  function card(e, i) {
    const { text, backup } = splitMessage(e.message);
    const diffBox = h("div", { class: "diff", hidden: true });
    const diffBtn = h("button", { type: "button", class: "btn icon", "data-diff": e.hash, "aria-label": "Show diff", "data-tip": tip("Show what this entry changed", "press"),
      onclick: async () => {
        if (!diffBox.hidden) {
          diffBox.hidden = true;
          return;
        }
        try {
          const { diff } = await app.api.get(`/api/history/diff?hash=${e.hash}`);
          diffBox.replaceChildren(...diff.split("\n").map((l) => h("div", { class: l.startsWith("+") && !l.startsWith("+++") ? "a" : l.startsWith("-") && !l.startsWith("---") ? "d" : "g" }, l)));
          diffBox.hidden = false;
        } catch (err) {
          if (err.name !== "NetworkError") app.toast(`Could not show that diff: ${err.message}`);
        }
      } }, icon("diff"));
    const restoreBtn = i === 0 ? null : h("button", { type: "button", class: "btn", "data-restore": e.hash, "data-tip": tip("Restore this version", "press"), onclick: () => app.restoreEntry(e.hash) }, icon("restore"), h("span", {}, "Restore"));
    return h("div", { class: "snap", "data-hash": e.hash },
      h("div", { class: "snap-head" },
        h("span", { class: "snap-time", title: new Date(e.ts).toLocaleString() }, relTime(e.ts)),
        h("span", { class: `badge${e.source === "external" ? " external" : ""}` }, e.source),
        h("span", { class: "snap-msg" }, text),
        diffBtn, restoreBtn),
      h("div", { class: "snap-meta" },
        h("span", {}, "entry"), h("span", { class: "f" }, e.hash.slice(0, 7)),
        backup ? h("span", {}, "backup") : null, backup ? h("span", { class: "f", "data-backup": backup }, backup) : null),
      diffBox);
  }

  async function refresh() {
    const my = ++seq;
    try {
      const data = await app.api.get("/api/history");
      if (my !== seq) return;
      entries = data.entries;
    } catch {
      return;
    }
    clear(body);
    if (!entries.length) body.append(h("p", { class: "empty" }, "No entries yet. The first save creates one."));
    else body.append(...entries.map(card));
    const want = store.get().historyFocus;
    if (want) {
      const el = body.querySelector(`[data-hash="${want}"]`);
      if (el) {
        el.scrollIntoView({ block: "center" });
        el.classList.add("mark");
        setTimeout(() => el.classList.remove("mark"), 2500);
      }
      store.set({ historyFocus: null });
    }
  }

  store.subscribe((_s, changed) => {
    if (changed.includes("receipt")) renderReceiptSlot();
    if (active && (changed.includes("historyRev") || changed.includes("diskHash"))) refresh();
  });
  renderReceiptSlot();

  return {
    show() {
      active = true;
      return refresh();
    },
    hide() {
      active = false;
    },
  };
}
