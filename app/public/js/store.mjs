// The page's shared state: the file as read from disk, the schema, the
// appearance and the view. It holds no pending changes (staging.mjs owns those)
// and does no network work. Parts of the page subscribe and re-draw only what
// the changed keys touch.

export function createStore(initial = {}) {
  let state = { ...initial };
  const subs = new Set();
  return {
    get: () => state,
    // patch is merged in; subscribers hear which keys actually changed.
    set(patch) {
      const prev = state;
      state = { ...state, ...patch };
      const changed = Object.keys(patch).filter((k) => prev[k] !== state[k]);
      if (changed.length) subs.forEach((fn) => fn(state, changed, prev));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

// key to every value the file sets for it, in file order.
export function valuesFromText(text) {
  const map = {};
  for (const line of String(text ?? "").split("\n")) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.*?)\s*$/);
    if (m) (map[m[1]] ??= []).push(m[2]);
  }
  return map;
}

// key to the schema's default values, as a list.
export function defaultsFromSchema(schema) {
  const out = {};
  for (const o of schema?.options ?? []) out[o.key] = o.defaults ?? [];
  return out;
}

export function initialState() {
  return {
    path: "",
    exists: false,
    diskText: "",
    diskHash: "",
    mtimeMs: null,
    diskValues: {},
    schema: null,
    byKey: {},
    defaults: {},
    themes: [],
    fonts: [],
    meta: null,
    appearance: "dark",
    variant: "dark",
    view: "settings",
    filters: { q: "", modified: false, pending: false },
    group: null,
    // Ghostty's verdict on the pending set: idle | checking | ok | bad | stale.
    verdict: { state: "idle" },
    receipt: null,
    conflict: null,
    readOnly: null,
    stopped: false,
    loading: true,
  };
}
