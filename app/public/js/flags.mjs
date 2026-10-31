// Ghostty writes some settings as a comma list of flags, where a leading "no-"
// turns a flag off (bell-features = attention,no-audio). These helpers read and
// change one flag while leaving every other token exactly as it was.

const tokens = (value) => String(value ?? "").split(",").map((t) => t.trim()).filter(Boolean);

// true when the flag is on, false when it is switched off, null when unset.
export function flagState(value, flag) {
  let state = null;
  for (const t of tokens(value)) {
    if (t === flag) state = true;
    else if (t === `no-${flag}`) state = false;
  }
  return state;
}

// Turn one flag on or off. An existing token for it is replaced in place so the
// order the person wrote is kept, and a missing one is appended.
export function toggleFlag(value, flag, on) {
  const next = on ? flag : `no-${flag}`;
  const parts = tokens(value);
  let replaced = false;
  const out = parts.map((t) => {
    if (t === flag || t === `no-${flag}`) {
      replaced = true;
      return next;
    }
    return t;
  });
  if (!replaced) out.push(next);
  return out.join(",");
}
