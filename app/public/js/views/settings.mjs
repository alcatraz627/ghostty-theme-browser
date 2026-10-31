// The Settings screen: the sticky group strip with search and filters, one
// scrolling list of every setting, and the floating Apply pill. Rows are built
// once when the schema arrives. Staging a value updates that row in place, so the
// scroll position and focus stay exactly where they were.

import { h, svgIcon, $$ } from "../dom.mjs";
import { ICONS } from "../icons.mjs";
import { tip } from "../keys.mjs";
import { createControl } from "../controls.mjs";
import { groupOptions, displayLabel, helpText, filterOptions } from "../labels.mjs";
import { PREVIEW_ROW_KEYS, LIVE_CAVEAT, previewsLive, themeNameFor } from "../preview.mjs";
import { openThemePicker } from "./dialogs.mjs";

const icon = (name) => svgIcon(ICONS[name]);
const OVERRIDE_KEYS = ["background", "foreground", "cursor-color", "cursor-text", "selection-background", "selection-foreground", "palette"];
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// "was 13", "was default", "was 3 items".
export function wasText(diskVals) {
  if (!diskVals?.length) return "was default";
  if (diskVals.length > 1) return `was ${diskVals.length} items`;
  const v = diskVals[0];
  return `was ${v.length > 26 ? v.slice(0, 25) + "…" : v}`;
}

// What a row shows: the value the pending set and the file add up to.
export function rowState(opt, { diskValues, pending, readOnly }) {
  const disk = diskValues[opt.key] ?? [];
  const values = pending ? (pending.unset ? [] : pending.values ?? [pending.value]) : disk;
  const defaults = opt.defaults ?? [];
  const first = opt.type === "list";
  const value = first ? values[0] ?? defaults[0] ?? "" : values.at(-1) ?? opt.default ?? "";
  return { value, values, isSet: values.length > 0, disabled: !!readOnly };
}

export function mountSettings(app, root, { goRail }) {
  const { store, staging } = app;
  const rows = new Map();
  const sections = new Map();
  let groups = [];
  let renderedStaged = new Set();

  // ---- strip ----
  const chips = h("div", { class: "chips", role: "tablist", "aria-label": "Setting groups" });
  const modBtn = h("button", { type: "button", class: "chip-toggle", id: "filter-modified", "data-tip": tip("Show settings set in the file", "filterModified"),
    onclick: () => setFilter({ modified: !store.get().filters.modified }) }, h("span", {}, "Modified"), h("span", { class: "count" }));
  const pendBtn = h("button", { type: "button", class: "chip-toggle", id: "filter-pending", "data-tip": tip("Show staged settings", "filterPending"),
    onclick: () => setFilter({ pending: !store.get().filters.pending }) }, h("span", {}, "Pending"), h("span", { class: "count" }));
  const searchInput = h("input", { type: "search", id: "search", placeholder: "Search", "aria-label": "Search settings", spellcheck: "false" });
  const search = h("div", { class: "search", "data-tip": tip("Search settings", "search"), "data-tip-pos": "below", "data-tip-align": "end" }, icon("search"), searchInput, h("kbd", {}, "/"));
  const strip = h("div", { class: "strip" }, chips, h("div", { class: "tools" }, modBtn, pendBtn, search));

  // ---- list and pill ----
  const list = h("div", { class: "list", id: "settings-list" }, h("div", { class: "empty" }, "Loading settings…"));
  const empty = h("div", { class: "empty", hidden: true }, "No settings match.");
  const countEl = h("b", { id: "pill-count" });
  const stateEl = h("span", { class: "state", id: "pill-state" });
  const discardBtn = h("button", { type: "button", class: "btn", id: "discard-btn", "data-tip": tip("Discard all changes", "discard"), onclick: () => app.discard() }, icon("x"), h("span", {}, "Discard"));
  const applyBtn = h("button", { type: "button", class: "btn solid", id: "apply-btn", onclick: () => app.apply() }, icon("check"), h("span", {}, "Apply"));
  const pill = h("div", { class: "float", id: "apply-pill", hidden: true, role: "region", "aria-label": "Pending changes" }, h("span", { class: "count" }, countEl, " staged"), stateEl, discardBtn, applyBtn);
  const page = h("div", { class: "page", id: "settings-page" }, list, pill);
  const rail = h("aside", { class: "rail", id: "rail" });
  root.append(strip, h("div", { class: "cols" }, page, rail));

  // ---- rows ----
  const ctx = {
    stage: (key, change) => app.stage(key, change),
    themeColors: (name) => app.themeColors(name),
    appearance: () => store.get().variant,
    openThemePicker(anchor, current, pickFn) {
      const s = store.get();
      openThemePicker({ anchor, themes: s.themes, current, isPair: /(^|,)\s*(light|dark):/.test(current), pick: pickFn });
    },
  };

  function buildRow(opt) {
    const s = store.get();
    const st = rowState(opt, { diskValues: s.diskValues, pending: null, readOnly: s.readOnly });
    const ctl = createControl(opt, ctx, st);
    const was = h("span", { class: "was", hidden: true });
    const act = h("button", { type: "button", class: "act", "aria-label": "Reset" }, icon("reset"));
    const live = PREVIEW_ROW_KEYS.includes(opt.key)
      ? h("span", { class: "live", title: LIVE_CAVEAT[opt.key] ?? "This setting changes the sample terminal" }, "previews live")
      : null;
    const note = opt.key === "theme" ? h("div", { class: "note", id: "override-note", hidden: true }) : null;
    const help = helpText(opt);
    const el = h("div", { class: "row", "data-key": opt.key, "data-group": opt.category },
      h("div", { class: "txt" },
        h("div", { class: "head" }, h("span", { class: "label" }, displayLabel(opt)), h("span", { class: "key" }, opt.key), live, opt.platform ? h("span", { class: "plat" }, opt.platform === "linux" ? "GTK and Linux" : "macOS only") : null),
        help ? h("div", { class: "help" }, help) : null),
      h("div", { class: "ctl" }, was, ctl.el),
      act, note);
    act.addEventListener("click", () => (staging.has(opt.key) ? staging.revert(opt.key) : app.stage(opt.key, { unset: true })));
    const row = { opt, el, ctl, was, act, note, live };
    rows.set(opt.key, row);
    updateRow(row);
    return el;
  }

  function updateRow(row) {
    const s = store.get();
    const { opt } = row;
    const pending = staging.get(opt.key);
    const st = rowState(opt, { diskValues: s.diskValues, pending, readOnly: s.readOnly });
    // A color the file leaves unset comes from the theme, so show that color.
    if (opt.type === "color" && !st.isSet) {
      const themed = app.themeColors(themeNameFor(staging.effective(s.diskValues), s.variant))?.[opt.key];
      if (themed) st.value = themed.startsWith("#") || !/^[0-9a-fA-F]{6}$/.test(themed) ? themed : `#${themed}`;
    }
    row.ctl.update(st);
    row.el.classList.toggle("pend", !!pending);
    const disk = s.diskValues[opt.key] ?? [];
    row.was.hidden = !pending;
    if (pending) row.was.textContent = wasText(disk);
    const label = displayLabel(opt);
    row.act.dataset.tip = pending ? tip(`Revert ${label} to the value on disk`, "resetRow") : tip(`Reset ${label} to its default`, "resetRow");
    row.act.setAttribute("aria-label", pending ? `Revert ${label}` : `Reset ${label}`);
    row.act.disabled = !pending && disk.length === 0;
    if (opt.key === "theme") {
      app.ensureTheme(themeNameFor({ theme: [st.value] }, s.variant));
      updateOverrideNote(row);
    }
    updateLive(row);
  }

  // The tag only shows while the sample can really show this setting.
  function updateLive(row) {
    if (!row.live) return;
    const s = store.get();
    row.live.hidden = !previewsLive(row.opt.key, staging.effective(s.diskValues), s.defaults);
  }

  // The explicit colors in the file win over any theme, so say so next to the
  // theme, and offer to stage their removal.
  function updateOverrideNote(row) {
    const s = store.get();
    const eff = staging.effective(s.diskValues);
    const set = OVERRIDE_KEYS.filter((k) => eff[k]?.length);
    const note = row.note;
    note.hidden = !set.length;
    if (!set.length) return;
    const names = set.map((k) => displayLabel(s.byKey[k], k).toLowerCase());
    const shown = names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
    note.replaceChildren(
      h("span", { title: names.join(", ") }, `Your file sets ${shown} itself. These override a theme, so a new theme will not change them.`),
      h("button", { type: "button", class: "btn small", id: "clear-overrides", disabled: !!s.readOnly, "data-tip": tip("Stage clearing these so the theme shows through", "press"),
        onclick: () => set.forEach((k) => app.stage(k, { unset: true })) }, "Stage clearing them")
    );
  }

  function buildList() {
    const s = store.get();
    rows.clear();
    sections.clear();
    groups = groupOptions(s.schema.options);
    list.replaceChildren();
    chips.replaceChildren();
    for (const g of groups) {
      const sec = h("section", { "data-group": g.name, id: `g-${slug(g.name)}` }, h("h2", {}, g.name), ...g.options.map(buildRow));
      sections.set(g.name, sec);
      list.append(sec);
      chips.append(h("button", { type: "button", role: "tab", "data-group": g.name, tabindex: "-1", "data-tip": tip(`${g.name}, ${g.options.length} settings`, "arrows"), onclick: () => jump(g.name) }, g.name));
    }
    list.append(empty);
    applyFilters();
    spy();
  }

  // ---- filters, search, groups ----
  function setFilter(patch) {
    store.set({ filters: { ...store.get().filters, ...patch } });
  }

  function applyFilters() {
    const s = store.get();
    const { q, modified, pending } = s.filters;
    const visible = new Set(filterOptions(s.schema?.options ?? [], { q, modified, pendingOnly: pending, diskValues: s.diskValues, pendingKeys: staging.keys() }).map((o) => o.key));
    let any = false;
    for (const g of groups) {
      let n = 0;
      for (const o of g.options) {
        const row = rows.get(o.key);
        const show = visible.has(o.key);
        if (row.el.hidden === show) row.el.hidden = !show;
        if (show) n++;
      }
      sections.get(g.name).hidden = n === 0;
      if (n) any = true;
    }
    empty.hidden = any || !s.schema;
    modBtn.classList.toggle("on", modified);
    pendBtn.classList.toggle("on", pending);
    modBtn.querySelector(".count").textContent = String(Object.keys(s.diskValues).filter((k) => s.byKey[k]).length);
    pendBtn.querySelector(".count").textContent = String(staging.size);
    markChips();
  }

  function markChips() {
    const staged = new Set(staging.keys().map((k) => store.get().byKey[k]?.category));
    for (const b of chips.children) b.classList.toggle("has", staged.has(b.dataset.group));
  }

  function jump(name) {
    const sec = sections.get(name);
    if (!sec || sec.hidden) return;
    page.scrollTo({ top: Math.max(0, sec.offsetTop - 6) });
    setActive(name);
  }

  function setActive(name) {
    for (const b of chips.children) {
      const on = b.dataset.group === name;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    if (store.get().group !== name) store.set({ group: name });
  }

  let spyQueued = false;
  function spy() {
    if (spyQueued) return;
    spyQueued = true;
    requestAnimationFrame(() => {
      spyQueued = false;
      let current = null;
      for (const g of groups) {
        const sec = sections.get(g.name);
        if (!sec.hidden && sec.offsetTop - 40 <= page.scrollTop) current = g.name;
      }
      if (page.scrollTop + page.clientHeight >= page.scrollHeight - 2) {
        const last = [...groups].reverse().find((g) => !sections.get(g.name).hidden);
        if (last && page.scrollTop > 0) current = last.name;
      }
      current ??= groups.find((g) => !sections.get(g.name).hidden)?.name ?? null;
      if (current) setActive(current);
    });
  }
  page.addEventListener("scroll", spy, { passive: true });

  chips.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const btns = [...chips.children].filter((b) => !sections.get(b.dataset.group)?.hidden);
    const i = btns.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    const next = btns[(i + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length];
    next.focus();
    jump(next.dataset.group);
  });

  searchInput.addEventListener("input", () => {
    setFilter({ q: searchInput.value });
    page.scrollTop = 0;
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && searchInput.value) {
      e.stopPropagation();
      searchInput.value = "";
      setFilter({ q: "" });
    }
  });

  // ---- pill ----
  function renderPill() {
    const s = store.get();
    const n = staging.size;
    pill.hidden = n === 0;
    if (!n) return;
    countEl.textContent = `${n} ${n === 1 ? "change" : "changes"}`;
    const v = s.verdict;
    const problems = (v.lint?.diagnostics?.length ?? 0) + (v.lint?.fileLevel?.length ?? 0) || 1;
    const byState = {
      ok: ["ok", "valid"],
      bad: ["bad", `${problems} problem${problems === 1 ? "" : "s"}`],
      error: ["bad", "check failed"],
      checking: ["", "checking"],
      idle: ["", ""],
    };
    const label = s.refusal ? ["bad", "refused"] : s.conflict || v.state === "stale" ? ["stale", "file changed"] : byState[v.state] ?? ["", ""];
    stateEl.className = `state ${label[0]}`;
    stateEl.textContent = label[1] ? `· ${label[1]}` : "";
    applyBtn.dataset.tip = tip(`Apply ${n} ${n === 1 ? "change" : "changes"}`, "apply");
    applyBtn.disabled = !!s.busy || !!s.readOnly;
  }

  store.subscribe((s, changed) => {
    if (changed.includes("schema") && s.schema) {
      buildList();
      renderPill();
      return;
    }
    if (!s.schema) return;
    if (changed.includes("diskValues") || changed.includes("readOnly") || changed.includes("variant") || changed.includes("themeRev")) {
      for (const row of rows.values()) updateRow(row);
      applyFilters();
    }
    if (changed.includes("stagedRev")) {
      const cur = new Set(staging.keys());
      for (const k of new Set([...renderedStaged, ...cur])) {
        const row = rows.get(k);
        if (row) updateRow(row);
      }
      // The theme row's note depends on every color key, not only its own.
      const themeRow = rows.get("theme");
      if (themeRow) updateOverrideNote(themeRow);
      // Cursor text depends on the cursor style, a different row.
      const cursorText = rows.get("cursor-text");
      if (cursorText) updateLive(cursorText);
      renderedStaged = cur;
      applyFilters();
    }
    if (changed.includes("filters")) applyFilters();
    if (["stagedRev", "verdict", "refusal", "conflict", "busy", "readOnly"].some((k) => changed.includes(k))) renderPill();
  });

  return { rail, searchInput, jump, chips, page };
}
