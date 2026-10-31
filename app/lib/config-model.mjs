// The config file as an editable structure that can always be written back
// byte-for-byte identical to what was read.
//
// Ghostty configs are line-oriented with repeatable keys and hand-written
// comments, so the model is an ordered list of line entries, never a map.
// Every entry keeps its original raw text; reading classifies lines but
// serialization only ever re-emits `raw`, which is what makes the round-trip
// invariant (serialize(parse(text)) === text) hold unconditionally. Editing
// (later milestones) replaces one entry's raw line and leaves the rest alone.

const PAIR_RE = /^\s*([A-Za-z0-9_-]+)\s*=(.*)$/;

export function parse(text) {
  const lines = text.split("\n");
  let trailingNewline = false;
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
    trailingNewline = true;
  }
  const entries = lines.map((raw) => {
    // CRLF files reach here with a trailing \r on every line (we only split
    // on \n). Classify against the logical line; raw keeps its bytes so the
    // round-trip guarantee is untouched.
    const logical = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (/^\s*$/.test(logical)) return { kind: "blank", raw };
    if (/^\s*#/.test(logical)) return { kind: "comment", raw };
    const m = logical.match(PAIR_RE);
    if (m) return { kind: "pair", raw, key: m[1], value: m[2].trim() };
    return { kind: "unknown", raw };
  });
  return { entries, trailingNewline };
}

export function serialize(model) {
  return (
    model.entries.map((e) => e.raw).join("\n") + (model.trailingNewline ? "\n" : "")
  );
}

// Read-side convenience: all key=value entries in file order, with their
// entry index so later editing code can address the exact line.
export function pairs(model) {
  return model.entries
    .map((e, index) => ({ ...e, index }))
    .filter((e) => e.kind === "pair");
}
