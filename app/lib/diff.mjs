// A small line diff for config files, used to show what Apply would change.
// Config files are short, so a plain longest-common-subsequence table is enough
// and keeps the app free of dependencies.
//
// Returns rows { t, text } where t is "-" (removed), "+" (added), " " (one line
// of context around a change) or "…" (a gap of unchanged lines collapsed).

export function lineDiff(before, after, context = 1) {
  const a = splitLines(before);
  const b = splitLines(after);
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = length of the common subsequence of a[i..] and b[j..]
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
      // Removals come before the additions that replace them.
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

// Keep each change plus `context` unchanged lines around it, and collapse the
// rest into a single "…" row so a long file does not drown a one-line change.
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
      // Only gaps between two changes get a marker. Unchanged lines before the
      // first change and after the last are simply not shown.
      out.push({ t: "…", text: "" });
      gap = true;
    }
  });
  while (out.length && out[out.length - 1].t === "…") out.pop();
  // A diff with no changes at all is an empty list, not a lone gap marker.
  return out.every((r) => r.t === "…" || r.t === " ") ? [] : out;
}
