// Every button the page builds carries a tooltip made from the shortcut table.
// This reads the sources: each h("button", ...) call must set data-tip through
// tip(...), either in the call or on the variable it is assigned to.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const JS = fileURLToPath(new URL("../public/js", import.meta.url));

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sources(p) : name.endsWith(".mjs") ? [p] : [];
  });
}

// The text of a call starting at the "(" at index open, string-aware.
export function callText(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === "(") depth++;
    if (c === ")" && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

test("callText finds the end of a call with strings and nested calls", () => {
  const s = 'x = h("button", { a: ")" , b: f(1) }, "t"); y()';
  assert.equal(callText(s, s.indexOf("(")), '("button", { a: ")" , b: f(1) }, "t")');
});

test("every button built in the page has a data-tip made with tip()", () => {
  const problems = [];
  let buttons = 0;
  for (const file of sources(JS)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bh\(\s*"button"/g)) {
      if (/^\s*\/\//.test(src.slice(src.lastIndexOf("\n", m.index) + 1, m.index))) continue; // a comment's example
      buttons++;
      const open = src.indexOf("(", m.index);
      const call = callText(src, open);
      const where = `${file.replace(JS, "js")}:${lineOf(src, m.index)}`;
      if (/"data-tip"\s*:/.test(call)) {
        const value = call.slice(call.search(/"data-tip"\s*:/));
        // press() in controls.mjs is tip(label, "press"), so it counts.
        if (!/^"data-tip"\s*:[^,]*\b(tip|press)\(/.test(value.replace(/\n/g, " "))) problems.push(`${where}: data-tip is not built with tip()`);
        continue;
      }
      const before = src.slice(src.lastIndexOf("\n", m.index) + 1, m.index);
      const name = before.match(/(?:const|let)\s+(\w+)\s*=\s*$/)?.[1];
      const later = name && new RegExp(`\\b${name}\\.dataset\\.tip\\s*=[^;]*\\btip\\(`).test(src);
      if (!later) problems.push(`${where}: no data-tip in the call and none set later on ${name ?? "an unnamed button"}`);
    }
    assert.ok(!/createElement\(\s*["']button["']/.test(src), `${file}: build buttons with h("button", ...) so this check sees them`);
  }
  assert.ok(buttons > 20, `the scan found ${buttons} buttons, which is too few to be reading the sources`);
  assert.deepEqual(problems, []);
});
