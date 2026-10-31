// The page's brain: loads the file and schema, owns staging, asks the server to
// preview and apply, and keeps the receipt. Views read the store and call these
// actions; none of them talks to the API on its own. Nothing here writes the
// config except apply(), saveRaw() and restoreEntry(), each of which sends the
// hash of the file the person was looking at.

import { createApi, NetworkError } from "./api.mjs";
import { createStore, initialState, valuesFromText, defaultsFromSchema } from "./store.mjs";
import { createStaging } from "./staging.mjs";
import { buildReceipt } from "./receipt.mjs";
import { themeNameFor } from "./preview.mjs";
import { displayLabel } from "./labels.mjs";

const PREVIEW_DEBOUNCE_MS = 250;
const POLL_MS = 5000;
const PING_EVERY_MS = 10_000;

export function createApp({ token, fetchImpl } = {}) {
  const store = createStore(initialState());
  const staging = createStaging();
  const themeCache = {};
  const themeLoading = new Set();
  const api = createApi({ token, fetchImpl, onNetworkError: () => store.set({ stopped: true }) });
  let knownMtime = null;
  let previewTimer = null;
  let previewSeq = 0;
  let lastPing = 0;
  let busy = false;

  const toast = (text) => store.set({ toast: { text, id: Math.random() } });
  const defaultOf = (key) => store.get().byKey[key]?.default ?? null;
  const diskBase = () => ({ hash: store.get().diskHash, text: store.get().diskText });

  // ---- loading and the quiet change poll ----

  function applyDisk(cfg, { own = false } = {}) {
    const text = cfg.content ?? "";
    const values = valuesFromText(text);
    if (cfg.mtimeMs !== undefined) knownMtime = cfg.mtimeMs;
    store.set({
      path: cfg.path ?? store.get().path,
      exists: cfg.exists ?? store.get().exists,
      diskText: text,
      diskHash: cfg.hash,
      mtimeMs: cfg.mtimeMs ?? null,
      diskValues: values,
    });
    staging.prune(values, defaultOf);
    // Our own writes move the base, since the person has seen the result. A hand
    // edit does not, so Apply still meets the old hash and the server says 409.
    if (own) staging.rebase({ hash: cfg.hash, text });
    if (staging.size) schedulePreview();
  }

  async function load({ keepStaging = false } = {}) {
    const soft = (p) => p.catch((e) => (e instanceof NetworkError ? Promise.reject(e) : { error: e.message }));
    const [meta, cfg, schema, themes, fonts] = await Promise.all([
      api.get("/api/meta"),
      soft(api.get("/api/config")),
      api.get("/api/schema"),
      api.get("/api/themes").catch((e) => (e instanceof NetworkError ? Promise.reject(e) : { themes: [] })),
      api.get("/api/fonts").catch((e) => (e instanceof NetworkError ? Promise.reject(e) : { families: [] })),
    ]);
    if (!keepStaging) staging.discard();
    store.set({
      meta,
      schema,
      byKey: Object.fromEntries(schema.options.map((o) => [o.key, o])),
      defaults: defaultsFromSchema(schema),
      themes: themes.themes,
      fonts: fonts.families,
      stopped: false,
    });
    if (cfg.error) {
      // An unreadable config opens read-only, with the reason on screen.
      store.set({ readOnly: cfg.error, loading: false });
      return;
    }
    store.set({ readOnly: null });
    applyDisk(cfg);
    store.set({ loading: false });
  }

  async function poll() {
    if (document.visibilityState !== "visible" || store.get().stopped || store.get().loading) return;
    try {
      const st = await api.get("/api/stat");
      if (knownMtime === null) {
        knownMtime = st.mtimeMs;
        return;
      }
      if (st.mtimeMs !== knownMtime) {
        const cfg = await api.get("/api/config");
        knownMtime = cfg.mtimeMs;
        if (cfg.hash !== store.get().diskHash) {
          applyDisk(cfg);
          store.set({ historyRev: (store.get().historyRev ?? 0) + 1 });
          toast("The config changed on disk. The page now shows the new file.");
        }
      }
    } catch {
      /* the server is briefly unreachable, or gone; the stopped panel handles that */
    }
  }

  function startPolling() {
    return setInterval(poll, POLL_MS);
  }

  // Tell the server a person is here. Only while the tab is visible, at most
  // once in ten seconds, and never from the quiet poll.
  function ping() {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastPing < PING_EVERY_MS) return;
    lastPing = now;
    api.post("/api/ping", {}).catch(() => {});
  }

  // ---- staging and the preview endpoint ----

  function stage(key, change) {
    const s = store.get();
    if (s.readOnly) return;
    staging.stage(key, change, { disk: s.diskValues[key], def: defaultOf(key), base: diskBase() });
  }

  function onStagingChanged() {
    store.set({ refusal: null, conflict: null, stagedRev: (store.get().stagedRev ?? 0) + 1 });
    if (staging.size) {
      store.set({ verdict: { ...store.get().verdict, state: "checking" } });
      schedulePreview();
    } else {
      clearTimeout(previewTimer);
      previewSeq++;
      store.set({ verdict: { state: "idle" } });
    }
  }
  staging.onChange(onStagingChanged);

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(runPreview, PREVIEW_DEBOUNCE_MS);
  }

  async function runPreview() {
    if (!staging.size || !staging.base) return;
    const seq = ++previewSeq;
    try {
      const { data } = await api.post("/api/config/preview", { changes: staging.changes(), baseHash: staging.base.hash });
      if (seq !== previewSeq) return;
      const state = data.stale ? "stale" : data.lint?.ok ? "ok" : "bad";
      store.set({ verdict: { state, diff: data.diff, lint: data.lint, newText: data.newText, newHash: data.newHash, currentHash: data.baseHash } });
    } catch (err) {
      if (seq !== previewSeq || err instanceof NetworkError) return;
      store.set({ verdict: { state: "error", message: err.message } });
    }
  }

  function discard() {
    return staging.discard();
  }

  // ---- writes ----

  async function finishWrite({ kind, response, keyCount = 0, title = null }) {
    const [cfg, hist] = await Promise.all([
      api.get("/api/config"),
      api.get("/api/history").catch((e) => (e instanceof NetworkError ? Promise.reject(e) : { entries: [] })),
    ]);
    applyDisk(cfg, { own: true });
    const receipt = buildReceipt({
      kind,
      response,
      keyCount,
      title,
      configPath: cfg.path,
      reloadKeybind: store.get().meta?.reloadKeybind ?? "",
      entries: hist.entries,
    });
    store.set({ receipt, conflict: null, refusal: null, historyRev: (store.get().historyRev ?? 0) + 1 });
  }

  async function apply() {
    const s = store.get();
    if (s.readOnly || busy || !staging.size) return;
    busy = true;
    store.set({ busy: true });
    const changes = staging.changes();
    try {
      const { status, data } = await api.post("/api/config/apply", { changes, baseHash: staging.base.hash });
      if (status === 409 || data?.reason === "stale") {
        // Someone edited the file after staging. Nothing was written.
        store.set({ conflict: { hash: data.hash, text: data.content ?? "" }, refusal: null });
      } else if (!data.ok) {
        store.set({ refusal: { reason: data.reason, lint: data.lint ?? null }, conflict: null });
      } else {
        staging.discard();
        await finishWrite({ kind: "apply", response: data, keyCount: changes.length });
      }
    } catch (err) {
      if (!(err instanceof NetworkError)) store.set({ refusal: { reason: err.message, lint: null } });
    } finally {
      busy = false;
      store.set({ busy: false });
    }
  }

  // After a conflict: take the file as it is now as the new base, keep the
  // pending set, and preview again so the diff shows both values.
  async function reviewOnNewFile() {
    const cfg = await api.get("/api/config");
    applyDisk(cfg);
    staging.rebase({ hash: cfg.hash, text: cfg.content ?? "" });
    store.set({ conflict: null });
    schedulePreview();
  }

  // The caller supplies the editor's own base hash, so a hand edit made while
  // the editor was open is caught the same way as in Apply.
  async function saveRaw(content, { baseHash, force = false }) {
    const res = await api.post("/api/config/save", { content, baseHash, force });
    if (res.data?.ok) await finishWrite({ kind: "raw", response: res.data, keyCount: 0 });
    return res;
  }

  async function restoreEntry(hash, { kind = "restore", title = null } = {}) {
    const { data } = await api.post("/api/history/restore", { hash });
    if (!data?.ok) {
      toast(`Restore failed: ${data?.reason ?? "unknown reason"}`);
      return data;
    }
    await finishWrite({ kind, response: data, title });
    return data;
  }

  async function activateProfile(name) {
    const { data } = await api.post("/api/profiles/activate", { name });
    if (!data?.ok) {
      toast(`Activate failed: ${data?.reason ?? "unknown reason"}`);
      return data;
    }
    await finishWrite({ kind: "restore", response: data, title: `Activated profile "${name}"` });
    return data;
  }

  async function undo(receipt = store.get().receipt) {
    if (!receipt?.undoTarget) return null;
    return restoreEntry(receipt.undoTarget, { kind: "undo" });
  }

  // ---- themes ----

  function ensureTheme(name) {
    if (!name || name in themeCache || themeLoading.has(name)) return;
    themeLoading.add(name);
    api
      .get(`/api/theme?name=${encodeURIComponent(name)}`)
      .then((r) => {
        themeCache[name] = r.colors;
      })
      .catch(() => {
        themeCache[name] = {};
      })
      .finally(() => {
        themeLoading.delete(name);
        store.set({ themeRev: (store.get().themeRev ?? 0) + 1 });
      });
  }
  const themeColors = (name) => themeCache[name];

  function ensureThemesFor(values, appearance) {
    ensureTheme(themeNameFor(values, appearance));
  }

  // ---- appearance ----

  function setAppearance(t) {
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* private window or blocked storage: the choice just lasts this session */
    }
    store.set({ appearance: t });
  }

  // The names a validator message should use for a key.
  const nameOf = (key) => displayLabel(store.get().byKey[key], key);

  return {
    store, staging, api, themeCache,
    load, poll, startPolling, ping, stage, discard, apply, reviewOnNewFile,
    saveRaw, restoreEntry, activateProfile, undo, applyDisk, finishWrite, runPreview,
    ensureTheme, themeColors, ensureThemesFor, setAppearance, toast, nameOf,
  };
}
