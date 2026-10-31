// The page's fetch wrapper: it sends the token, hands a 409 conflict back as data,
// turns other HTTP errors into ApiError, and reports a server that never answered
// as a NetworkError (which is what shows the calm "stopped" panel).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi, ApiError, NetworkError } from "../public/js/api.mjs";

const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("the token rides in the x-app-token header, and a body adds a JSON content type", async () => {
  let seen;
  const api = createApi({ token: "abc", fetchImpl: async (path, init) => ((seen = { path, init }), { ok: true, status: 200, json: async () => ({ ok: true }) }) });
  await api.get("/api/meta");
  assert.equal(seen.init.headers["x-app-token"], "abc");
  assert.equal(seen.init.headers["content-type"], undefined);
  await api.post("/api/config/apply", { changes: [], baseHash: "h" });
  assert.equal(seen.init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(seen.init.body), { changes: [], baseHash: "h" });
});

test("a 409 conflict comes back as data, not as an error", async () => {
  const api = createApi({ token: "t", fetchImpl: reply(409, { ok: false, reason: "stale", hash: "x" }) });
  const { status, data } = await api.post("/api/config/apply", {});
  assert.equal(status, 409);
  assert.equal(data.reason, "stale");
});

test("a refused write (HTTP 200, ok false) is data too", async () => {
  const api = createApi({ token: "t", fetchImpl: reply(200, { ok: false, reason: "validation failed", lint: { ok: false } }) });
  const { data } = await api.post("/api/config/apply", {});
  assert.equal(data.reason, "validation failed");
});

test("other HTTP errors throw ApiError with the server's message", async () => {
  const api = createApi({ token: "t", fetchImpl: reply(401, { error: "missing or bad token" }) });
  await assert.rejects(() => api.get("/api/meta"), (e) => e instanceof ApiError && e.status === 401 && /bad token/.test(e.message));
});

test("no answer at all is a NetworkError and fires the hook once", async () => {
  let fired = 0;
  const api = createApi({ token: "t", fetchImpl: async () => { throw new TypeError("Failed to fetch"); }, onNetworkError: () => fired++ });
  await assert.rejects(() => api.get("/api/stat"), (e) => e instanceof NetworkError);
  assert.equal(fired, 1);
});

test("an HTTP error does not fire the network hook", async () => {
  let fired = 0;
  const api = createApi({ token: "t", fetchImpl: reply(500, { error: "boom" }), onNetworkError: () => fired++ });
  await assert.rejects(() => api.get("/api/x"), ApiError);
  assert.equal(fired, 0);
});
