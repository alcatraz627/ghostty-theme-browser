// The two floating things the page opens: a modal confirm (also used for a
// name prompt) and the theme picker popover. Both return control to the caller
// through a promise or a callback and remove themselves from the page.

import { h } from "../dom.mjs";
import { tip } from "../keys.mjs";

// body: strings or nodes. list: lines shown as bullets. input: {value, placeholder}
// adds a text box. Resolves {ok, value}.
export function confirmDialog({ title, body = [], list = [], confirmLabel = "Confirm", danger = false, input = null }) {
  return new Promise((resolve) => {
    const field = input ? h("input", { class: "field", type: "text", value: input.value ?? "", placeholder: input.placeholder ?? "", "aria-label": title }) : null;
    const cancel = h("button", { type: "button", class: "btn", value: "cancel", "data-tip": tip("Cancel", "discard"), onclick: () => dlg.close("cancel") }, "Cancel");
    const ok = h("button", { type: "submit", class: `btn solid${danger ? " danger" : ""}`, value: "ok", "data-tip": tip(confirmLabel, "press") }, confirmLabel);
    const form = h("form", { method: "dialog" },
      h("h2", {}, title),
      ...body.map((b) => (typeof b === "string" ? h("p", {}, b) : b)),
      list.length ? h("ul", {}, ...list.map((l) => h("li", {}, l))) : null,
      field,
      h("div", { class: "acts" }, cancel, ok));
    const dlg = h("dialog", { class: "dlg", "aria-label": title }, form);
    dlg.addEventListener("close", () => {
      resolve({ ok: dlg.returnValue === "ok", value: field?.value ?? "" });
      dlg.remove();
    });
    document.body.append(dlg);
    dlg.showModal();
    (field ?? ok).focus();
  });
}

// Anchored list of themes with a search box. pick(name) is called on a choice.
export function openThemePicker({ anchor, themes, current, isPair, pick }) {
  closeThemePicker();
  const search = h("input", { class: "field", type: "search", placeholder: "Search themes", "aria-label": "Search themes", spellcheck: "false" });
  const opts = h("div", { class: "opts", role: "listbox" });
  const hint = isPair ? h("div", { class: "hint" }, "Picking a theme replaces your light and dark pair with one theme.") : null;
  const pop = h("div", { class: "popover", id: "theme-popover", "data-count": String(themes.length) }, search, hint, opts);
  let shown = [];
  let focus = -1;

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    shown = themes.filter((t) => !q || t.name.toLowerCase().includes(q));
    opts.replaceChildren(
      ...(shown.length
        ? shown.map((t, i) =>
            h("button", {
              type: "button", class: `opt${t.name === current ? " on" : ""}${i === focus ? " focus" : ""}`,
              "data-name": t.name, "data-tip": tip("Use this theme", "press"), role: "option",
              onclick: () => choose(t.name),
            }, h("span", {}, t.name), t.source === "user" ? h("span", { class: "src" }, "custom") : null))
        : [h("div", { class: "empty" }, "No matching themes.")])
    );
    opts.querySelector(".opt.on, .opt.focus")?.scrollIntoView({ block: "nearest" });
  };
  const choose = (name) => {
    closeThemePicker();
    pick(name);
    anchor.focus();
  };
  search.addEventListener("input", () => {
    focus = -1;
    draw();
  });
  pop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeThemePicker();
      anchor.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focus = Math.max(0, Math.min(shown.length - 1, focus + (e.key === "ArrowDown" ? 1 : -1)));
      draw();
    } else if (e.key === "Enter" && focus >= 0 && shown[focus]) {
      e.preventDefault();
      choose(shown[focus].name);
    }
  });
  document.body.append(pop);
  draw();

  const r = anchor.getBoundingClientRect();
  const width = 340;
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width))}px`;
  const room = window.innerHeight - r.bottom;
  if (room < 300 && r.top > room) pop.style.bottom = `${window.innerHeight - r.top + 6}px`;
  else pop.style.top = `${r.bottom + 6}px`;
  search.focus();

  const outside = (e) => {
    if (!pop.contains(e.target) && !anchor.contains(e.target)) closeThemePicker();
  };
  setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
  pop._off = () => document.removeEventListener("pointerdown", outside, true);
}

export function closeThemePicker() {
  const pop = document.getElementById("theme-popover");
  if (pop) {
    pop._off?.();
    pop.remove();
  }
}
