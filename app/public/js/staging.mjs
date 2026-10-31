// The pending change set. Nothing here touches the network or the file: a
// control calls stage(), the set remembers what the file looked like when the
// first change was staged (the base), and the page later sends the list and the
// base hash to Apply. One set serves every group and every tab.
//
// A change is {value} | {values} | {unset: true}. Staging a change that equals
// what the file already says removes it from the set, so "put it back" and
// "revert" leave nothing pending.

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// One canonical shape per change. An empty value or an empty list means "back
// to the default", which is how the server reads them too.
export function normalizeChange(change) {
  if (!change || change.unset === true) return { unset: true };
  if (Array.isArray(change.values)) {
    const values = change.values.map(String);
    return values.length ? { values } : { unset: true };
  }
  if (typeof change.value === "string") {
    return change.value === "" ? { unset: true } : { value: change.value };
  }
  return { unset: true };
}

// Does this change leave the file as it is? disk is the list of values the file
// sets for the key (empty when it does not), def the schema default.
export function sameAsDisk(change, disk, def = null) {
  const d = disk ?? [];
  if (change.unset) return d.length === 0;
  if (change.values) return sameList(change.values, d);
  if (d.length) return d[d.length - 1] === change.value;
  return def !== null && change.value === def;
}

export function createStaging() {
  const pending = new Map();
  let base = null;
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());

  return {
    // ctx: {disk: string[] | undefined, def: string | null, base: {hash, text}}
    stage(key, change, ctx = {}) {
      const next = normalizeChange(change);
      if (sameAsDisk(next, ctx.disk, ctx.def ?? null)) {
        pending.delete(key);
      } else {
        pending.set(key, next);
        if (!base && ctx.base) base = { ...ctx.base };
      }
      if (!pending.size) base = null;
      emit();
    },
    revert(key) {
      if (pending.delete(key)) {
        if (!pending.size) base = null;
        emit();
      }
    },
    // Returns what was pending, so a caller could offer to bring it back.
    discard() {
      const before = new Map(pending);
      pending.clear();
      base = null;
      emit();
      return before;
    },
    // After a write: drop the changes that were sent and are still exactly what
    // was sent. A key edited again while the write was in flight stays pending.
    discardMatching(sent) {
      let dropped = 0;
      for (const ch of sent) {
        const { key, ...change } = ch;
        const now = pending.get(key);
        if (now && JSON.stringify(now) === JSON.stringify(normalizeChange(change))) {
          pending.delete(key);
          dropped++;
        }
      }
      if (!pending.size) base = null;
      if (dropped) emit();
      return dropped;
    },
    has: (key) => pending.has(key),
    get: (key) => pending.get(key) ?? null,
    keys: () => [...pending.keys()],
    get size() {
      return pending.size;
    },
    get base() {
      return base;
    },
    // Move the base to a newer file, for our own writes and for "review on the
    // new file" after a conflict. Only the base moves; the changes stay.
    rebase(next) {
      if (pending.size) base = { ...next };
      emit();
    },
    // After the file changed under us: drop any change the file now already has.
    prune(diskMap, defaultOf = () => null) {
      let dropped = false;
      for (const [key, ch] of [...pending]) {
        if (sameAsDisk(ch, diskMap[key], defaultOf(key))) {
          pending.delete(key);
          dropped = true;
        }
      }
      if (!pending.size) base = null;
      if (dropped) emit();
    },
    // The file's values with the pending set laid over them.
    effective(diskMap) {
      const out = {};
      for (const [k, v] of Object.entries(diskMap)) out[k] = [...v];
      for (const [key, ch] of pending) {
        if (ch.unset) delete out[key];
        else if (ch.values) out[key] = [...ch.values];
        else out[key] = [ch.value];
      }
      return out;
    },
    // The list Apply and preview send to the server.
    changes() {
      return [...pending].map(([key, ch]) => ({ key, ...ch }));
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
