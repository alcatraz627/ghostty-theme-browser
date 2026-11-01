// The right control for each setting, matched to how Ghostty reads the value:
// a switch for booleans, a segmented choice for four values or fewer, a select
// for more, flag tokens for comma lists of flags, a hex-guarded color swatch, a
// stepper for numbers, a list box for repeated keys, a font box that keeps the
// fallback chain, and a theme chooser.
//
// Controls never write. A change goes to ctx.stage(key, change); the row then
// calls update() on the same control, so the element a person is using is never
// replaced. The top half of this file is pure and tested in Node; the bottom
// half builds the DOM.

import { flagState, toggleFlag } from "./flags.mjs";
import { tip } from "./keys.mjs";
import { h } from "./dom.mjs";
import { themeNameFor, themeSides } from "./preview.mjs";

// Which control draws this option. current is the effective value, so a value
// the schema does not list still gets a control that can show it.
export function controlKind(opt, current = "") {
  if (opt.key === "theme") return "theme";
  if (opt.key === "font-family") return "font";
  switch (opt.type) {
    case "boolean":
      return current === "" || current === "true" || current === "false" ? "switch" : "text";
    case "enum": {
      const vals = opt.enumValues ?? [];
      if (current && !vals.includes(current)) return "select";
      return vals.length <= 4 ? "segmented" : "select";
    }
    case "flags":
      return "flags";
    case "color":
      return "color";
    case "number":
      return "stepper";
    case "list":
      return "list";
    default:
      return "text";
  }
}

// Native color pickers speak #rrggbb only. Anything else (a color name, a
// cell-* keyword, a list) must stay in the text box, because a picker would
// replace it with black on first use.
export function hexForPicker(value) {
  const v = String(value ?? "").trim();
  return /^#?[0-9a-fA-F]{6}$/.test(v) ? (v.startsWith("#") ? v : "#" + v).toLowerCase() : null;
}

export function stepFor(opt) {
  if (/opacity/.test(opt.key)) return 0.05;
  if (opt.key === "font-size" || /contrast/.test(opt.key)) return 0.5;
  return /\./.test(String(opt.default ?? "")) ? 0.1 : 1;
}

export function boundsFor(opt) {
  if (/opacity/.test(opt.key)) return { min: 0, max: 1 };
  if (opt.key === "font-size") return { min: 1 };
  return {};
}

// One step up or down from the current text. Returns null when the text is not
// a number, so a half-typed or wrong value is left for the validator to name.
export function stepNumber(text, dir, opt) {
  const cur = Number(String(text).trim());
  if (String(text).trim() === "" || !Number.isFinite(cur)) return null;
  const step = stepFor(opt);
  const decimals = (String(step).split(".")[1] || "").length;
  let next = +(cur + dir * step).toFixed(decimals);
  const { min, max } = boundsFor(opt);
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return String(next);
}

// What one line of each list setting looks like. A person should not have to
// remember the grammar; the example is the box's placeholder and a hint under it.
export const LIST_EXAMPLES = {
  palette: "0=#15161e",
  "font-feature": "calt or -liga",
  "font-variation": "wght=600",
  "font-variation-bold": "wght=700",
  "font-variation-italic": "slnt=-12",
  "font-variation-bold-italic": "wght=700",
  "font-codepoint-map": "U+E000-U+F8FF=Symbols Nerd Font Mono",
  env: "NAME=value",
  keybind: "super+t=new_tab",
  "command-palette-entry": "title:Name,action:new_tab",
  "config-file": "?optional/path",
  "custom-shader": "path/to/shader.glsl",
  "font-family": "Font name",
  "font-family-bold": "Font name",
  "font-family-italic": "Font name",
  "font-family-bold-italic": "Font name",
};

export const listExample = (key) => LIST_EXAMPLES[key] ?? null;

export const listToText = (values) => (values ?? []).join("\n");
export const textToList = (text) => String(text ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

// The font box edits the first font only. The rest of the chain is kept as it is.
export function withFirstFont(values, first) {
  const rest = (values ?? []).slice(1);
  const f = String(first ?? "").trim();
  if (f) return [f, ...rest];
  return rest;
}

// What a flag token shows: the person's own setting for it, else the default.
export function flagShown(userValue, defaultValue, flag) {
  return flagState(userValue, flag) ?? flagState(defaultValue, flag) ?? false;
}

// The text the file would hold after clicking one flag token.
export function flagClick(userValue, defaultValue, flag) {
  return toggleFlag(userValue ?? "", flag, !flagShown(userValue, defaultValue, flag));
}

// DOM builders start here.

const press = (label) => tip(label, "press");

// ctx: {stage(key, change), openThemePicker(anchor, current, pick), themeColors(name),
//       appearance(): "light" | "dark"}.
// state given to update(): {value, values, isSet, disabled}.
export function createControl(opt, ctx, initial) {
  const kind = controlKind(opt, initial.value);
  const stage = (change) => ctx.stage(opt.key, change);
  const build = BUILDERS[kind];
  const made = build(opt, ctx, stage);
  made.el.dataset.control = kind;
  return { kind, el: made.el, update: made.update };
}

function setDisabled(el, disabled) {
  el.classList.toggle("disabled", !!disabled);
  for (const f of el.querySelectorAll("button, input, select, textarea")) f.disabled = !!disabled;
  if (el.matches("button, input, select, textarea")) el.disabled = !!disabled;
}

const BUILDERS = {
  switch(opt, ctx, stage) {
    const b = h("button", { type: "button", class: "sw", role: "switch", "data-tip": tip("Toggle", "toggle"), "aria-label": opt.label });
    b.addEventListener("click", () => stage({ value: b.getAttribute("aria-checked") === "true" ? "false" : "true" }));
    return {
      el: b,
      update(s) {
        const on = s.value === "true";
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", String(on));
        setDisabled(b, s.disabled);
      },
    };
  },

  segmented(opt, ctx, stage) {
    const wrap = h("span", { class: "seg", role: "group", "aria-label": opt.label });
    const btns = (opt.enumValues ?? []).map((v) => {
      const b = h("button", { type: "button", "data-value": v, "data-tip": press(`Set to ${v}`) }, v);
      b.addEventListener("click", () => stage({ value: v }));
      wrap.append(b);
      return b;
    });
    return {
      el: wrap,
      update(s) {
        for (const b of btns) b.classList.toggle("on", b.dataset.value === s.value);
        setDisabled(wrap, s.disabled);
      },
    };
  },

  select(opt, ctx, stage) {
    const sel = h("select", { class: "field select", "aria-label": opt.label });
    sel.addEventListener("change", () => stage({ value: sel.value }));
    return {
      el: sel,
      update(s) {
        const vals = [...(opt.enumValues ?? [])];
        if (s.value && !vals.includes(s.value)) vals.unshift(s.value);
        if (sel.dataset.sig !== vals.join("\u0000")) {
          sel.replaceChildren(...vals.map((v) => h("option", { value: v }, v)));
          sel.dataset.sig = vals.join("\u0000");
        }
        sel.value = s.value;
        setDisabled(sel, s.disabled);
      },
    };
  },

  flags(opt, ctx, stage) {
    const wrap = h("span", { class: "flags", role: "group", "aria-label": opt.label });
    const btns = (opt.flags ?? []).map((f) => {
      const b = h("button", { type: "button", "data-flag": f, "data-tip": press(`Toggle ${f}`) }, f);
      wrap.append(b);
      return b;
    });
    let user = "";
    wrap.addEventListener("click", (e) => {
      const f = e.target.closest("button")?.dataset.flag;
      if (f) stage({ value: flagClick(user, opt.default, f) });
    });
    return {
      el: wrap,
      update(s) {
        user = s.values.at(-1) ?? "";
        for (const b of btns) {
          const on = flagShown(user, opt.default, b.dataset.flag);
          b.classList.toggle("on", on);
          b.setAttribute("aria-pressed", String(on));
        }
        setDisabled(wrap, s.disabled);
      },
    };
  },

  color(opt, ctx, stage) {
    const picker = h("input", { type: "color", class: "picker", "aria-label": `${opt.label} picker`, "data-tip": press("Pick a color") });
    const plain = h("s", { class: "plain-swatch" });
    const text = h("input", { type: "text", class: "hex", spellcheck: "false", "aria-label": opt.label });
    const wrap = h("span", { class: "swatch" }, picker, plain, text);
    picker.addEventListener("input", () => {
      text.value = picker.value;
      stage({ value: picker.value });
    });
    text.addEventListener("change", () => stage({ value: text.value.trim() }));
    return {
      el: wrap,
      update(s) {
        const hex = hexForPicker(s.value);
        // The picker exists only for a value it can show faithfully.
        picker.hidden = !hex;
        plain.hidden = !!hex;
        if (hex) picker.value = hex;
        else plain.style.background = /^[a-zA-Z]+$/.test(s.value) ? s.value : "transparent";
        if (document.activeElement !== text) text.value = s.value;
        setDisabled(wrap, s.disabled);
      },
    };
  },

  stepper(opt, ctx, stage) {
    const input = h("input", { type: "text", inputmode: "decimal", class: "num", spellcheck: "false", "aria-label": opt.label });
    const move = (dir) => {
      const next = stepNumber(input.value, dir, opt);
      if (next === null) return;
      input.value = next;
      stage({ value: next });
    };
    const minus = h("button", { type: "button", "data-tip": tip("Decrease", "stepDown"), "aria-label": "Decrease", onclick: () => move(-1) }, "−");
    const plus = h("button", { type: "button", "data-tip": tip("Increase", "stepUp"), "aria-label": "Increase", onclick: () => move(1) }, "+");
    input.addEventListener("change", () => stage({ value: input.value.trim() }));
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        move(e.key === "ArrowUp" ? 1 : -1);
      }
    });
    const wrap = h("span", { class: "step" }, minus, input, plus);
    return {
      el: wrap,
      update(s) {
        if (document.activeElement !== input) input.value = s.value;
        setDisabled(wrap, s.disabled);
      },
    };
  },

  text(opt, ctx, stage) {
    const input = h("input", { type: "text", class: "field", spellcheck: "false", "aria-label": opt.label });
    input.addEventListener("change", () => stage({ value: input.value.trim() }));
    return {
      el: input,
      update(s) {
        if (document.activeElement !== input) input.value = s.value;
        setDisabled(input, s.disabled);
      },
    };
  },

  // A list stages when the box loses focus or the person commits, never per
  // keystroke, so a half-typed line cannot reach the diff.
  list(opt, ctx, stage) {
    const example = listExample(opt.key);
    const ta = h("textarea", { class: "field list", spellcheck: "false", "aria-label": opt.label, placeholder: example ?? "(defaults, one item per line)" });
    const hint = h("span", { class: "hint" }, example ? `One per line, for example ${example}` : "One item per line");
    ta.addEventListener("change", () => {
      const values = textToList(ta.value);
      stage(values.length ? { values } : { unset: true });
    });
    return {
      el: h("span", { class: "listbox" }, ta, hint),
      update(s) {
        if (document.activeElement !== ta) {
          ta.value = listToText(s.values);
          ta.rows = Math.min(6, Math.max(2, s.values.length + 1));
        }
        setDisabled(ta, s.disabled);
      },
    };
  },

  font(opt, ctx, stage) {
    const input = h("input", { type: "text", class: "field", list: "font-families", spellcheck: "false", "aria-label": opt.label });
    const more = h("span", { class: "more" });
    let user = [];
    input.addEventListener("change", () => {
      const next = withFirstFont(user, input.value);
      stage(next.length ? { values: next } : { unset: true });
    });
    return {
      el: h("span", { class: "fontbox" }, input, more),
      update(s) {
        user = s.values;
        if (document.activeElement !== input) input.value = s.values[0] ?? s.value ?? "";
        const rest = Math.max(0, s.values.length - 1);
        more.textContent = rest ? `+${rest} fallback${rest === 1 ? "" : "s"} kept` : "";
        setDisabled(input, s.disabled);
      },
    };
  },

  theme(opt, ctx, stage) {
    const name = h("span", { class: "name" });
    const dots = h("span", { class: "dots" });
    const btn = h("button", { type: "button", class: "chooser", "data-tip": press("Choose a theme") }, name, dots, h("em", {}, "Change"));
    let current = "";
    btn.addEventListener("click", () => ctx.openThemePicker(btn, current, (picked) => stage({ value: picked })));
    return {
      el: btn,
      update(s) {
        current = s.value;
        // A light and dark pair shows both halves, one under the other, so the
        // dark half is never cut off; the full text is also the tooltip.
        const sides = themeSides(s.value);
        if (sides) {
          name.replaceChildren(
            h("span", { class: "side" }, h("i", {}, "light"), sides.light),
            h("span", { class: "side" }, h("i", {}, "dark"), sides.dark)
          );
        } else {
          name.textContent = s.value || "(no theme)";
        }
        name.classList.toggle("pair", !!sides);
        btn.title = s.value;
        const colors = ctx.themeColors(themeNameFor({ theme: [s.value] }, ctx.appearance()));
        dots.replaceChildren(
          ...[1, 2, 3, 4, 5, 6].map((n) => h("s", { style: colors?.[`palette.${n}`] ? `background:${colors[`palette.${n}`]}` : "" }))
        );
        setDisabled(btn, s.disabled);
      },
    };
  },
};
