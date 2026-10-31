// Profiles: complete config files kept by name. Save the current file as one,
// activate one (written through the normal safety path, so the file it replaces
// is in History), duplicate or delete.

import { h, svgIcon, clear, relTime } from "../dom.mjs";
import { ICONS } from "../icons.mjs";
import { tip } from "../keys.mjs";
import { confirmDialog } from "./dialogs.mjs";
import { renderReceipt } from "./rail.mjs";
import { ApiError } from "../api.mjs";

const icon = (name) => svgIcon(ICONS[name]);

export function mountProfiles(app, root, { goHistory }) {
  const { store, api } = app;
  const nameInput = h("input", { class: "field name-input", id: "profile-name", type: "text", placeholder: "New profile name", maxlength: "41", "aria-label": "Profile name", spellcheck: "false" });
  const saveBtn = h("button", { type: "button", class: "btn solid", id: "profile-save", "data-tip": tip("Save the current file as a profile", "press"), onclick: () => saveCurrent() }, icon("plus"), h("span", {}, "Save current as profile"));
  const receiptSlot = h("div", { id: "profiles-receipt" });
  const body = h("div", { id: "profiles-body", class: "stack" });
  root.append(h("div", { class: "view-inner" }, h("div", { class: "toolbar" }, nameInput, saveBtn), receiptSlot, body));
  let active = false;

  function renderReceiptSlot() {
    clear(receiptSlot);
    const r = store.get().receipt;
    if (r) receiptSlot.append(renderReceipt(app, r, { onHistory: goHistory, solidUndo: false }));
  }

  async function saveWithConfirm(payload, done) {
    try {
      await api.post("/api/profiles/save", payload);
    } catch (err) {
      if (!(err instanceof ApiError) || !err.message.includes("already exists")) throw err;
      const { ok } = await confirmDialog({ title: "Replace this profile?", body: [`${payload.name} already exists. Replacing it cannot be undone from History.`], confirmLabel: "Replace", danger: true });
      if (!ok) return false;
      await api.post("/api/profiles/save", { ...payload, overwrite: true });
    }
    app.toast(done);
    await refresh();
    return true;
  }

  async function saveCurrent() {
    const name = nameInput.value.trim();
    if (!name) {
      app.toast("Give the profile a name first.");
      nameInput.focus();
      return;
    }
    try {
      if (await saveWithConfirm({ name }, `Saved the current file as "${name}".`)) nameInput.value = "";
    } catch (err) {
      app.toast(err.message);
    }
  }
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveCurrent();
  });

  async function duplicate(name) {
    const r = await confirmDialog({ title: `Duplicate "${name}"`, body: ["Name for the copy:"], input: { value: `${name} copy` }, confirmLabel: "Duplicate" });
    const next = r.value.trim();
    if (!r.ok || !next) return;
    try {
      await saveWithConfirm({ name: next, from: name }, `Duplicated "${name}" as "${next}".`);
    } catch (err) {
      app.toast(err.message);
    }
  }

  async function remove(name) {
    const r = await confirmDialog({ title: `Delete profile "${name}"?`, body: ["The config it holds stays in History if it was ever applied."], confirmLabel: "Delete", danger: true });
    if (!r.ok) return;
    try {
      await api.post("/api/profiles/delete", { name });
      await refresh();
    } catch (err) {
      app.toast(err.message);
    }
  }

  function card(p) {
    const btn = (cls, label, ic, tipText, fn, extra = {}) =>
      h("button", { type: "button", class: `btn ${cls}`, "data-tip": tip(tipText, "press"), onclick: fn, ...extra }, icon(ic), h("span", {}, label));
    return h("div", { class: `profile${p.active ? " active" : ""}`, "data-name": p.name },
      h("span", { class: "name" }, p.name),
      p.active ? h("span", { class: "badge active" }, "active") : null,
      h("span", { class: "grow" }, `${relTime(p.mtimeMs)} · ${p.size} B`),
      p.active ? null : btn("", "Activate", "check", `Activate ${p.name}`, () => app.activateProfile(p.name), { "data-activate": p.name }),
      btn("", "Duplicate", "copy", `Duplicate ${p.name}`, () => duplicate(p.name), { "data-duplicate": p.name }),
      btn("", "Delete", "trash", `Delete ${p.name}`, () => remove(p.name), { "data-delete": p.name }));
  }

  async function refresh() {
    try {
      const { profiles } = await api.get("/api/profiles");
      clear(body);
      body.append(...(profiles.length ? profiles.map(card) : [h("p", { class: "empty" }, "No profiles yet. Save the current file as one above.")]));
    } catch (err) {
      clear(body);
      body.append(h("p", { class: "empty" }, `Profiles unavailable: ${err.message}`));
    }
  }

  store.subscribe((_s, changed) => {
    if (changed.includes("receipt")) renderReceiptSlot();
    if (active && changed.includes("diskHash")) refresh();
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
    focus: () => nameInput.focus(),
  };
}
