// A line diff for config text, the same algorithm and output shape as the
// server's app/lib/diff.mjs. The page needs it to show what changed on disk
// between "when I started staging" and "now"; a test keeps the two in step.
//
// Rows are {t, text}: "-" removed, "+" added, " " one line of context, "…" a
// collapsed gap.

export function lineDiff(before, after, context = 1) {
  const a = splitLines(before);
  const b = splitLines(after);
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const rows = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      rows.push({ t: " ", text: a[i] });
      i++;
      j++;
    } else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) {
      rows.push({ t: "-", text: a[i++] });
    } else {
      rows.push({ t: "+", text: b[j++] });
    }
  }
  return trimContext(rows, context);
}

function splitLines(text) {
  if (!text) return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function trimContext(rows, context) {
  const keep = new Array(rows.length).fill(false);
  rows.forEach((r, idx) => {
    if (r.t === " ") return;
    for (let k = Math.max(0, idx - context); k <= Math.min(rows.length - 1, idx + context); k++) {
      keep[k] = true;
    }
  });
  const out = [];
  let gap = false;
  rows.forEach((r, idx) => {
    if (keep[idx]) {
      out.push(r);
      gap = false;
    } else if (!gap && out.length) {
      out.push({ t: "…", text: "" });
      gap = true;
    }
  });
  while (out.length && out[out.length - 1].t === "…") out.pop();
  return out.every((r) => r.t === "…" || r.t === " ") ? [] : out;
}
